from flask import Blueprint, render_template, redirect, url_for, flash, request, session, g, current_app, abort, jsonify
from markdown import markdown
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime
from sqlalchemy import func
from pymongo.errors import PyMongoError
import os
import pdfplumber  # type: ignore
import logging
import time
import json
import re
import urllib.error
import urllib.request
from urllib.parse import urlencode
import base64
import shutil


from . import db, applications_collection
from .models import (
    User,
    Job,
    Application,
    ATSResult,
    JobConfig,
    InterviewRoundConfig,
    MCQRoundConfig,
    CodingRoundConfig,
    RoundEvaluation,
    ApplicantPipelineState,
    MCQRoundAssignment,
    FaceCapture,
)
from .pipeline import (
    build_funnel_summary,
    complete_round_and_advance,
    dispatch_email,
    parse_resume_to_json,
    parse_rounds_payload,
    run_shortlisting,
    score_resume_against_job,
    send_acknowledgement_email,
    should_auto_shortlist,
    upsert_pipeline_state,
)
from .utils import allowed_file, evaluate_cv, extract_score, generate_interview_questions, generate_feedback, convert_keys_to_strings, parse_job_description_pdf

main = Blueprint('main', __name__)

REQUIRED_FACE_ANGLES = ('front', 'left', 'right')


def _default_technical_round_url() -> str:
    configured = str(current_app.config.get('TECHNICAL_ROUND_URL', 'http://127.0.0.1:3000/')).strip()
    return configured or 'http://127.0.0.1:3000/'


def _default_coding_round_url() -> str:
    configured = str(current_app.config.get('CODING_ROUND_URL', 'http://127.0.0.1:5173/')).strip()
    return configured or 'http://127.0.0.1:5173/'


def _decode_data_url_image(image_data: str) -> bytes:
    if not image_data or ',' not in image_data:
        raise ValueError('Invalid image payload')

    header, encoded = image_data.split(',', 1)
    if not header.lower().startswith('data:image/'):
        raise ValueError('Only image data is supported')

    try:
        decoded = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError('Failed to decode image data') from exc

    if not decoded:
        raise ValueError('Empty image payload')

    max_bytes = 4 * 1024 * 1024
    if len(decoded) > max_bytes:
        raise ValueError('Image payload is too large')

    return decoded


def _normalize_relative_path(path: str) -> str:
    return path.replace('\\', '/').strip('/').strip()


def _is_safe_face_ref(face_ref: str, user_id: int, job_id: int) -> bool:
    normalized = _normalize_relative_path(face_ref)
    expected_prefix = f"face_capture/temp/user_{user_id}/job_{job_id}/"
    if not normalized.startswith(expected_prefix):
        return False
    return normalized.endswith('.jpg') or normalized.endswith('.jpeg') or normalized.endswith('.png')


def _persist_face_capture_images(*, user_id: int, job_id: int, application_id: int, face_refs: dict[str, str]) -> dict[str, str]:
    photos_root = current_app.config['UPLOAD_FOLDER_PHOTOS']
    app_rel_dir = f"face_capture/applications/app_{application_id}"
    app_abs_dir = os.path.join(photos_root, app_rel_dir.replace('/', os.sep))
    os.makedirs(app_abs_dir, exist_ok=True)

    persisted: dict[str, str] = {}
    for angle, face_ref in face_refs.items():
        normalized_ref = _normalize_relative_path(face_ref)
        src_abs = os.path.join(photos_root, normalized_ref.replace('/', os.sep))
        if not os.path.isfile(src_abs):
            raise ValueError(f'Missing uploaded face image for {angle}.')

        ext = os.path.splitext(src_abs)[1].lower()
        if ext not in {'.jpg', '.jpeg', '.png'}:
            ext = '.jpg'

        target_name = f"{angle}{ext}"
        rel_target = f"{app_rel_dir}/{target_name}"
        abs_target = os.path.join(photos_root, rel_target.replace('/', os.sep))

        try:
            os.replace(src_abs, abs_target)
        except OSError:
            shutil.copy2(src_abs, abs_target)
            os.remove(src_abs)

        persisted[angle] = rel_target.replace('\\', '/')

    temp_dir = os.path.join(
        photos_root,
        'face_capture',
        'temp',
        f'user_{user_id}',
        f'job_{job_id}',
    )
    if os.path.isdir(temp_dir):
        try:
            shutil.rmtree(temp_dir)
        except OSError:
            pass

    return persisted


def mongo_find_one(query):
    try:
        return applications_collection.find_one(query)
    except PyMongoError as e:
        logging.warning(f"MongoDB find_one unavailable: {e}")
        return None


def mongo_insert_one(document):
    try:
        applications_collection.insert_one(document)
        return True
    except PyMongoError as e:
        logging.warning(f"MongoDB insert_one unavailable: {e}")
        return False


def parse_lines_field(raw_value):
    if not raw_value:
        return []
    return [item.strip() for item in raw_value.splitlines() if item.strip()]


def _infer_round_type(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ["mcq", "multiple choice", "assessment", "quiz", "aptitude"]):
        return "MCQ Assessment"
    if any(token in lowered for token in ["hr", "behavioral", "cultural", "culture"]):
        return "HR Interview"
    if any(token in lowered for token in ["system design", "architecture"]):
        return "System Design"
    if any(token in lowered for token in ["coding", "programming", "dsa", "algorithm", "leetcode"]):
        return "Coding"
    if any(token in lowered for token in ["assignment", "take home", "home task"]):
        return "Assignment"
    return "Technical Interview"


def _extract_interview_plan_from_prompt(prompt: str) -> list[dict]:
    content = (prompt or "").strip()
    if not content:
        return []


    rounds_count_match = re.search(r"(\d+)\s*round", content, flags=re.IGNORECASE)
    rounds_count = int(rounds_count_match.group(1)) if rounds_count_match else 3
    rounds_count = max(1, min(8, rounds_count))


    global_duration_match = re.search(r"(\d+)\s*(?:minutes|min)", content, flags=re.IGNORECASE)
    default_duration = int(global_duration_match.group(1)) if global_duration_match else 30


    explicit_rounds = []
    round_pattern = re.compile(
        r"round\s*(\d+)\s*[:\-]\s*(.*?)(?=\s*round\s*\d+\s*[:\-]|$)",
        flags=re.IGNORECASE | re.DOTALL,
    )
    for match in round_pattern.finditer(content):
        round_number = int(match.group(1))
        round_text = re.sub(r"\s+", " ", match.group(2)).strip()

        duration_match = re.search(r"(\d+)\s*(?:minutes|min)", round_text, flags=re.IGNORECASE)
        duration = int(duration_match.group(1)) if duration_match else default_duration

        topics_match = re.search(
            r"(?:topics?|focus)\s*[:\-]\s*(.*?)(?=\s*(?:schedule|advance\s*count|duration|rubric|$))",
            round_text,
            flags=re.IGNORECASE,
        )
        if topics_match:
            focus_areas = [item.strip() for item in re.split(r",|;", topics_match.group(1)) if item.strip()]
        else:
            focus_areas = [round_text]

        explicit_rounds.append(
            {
                "round_number": round_number,
                "round_name": f"Round {round_number}",
                "round_type": _infer_round_type(round_text),
                "duration_minutes": duration,
                "focus_areas": focus_areas,
                "advance_count": None,
                "evaluation_rubric": ["Communication", "Technical depth", "Problem solving"],
                "schedule_window": "To be scheduled",
            }
        )

    if explicit_rounds:
        explicit_rounds.sort(key=lambda item: item["round_number"])
        return explicit_rounds

    defaults = [
        ("Screening", "Technical Interview", ["Core skills", "Experience review"]),
        ("Technical", "Coding", ["Problem solving", "Coding quality"]),
        ("Managerial", "HR Interview", ["Behavioral", "Culture fit"]),
    ]

    rounds = []
    for idx in range(1, rounds_count + 1):
        default_name, default_type, default_topics = defaults[min(idx - 1, len(defaults) - 1)]
        rounds.append(
            {
                "round_number": idx,
                "round_name": f"{default_name} Round",
                "round_type": default_type,
                "duration_minutes": default_duration,
                "focus_areas": default_topics,
                "advance_count": None,
                "evaluation_rubric": ["Communication", "Technical depth", "Problem solving"],
                "schedule_window": "To be scheduled",
            }
        )

    return rounds


def _parse_schedule_window(schedule_window: str | None) -> tuple[datetime | None, datetime | None]:
    raw = (schedule_window or '').strip()
    if not raw:
        return None, None

    separators = [' to ', ' - ', '–', '—']
    parts = [raw]
    for separator in separators:
        if separator in raw:
            parts = [item.strip() for item in raw.split(separator, 1)]
            break

    if len(parts) != 2:
        return None, None

    left, right = parts
    formats = [
        '%Y-%m-%d %H:%M',
        '%d-%m-%Y %H:%M',
        '%Y/%m/%d %H:%M',
        '%H:%M',
    ]

    def _parse_part(value: str) -> datetime | None:
        for fmt in formats:
            try:
                parsed = datetime.strptime(value, fmt)
                if fmt == '%H:%M':
                    now = datetime.now()
                    parsed = parsed.replace(year=now.year, month=now.month, day=now.day)
                return parsed
            except ValueError:
                continue
        return None

    start = _parse_part(left)
    end = _parse_part(right)
    return start, end


def _is_round_window_open(schedule_window: str | None) -> bool:
    start, end = _parse_schedule_window(schedule_window)
    if start is None or end is None:
        return True
    now = datetime.now()
    return start <= now <= end


def _is_mcq_round_type(round_type: str | None, round_name: str | None = None) -> bool:
    lowered = f"{round_type or ''} {round_name or ''}".lower()
    return any(token in lowered for token in ['mcq', 'assessment', 'quiz', 'aptitude'])


def _is_coding_round_type(round_type: str | None, round_name: str | None = None) -> bool:
    lowered = f"{round_type or ''} {round_name or ''}".lower()
    return any(token in lowered for token in ['coding', 'dsa', 'algorithm', 'programming'])


def _is_interview_round_type(round_type: str | None, round_name: str | None = None) -> bool:
    lowered = f"{round_type or ''} {round_name or ''}".lower()
    return any(token in lowered for token in ['interview', 'technical', 'voice', 'video', 'hr'])


def _get_first_assignable_round(job_id: int) -> InterviewRoundConfig | None:
    rounds = InterviewRoundConfig.query.filter_by(job_id=job_id).order_by(InterviewRoundConfig.round_number.asc()).all()
    for round_cfg in rounds:
        if _is_mcq_round_type(round_cfg.round_type, round_cfg.round_name) or _is_coding_round_type(round_cfg.round_type, round_cfg.round_name):
            return round_cfg
    return None


