import sys
import time
sys.path.insert(0, r"C:\Users\Navinkumar\Downloads\Smart\SmartRecruit_LLM")
from app import create_app, db
from app.models import User, Job, JobConfig, Application
from app.pipeline import dispatch_email

app = create_app()
with app.app_context():
    navin = User.query.filter_by(email='navin5447499@gmail.com').first()
    job = Job.query.get(1)
    config = JobConfig.query.filter_by(job_id=1, confirmed=True).first()
    application = Application.query.filter_by(user_id=navin.id, job_id=1).first()

    print('Waiting 120 seconds before sending shortlisted email...')
    time.sleep(120)

    subject = f"You are shortlisted for {job.title}"
    body = (
        f"Hi {navin.first_name},\n\n"
        f"You are shortlisted for this job: {job.title}.\n"
        "Further round information will be shared shortly.\n\n"
        f"Reply to: {config.reply_to_email}\n"
        f"- {config.company_display_name} Recruitment Team"
    )

    dispatch_email(
        applicant=navin,
        job=job,
        application_id=application.id,
        event_type='SHORTLISTED',
        subject=subject,
        body=body,
        reply_to=config.reply_to_email,
    )
    db.session.commit()
    print('Shortlisted email process completed for navin5447499@gmail.com')
