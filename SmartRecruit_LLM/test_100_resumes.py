#!/usr/bin/env python
import sys
import os
import shutil
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models import User, Job, JobConfig, Application, ATSResult, ApplicantPipelineState
from app.pipeline import parse_resume_to_json, score_resume_against_job, upsert_pipeline_state

def main():
    app = create_app()
    ctx = app.app_context()
    ctx.push()
    
    # Paths
    resume_dir = r'C:\Users\Navinkumar\Downloads\Smart\SmartRecruit_LLM\resume dataset\data\data\INFORMATION-TECHNOLOGY'
    upload_dir = os.path.join(os.path.dirname(__file__), 'app', 'static', 'uploads', 'cv')
    
    # Get all PDFs in IT folder
    resume_files = sorted([f for f in os.listdir(resume_dir) if f.lower().endswith('.pdf')])[:100]
    print(f"Found {len(resume_files)} resumes to process\n")
    
    # Get job and config
    job = Job.query.get(1)
    config = JobConfig.query.filter_by(job_id=1, confirmed=True).first()
    
    if not job:
        print("Job ID 1 not found")
        ctx.pop()
        return
    if not config:
        print("Job config not found or not confirmed")
        ctx.pop()
        return
    
    print(f"Job: {job.title}")
    print(f"Job Config ID: {config.id}\n")
    
    # Track results
    created_users = 0
    submitted_applications = 0
    ats_scores = []
    shortlisted = 0
    
    # Process each resume
    for idx, resume_file in enumerate(resume_files, 1):
        email = f"applicant_{idx:03d}@test.com"
        first_name = f"Applicant{idx:03d}"
        last_name = "Test"
        
        # Create or get user
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(
                first_name=first_name,
                last_name=last_name,
                company_name="NA",
                email=email,
                phone_number=f"90000000{idx:02d}",
                birthday="1990-01-01",
                role='applicant'
            )
            user.set_password('test123')
            db.session.add(user)
            db.session.flush()
            created_users += 1
        
        # Copy resume
        source_path = os.path.join(resume_dir, resume_file)
        dest_filename = f"resume_{idx:03d}_{resume_file}"
        dest_path = os.path.join(upload_dir, dest_filename)
        
        try:
            shutil.copy(source_path, dest_path)
            user.cv_file = dest_filename
            db.session.commit()
        except Exception as e:
            print(f"  Error copying resume {idx}: {e}")
            db.session.rollback()
            continue
        
        # Check if already applied
        existing = Application.query.filter_by(user_id=user.id, job_id=job.id).first()
        if existing:
            print(f"{idx:3d}. {email} - Already applied")
            continue
        
        # Parse resume and score
        try:
            parsed_resume = parse_resume_to_json(dest_path)
            score_result = score_resume_against_job(job, config, parsed_resume)
            
            # Create application
            app_record = Application(
                user_id=user.id,
                job_id=job.id,
                message=str(score_result.ats_score),
                timestamp=datetime.utcnow(),
                status='Applied'
            )
            db.session.add(app_record)
            db.session.flush()
            
            # Create ATS result
            ats_result = ATSResult(
                application_id=app_record.id,
                applicant_id=user.id,
                job_id=job.id,
                ats_score=score_result.ats_score,
                score_breakdown=score_result.score_breakdown,
                matched_keywords=score_result.matched_keywords,
                missing_keywords=score_result.missing_keywords,
                experience_summary=score_result.experience_summary,
                shortlist_eligible=score_result.shortlist_eligible,
                shortlist_reason=score_result.shortlist_reason,
                parsed_resume=parsed_resume,
            )
            db.session.add(ats_result)
            
            upsert_pipeline_state(app_record, 'ATS_SCORED')
            db.session.commit()
            
            ats_scores.append(score_result.ats_score)
            if score_result.shortlist_eligible:
                shortlisted += 1
            
            submitted_applications += 1
            print(f"{idx:3d}. {email} - Score: {score_result.ats_score:.2f} {'[SHORTLIST]' if score_result.shortlist_eligible else ''}")
            
        except Exception as e:
            print(f"{idx:3d}. {email} - Error: {str(e)[:60]}")
            db.session.rollback()
    
    db.session.commit()
    
    # Summary
    print(f"\n{'='*70}")
    print(f"TEST SUMMARY")
    print(f"{'='*70}")
    print(f"Total Resumes Processed:      {len(resume_files)}")
    print(f"New Users Created:            {created_users}")
    print(f"Applications Submitted:       {submitted_applications}")
    print(f"Candidates Shortlisted:       {shortlisted}")
    if ats_scores:
        print(f"\nATS Score Statistics:")
        print(f"  Average Score:            {sum(ats_scores)/len(ats_scores):.2f}")
        print(f"  Min Score:                {min(ats_scores):.2f}")
        print(f"  Max Score:                {max(ats_scores):.2f}")
    print(f"{'='*70}\n")
    
    ctx.pop()

if __name__ == '__main__':
    main()
