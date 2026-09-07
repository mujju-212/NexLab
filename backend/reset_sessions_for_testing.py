"""
Reset sessions to active/pending so testing can be conducted properly.
"""
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.session import LabSession, SessionAttendance

app = create_app()

with app.app_context():
    # 1. Reset attendances so fresh attendance acknowledgment can be tested
    deleted_att = SessionAttendance.query.delete()
    print(f"Cleared {deleted_att} attendance records.")

    now = datetime.utcnow()

    # 2. Get all sessions
    sessions = LabSession.query.all()
    print(f"Found {len(sessions)} sessions.")

    # We will make the first 2 sessions 'active' (LIVE NOW) so the student can directly click 'Join Live Room'
    # and test attendance and permissions screens.
    # The rest will be set to 'scheduled' (Pending / Upcoming).
    
    for idx, s in enumerate(sessions):
        if idx < 2:
            # Active Live Session
            s.status = 'active'
            s.current_mode = 'briefing'
            s.started_at = now - timedelta(minutes=15)
            s.scheduled_at = now - timedelta(minutes=15)
            s.ended_at = None
            print(f"Session [{s.id[:8]}] '{s.title}': set to ACTIVE (LIVE NOW)")
        else:
            # Scheduled / Pending Session
            s.status = 'scheduled'
            s.current_mode = 'briefing'
            s.started_at = None
            s.ended_at = None
            s.scheduled_at = now + timedelta(hours=(idx * 2))
            print(f"Session [{s.id[:8]}] '{s.title}': set to SCHEDULED (PENDING - in {idx*2}h)")

    db.session.commit()
    print("All sessions successfully updated and committed to database!")
