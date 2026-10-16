from app import create_app
from app.analytics.snapshots import backfill_snapshots
from app.models.institution import Institution

app = create_app('development')
with app.app_context():
    inst = Institution.query.get('inst-test-001')
    if inst:
        print(f"Backfilling 30 days of real snapshots for {inst.name} ({inst.id})...")
        res = backfill_snapshots(inst.id, days=30)
        print(f"Successfully recorded {len(res)} daily snapshots for Greenwood Institute!")
    else:
        print("Institution inst-test-001 not found!")
