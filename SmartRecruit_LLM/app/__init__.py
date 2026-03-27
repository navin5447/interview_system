from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_session import Session
from flask_migrate import Migrate # type: ignore
from pymongo import MongoClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError
import time
from .config import Config

db = SQLAlchemy()
migrate = Migrate()
sess = Session()

mongo_client = MongoClient(
    'mongodb://localhost:27017/',
    serverSelectionTimeoutMS=1000,
    connectTimeoutMS=1000,
    socketTimeoutMS=1000
)
mongodb = mongo_client['applications']
applications_collection = mongodb['applications']


def _ensure_user_role_schema():
    inspector = inspect(db.engine)
    if not inspector.has_table('user'):
        return

    columns = {column['name'] for column in inspector.get_columns('user')}

    for attempt in range(6):
        try:
            if 'role' not in columns:
                db.session.execute(text("ALTER TABLE user ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'applicant'"))
                db.session.commit()

            # Backfill roles for older data.
            db.session.execute(text("UPDATE user SET role = 'applicant' WHERE role IS NULL OR role = ''"))
            db.session.execute(
                text(
                    """
                    UPDATE user
                    SET role = 'recruiter'
                    WHERE id IN (SELECT DISTINCT user_id FROM job)
                      AND role = 'applicant'
                    """
                )
            )
            db.session.execute(
                text(
                    """
                    UPDATE user
                    SET role = 'both'
                    WHERE id IN (SELECT DISTINCT user_id FROM job)
                      AND id IN (SELECT DISTINCT user_id FROM application)
                    """
                )
            )
            db.session.commit()
            return
        except OperationalError as exc:
            db.session.rollback()
            if 'database is locked' not in str(exc).lower() or attempt == 5:
                raise
            time.sleep(0.5 * (attempt + 1))


def _ensure_application_schema():
    inspector = inspect(db.engine)
    if not inspector.has_table('application'):
        return

    columns = {column['name'] for column in inspector.get_columns('application')}

    for attempt in range(6):
        try:
            if 'resume_file' not in columns:
                db.session.execute(
                    text("ALTER TABLE application ADD COLUMN resume_file VARCHAR(120) NOT NULL DEFAULT ''")
                )
                db.session.commit()
            return
        except OperationalError as exc:
            db.session.rollback()
            if 'database is locked' not in str(exc).lower() or attempt == 5:
                raise
            time.sleep(0.5 * (attempt + 1))

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db_uri = str(app.config.get('SQLALCHEMY_DATABASE_URI', ''))
    if db_uri.startswith('sqlite'):
        engine_options = dict(app.config.get('SQLALCHEMY_ENGINE_OPTIONS') or {})
        connect_args = dict(engine_options.get('connect_args') or {})
        connect_args.setdefault('timeout', 30)
        engine_options['connect_args'] = connect_args
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = engine_options

    db.init_app(app)  
    migrate.init_app(app, db)
    sess.init_app(app)

    with app.app_context():
        from . import models  # noqa: F401
        from .pipeline import start_auto_shortlist_worker, start_email_retry_worker
        from .utils import create_upload_folders
        db.create_all()
        _ensure_user_role_schema()
        _ensure_application_schema()
        create_upload_folders(app)
        from .routes import main as main_blueprint
        app.register_blueprint(main_blueprint)
        start_email_retry_worker(app)
        start_auto_shortlist_worker(app)

        return app