def _get_next_assignable_round(job_id: int, current_round_number: int) -> InterviewRoundConfig | None:
    rounds = (
        InterviewRoundConfig.query
        .filter_by(job_id=job_id)
        .order_by(InterviewRoundConfig.round_number.asc())
        .all()
    )
    for round_cfg in rounds:
        if round_cfg.round_number <= current_round_number:
            continue
        if _is_mcq_round_type(round_cfg.round_type, round_cfg.round_name) or _is_coding_round_type(round_cfg.round_type, round_cfg.round_name):
            return round_cfg
    return None


def _send_round_assignment_email(*, applicant: User, application: Application, job: Job, round_config: InterviewRoundConfig) -> None:
    config = JobConfig.query.filter_by(job_id=job.id, confirmed=True).first()
    if config is None:
        return

    focus_text = ', '.join(round_config.focus_areas or []) or 'As per interview plan'
    rubric_text = ', '.join(round_config.evaluation_rubric or []) or 'As per interview plan'
    schedule_text = round_config.schedule_window or 'To be scheduled'

    conditions = [
        'Join using your candidate dashboard within the allowed schedule window.',
        'This round is mandatory to move to the next stage.',
        'Use your own work only; plagiarism or malpractice may lead to rejection.',
    ]

    if _is_mcq_round_type(round_config.round_type, round_config.round_name):
        mcq_config = MCQRoundConfig.query.filter_by(job_id=job.id, round_number=round_config.round_number).first()
        if mcq_config is not None:
            conditions.append(
                f"MCQ Format: {mcq_config.num_questions} questions, {mcq_config.timer_seconds} seconds per question, difficulty split Easy {mcq_config.easy_percent}% / Medium {mcq_config.medium_percent}% / Hard {mcq_config.hard_percent}%"
            )
    elif _is_coding_round_type(round_config.round_type, round_config.round_name):
        coding_config = CodingRoundConfig.query.filter_by(job_id=job.id, round_number=round_config.round_number).first()
        if coding_config is not None:
            conditions.append(
                f"Coding Format: {coding_config.num_questions} questions, Difficulty {coding_config.difficulty.title()}"
            )

    conditions_text = '\n'.join([f"- {item}" for item in conditions])

    all_rounds = InterviewRoundConfig.query.filter_by(job_id=job.id).order_by(InterviewRoundConfig.round_number.asc()).all()
    if all_rounds:
        plan_lines = []
        for item in all_rounds:
            plan_lines.append(
                f"- Round {item.round_number}: {item.round_name} | Type: {item.round_type} | Duration: {item.duration_minutes} min | Schedule: {item.schedule_window or 'To be scheduled'}"
            )
        all_rounds_text = '\n'.join(plan_lines)
    else:
        all_rounds_text = '- Round plan will be shared separately.'

    subject = f"Interview Round Assigned: Round {round_config.round_number} - {job.title}"
    body = (
        f"Hi {applicant.first_name},\n\n"
        f"You have been assigned to the next hiring round for {job.title}.\n\n"
        f"Round Number: {round_config.round_number}\n"
        f"Round Name: {round_config.round_name}\n"
        f"Round Type: {round_config.round_type}\n"
        f"Duration: {round_config.duration_minutes} minutes\n"
        f"Schedule Window: {schedule_text}\n"
        f"Topics: {focus_text}\n"
        f"Evaluation Criteria: {rubric_text}\n\n"
        f"Complete Round Plan:\n{all_rounds_text}\n\n"
        f"Conditions:\n{conditions_text}\n\n"
        "Please check your candidate dashboard and start the round within the permitted time.\n\n"
        f"Reply to: {config.reply_to_email}\n"
        f"- {config.company_display_name} Recruitment Team"
    )

    dispatch_email(
        applicant=applicant,
        job=job,
        application_id=application.id,
        event_type='ROUND_ASSIGNED',
        subject=subject,
        body=body,
        reply_to=config.reply_to_email,
    )

@main.before_app_request
def load_user():
    user_id = session.get('user_id')
    if user_id:
        g.user = User.query.get(user_id)
    else:
        g.user = None

@main.context_processor
def inject_user():
    return {'user': g.user}


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if g.user is None:
            flash('You need to sign in first.', 'danger')
            return redirect(url_for('main.auth'))
        return view(*args, **kwargs)
    return wrapped_view


def role_required(*roles):
    def decorator(view):
        @wraps(view)
        @login_required
        def wrapped_view(*args, **kwargs):
            if not g.user.has_role(*roles):
                abort(403)
            return view(*args, **kwargs)
        return wrapped_view
    return decorator

@main.route('/')
@login_required
def home():
    if g.user.has_role('recruiter', 'both'):
        return redirect(url_for('main.dashboard'))
    return redirect(url_for('main.applicant_dashboard'))


@main.route('/applicant_dashboard')
@role_required('applicant', 'both')
def applicant_dashboard():
    jobs = Job.query.filter(Job.user_id != g.user.id).order_by(Job.date_posted.desc()).all()
    recent_applications = Application.query.filter_by(user_id=g.user.id).order_by(Application.timestamp.desc()).limit(5).all()

    return render_template(
        'applicant_dashboard.html',
        jobs=jobs,
        recent_applications=recent_applications
    )


@main.route('/jobs')
@role_required('applicant', 'both')
def browse_jobs():
    jobs = Job.query.filter(Job.user_id != g.user.id).order_by(Job.date_posted.desc()).all()

    sqlite_apps = Application.query.filter_by(user_id=g.user.id).all()
    applied_by_job_id = {item.job_id: item for item in sqlite_apps}

    available_jobs = [job for job in jobs if job.id not in applied_by_job_id]
    applied_jobs = [
        {
            'job': job,
            'application': applied_by_job_id[job.id],
        }
        for job in jobs
        if job.id in applied_by_job_id
    ]

    return render_template(
        'snippet_career_list.html',
        available_jobs=available_jobs,
        applied_jobs=applied_jobs,
    )

@main.route('/sign', methods=['GET', 'POST'])
def auth():
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'signup':
            # Collect form data
            first_name = request.form['first_name']
            last_name = request.form['last_name']
            user_role = request.form.get('role', 'applicant').strip().lower()
            if user_role not in {'applicant', 'recruiter'}:
                user_role = 'applicant'

            company_name = request.form.get('company_name', '').strip()
            email = request.form['email'].strip().lower()
            phone_number = request.form['phone_number']
            birthday = request.form['birthday']
            password = request.form['password']
            confirm_password = request.form['confirm_password']

            if user_role == 'recruiter' and not company_name:
                flash('Company name is required for recruiter accounts.', 'danger')
                return redirect(url_for('main.auth'))

            if not company_name:
                company_name = 'Independent'

            # Validate password match
            if password != confirm_password:
                flash('Passwords do not match.', 'danger')
                return redirect(url_for('main.auth'))

            # Check if the email already exists
            existing_user = User.query.filter(
                func.lower(func.trim(User.email)) == email
            ).first()
            if existing_user:
                flash('An account with this email already exists.', 'danger')
                return redirect(url_for('main.auth'))

            # Create a new user
            user = User(
                first_name=first_name,
                last_name=last_name,
                company_name=company_name,
                email=email,
                phone_number=phone_number,
                birthday=birthday,
                role=user_role
            )
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            flash('Signup successful! You can now sign in.', 'success')
            return redirect(url_for('main.auth'))

        elif action == 'signin':
            # Collect form data
            email = request.form['email'].strip().lower()
            password = request.form['password']

            # Check if the user exists
            user = User.query.filter(
                func.lower(func.trim(User.email)) == email
            ).first()
            if user and user.check_password(password):
                db.session.commit()
                session['user_id'] = user.id
                flash('Signin successful!', 'success')
                if user.has_role('recruiter', 'both'):
                    return redirect(url_for('main.dashboard'))
                return redirect(url_for('main.applicant_dashboard'))
            else:
                flash('Invalid email or password.', 'danger')
                return redirect(url_for('main.auth'))

    return render_template('sign.html')

@main.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'success')
    return redirect(url_for('main.auth'))

@main.route('/create_job', methods=['GET', 'POST'])
@role_required('recruiter', 'both')
def create_job():
    if request.method == 'POST':
        title = request.form['title']
        location = request.form['location']
        description = request.form['description']
        salary = request.form['salary']
        department = request.form.get('department', '').strip()
        employment_type = request.form.get('employment_type', '').strip()
        work_mode = request.form.get('work_mode', '').strip()
        application_deadline_raw = request.form.get('application_deadline', '').strip()
        role_summary = request.form.get('role_summary', '').strip()
        expected_applicants_raw = request.form.get('expected_applicants', '').strip()
        shortlist_mode = request.form.get('shortlist_mode', 'count').strip()
        shortlist_value_raw = request.form.get('shortlist_value', '').strip()
        min_ats_threshold_raw = request.form.get('min_ats_threshold', '70').strip()
        notification_tone = request.form.get('notification_tone', 'Formal').strip().lower()
        company_display_name = request.form.get('company_display_name', g.user.company_name).strip()
        company_logo_url = request.form.get('company_logo_url', '').strip()
        reply_to_email = request.form.get('reply_to_email', g.user.email).strip().lower()
        send_rejection_emails = request.form.get('send_rejection_emails', 'yes').strip().lower() == 'yes'
        rejection_timing = request.form.get('rejection_timing', 'after_shortlisting').strip()
        confirm_publish = request.form.get('confirm_publish', '').strip()
        rounds_payload = request.form.get('rounds_payload', '').strip()

        required_fields = [
            department,
            employment_type,
            work_mode,
            application_deadline_raw,
            role_summary,
            expected_applicants_raw,
            shortlist_value_raw,
            min_ats_threshold_raw,
            company_display_name,
            reply_to_email,
        ]
        if not all(required_fields):
            flash('Please complete all required job configuration fields before publishing.', 'danger')
            return redirect(url_for('main.create_job'))

        if confirm_publish != 'CONFIRM':
            flash("Type CONFIRM to publish this job.", 'danger')
            return redirect(url_for('main.create_job'))

        try:
            deadline_dt = datetime.strptime(application_deadline_raw, '%Y-%m-%dT%H:%M')
            expected_applicants = int(expected_applicants_raw)
            shortlist_value = float(shortlist_value_raw)
            min_ats_threshold = float(min_ats_threshold_raw)
            rounds = parse_rounds_payload(rounds_payload)
        except ValueError as e:
            flash(f'Invalid job configuration values: {e}', 'danger')
            return redirect(url_for('main.create_job'))

        if not rounds:
            flash('Add at least one interview round configuration before publishing.', 'danger')
            return redirect(url_for('main.create_job'))

        new_job = Job(
            title=title,
            location=location,
            description=description,
            salary=salary,
            user_id=g.user.id
        )
        db.session.add(new_job)
        db.session.flush()

        config = JobConfig(
            job_id=new_job.id,
            department=department,
            employment_type=employment_type,
            work_mode=work_mode,
            location_display=location,
            application_deadline=deadline_dt,
            role_summary=role_summary,
            key_responsibilities=parse_lines_field(request.form.get('key_responsibilities', '')),
            required_qualifications=parse_lines_field(request.form.get('required_qualifications', '')),
            preferred_qualifications=parse_lines_field(request.form.get('preferred_qualifications', '')),
            tech_stack=parse_lines_field(request.form.get('tech_stack', '')),
            expected_applicants=expected_applicants,
            shortlist_mode=shortlist_mode,
            shortlist_value=shortlist_value,
            min_ats_threshold=min_ats_threshold,
            mandatory_filters=parse_lines_field(request.form.get('mandatory_filters', '')),
            preferred_filters=parse_lines_field(request.form.get('preferred_filters', '')),
            notification_tone=notification_tone,
            company_display_name=company_display_name,
            company_logo_url=company_logo_url,
            reply_to_email=reply_to_email,
            send_rejection_emails=send_rejection_emails,
            rejection_timing=rejection_timing,
            confirmed=True,
            published_at=datetime.utcnow(),
        )
        db.session.add(config)

        for round_row in rounds:
            db.session.add(
                InterviewRoundConfig(
                    job_id=new_job.id,
                    round_number=round_row['round_number'],
                    round_name=round_row['round_name'],
                    round_type=round_row['round_type'],
                    duration_minutes=round_row['duration_minutes'],
                    focus_areas=round_row['focus_areas'],
                    advance_count=round_row['advance_count'],
                    evaluation_rubric=round_row['evaluation_rubric'],
                    schedule_window=round_row['schedule_window'],
                )
            )
            if _is_mcq_round_type(round_row.get('round_type'), round_row.get('round_name')):
                mcq_conf = round_row.get('mcq_config') or {}
                db.session.add(
                    MCQRoundConfig(
                        job_id=new_job.id,
                        round_number=round_row['round_number'],
                        num_questions=int(mcq_conf.get('num_questions', 15)),
                        timer_seconds=int(mcq_conf.get('timer_seconds', 60)),
                        easy_percent=int(mcq_conf.get('easy_percent', 20)),
                        medium_percent=int(mcq_conf.get('medium_percent', 50)),
                        hard_percent=int(mcq_conf.get('hard_percent', 30)),
                    )
                )
            elif _is_coding_round_type(round_row.get('round_type'), round_row.get('round_name')):
                coding_conf = round_row.get('coding_config') or {}
                db.session.add(
                    CodingRoundConfig(
                        job_id=new_job.id,
                        round_number=round_row['round_number'],
                        external_url=str(coding_conf.get('external_url', _default_coding_round_url())).strip(),
                        num_questions=int(coding_conf.get('num_questions', 5)),
                        difficulty=str(coding_conf.get('difficulty', 'medium')).strip().lower(),
                    )
                )

        db.session.commit()

        funnel = build_funnel_summary(new_job)
        flash(f'Job published. Funnel: {funnel}', 'success')
        return redirect(url_for('main.my_jobs'))

    return render_template('create_job.html')

