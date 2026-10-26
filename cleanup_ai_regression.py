"""Remove ONLY the isolated AI-regression test tenant and everything that
references it, using a generic fixed-point sweep over every table that has a
column pointing at one of the test ids. The tenant was created distinctly
(code prefix AIR, name 'AI Regression Temporary ...') so no baseline data is
touched. Idempotent: safe to re-run.
"""
import json, os, shutil, warnings, sys
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app
from app.extensions import db

app = create_app()

with app.app_context():
    from app.models.institution import Institution
    from app.models.subject import Subject
    from app.models.experiment import Experiment
    from app.models.user import User

    c = json.load(open('/tmp/ai-regression/credentials.json'))
    IID = c['institution_id']
    USER_IDS = set([c['student_id'], c['instructor_id'],
                    c['institution_admin_id'], c['platform_admin_id']])

    inst = Institution.query.get(IID)
    if inst is None:
        print('Test institution already absent — nothing to do.')
        sys.exit(0)
    assert inst.code.startswith('AIR'), f'refusing to delete non-test institution {inst.code}'

    SUBJ_IDS = [s.id for s in Subject.query.filter_by(institution_id=IID).all()]
    EXP_IDS = [e.id for e in Experiment.query.filter_by(institution_id=IID).all()]
    print('institution:', inst.code)
    print('subjects:', SUBJ_IDS)
    print('experiments:', EXP_IDS)

    for eid in EXP_IDS:
        d = os.path.join(app.root_path, '..', 'simulations', eid)
        if os.path.isdir(d):
            shutil.rmtree(d)
            print('removed simulation dir for', eid)

    id_sets = {
        'institution_id': {IID},
        'user_id': set(USER_IDS),
        'student_id': set(USER_IDS),
        'instructor_id': set(USER_IDS),
        'actor_id': set(USER_IDS),
        'created_by': set(USER_IDS),
        'approved_by': set(USER_IDS),
        'updated_by': set(USER_IDS),
        'owner_id': set(USER_IDS),
        'subject_id': set(SUBJ_IDS),
        'experiment_id': set(EXP_IDS),
        'exam_id': set(EXP_IDS),
    }

    tables = [t for t in db.metadata.tables.keys() if t != 'alembic_version']
    total = {}
    for _pass in range(14):
        pass_deleted = 0
        for t in tables:
            cols = set(db.metadata.tables[t].columns.keys())
            for colname, idset in id_sets.items():
                if colname in cols and idset:
                    table = db.metadata.tables[t]
                    sp = db.session.begin_nested()
                    n = 0
                    try:
                        # savepoint so an FK violation only skips this one
                        # delete and is retried on a later pass
                        n = db.session.query(table).filter(
                            table.c[colname].in_(list(idset))).delete(synchronize_session=False)
                        sp.commit()
                    except Exception:
                        try:
                            sp.rollback()
                        except Exception:
                            pass
                        continue
                    if n:
                        key = f'{t}.{colname}'
                        total[key] = total.get(key, 0) + n
                        pass_deleted += n
        print(f'pass {_pass+1}: deleted {pass_deleted} rows')
        if pass_deleted == 0:
            break

    n = db.session.query(Institution).filter(Institution.id == IID).delete()
    total['institutions'] = n
    db.session.commit()

    print('DELETED (by table.column):')
    for k in sorted(total):
        print(f'  {k}: {total[k]}')

    left_inst = db.session.query(Institution).filter(Institution.id == IID).count()
    left_users = db.session.query(User).filter(User.id.in_(USER_IDS)).count()
    left_exp = db.session.query(Experiment).filter(Experiment.institution_id == IID).count()
    print('verify -> institution:', left_inst, 'users:', left_users, 'experiments:', left_exp)
    assert left_inst == 0 and left_users == 0 and left_exp == 0
    print('CLEANUP COMPLETE')
