# NexLab — running & public access

## Access (no tunnel — local only)

Cloudflare tunnelling has been **removed** at the owner's request: the free
quick-tunnel hostname changes on every restart, and the sandbox kills the
processes between sessions, so the link kept dying. The app is now served
locally only:

| Service | URL |
|---|---|
| Frontend (the app) | http://localhost:3000 |
| Flask API | http://localhost:5000 |
| PostgreSQL | postgresql://postgres:vlabpass@localhost:5433/virtuallab |

The in-sandbox preview proxies port 3000, so use that instead of a tunnel.

## Logins (all real accounts, created through the API — no seed data)

| Role | Email | Password |
|---|---|---|
| Platform super admin | `superadmin@nexlab.io` | `SuperAdmin@2026` |
| Institution admin (SKIT) | `admin@skit.edu.in` | `SkitAdmin@2026` |
| Instructor | `anitha.rao@skit.edu.in` | `Instructor@2026` |
| Student | `rahul.sharma@skit.edu.in` | `Student@2026` |

Landing pages: `/login` → redirects by role. Start at `/student/subjects`,
`/instructor/grading`, `/institution/dashboard`, `/platform`.

## What is currently in the database

- Tenant **SKIT** → 2024-25 academic year → Computer Science dept → batch →
  sections A and B → **CS301 Data Structures and Algorithms** (100 subject marks).
- Instructor **Anitha Rao** assigned to CS301 in section A; student **Rahul Sharma**
  (`SKIT2026001`) enrolled.
- 4 published lab experiments, weights chosen per experiment:

  | # | Experiment | Weightage to subject | Rubric (tests / report / quality / viva / quiz) |
  |---|---|---|---|
  | 1 | Binary Search | 1 | 60 / 20 / 10 / 10 / **0** |
  | 2 | Linear vs Binary Search | 1 | 50 / 20 / 10 / 10 / 10 |
  | 3 | Merging Two Sorted Arrays | 1 | 50 / 20 / 10 / 10 / 10 |
  | 4 | Insertion Sort Lab | 2 | 60 / 20 / 10 / 10 / **0** |

- 1 published timed exam **CS301 Quiz 1: Searching** — 20 min, 3 MCQ (5 points),
  pass 40%, worth **25 marks (25%)** of the subject, focus + lockdown proctoring
  on, `max_violations` 5, 5 attempts.
- Component-level grades for Rahul: #1 → **80.1**, #2 → **84.0**, #4 → **66.9**;
  #3 unsubmitted on purpose (so empty states are visible, not faked).
  Allocated weightage **30 pts** (1+1+1+2+25), subject ceiling 100.

## Start / restart everything

```bash
./setup.sh          # once per fresh sandbox: postgres + python + node + schema
./start-all.sh      # postgres -> Flask :5000 -> Next.js :3000 (production build)
./up.sh             # postgres + Flask + Next.js, with a keeper loop
python3 walkthrough.py       # rebuild the tenant from zero through the API
python3 restore_demo_data.py # rebuild experiments/exam/grades through the API
```

Both scripts are idempotent — they skip anything that already exists.

## Sandbox caveat worth knowing

Only files under `/home/user` survive between sessions. Postgres data
(`/var/lib/postgresql`), pip packages, and `node_modules` do **not**, so after a
restart of the sandbox you must re-run `./setup.sh` and then the two python
scripts to get the data back. `bin/cloudflared` is stored inside `/home/user`
so the tunnel binary survives.