@main.route('/my_jobs')
@role_required('recruiter', 'both')
def my_jobs():
    jobs = Job.query.filter_by(user_id=g.user.id).all()
    return render_template('my_jobs.html', jobs=jobs)

@main.route('/edit_job/<int:job_id>', methods=['GET', 'POST'])
@role_required('recruiter', 'both')
def edit_job(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    if request.method == 'POST':
        job.title = request.form['title']
        job.location = request.form['location']
        job.description = request.form['description']
        job.salary = request.form['salary']
        db.session.commit()
        flash('Job updated successfully!', 'success')
        return redirect(url_for('main.my_jobs'))

    return render_template('edit_job.html', job=job)

@main.route('/delete_job/<int:job_id>', methods=['POST'])
@role_required('recruiter', 'both')
def delete_job(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    db.session.delete(job)
    db.session.commit()
    flash('Job deleted successfully!', 'success')
    return redirect(url_for('main.my_jobs'))

@main.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    user = User.query.get(g.user.id)
    
    if user is None:
        flash('User not found.', 'danger')
        return redirect(url_for('main.auth'))

    if request.method == 'POST':
        # Handle General Settings Form Submission
        if 'save_changes' in request.form:
            # Fetching and validating form data
            first_name = request.form.get('first_name')
            last_name = request.form.get('last_name')
            company_name = request.form.get('company_name')
            email = request.form.get('email', '').strip().lower()
            phone_number = request.form.get('phone_number')
            birthday = request.form.get('birthday')

            # Ensure no required fields are empty
            if not all([first_name, last_name, email, phone_number, birthday]):
                flash('All fields are required.', 'danger')
                return redirect(url_for('main.settings'))

            if user.has_role('recruiter', 'both') and not company_name:
                flash('Company name is required for recruiter accounts.', 'danger')
                return redirect(url_for('main.settings'))

            if not company_name:
                company_name = 'Independent'

            # Update user details
            user.first_name = first_name
            user.last_name = last_name
            user.company_name = company_name
            existing_user = User.query.filter(
                func.lower(func.trim(User.email)) == email,
                User.id != user.id
            ).first()
            if existing_user:
                flash('An account with this email already exists.', 'danger')
                return redirect(url_for('main.settings'))

            user.email = email
            user.phone_number = phone_number
            user.birthday = birthday

            # Handle Profile Photo Upload
            if 'profile_photo' in request.files:
                profile_photo = request.files['profile_photo']
                if profile_photo and allowed_file(profile_photo.filename, {'jpg', 'jpeg', 'png'}):
                    photo_filename = secure_filename(profile_photo.filename)
                    profile_photo.save(os.path.join(current_app.config['UPLOAD_FOLDER_PHOTOS'], photo_filename))
                    user.profile_photo = photo_filename

            # Commit changes to the database
            try:
                db.session.commit()
                flash('General settings updated successfully!', 'success')
            except Exception as e:
                db.session.rollback()
                logging.error(f"Error updating settings: {e}")
                flash('An error occurred while updating your settings. Please try again.', 'danger')

            return redirect(url_for('main.settings'))

        # Handle CV Upload Form Submission
        if 'upload_cv' in request.form:
            if 'cv_file' in request.files:
                cv_file = request.files['cv_file']
                if cv_file and allowed_file(cv_file.filename, {'pdf', 'docx'}):
                    cv_filename = secure_filename(cv_file.filename)
                    cv_file.save(os.path.join(current_app.config['UPLOAD_FOLDER_CV'], cv_filename))
                    user.cv_file = cv_filename

            # Commit changes to the database
            try:
                db.session.commit()
                flash('CV uploaded successfully!', 'success')
            except Exception as e:
                db.session.rollback()
                logging.error(f"Error uploading CV: {e}")
                flash('An error occurred while uploading your CV. Please try again.', 'danger')

            return redirect(url_for('main.settings'))

    return render_template('settings.html', user=user)

@main.route('/job/<int:job_id>')
@login_required
def job_detail(job_id):
    job = Job.query.get_or_404(job_id)
    job.description = markdown(job.description)

    has_applied = False
    if g.user.has_role('applicant', 'both'):
        existing_application_sqlite = Application.query.filter_by(user_id=g.user.id, job_id=job_id).first()
        existing_application_mongo = mongo_find_one({
            'user_id': str(g.user.id),
            'job_id': str(job_id)
        })
        has_applied = bool(existing_application_sqlite or existing_application_mongo)

    return render_template('job_detail.html', job=job, has_applied=has_applied)

@main.route('/apply/<int:job_id>', methods=['GET', 'POST'])
@role_required('applicant', 'both')
def apply(job_id):
    job = Job.query.get_or_404(job_id)
    config = JobConfig.query.filter_by(job_id=job.id, confirmed=True).first()
    if config is None:
        flash('This job is not fully configured for automated hiring yet.', 'danger')
        return redirect(url_for('main.job_detail', job_id=job_id))

    existing_application_sqlite = Application.query.filter_by(user_id=g.user.id, job_id=job_id).first()
    existing_application_mongo = mongo_find_one({
        'user_id': str(g.user.id),
        'job_id': str(job_id)
    })

    if existing_application_sqlite or existing_application_mongo:
        flash('You have already applied for this job.', 'alert')
        return redirect(url_for('main.job_detail', job_id=job_id))

    if request.method == 'GET':
        return render_template('apply.html', job=job)

    # POST request handling
    resume_choice = request.form.get('resume_choice')
    cv_path = None
    resume_filename = None

    if resume_choice == 'profile':
        if not g.user.cv_file:
            flash('Please upload your CV in settings before applying.', 'danger')
            return redirect(url_for('main.settings'))
        
        cv_path = os.path.join(current_app.config['UPLOAD_FOLDER_CV'], g.user.cv_file)
        resume_filename = g.user.cv_file
        if not os.path.isfile(cv_path):
            flash('CV file not found. Please upload again.', 'danger')
            return redirect(url_for('main.settings'))
    
    elif resume_choice == 'new':
        if 'resume' not in request.files:
            flash('No resume file selected.', 'danger')
            return redirect(request.url)
        
        file = request.files['resume']
        if file.filename == '':
            flash('No selected file.', 'danger')
            return redirect(request.url)

        file_size = file.content_length
        if file_size is None:
            current_pos = file.stream.tell()
            file.stream.seek(0, os.SEEK_END)
            file_size = file.stream.tell()
            file.stream.seek(current_pos)

        if file_size and file_size > current_app.config['MAX_CV_FILE_SIZE']:
            flash('The resume file is too large. The maximum size is 5MB.', 'danger')
            return redirect(request.url)

        if file and allowed_file(file.filename):
            resume_filename = secure_filename(file.filename)
            # Create a unique filename to avoid overwrites
            timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
            unique_filename = f"{timestamp}_{g.user.id}_{resume_filename}"
            
            upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER_CV'], 'applications')
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)
            
            cv_path = os.path.join(upload_folder, unique_filename)
            file.save(cv_path)
            resume_filename = os.path.join('applications', unique_filename)
        else:
            flash('Invalid file type for resume.', 'danger')
            return redirect(request.url)
    
    else:
        flash('Invalid resume option selected.', 'danger')
        return redirect(request.url)

    if not cv_path:
        flash('Could not determine resume path.', 'danger')
        return redirect(request.url)

    face_front_ref = request.form.get('face_front_ref', '').strip()
    face_left_ref = request.form.get('face_left_ref', '').strip()
    face_right_ref = request.form.get('face_right_ref', '').strip()
    face_tilt_ref = request.form.get('face_tilt_ref', '').strip()

    face_refs = {
        'front': face_front_ref,
        'left': face_left_ref,
        'right': face_right_ref,
    }

    missing_angles = [angle for angle, value in face_refs.items() if not value]
    if missing_angles:
        flash('Please complete face capture (front, left, right) before submitting.', 'danger')
        return redirect(request.url)

    for angle, face_ref in face_refs.items():
        if not _is_safe_face_ref(face_ref, g.user.id, job_id):
            flash(f'Invalid {angle} face capture reference. Please capture again.', 'danger')
            return redirect(request.url)

        abs_face_path = os.path.join(current_app.config['UPLOAD_FOLDER_PHOTOS'], _normalize_relative_path(face_ref).replace('/', os.sep))
        if not os.path.isfile(abs_face_path):
            flash(f'Missing {angle} face image. Please capture again.', 'danger')
            return redirect(request.url)

    if face_tilt_ref and not _is_safe_face_ref(face_tilt_ref, g.user.id, job_id):
        face_tilt_ref = ''

    try:
        parsed_resume = parse_resume_to_json(cv_path)
    except Exception as e:
        logging.error(f"Failed to process CV: {e}")
        flash('Failed to process CV.', 'danger')
        return redirect(url_for('main.job_detail', job_id=job_id))

    score = score_resume_against_job(job, config, parsed_resume)

    new_application = Application(
        user_id=g.user.id,
        job_id=job_id,
        resume_file=resume_filename,
        message=str(score.ats_score),
        timestamp=datetime.utcnow(),
        status='Applied'
    )
    db.session.add(new_application)
    db.session.flush()

    ats_row = ATSResult(
        application_id=new_application.id,
        applicant_id=g.user.id,
        job_id=job_id,
        ats_score=score.ats_score,
        score_breakdown=score.score_breakdown,
        matched_keywords=score.matched_keywords,
        missing_keywords=score.missing_keywords,
        experience_summary=score.experience_summary,
        shortlist_eligible=score.shortlist_eligible,
        shortlist_reason=score.shortlist_reason,
        parsed_resume=parsed_resume,
    )
    db.session.add(ats_row)

    try:
        refs_to_persist = dict(face_refs)
        if face_tilt_ref and _is_safe_face_ref(face_tilt_ref, g.user.id, job_id):
            refs_to_persist['tilt'] = face_tilt_ref

        persisted_paths = _persist_face_capture_images(
            user_id=g.user.id,
            job_id=job_id,
            application_id=new_application.id,
            face_refs=refs_to_persist,
        )

        db.session.add(
            FaceCapture(
                application_id=new_application.id,
                candidate_id=g.user.id,
                job_id=job_id,
                front_image_path=persisted_paths['front'],
                left_image_path=persisted_paths['left'],
                right_image_path=persisted_paths['right'],
                tilt_image_path=persisted_paths.get('tilt'),
            )
        )
    except Exception as e:
        db.session.rollback()
        logging.error(f"Failed to persist face capture data: {e}")
        flash('Face capture upload failed. Please retry your application.', 'danger')
        return redirect(request.url)

    upsert_pipeline_state(new_application, 'ATS_SCORED')
    send_acknowledgement_email(g.user, job, config)

    application_data = {
        'application_id': str(new_application.id),
        'user_id': str(g.user.id),
        'job_id': str(job_id),
        'ats_result': {
            'ats_score': score.ats_score,
            'score_breakdown': score.score_breakdown,
            'matched_keywords': score.matched_keywords,
            'missing_keywords': score.missing_keywords,
            'experience_summary': score.experience_summary,
            'shortlist_eligible': score.shortlist_eligible,
            'shortlist_reason': score.shortlist_reason,
        },
    }
    mongo_insert_one(application_data)

    db.session.commit()

    if should_auto_shortlist(job, config):
        report = run_shortlisting(job, config)
        flash(
            f"Shortlisting completed: {report['received']} received, {report['shortlisted']} shortlisted, {report['rejected']} rejected.",
            'info'
        )

    flash('Application submitted and ATS scored successfully!', 'success')
    return redirect(url_for('main.view_applications'))


@main.route('/api/face-capture/upload', methods=['POST'])
@role_required('applicant', 'both')
def upload_face_capture():
    payload = request.get_json(silent=True) or {}

    angle = str(payload.get('angle', '')).strip().lower()
    if angle not in (*REQUIRED_FACE_ANGLES, 'tilt'):
        return jsonify({'ok': False, 'error': 'Invalid face angle'}), 400

    try:
        job_id = int(payload.get('job_id'))
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'Invalid job id'}), 400

    job = Job.query.get(job_id)
    if job is None:
        return jsonify({'ok': False, 'error': 'Job not found'}), 404

    image_data = str(payload.get('image_data', '')).strip()
    try:
        image_bytes = _decode_data_url_image(image_data)
    except ValueError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400

    rel_dir = f"face_capture/temp/user_{g.user.id}/job_{job_id}"
    abs_dir = os.path.join(current_app.config['UPLOAD_FOLDER_PHOTOS'], rel_dir.replace('/', os.sep))
    os.makedirs(abs_dir, exist_ok=True)

    rel_path = f"{rel_dir}/{angle}.jpg"
    abs_path = os.path.join(current_app.config['UPLOAD_FOLDER_PHOTOS'], rel_path.replace('/', os.sep))

    with open(abs_path, 'wb') as image_file:
        image_file.write(image_bytes)

    return jsonify({'ok': True, 'angle': angle, 'face_ref': rel_path.replace('\\', '/')})

