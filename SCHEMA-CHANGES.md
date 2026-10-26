# Schema changes shipped in this push (25789f0 → d8f56df)

Yes — **4 tables changed**. No tables were dropped and no data was deleted.
No new Alembic revision was added, so `flask db upgrade` will *not* pick these
up. Apply them with `migrate_missing_columns.py` plus the SQL below.

## 1. `exams` — 3 new columns
| Column | Type | Default | Commit |
|---|---|---|---|
| `proctor_focus_enabled` | boolean | false | 8e5157e |
| `proctor_lockdown_enabled` | boolean | false | 8e5157e |
| `max_violations` | integer | 0 | 8e5157e |

## 2. `grades` — exam support + assessed ticks
| Change | Commit |
|---|---|
| `experiment_id` **NOT NULL → NULL** (a grade now belongs to an experiment *or* an exam) | 8e5157e |
| **new** `exam_id` varchar(36) → FK `exams(id)` | 8e5157e |
| **new** `assessed_components` json — `{component: true/false}` ticks | 8e5157e |
| **new** index `ix_grades_student_exam (student_id, exam_id)` | 8e5157e |

## 3. `proctor_events` — exam proctoring
| Change | Commit |
|---|---|
| `session_id` **NOT NULL → NULL** (events can belong to an exam attempt) | 3d94684 |
| **new** `exam_id` varchar(36) → FK `exams(id)` | 3d94684 |
| **new** `attempt_id` varchar(36) | 3d94684 |
| **new** indexes `ix_proctor_events_exam_attempt`, `ix_proctor_events_exam_student` | 3d94684 |

## 4. Free practice — difficulty widened
`free_courses.difficulty`, `free_exercises.difficulty`, `practice_problems.difficulty`:
`varchar(10)` → `varchar(20)` (commit 8e5157e).

---

## How to apply

```bash
cd backend
python3 migrate_missing_columns.py      # adds the new columns from the models
```

then, for the parts the helper does not cover (nullability, varchar width, indexes):

```sql
-- exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS proctor_focus_enabled    boolean DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS proctor_lockdown_enabled boolean DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_violations           integer DEFAULT 0;

-- grades
ALTER TABLE grades ALTER COLUMN experiment_id DROP NOT NULL;
ALTER TABLE grades ADD COLUMN IF NOT EXISTS exam_id varchar(36) REFERENCES exams(id);
ALTER TABLE grades ADD COLUMN IF NOT EXISTS assessed_components json;
CREATE INDEX IF NOT EXISTS ix_grades_student_exam ON grades (student_id, exam_id);

-- proctor events
ALTER TABLE proctor_events ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE proctor_events ADD COLUMN IF NOT EXISTS exam_id varchar(36) REFERENCES exams(id);
ALTER TABLE proctor_events ADD COLUMN IF NOT EXISTS attempt_id varchar(36);
CREATE INDEX IF NOT EXISTS ix_proctor_events_exam_attempt ON proctor_events (exam_id, attempt_id);
CREATE INDEX IF NOT EXISTS ix_proctor_events_exam_student ON proctor_events (exam_id, student_id);

-- free practice
ALTER TABLE free_courses     ALTER COLUMN difficulty TYPE varchar(20);
ALTER TABLE free_exercises   ALTER COLUMN difficulty TYPE varchar(20);
ALTER TABLE practice_problems ALTER COLUMN difficulty TYPE varchar(20);
```

(If a column already exists with a different FK definition, drop the
`ADD COLUMN ... REFERENCES` clause and add the constraint separately.)

## What breaks if you skip it

| Skipped | Symptom |
|---|---|
| `grades.assessed_components` | `POST /api/instructor/grades` → 500 (unknown column) |
| `grades.exam_id` | exam grading 500 |
| `proctor_events.exam_id` / `attempt_id` | exam proctoring ingest 500 |
| `exams.proctor_*` / `max_violations` | exam create/edit 500, `to_dict()` fails |
| `difficulty` widening | inserting a long difficulty string raises `value too long` |

## Data note (not a schema change)

`grades.code_quality_grade` is now documented and computed as **0–100**. The old
backend multiplied stored values ≤10 by 10 on read (`code_raw * 10 if <= 10`),
so any historical row holding a 0–10 value will now be read at face value and
look low. Check before rescaling, because a *genuine* 8/100 is indistinguishable
from a legacy 8/10:

```sql
SELECT id, student_id, code_quality_grade
FROM grades
WHERE code_quality_grade > 0 AND code_quality_grade <= 10;
```

If those rows all came from the old rubric UI (typical values 6–9), rescale them
once; otherwise leave them and re-grade.
