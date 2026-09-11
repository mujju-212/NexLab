import sys
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.feedback import Notification

app = create_app()

with app.app_context():
    admin = User.query.filter_by(email='inst.admin@nexlab.demo').first()
    if not admin:
        admin = User.query.filter_by(role='institution_admin').first()
    if not admin:
        print("No institution admin found to seed notifications for.")
        sys.exit(1)

    print(f"Seeding notifications for admin: {admin.email} (ID: {admin.id})...")

    # Clear previous notifications for admin to keep demo clean
    Notification.query.filter_by(user_id=admin.id).delete()
    db.session.commit()

    now = datetime.utcnow()

    demo_notifs = [
        {
            'type': 'session',
            'title': 'New session scheduled',
            'message': 'DS Lab - Section A',
            'created_at': now - timedelta(hours=2),
            'is_read': False,
        },
        {
            'type': 'announcement',
            'title': 'Announcement published',
            'message': 'Mid-semester exam schedule',
            'created_at': now - timedelta(hours=5),
            'is_read': False,
        },
        {
            'type': 'user',
            'title': 'New user registered',
            'message': 'Student - Aryan Mehta',
            'created_at': now - timedelta(days=1, hours=2),
            'is_read': True,
        },
        {
            'type': 'alert',
            'title': 'Session cancelled',
            'message': 'Python Lab - Section B',
            'created_at': now - timedelta(days=1, hours=6),
            'is_read': True,
        },
        {
            'type': 'user',
            'title': 'Profile updated',
            'message': 'Dr. Neha Iyer',
            'created_at': now - timedelta(days=2, hours=1),
            'is_read': True,
        },
    ]

    for item in demo_notifs:
        notif = Notification(
            user_id=admin.id,
            type=item['type'],
            title=item['title'],
            message=item['message'],
            created_at=item['created_at'],
            is_read=item['is_read'],
        )
        db.session.add(notif)

    db.session.commit()
    print(f"Successfully seeded {len(demo_notifs)} notifications for {admin.email}!")