@main.route('/interview_questions', methods=['GET', 'POST'])
@role_required('applicant', 'both')
def interview_questions():
    questions = session.get('questions')
    current_question = session.get('current_question', 0)
    responses = session.get('responses', {})

    if request.method == 'POST':
        response = request.form.get('response')
        if response:
            responses[str(current_question)] = response
            session['responses'] = responses
            current_question += 1
            session['current_question'] = current_question

            if current_question >= len(questions):
                return redirect(url_for('main.review_responses'))

    if current_question < len(questions):
        question = questions[current_question]
        return render_template('interview_questions.html', question_number=current_question + 1, question_text=question)
    else:
        return redirect(url_for('main.review_responses'))

@main.route('/review_responses')
@role_required('applicant', 'both')
def review_responses():
    return render_template('loading.html', next_url = url_for('main.generate_feedbacks'))

@main.route('/generate_feedbacks')
@role_required('applicant', 'both')
def generate_feedbacks():
    responses = session.get('responses', {})
    questions = session.get('questions', [])
    job_id = session.get('job_id')
    job = Job.query.get_or_404(job_id)
    similarity_score = session.get('similarity_score')

    feedback_list = []
    for idx, response in responses.items():
        question = questions[int(idx)]
        feedback = generate_feedback(question, response, job.description)
        score = extract_score(feedback)
        time.sleep(2)  
        feedback_list.append({
            'question': question,
            'response': response,
            'feedback': feedback,
            'score':score
        })

    new_application = Application(
        user_id=g.user.id,
        job_id=job_id,
        message=similarity_score,
        timestamp=datetime.utcnow(),
        status='Pending'
    )
    db.session.add(new_application)
    db.session.commit()

    application_data = {
        'application_id': str(new_application.id),
        'user_id': str(g.user.id),
        'job_id': str(job_id),
        'responses': convert_keys_to_strings(responses),
        'feedback': feedback_list
    }
    if not mongo_insert_one(application_data):
        flash('Application saved, but interview analytics storage is temporarily unavailable.', 'info')

    flash('Application submitted successfully!', 'success')
    return redirect(url_for('main.view_applications'))


@main.route('/job/<int:job_id>/run_shortlisting', methods=['POST'])
@role_required('recruiter', 'both')
def run_shortlisting_now(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    config = JobConfig.query.filter_by(job_id=job.id, confirmed=True).first()
    if config is None:
        flash('Job configuration not found.', 'danger')
        return redirect(url_for('main.my_jobs'))

    report = run_shortlisting(job, config)
    ties_message = ' Tie at cutoff included extra candidates.' if report['ties_included'] else ''
    flash(
        f"Shortlisting complete: {report['received']} received, {report['shortlisted']} shortlisted, {report['rejected']} rejected.{ties_message}",
        'success'
    )
    return redirect(url_for('main.view_candidates', job_id=job.id))


@main.route('/job/<int:job_id>/complete_round/<int:round_number>', methods=['POST'])
@role_required('recruiter', 'both')
def complete_round(job_id, round_number):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    payload = request.form.get('round_evaluations') or request.get_json(silent=True)
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            flash('Invalid round evaluations payload.', 'danger')
            return redirect(url_for('main.view_candidates', job_id=job.id))

    if not isinstance(payload, list):
        flash('Round evaluations must be a JSON array.', 'danger')
        return redirect(url_for('main.view_candidates', job_id=job.id))

    try:
        report = complete_round_and_advance(job, round_number, payload)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect(url_for('main.view_candidates', job_id=job.id))

    flash(
        f"Round {report['round']} processed: {report['advanced']} advanced, {report['eliminated']} eliminated.",
        'success'
    )
    return redirect(url_for('main.view_candidates', job_id=job.id))

@main.route('/view_applications')
@role_required('applicant', 'both')
def view_applications():
    applications = db.session.query(
        Application,
        ApplicantPipelineState.state
    ).outerjoin(
        ApplicantPipelineState, Application.id == ApplicantPipelineState.application_id
    ).filter(
        Application.user_id == g.user.id
    ).order_by(
        Application.timestamp.desc()
    ).all()

    app_ids = [app.id for app, state in applications]
    assignments = MCQRoundAssignment.query.filter(
        MCQRoundAssignment.application_id.in_(app_ids),
        MCQRoundAssignment.is_active.is_(True)
    ).all() if app_ids else []
    assigned_ids = {item.application_id for item in assignments}

    applications_list = []
    for app, state in applications:
        job = Job.query.get(app.job_id)
        assignment = next((item for item in assignments if item.application_id == app.id), None)
        assigned_round = assignment.round_number if assignment else None
        
        # If no explicit assignment, determine the next available round
        if assigned_round is None:
            all_rounds = InterviewRoundConfig.query.filter_by(job_id=app.job_id).order_by(InterviewRoundConfig.round_number.asc()).all()
            
            # Find which rounds the candidate has completed
            completed_evaluations = RoundEvaluation.query.filter_by(job_id=app.job_id, application_id=app.id).all()
            completed_round_numbers = {eval.round_number for eval in completed_evaluations}
            
            # Find the next unstarted round that matches applicant status
            current_status = app.dynamic_status
            workflow_state = (state or '').upper()
            base_status = (app.status or '').upper()
            can_start_from_state = (
                workflow_state in {'SHORTLISTED', 'ADVANCED'}
                or workflow_state.endswith('_SCHEDULED')
                or base_status in {'SHORTLISTED', 'ADVANCED'}
            )
            
            if can_start_from_state:
                for round_cfg in all_rounds:
                    if round_cfg.round_number not in completed_round_numbers:
                        assigned_round = round_cfg.round_number
                        break
        
        assigned_round_cfg = InterviewRoundConfig.query.filter_by(job_id=app.job_id, round_number=assigned_round).first() if assigned_round else None
        assigned_round_type = assigned_round_cfg.round_type if assigned_round_cfg else ''
        assigned_round_name = assigned_round_cfg.round_name if assigned_round_cfg else ''
        is_mcq_round = _is_mcq_round_type(assigned_round_type, assigned_round_name)
        is_coding_round = _is_coding_round_type(assigned_round_type, assigned_round_name)
        is_interview_round = _is_interview_round_type(assigned_round_type, assigned_round_name)

        current_status = app.dynamic_status
        workflow_state = (state or '').upper()
        base_status = (app.status or '').upper()
        can_start_from_state = (
            workflow_state in {'SHORTLISTED', 'ADVANCED'}
            or workflow_state.endswith('_SCHEDULED')
            or base_status in {'SHORTLISTED', 'ADVANCED'}
        )

        # For MCQ/Coding rounds, require explicit assignment; for interview rounds, just check status
        can_launch_test = (
            (is_mcq_round or is_coding_round or is_interview_round)
            and can_start_from_state
            and assigned_round is not None
            and _is_round_window_open(assigned_round_cfg.schedule_window if assigned_round_cfg else None)
        )
        
        launch_url = None
        launch_label = None
        if can_launch_test:
            if is_coding_round:
                launch_url = url_for('main.start_coding_round', application_id=app.id, round_number=assigned_round)
                launch_label = f"Start Round {assigned_round} Coding"
            elif is_interview_round:
                launch_url = url_for('main.start_interview_round', application_id=app.id, round_number=assigned_round)
                launch_label = f"Start Round {assigned_round} Interview"
            else:
                launch_url = url_for('main.start_mcq_round', application_id=app.id, round_number=assigned_round)
                launch_label = f"Start Round {assigned_round} Assessment"

        applications_list.append({
            'id': app.id,
            'job_title': job.title if job else 'Unknown',
            'application_date': app.timestamp,
            'status': current_status,
            'round_launch_url': launch_url,
            'round_launch_label': launch_label,
        })

    return render_template('view_applications.html', applications=applications_list)


@main.route('/application/<int:application_id>/start_mcq_round/<int:round_number>')
@role_required('applicant', 'both')
def start_mcq_round(application_id, round_number):
    application = Application.query.get_or_404(application_id)
    if application.user_id != g.user.id:
        abort(403)

    job = Job.query.get_or_404(application.job_id)
    round_config = InterviewRoundConfig.query.filter_by(job_id=job.id, round_number=round_number).first()
    if round_config is None:
        flash(f'Round {round_number} is not configured for this job.', 'danger')
        return redirect(url_for('main.view_applications'))

    if not _is_mcq_round_type(round_config.round_type, round_config.round_name):
        flash(f'Round {round_number} is not configured as MCQ for this job.', 'danger')
        return redirect(url_for('main.view_applications'))

    if application.status not in {'Shortlisted', 'Advanced'}:
        flash('You are not eligible to start this round yet.', 'danger')
        return redirect(url_for('main.view_applications'))

    assignment = MCQRoundAssignment.query.filter_by(application_id=application.id, is_active=True).first()
    if assignment is None:
        flash('Assessment round is not assigned to you yet. Please wait for recruiter assignment.', 'danger')
        return redirect(url_for('main.view_applications'))

    if assignment.round_number != round_number:
        flash('You are not assigned to this MCQ round.', 'danger')
        return redirect(url_for('main.view_applications'))

    if not _is_round_window_open(round_config.schedule_window):
        flash(f"Round {round_number} is available only during the schedule window: {round_config.schedule_window}", 'danger')
        return redirect(url_for('main.view_applications'))

    ats_row = ATSResult.query.filter_by(application_id=application.id).first()
    resume_text = ''
    if ats_row and isinstance(ats_row.parsed_resume, dict):
        resume_text = str(ats_row.parsed_resume.get('raw_text', ''))

    focus_text = ', '.join(round_config.focus_areas or [])
    rubric_text = ', '.join(round_config.evaluation_rubric or [])
    job_requirements = (
        f"Job Title: {job.title}\n"
        f"Job Description: {job.description}\n"
        f"Round Name: {round_config.round_name}\n"
        f"Round Type: {round_config.round_type}\n"
        f"Round Topics: {focus_text}\n"
        f"Evaluation Rubric: {rubric_text}\n"
        f"Candidate Resume Context: {resume_text[:2500]}"
    )

    mcq_config = MCQRoundConfig.query.filter_by(job_id=job.id, round_number=round_number).first()
    num_questions = mcq_config.num_questions if mcq_config else 15
    timer_value = mcq_config.timer_seconds if mcq_config else 60
    easy_percent = mcq_config.easy_percent if mcq_config else 20
    medium_percent = mcq_config.medium_percent if mcq_config else 50
    hard_percent = mcq_config.hard_percent if mcq_config else 30

    query = urlencode(
        {
            'job_requirements': job_requirements,
            'num_questions': num_questions,
            'timer': timer_value,
            'easy': easy_percent,
            'medium': medium_percent,
            'hard': hard_percent,
            'autostart': 1,
            'candidate_mode': 1,
            'application_id': application.id,
            'round_number': round_number,
            'proxy_round': 'aptitude' if 'aptitude' in ((round_config.round_type or '') + ' ' + (round_config.round_name or '')).lower() else 'mcq',
            'submit_url': url_for('main.submit_mcq_round_result', application_id=application.id, round_number=round_number),
        }
    )
    mcq_url = url_for('static', filename='mcq_round/index.html')
    return redirect(f"{mcq_url}?{query}")


@main.route('/application/<int:application_id>/start_mcq_round1')
@role_required('applicant', 'both')
def start_mcq_round1(application_id):
    return redirect(url_for('main.start_mcq_round', application_id=application_id, round_number=1))


@main.route('/application/<int:application_id>/start_coding_round/<int:round_number>')
@role_required('applicant', 'both')
def start_coding_round(application_id, round_number):
    application = Application.query.get_or_404(application_id)
    if application.user_id != g.user.id:
        abort(403)

    job = Job.query.get_or_404(application.job_id)
    round_config = InterviewRoundConfig.query.filter_by(job_id=job.id, round_number=round_number).first()
    if round_config is None:
        flash(f'Round {round_number} is not configured for this job.', 'danger')
        return redirect(url_for('main.view_applications'))

    if not _is_coding_round_type(round_config.round_type, round_config.round_name):
        flash(f'Round {round_number} is not configured as Coding for this job.', 'danger')
        return redirect(url_for('main.view_applications'))

    if application.status not in {'Shortlisted', 'Advanced'}:
        flash('You are not eligible to start this round yet.', 'danger')
        return redirect(url_for('main.view_applications'))

    assignment = MCQRoundAssignment.query.filter_by(application_id=application.id, is_active=True).first()
    if assignment is None:
        flash('Coding round is not assigned to you yet. Please wait for recruiter assignment.', 'danger')
        return redirect(url_for('main.view_applications'))

    if assignment.round_number != round_number:
        flash('You are not assigned to this coding round.', 'danger')
        return redirect(url_for('main.view_applications'))

    if not _is_round_window_open(round_config.schedule_window):
        flash(f"Round {round_number} is available only during the schedule window: {round_config.schedule_window}", 'danger')
        return redirect(url_for('main.view_applications'))

    coding_config = CodingRoundConfig.query.filter_by(job_id=job.id, round_number=round_number).first()
    coding_url = (coding_config.external_url if coding_config else _default_coding_round_url()).strip()
    if not coding_url:
        coding_url = _default_coding_round_url()
    if 'github.com' in coding_url.lower() or coding_url.lower().endswith('.git'):
        coding_url = _default_coding_round_url()
    if re.match(r'^https?://(127\.0\.0\.1|localhost):3000/?$', coding_url, re.IGNORECASE):
        coding_url = _default_coding_round_url()

    selected_difficulty = (coding_config.difficulty if coding_config else 'medium').strip().lower()
    total_questions = int(coding_config.num_questions if coding_config else 5)
    easy_count = total_questions if selected_difficulty == 'easy' else 0
    medium_count = total_questions if selected_difficulty == 'medium' else 0
    hard_count = total_questions if selected_difficulty == 'hard' else 0
    if selected_difficulty not in {'easy', 'medium', 'hard'}:
        medium_count = total_questions

    query = urlencode(
        {
            'easy': easy_count,
            'medium': medium_count,
            'hard': hard_count,
            'duration': round_config.duration_minutes,
            'candidate_id': str(application.id),
            'application_id': application.id,
            'job_id': job.id,
            'round_number': round_number,
            'proxy_round': 'coding',
            'submit_url': url_for('main.submit_coding_round_result', application_id=application.id, round_number=round_number, _external=True),
            'candidate_name': f"{g.user.first_name} {g.user.last_name}",
            'job_title': job.title,
        }
    )
    separator = '&' if '?' in coding_url else '?'
    return redirect(f"{coding_url}{separator}{query}")


@main.route('/application/<int:application_id>/start_interview_round/<int:round_number>')
@role_required('applicant', 'both')
def start_interview_round(application_id, round_number):
    application = Application.query.get_or_404(application_id)
    if application.user_id != g.user.id:
        abort(403)

    job = Job.query.get_or_404(application.job_id)
    round_config = InterviewRoundConfig.query.filter_by(job_id=job.id, round_number=round_number).first()
    if round_config is None:
        flash(f'Round {round_number} not configured', 'danger')
        return redirect(url_for('main.view_applications'))

    if not _is_interview_round_type(round_config.round_type, round_config.round_name):
        flash('This is not an interview round.', 'danger')
        return redirect(url_for('main.view_applications'))

    # Check application status - must be Shortlisted or Advanced to access interview rounds
    if application.status not in {'Shortlisted', 'Advanced'}:
        flash('You are not eligible for this interview round yet.', 'danger')
        return redirect(url_for('main.view_applications'))

    # Check if round window is open
    if not _is_round_window_open(round_config.schedule_window):
        flash(f"Round {round_number} is available only during the schedule window: {round_config.schedule_window}", 'danger')
        return redirect(url_for('main.view_applications'))

    ats_row = ATSResult.query.filter_by(application_id=application.id).first()
    parsed_resume = ats_row.parsed_resume if ats_row and isinstance(ats_row.parsed_resume, dict) else {}

    focus_items = [str(item).strip() for item in (round_config.focus_areas or []) if str(item).strip()]
    rubric_items = [str(item).strip() for item in (round_config.evaluation_rubric or []) if str(item).strip()]

    resume_summary = str(
        parsed_resume.get('summary')
        or parsed_resume.get('experience_summary')
        or parsed_resume.get('raw_text')
        or ''
    ).strip()
    resume_summary = resume_summary[:1800]

    raw_skills = parsed_resume.get('skills') or parsed_resume.get('technical_skills') or []
    if isinstance(raw_skills, str):
        resume_skills = [item.strip() for item in re.split(r',|;', raw_skills) if item.strip()]
    elif isinstance(raw_skills, list):
        resume_skills = [str(item).strip() for item in raw_skills if str(item).strip()]
    else:
        resume_skills = []
    resume_skills = resume_skills[:10]

    hr_prompt_parts = [
        f"Technical interview for role: {job.title}.",
        f"Recruiter focus topics: {', '.join(focus_items) if focus_items else 'Problem solving, system thinking, role depth'}.",
        f"Evaluation rubric priorities: {', '.join(rubric_items) if rubric_items else 'Communication, technical depth, culture fit'}.",
        "Generate practical technical questions grounded in recruiter topics and candidate resume context.",
        "Keep some communication and culture-fit questions in the set.",
    ]
    hr_prompt = ' '.join(hr_prompt_parts)

    interview_url = 'http://127.0.0.1:3000/'
    query = urlencode(
        {
            'application_id': application.id,
            'round_number': round_number,
            'job_id': job.id,
            'proxy_round': 'technical',
            'candidate_name': f"{g.user.first_name} {g.user.last_name}",
            'job_title': job.title,
            'hr_prompt': hr_prompt,
            'resume_summary': resume_summary,
            'resume_skills': ', '.join(resume_skills),
            'total_questions': 10,
            'scenario_percentage': 35,
            'resume_validation_percentage': 25,
        }
    )
    separator = '&' if '?' in interview_url else '?'
    return redirect(f"{interview_url}{separator}{query}")


@main.route('/application/<int:application_id>/mcq_round/<int:round_number>/submit_result', methods=['POST'])
@role_required('applicant', 'both')
def submit_mcq_round_result(application_id, round_number):
    application = Application.query.get_or_404(application_id)
    if application.user_id != g.user.id:
        abort(403)

    assignment = MCQRoundAssignment.query.filter_by(application_id=application.id, is_active=True).first()
    if assignment is None or assignment.round_number != round_number:
        return jsonify({'error': 'MCQ round is not assigned for this application'}), 400

    round_config = InterviewRoundConfig.query.filter_by(job_id=application.job_id, round_number=round_number).first()
    if round_config is None or not _is_mcq_round_type(round_config.round_type, round_config.round_name if round_config else None):
        return jsonify({'error': 'Configured round is not MCQ'}), 400

    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get('session_id', '')).strip()
    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400

    mcq_api_base = current_app.config.get('MCQ_API_URL', 'http://localhost:8000').rstrip('/')
    results_url = f"{mcq_api_base}/api/results/{session_id}"

    try:
        with urllib.request.urlopen(results_url, timeout=30) as response:
            content = response.read().decode('utf-8')
            results_data = json.loads(content)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logging.error('Failed to fetch MCQ results from backend: %s', exc)
        return jsonify({'error': 'Unable to validate MCQ results. Please try again.'}), 502

    score_payload = results_data.get('score') or {}
    round_score = float(score_payload.get('percentage') or 0.0)
    proxy_score = payload.get('proxy_score')
    proxy_events = payload.get('proxy_events') or []
    try:
        proxy_score = float(proxy_score) if proxy_score is not None else None
    except (TypeError, ValueError):
        proxy_score = None

    existing = RoundEvaluation.query.filter_by(application_id=application.id, round_number=round_number).first()
    evaluation_data = {
        'source': 'mcq_backend',
        'session_id': session_id,
        'score': score_payload,
        'difficulty_breakdown': results_data.get('difficulty_breakdown', {}),
        'category_breakdown': results_data.get('category_breakdown', {}),
        'total_questions': int(score_payload.get('total') or 0),
        'correct_answers': int(score_payload.get('correct') or 0),
        'proxy_score': proxy_score,
        'proxy_events': proxy_events,
    }

    if existing is None:
        existing = RoundEvaluation(
            application_id=application.id,
            applicant_id=application.user_id,
            job_id=application.job_id,
            round_number=round_number,
            round_score=round_score,
            evaluation_data=evaluation_data,
            completed_at=datetime.utcnow(),
        )
        db.session.add(existing)
    else:
        existing.round_score = round_score
        existing.evaluation_data = evaluation_data
        existing.completed_at = datetime.utcnow()

    assignment.is_active = False
    upsert_pipeline_state(application, f'ROUND_{round_number}_COMPLETED')

    next_round = _get_next_assignable_round(application.job_id, round_number)
    if next_round is None:
        application.status = 'Advanced'
    else:
        assignment.round_number = next_round.round_number
        assignment.is_active = True
        assignment.assigned_at = datetime.utcnow()
        application.status = 'Advanced'
        upsert_pipeline_state(application, f'ROUND_{next_round.round_number}_SCHEDULED')

    db.session.commit()

    if next_round is None:
        return jsonify({'success': True, 'message': 'Round submitted successfully'})
    return jsonify({'success': True, 'message': f'Round submitted successfully. Next round (Round {next_round.round_number}) is now assigned.'})


@main.route('/application/<int:application_id>/coding_round/<int:round_number>/submit_result', methods=['GET', 'POST'])
@role_required('applicant', 'both')
def submit_coding_round_result(application_id, round_number):
    application = Application.query.get_or_404(application_id)
    if application.user_id != g.user.id:
        abort(403)

    assignment = MCQRoundAssignment.query.filter_by(application_id=application.id).first()
    if assignment is None:
        flash('Coding round assignment not found for this application.', 'danger')
        return redirect(url_for('main.view_applications'))

    if assignment.round_number != round_number and assignment.is_active:
        flash('This coding round is not assigned for your application.', 'danger')
        return redirect(url_for('main.view_applications'))

    round_config = InterviewRoundConfig.query.filter_by(job_id=application.job_id, round_number=round_number).first()
    if round_config is None or not _is_coding_round_type(round_config.round_type, round_config.round_name if round_config else None):
        flash('Configured round is not coding.', 'danger')
        return redirect(url_for('main.view_applications'))

    payload = request.get_json(silent=True) if request.method == 'POST' else {}
    percentage_raw = (
        (payload or {}).get('percentage')
        or request.args.get('percentage')
        or request.args.get('score')
        or 0
    )
    try:
        round_score = float(percentage_raw)
    except (TypeError, ValueError):
        round_score = 0.0

    interview_id = (
        (payload or {}).get('interview_id')
        or request.args.get('interview_id')
        or ''
    )
    total_score = (
        (payload or {}).get('total_score')
        or request.args.get('total_score')
    )
    max_score = (
        (payload or {}).get('max_score')
        or request.args.get('max_score')
    )
    verdict = (
        (payload or {}).get('verdict')
        or request.args.get('verdict')
    )
    proxy_score = (
        (payload or {}).get('proxy_score')
        or request.args.get('proxy_score')
    )
    proxy_events = (
        (payload or {}).get('proxy_events')
        or request.args.get('proxy_events')
        or []
    )
    try:
        proxy_score = float(proxy_score) if proxy_score is not None else None
    except (TypeError, ValueError):
        proxy_score = None

    existing = RoundEvaluation.query.filter_by(application_id=application.id, round_number=round_number).first()
    evaluation_data = {
        'source': 'dsa_round',
        'interview_id': interview_id,
        'percentage': round_score,
        'total_score': total_score,
        'max_score': max_score,
        'verdict': verdict,
        'proxy_score': proxy_score,
        'proxy_events': proxy_events,
    }

    if existing is None:
        existing = RoundEvaluation(
            application_id=application.id,
            applicant_id=application.user_id,
            job_id=application.job_id,
            round_number=round_number,
            round_score=round_score,
            evaluation_data=evaluation_data,
            completed_at=datetime.utcnow(),
        )
        db.session.add(existing)
    else:
        existing.round_score = round_score
        existing.evaluation_data = evaluation_data
        existing.completed_at = datetime.utcnow()

    assignment.is_active = False
    upsert_pipeline_state(application, f'ROUND_{round_number}_COMPLETED')

    next_round = _get_next_assignable_round(application.job_id, round_number)
    if next_round is None:
        application.status = 'Advanced'
    else:
        assignment.round_number = next_round.round_number
        assignment.is_active = True
        assignment.assigned_at = datetime.utcnow()
        application.status = 'Advanced'
        upsert_pipeline_state(application, f'ROUND_{next_round.round_number}_SCHEDULED')

    db.session.commit()

    if request.method == 'POST':
        if next_round is None:
            return jsonify({'success': True, 'message': 'Coding round submitted successfully'})
        return jsonify({'success': True, 'message': f'Coding round submitted. Next round (Round {next_round.round_number}) assigned.'})

    if next_round is None:
        flash('Coding round submitted successfully.', 'success')
    else:
        flash(f'Coding round submitted. Next round (Round {next_round.round_number}) is assigned.', 'success')
    return redirect(url_for('main.view_applications'))

@main.route('/view_candidates/<int:job_id>')
@role_required('recruiter', 'both')
def view_candidates(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    applications = Application.query.filter_by(job_id=job_id).all()
    app_ids = [item.id for item in applications]
    assignments = MCQRoundAssignment.query.filter(
        MCQRoundAssignment.application_id.in_(app_ids),
        MCQRoundAssignment.is_active.is_(True)
    ).all() if app_ids else []
    assigned_ids = {item.application_id for item in assignments}

    target_round = _get_first_assignable_round(job_id)

    completed_first_round_ids = set()
    if target_round is not None and app_ids:
        completed_rows = RoundEvaluation.query.filter(
            RoundEvaluation.application_id.in_(app_ids),
            RoundEvaluation.job_id == job_id,
            RoundEvaluation.round_number == target_round.round_number,
        ).all()
        completed_first_round_ids = {row.application_id for row in completed_rows}

    round_configs = InterviewRoundConfig.query.filter_by(job_id=job_id).order_by(InterviewRoundConfig.round_number.asc()).all()
    candidates = []
    for app in applications:
        user = User.query.get(app.user_id)
        if user is None:
            continue
        can_assign_mcq = (
            target_round is not None
            and app.status in {'Shortlisted', 'Advanced'}
            and app.id not in assigned_ids
            and app.id not in completed_first_round_ids
        )
        candidates.append({
            'application_id': app.id,
            'name': f"{user.first_name} {user.last_name}",
            'email': user.email,
            'phone': user.phone_number,
            'status': app.status,
            'applied_on': app.timestamp,
            'mcq_assigned': app.id in assigned_ids,
            'can_assign_mcq': can_assign_mcq,
        })

    return render_template('view_candidates.html', candidates=candidates, job=job, round_configs=round_configs)


@main.route('/application/<int:application_id>/assign_mcq_round1', methods=['POST'])
@role_required('recruiter', 'both')
def assign_mcq_round1(application_id):
    application = Application.query.get_or_404(application_id)
    job = Job.query.get_or_404(application.job_id)
    if job.user_id != g.user.id:
        abort(403)

    target_round = _get_first_assignable_round(job.id)
    if target_round is None:
        flash('No assignable test round (Assessment/Coding) is configured for this job.', 'danger')
        return redirect(url_for('main.view_candidates', job_id=job.id))

    if application.status not in {'Shortlisted', 'Advanced'}:
        flash('Only shortlisted/advanced candidates can be assigned to a round.', 'danger')
        return redirect(url_for('main.view_candidates', job_id=job.id))

    assignment = MCQRoundAssignment.query.filter_by(application_id=application.id).first()
    if assignment is None:
        assignment = MCQRoundAssignment(
            application_id=application.id,
            job_id=job.id,
            applicant_id=application.user_id,
            assigned_by=g.user.id,
            round_number=target_round.round_number,
            is_active=True,
        )
        db.session.add(assignment)
    else:
        assignment.assigned_by = g.user.id
        assignment.job_id = job.id
        assignment.applicant_id = application.user_id
        assignment.round_number = target_round.round_number
        assignment.is_active = True
        assignment.assigned_at = datetime.utcnow()

    applicant = User.query.get(application.user_id)
    if applicant is not None:
        _send_round_assignment_email(
            applicant=applicant,
            application=application,
            job=job,
            round_config=target_round,
        )

    db.session.commit()
    flash(f'Assigned {target_round.round_name} (Round {target_round.round_number}) to candidate successfully.', 'success')
    return redirect(url_for('main.view_candidates', job_id=job.id))


@main.route('/job/<int:job_id>/shortlist_report')
@role_required('recruiter', 'both')
def shortlist_report(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    ats_rows = ATSResult.query.filter_by(job_id=job_id).order_by(ATSResult.ats_score.desc()).all()
    shortlisted = []
    rejected = []

    for row in ats_rows:
        app = Application.query.get(row.application_id)
        user = User.query.get(row.applicant_id)
        if app is None or user is None:
            continue

        item = {
            'application_id': app.id,
            'candidate_name': f"{user.first_name} {user.last_name}",
            'email': user.email,
            'ats_score': row.ats_score,
            'score_breakdown': row.score_breakdown,
            'reason': row.shortlist_reason or 'Evaluated by ATS',
            'status': app.status,
        }

        if app.status in {'Shortlisted', 'Advanced', 'Recommended', 'Accepted'}:
            shortlisted.append(item)
        elif app.status in {'Rejected', 'Eliminated'}:
            rejected.append(item)

    summary = {
        'received': len(ats_rows),
        'shortlisted': len(shortlisted),
        'rejected': len(rejected),
    }

    return render_template(
        'shortlist_report.html',
        job=job,
        summary=summary,
        shortlisted=shortlisted,
        rejected=rejected,
    )


@main.route('/job/<int:job_id>/extract_interview_plan', methods=['POST'])
@role_required('recruiter', 'both')
def extract_interview_plan(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    payload = request.get_json(silent=True) or {}
    prompt = payload.get('prompt', '')
    rounds = _extract_interview_plan_from_prompt(prompt)
    return jsonify({'rounds': rounds})


@main.route('/job/<int:job_id>/schedule_interview', methods=['GET', 'POST'])
@role_required('recruiter', 'both')
def schedule_interview(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    if request.method == 'POST':
        form_action = request.form.get('form_action', 'save')
        rounds_payload = request.form.get('rounds_payload', '').strip()
        try:
            rounds = parse_rounds_payload(rounds_payload)
        except ValueError as e:
            flash(str(e), 'danger')
            return redirect(url_for('main.schedule_interview', job_id=job.id))

        if not rounds:
            flash('Please add at least one interview round.', 'danger')
            return redirect(url_for('main.schedule_interview', job_id=job.id))

        InterviewRoundConfig.query.filter_by(job_id=job.id).delete()
        MCQRoundConfig.query.filter_by(job_id=job.id).delete()
        CodingRoundConfig.query.filter_by(job_id=job.id).delete()
        for round_row in rounds:
            db.session.add(
                InterviewRoundConfig(
                    job_id=job.id,
                    round_number=round_row['round_number'],
                    round_name=round_row['round_name'],
                    round_type=round_row['round_type'],
                    duration_minutes=round_row['duration_minutes'],
                    focus_areas=round_row['focus_areas'],
                    advance_count=round_row['advance_count'],
                    evaluation_rubric=round_row['evaluation_rubric'],
                    schedule_window=round_row['schedule_window'],
                )
            )
            if _is_mcq_round_type(round_row.get('round_type'), round_row.get('round_name')):
                mcq_conf = round_row.get('mcq_config') or {}
                db.session.add(
                    MCQRoundConfig(
                        job_id=job.id,
                        round_number=round_row['round_number'],
                        num_questions=int(mcq_conf.get('num_questions', 15)),
                        timer_seconds=int(mcq_conf.get('timer_seconds', 60)),
                        easy_percent=int(mcq_conf.get('easy_percent', 20)),
                        medium_percent=int(mcq_conf.get('medium_percent', 50)),
                        hard_percent=int(mcq_conf.get('hard_percent', 30)),
                    )
                )
            elif _is_coding_round_type(round_row.get('round_type'), round_row.get('round_name')):
                coding_conf = round_row.get('coding_config') or {}
                db.session.add(
                    CodingRoundConfig(
                        job_id=job.id,
                        round_number=round_row['round_number'],
                        external_url=str(coding_conf.get('external_url', _default_coding_round_url())).strip(),
                        num_questions=int(coding_conf.get('num_questions', 5)),
                        difficulty=str(coding_conf.get('difficulty', 'medium')).strip().lower(),
                    )
                )

        db.session.commit()
        flash('Interview rounds saved successfully.', 'success')

        if form_action == 'assign_mcq':
            target_round = _get_first_assignable_round(job.id)
            if target_round is None:
                flash('No assignable test round (Assessment/Coding) is configured.', 'danger')
                return redirect(url_for('main.schedule_interview', job_id=job.id))

            eligible_apps = Application.query.filter_by(job_id=job.id).filter(
                Application.status.in_(['Shortlisted', 'Advanced'])
            ).all()

            assigned_count = 0
            for app in eligible_apps:
                assignment = MCQRoundAssignment.query.filter_by(application_id=app.id).first()
                if assignment is None:
                    assignment = MCQRoundAssignment(
                        application_id=app.id,
                        job_id=job.id,
                        applicant_id=app.user_id,
                        assigned_by=g.user.id,
                        round_number=target_round.round_number,
                        is_active=True,
                    )
                    db.session.add(assignment)
                else:
                    assignment.job_id = job.id
                    assignment.applicant_id = app.user_id
                    assignment.assigned_by = g.user.id
                    assignment.round_number = target_round.round_number
                    assignment.is_active = True
                    assignment.assigned_at = datetime.utcnow()

                applicant = User.query.get(app.user_id)
                if applicant is not None:
                    _send_round_assignment_email(
                        applicant=applicant,
                        application=app,
                        job=job,
                        round_config=target_round,
                    )
                assigned_count += 1

            db.session.commit()
            flash(f'Assigned {target_round.round_name} (Round {target_round.round_number}) to {assigned_count} shortlisted candidates.', 'success')
            return redirect(url_for('main.view_candidates', job_id=job.id))

        return redirect(url_for('main.view_candidates', job_id=job.id))

    existing_rounds = InterviewRoundConfig.query.filter_by(job_id=job.id).order_by(InterviewRoundConfig.round_number.asc()).all()
    existing_mcq_configs = {
        (item.round_number): item
        for item in MCQRoundConfig.query.filter_by(job_id=job.id).all()
    }
    existing_coding_configs = {
        (item.round_number): item
        for item in CodingRoundConfig.query.filter_by(job_id=job.id).all()
    }
    rounds_data = [
        {
            'round_number': row.round_number,
            'round_name': row.round_name,
            'round_type': row.round_type,
            'duration_minutes': row.duration_minutes,
            'focus_areas': row.focus_areas or [],
            'advance_count': row.advance_count,
            'evaluation_rubric': row.evaluation_rubric or [],
            'schedule_window': row.schedule_window or 'To be scheduled',
            'mcq_config': (
                {
                    'num_questions': existing_mcq_configs[row.round_number].num_questions,
                    'timer_seconds': existing_mcq_configs[row.round_number].timer_seconds,
                    'easy_percent': existing_mcq_configs[row.round_number].easy_percent,
                    'medium_percent': existing_mcq_configs[row.round_number].medium_percent,
                    'hard_percent': existing_mcq_configs[row.round_number].hard_percent,
                }
                if row.round_number in existing_mcq_configs
                else None
            ),
            'coding_config': (
                {
                    'external_url': existing_coding_configs[row.round_number].external_url,
                    'num_questions': existing_coding_configs[row.round_number].num_questions,
                    'difficulty': existing_coding_configs[row.round_number].difficulty,
                }
                if row.round_number in existing_coding_configs
                else None
            ),
        }
        for row in existing_rounds
    ]

    return render_template('schedule_interview.html', job=job, rounds_data=rounds_data)


@main.route('/api/mark-round-complete', methods=['POST'])
def mark_round_complete():
    try:
        data = request.get_json(silent=True) or {}
        application_id = data.get('application_id')
        round_number = data.get('round_number')
        round_score = data.get('round_score', 0)
        evaluation_data = data.get('evaluation_data') or {}

        if not application_id or not round_number:
            return jsonify({'error': 'Missing application_id or round_number'}), 400

        try:
            application_id = int(application_id)
            round_number = int(round_number)
        except (TypeError, ValueError):
            return jsonify({'error': 'application_id and round_number must be integers'}), 400

        try:
            round_score = float(round_score)
        except (TypeError, ValueError):
            round_score = 0.0

        assignment = MCQRoundAssignment.query.filter_by(
            application_id=application_id,
            round_number=round_number,
        ).first()

        application = Application.query.get(application_id)
        if application is None:
            return jsonify({'error': 'Application not found'}), 404

        if assignment:
            assignment.is_active = False
            assignment.assigned_at = datetime.utcnow()

        existing_eval = RoundEvaluation.query.filter_by(
            application_id=application_id,
            round_number=round_number,
        ).first()

        if existing_eval:
            existing_eval.round_score = round_score
            existing_eval.evaluation_data = evaluation_data if isinstance(evaluation_data, dict) else {'raw': evaluation_data}
            existing_eval.completed_at = datetime.utcnow()
        else:
            db.session.add(
                RoundEvaluation(
                    application_id=application_id,
                    applicant_id=application.user_id,
                    job_id=application.job_id,
                    round_number=round_number,
                    round_score=round_score,
                    evaluation_data=evaluation_data if isinstance(evaluation_data, dict) else {'raw': evaluation_data},
                    completed_at=datetime.utcnow(),
                )
            )

        upsert_pipeline_state(application=application, state='UNDER_REVIEW')
        db.session.commit()
        return jsonify({'success': True, 'message': f'Round {round_number} marked as completed'}), 200

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error marking round complete: {str(e)}")
        return jsonify({'error': str(e)}), 500


@main.route('/job/<int:job_id>/round_scoring')
@role_required('recruiter', 'both')
def round_scoring_overview(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    round_configs = InterviewRoundConfig.query.filter_by(job_id=job_id).order_by(InterviewRoundConfig.round_number.asc()).all()
    applications = Application.query.filter_by(job_id=job_id).all()
    users_by_id = {user.id: user for user in User.query.filter(User.id.in_([app.user_id for app in applications])).all()} if applications else {}

    evaluation_rows_all = RoundEvaluation.query.filter_by(job_id=job_id).all()
    evaluations_by_app_and_round = {
        (row.application_id, row.round_number): row for row in evaluation_rows_all
    }

    matrix_rows = []
    for app in applications:
        user = users_by_id.get(app.user_id)
        if user is None:
            continue

        include_row = app.status in {'Shortlisted', 'Advanced'} or any(
            row.application_id == app.id for row in evaluation_rows_all
        )
        if not include_row:
            continue

        completed_rounds = {
            row.round_number for row in evaluation_rows_all if row.application_id == app.id
        }

        next_assigned_round = 1
        while next_assigned_round in completed_rounds:
            next_assigned_round += 1

        round_cells = []
        total_score = 0.0
        has_any_score = False

        for round_config in round_configs:
            evaluation = evaluations_by_app_and_round.get((app.id, round_config.round_number))
            if evaluation is not None:
                score_value = float(evaluation.round_score)
                total_score += score_value
                has_any_score = True
                round_cells.append({
                    'score': score_value,
                    'assigned': False,
                })
                continue

            is_assigned = (
                app.status in {'Shortlisted', 'Advanced'}
                and round_config.round_number == next_assigned_round
                and next_assigned_round <= len(round_configs)
            )
            round_cells.append({
                'score': None,
                'assigned': is_assigned,
            })

        matrix_rows.append({
            'application_id': app.id,
            'name': f"{user.first_name} {user.last_name}",
            'status': app.status,
            'round_cells': round_cells,
            'total_score': total_score if has_any_score else None,
        })

    matrix_rows.sort(key=lambda row: row['total_score'] if row['total_score'] is not None else -1, reverse=True)

    sections = []
    for round_config in round_configs:
        evaluation_rows = RoundEvaluation.query.filter_by(job_id=job_id, round_number=round_config.round_number).all()
        evaluations_by_app = {row.application_id: row for row in evaluation_rows}

        round_candidates = []
        for app in applications:
            include_row = app.status in {'Shortlisted', 'Advanced'} or app.id in evaluations_by_app
            if not include_row:
                continue

            user = users_by_id.get(app.user_id)
            if user is None:
                continue

            evaluation = evaluations_by_app.get(app.id)
            notes = ''
            if evaluation and isinstance(evaluation.evaluation_data, dict):
                notes = str(evaluation.evaluation_data.get('notes', ''))

            round_candidates.append({
                'application_id': app.id,
                'name': f"{user.first_name} {user.last_name}",
                'email': user.email,
                'status': app.status,
                'existing_score': evaluation.round_score if evaluation else None,
                'existing_notes': notes,
            })

        sections.append({
            'round': round_config,
            'is_mcq': _is_mcq_round_type(round_config.round_type, round_config.round_name),
            'candidates': round_candidates,
        })

    return render_template(
        'round_scoring.html',
        job=job,
        sections=sections,
        round_headers=round_configs,
        matrix_rows=matrix_rows,
    )


@main.route('/job/<int:job_id>/round_scoring/<int:round_number>')
@role_required('recruiter', 'both')
def round_scoring_form(job_id, round_number):
    return redirect(f"{url_for('main.round_scoring_overview', job_id=job_id)}#round-{round_number}")

@main.route('/view_interview/<int:application_id>')
@role_required('recruiter', 'both')
def view_interview(application_id):
    application = Application.query.get_or_404(application_id)
    job = Job.query.get(application.job_id)
    if job.user_id != g.user.id:
        abort(403)

    application_data = mongo_find_one({'application_id': str(application_id)})
    if not application_data:
        flash('Interview data not found.', 'danger')
        return redirect(url_for('main.view_candidates', job_id=job.id))

    feedback_list = application_data.get('feedback', [])
    
    # Pass application_id to the template 
    return render_template('view_interview.html', feedback_list=feedback_list, applicant=application.user, application_id=application_id)

@main.route('/accept_application/<int:application_id>', methods=['POST'])
@role_required('recruiter', 'both')
def accept_application(application_id):
    application = Application.query.get_or_404(application_id)
    job = Job.query.get(application.job_id)
    if job.user_id != g.user.id:
        abort(403)

    application.status = 'Accepted'
    upsert_pipeline_state(application, 'ACCEPTED')

    applicant = User.query.get(application.user_id)
    config = JobConfig.query.filter_by(job_id=job.id, confirmed=True).first()
    company_name = config.company_display_name if config else 'Station-S'
    reply_to = config.reply_to_email if config else None

    if applicant is not None:
        dispatch_email(
            applicant=applicant,
            job=job,
            application_id=application.id,
            event_type='FINAL_SELECTED',
            subject=f"Congratulations! You're selected for {job.title}",
            body=(
                f"Hi {applicant.first_name},\n\n"
                f"Great news — you have been selected for the role of {job.title}.\n"
                "Our recruitment team will reach out with the next steps shortly.\n\n"
                f"Reply to: {reply_to or 'Recruitment Team'}\n"
                f"- {company_name} Recruitment Team"
            ),
            reply_to=reply_to,
        )

    db.session.commit()
    flash('Application accepted.', 'success')
    return redirect(url_for('main.view_candidates', job_id=job.id))

@main.route('/reject_application/<int:application_id>', methods=['POST'])
@role_required('recruiter', 'both')
def reject_application(application_id):
    application = Application.query.get_or_404(application_id)
    job = Job.query.get(application.job_id)
    if job.user_id != g.user.id:
        abort(403)

    application.status = 'Rejected'
    upsert_pipeline_state(application, 'REJECTED')

    applicant = User.query.get(application.user_id)
    config = JobConfig.query.filter_by(job_id=job.id, confirmed=True).first()
    company_name = config.company_display_name if config else 'Station-S'
    reply_to = config.reply_to_email if config else None

    if applicant is not None:
        dispatch_email(
            applicant=applicant,
            job=job,
            application_id=application.id,
            event_type='FINAL_REJECTED',
            subject=f"Update on your application for {job.title}",
            body=(
                f"Hi {applicant.first_name},\n\n"
                f"Thank you for your time and effort throughout the process for {job.title}.\n"
                "After careful review, we are unable to move forward with your application at this time.\n"
                "We appreciate your interest and encourage you to apply again in the future.\n\n"
                f"Reply to: {reply_to or 'Recruitment Team'}\n"
                f"- {company_name} Recruitment Team"
            ),
            reply_to=reply_to,
        )

    db.session.commit()
    flash('Application rejected.', 'success')
    return redirect(url_for('main.view_candidates', job_id=job.id))

@main.route('/dashboard')
@role_required('recruiter', 'both')
def dashboard():
    jobs = Job.query.filter_by(user_id=g.user.id).all()
    recent_jobs = Job.query.filter_by(user_id=g.user.id).order_by(Job.date_posted.desc()).limit(5).all()
    job_ids = [job.id for job in jobs]
    funnel_counts = {
        'jobs_count': len(jobs),
        'applications_received': 0,
        'job_offers': 0,
        'active_rounds': 0,
    }
    application_counts_by_job = {}

    if job_ids:
        funnel_counts['applications_received'] = Application.query.filter(
            Application.job_id.in_(job_ids)
        ).count()

        application_counts = db.session.query(
            Application.job_id,
            db.func.count(Application.id)
        ).filter(
            Application.job_id.in_(job_ids)
        ).group_by(
            Application.job_id
        ).all()
        application_counts_by_job = {job_id: count for job_id, count in application_counts}

        funnel_counts['job_offers'] = Application.query.filter(
            Application.job_id.in_(job_ids),
            Application.status.in_(['Accepted', 'Offer'])
        ).count()

        funnel_counts['active_rounds'] = MCQRoundAssignment.query.filter(
            MCQRoundAssignment.job_id.in_(job_ids),
            MCQRoundAssignment.is_active.is_(True)
        ).count()

    recent_jobs_data = [
        {
            'id': job.id,
            'title': job.title,
            'application_count': application_counts_by_job.get(job.id, 0),
            'status': 'Active',
            'date_posted': job.date_posted,
        }
        for job in recent_jobs
    ]

    return render_template('dashboard.html', jobs=recent_jobs_data, funnel_counts=funnel_counts)

@main.route('/get_job_data/<int:job_id>')
@role_required('recruiter', 'both')
def get_job_data(job_id):
    job = Job.query.get_or_404(job_id)
    if job.user_id != g.user.id:
        abort(403)

    applications = Application.query.filter_by(job_id=job_id).all()
    candidates = []
    ages = []
    questions_responses = []

    for app in applications:
        candidate = User.query.get(app.user_id)
        feedback_data = mongo_find_one({'application_id': str(app.id)}) or {}
        total_score = sum(fb['score'] for fb in feedback_data.get('feedback', []) if fb['score'] is not None)
        try:
            birthday = datetime.strptime(candidate.birthday, "%Y-%m-%d")
            today = datetime.now()
            age = today.year - birthday.year - ((today.month, today.day) < (birthday.month, birthday.day))
        except ValueError:
            age = None  
        if age is not None:
            ages.append(age)

        candidates.append({
            'name': f"{candidate.first_name} {candidate.last_name}",
            'score': total_score,
            'app_id': app.id
        })

        # Add questions and responses
        if feedback_data:
            for feedback in feedback_data.get('feedback', []):
                # Handle None score values by setting them to 0
                score = feedback.get('score', 0) or 0
                questions_responses.append({
                    'question': feedback.get('question', ''),
                    'response': feedback.get('response', ''),
                    'score': score
                })

    # Sort candidates by score and select the top 3
    top_candidates = sorted(candidates, key=lambda x: x['score'], reverse=True)[:3]

    # Add similarity score for top 3 candidates
    for candidate in top_candidates:
        app = Application.query.get(candidate['app_id'])
        try:
            similarity_score = float(app.message)
        except ValueError:
            similarity_score = 0.0  # Default value if conversion fails

        candidate['similarity'] = similarity_score  # Add similarity score to top candidates

    # Prepare data for both top candidates and all candidates
    all_candidates = [{'name': c['name'], 'totalScore': c['score']} for c in candidates]
    scores = [{'name': c['name'], 'totalScore': c['score'], 'similarity': c.get('similarity', 0)} for c in top_candidates]

    return jsonify({
        'topCandidates': top_candidates,
        'allCandidates': all_candidates,
        'scores': scores,
        'ages': ages,
        'questionsResponses': sorted(questions_responses, key=lambda x: x['score'], reverse=True)
    })


@main.route('/api/extract-job-details', methods=['POST'])
@role_required('recruiter', 'both')
def extract_job_details():
    if 'job_description_pdf' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['job_description_pdf']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        temp_dir = os.path.join(current_app.root_path, 'tmp')
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, secure_filename(file.filename))
        
        try:
            file.save(temp_path)
            with open(temp_path, 'rb') as f:
                extracted_data = parse_job_description_pdf(f)
            return jsonify(extracted_data)
        except Exception as e:
            logging.exception(f"Error parsing PDF: {e}")
            return jsonify({"error": "Failed to parse PDF"}), 500
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
    return jsonify({"error": "Invalid file type"}), 400
