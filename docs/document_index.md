# Virtual Lab Platform — Master Document Index
> **Use this file to find any document quickly.**
> Every file is listed with its exact path, category, purpose, and searchable keywords.
> Last Updated: **2026-08-04 (Session 3 — Admin Feature Completion)**

---

## Folder Structure Overview

```
d:\AVTIVE PROJ\Major project\
├── planning/          ← Research, analysis, architecture decisions, competitor study
├── docs/              ← Final project documentation, setup logs, feature writeups
├── backend/           ← All backend source code (Flask, models, ML, Docker configs)
└── research papers/   ← Original academic PDFs and datasets (DO NOT MOVE)
```

---

## FOLDER: `planning/`
> Contains all research, analysis, decision-making, and architecture planning documents.
> These were written BEFORE and DURING development to figure out what to build and how.

---

### `planning/backend_ml_docker_competitors.md`
**Size:** 23,832 bytes | **Type:** Research & Analysis

**What it contains:**
- Detailed competitor analysis: IIT Virtual Labs, Replit, HackerRank, CodeChef, Codility, LeetCode
- Feature-by-feature comparison table (our platform vs competitors)
- List of features we support that competitors DON'T (viva, focus scoring, PDF lab record)
- Features competitors have that we're missing (MOSS, AI test gen, full lockdown)
- ML dataset discussion — what datasets exist, what we need to collect
- Docker architecture decision: why self-hosted Judge0 vs cloud alternatives

**Search keywords:** `competitor, IIT Vlabs, HackerRank, MOSS, plagiarism, dataset, benchmark, ML training data, market comparison`

---

### `planning/core_infra_deep_dive.md`
**Size:** 23,630 bytes | **Type:** Architecture Deep Dive

**What it contains:**
- Deep technical analysis of the core infrastructure layer
- Database schema design reasoning (why each table was designed that way)
- Multi-tenancy enforcement strategy (`institution_id` in every query)
- Session management architecture (30-second auto-save, diff recording, reconnect)
- Judge0 integration design (polling vs webhook mode)
- Flask-SocketIO event design for live sessions
- Redis usage patterns (job queue, session cache)
- APScheduler background job design

**Search keywords:** `infrastructure, multi-tenancy, institution_id, session management, auto-save, Socket.io, Redis, APScheduler, Judge0 integration, polling, webhook`

---

### `planning/final_backend_decisions_locked.md`
**Size:** 15,855 bytes | **Type:** Architecture Decision Record (LOCKED)

**What it contains:**
- ALL final backend decisions — locked, cannot be changed without major rework
- JWT payload structure: `{user_id, institution_id, role, exp}`
- Role system: `platform_admin | institution_admin | instructor | student`
- Pre-lab quiz gate logic (must pass to enter session)
- Focus scoring: client sends raw signals → server infers using RF model
- Code version saving: version-numbered, full file snapshots every 30s
- Session disconnect handling: auto-reconnect within 5 min, instructor can call out
- Grade locking: grade is locked permanently on first student view
- PDF generation pipeline: WeasyPrint → Cloudinary → URL
- Gap analysis and solutions for 6 identified gaps

**Search keywords:** `architecture decisions, JWT, roles, quiz gate, focus scoring, code versioning, grade locking, PDF, session disconnect, final decisions`

---

### `planning/iit_vlabs_vs_your_platform.md`
**Size:** 9,960 bytes | **Type:** Competitor Deep Dive

**What it contains:**
- Detailed head-to-head comparison with IIT Virtual Labs (the closest competitor)
- What IIT Vlabs does well (simulation, accessibility, government-backed)
- What IIT Vlabs lacks (real code execution, proctoring, grading, AI hints)
- Our advantages over IIT Vlabs listed point by point
- Market positioning analysis
- Which IIT Vlab features we should consider adding

**Search keywords:** `IIT Virtual Labs, Amrita, Olabs, simulation, comparison, market position, government, MHRD`

---

### `planning/mvp_revised_load.md`
**Size:** 17,786 bytes | **Type:** MVP Planning & Load Estimates

**What it contains:**
- Revised MVP scope (what to build first vs defer to later)
- Feature priority tiers: Must Have / Should Have / Nice to Have
- Load estimates: concurrent users, DB query rates, Judge0 submission rates
- Infrastructure sizing recommendations for 500-user institution
- Phase 1 vs Phase 2 vs Phase 3 feature breakdown
- Risk assessment for each major feature

**Search keywords:** `MVP, minimum viable product, load testing, concurrent users, infrastructure sizing, phase 1, phase 2, priority, risk`

---

### `planning/research_papers_deep_dive.md`
**Size:** 27,035 bytes | **Type:** Academic Research Summary

**What it contains:**
- Analysis of 6 academic research papers read for this project
- Paper 1: Spark — Real-time monitoring of programming exercises (inspiration for focus scoring)
- Paper 2: AI-based online exam proctoring system
- Paper 3: Intelligent feedback for introductory programming (inspiration for AI hints)
- Paper 4: Knowledge tracing in CS education
- Paper 5: Student behavioral dataset for suspicious detection
- Paper 6: Learning analytics in virtual labs
- Key findings from each paper and how they influenced our design
- Specific algorithms and approaches borrowed from research

**Search keywords:** `research papers, academic, Spark, proctoring, knowledge tracing, DPKT, behavioral dataset, learning analytics, algorithm, citations`

---

### `planning/virtual lab.md`
**Size:** 78,600 bytes | **Type:** Raw Research Notes (Large)

**What it contains:**
- Extensive raw notes and brainstorming from the early project planning phase
- Initial feature ideas before they were finalized
- Raw competitor research notes
- Early thoughts on system architecture
- Questions and open items from the initial design phase
- This is the original large working document before it was split into focused docs

**Search keywords:** `raw notes, brainstorm, early design, initial ideas, feature ideas, open questions, planning`

---

### `planning/virtual_lab_analysis.md`
**Size:** 10,677 bytes | **Type:** Platform Analysis Summary

**What it contains:**
- High-level analysis of the virtual lab space
- Summary of what existing virtual lab platforms do
- Key gaps in the market that our platform addresses
- Target user personas (instructor, student, institution admin)
- Core value propositions of our platform

**Search keywords:** `analysis, market gaps, user personas, value proposition, virtual lab space, target users`

---

### `planning/vl reserch2.txt`
**Size:** 55,544 bytes | **Type:** Raw Research Text

**What it contains:**
- Second batch of raw research notes (plain text format)
- Additional competitor research
- Feature brainstorming session notes
- Notes from reading research papers
- Reference links and citations collected during research

**Search keywords:** `raw research, text notes, competitor links, citations, brainstorming notes`

---

## FOLDER: `docs/`
> Contains finalized project documentation — the complete written record of what the platform IS, what has been built, and how systems are set up.

---

### `docs/VIRTUAL LAB PLATFORM - COMPLETE.md`
**Size:** 114,418 bytes | **Type:** Master Platform Document (Largest File)

**What it contains:**
- The complete, comprehensive documentation of the entire Virtual Lab Platform
- Full feature list for all 4 roles (Platform Admin, Institution Admin, Instructor, Student)
- Complete user flow for every action in the system
- Architecture overview
- All business rules and constraints
- Edge cases and how they're handled
- This is the definitive reference for what the platform does

**Search keywords:** `complete platform, all features, user flows, business rules, platform admin, institution admin, instructor, student, edge cases, comprehensive`

---

### `docs/Final Roles, Features and Completworkflow.md`
**Size:** 35,997 bytes | **Type:** Roles & Workflow Document

**What it contains:**
- Finalized role definitions for all 4 user types
- Complete workflow for each role (step by step, what they do in the system)
- Feature list per role — exactly what each role can see and do
- Permissions matrix
- Key workflows: institution onboarding, experiment creation, session lifecycle, grading
- Pre-lab content workflow, quiz gate workflow, live session workflow

**Search keywords:** `roles, permissions, workflow, institution onboarding, experiment creation, session lifecycle, grading workflow, quiz gate, pre-lab, feature list`

---

### `docs/final_project_doc_part1.md`
**Size:** 26,356 bytes | **Type:** Project Documentation Part 1

**What it contains:**
- Part 1 of the detailed project documentation
- System overview and introduction
- Technology stack decisions with justifications
- Database design overview
- Auth system design
- Multi-tenancy implementation details
- The Admin and Institution Admin module documentation

**Search keywords:** `project documentation, system overview, technology stack, database design, auth, multi-tenancy, admin module, institution module`

---

### `docs/final_project_doc_part2.md`
**Size:** 21,459 bytes | **Type:** Project Documentation Part 2

**What it contains:**
- Part 2 of the detailed project documentation
- Instructor module documentation (all features)
- Student module documentation (all features)
- AI and ML system documentation
- Real-time session system documentation
- PDF lab record system
- Judge0 execution integration overview

**Search keywords:** `instructor module, student module, AI hints, ML focus scoring, real-time session, Socket.io, PDF lab record, code execution`

---

### `docs/backend_progress_doc.md`
**Size:** 25,365 bytes | **Type:** Backend Setup Log (Step-by-Step) — **Sessions 1–4**

**What it contains:**
- Complete step-by-step log of everything done to set up the backend (first 4 sessions)
- Every file created — all 28 models, 8 blueprints, ML files, services, sockets
- Every API endpoint documented with method, route, and description
- Python venv setup — all errors hit + exact fixes (scikit-learn, pandas, psycopg2)
- Docker setup steps
- Judge0 cgroup debug full log — what failed, what worked
- Current status of each component (as of Session 4)
- Next steps checklist
- Quick start commands

**Search keywords:** `backend setup, setup log, models, blueprints, API endpoints, venv, packages, errors, fixes, scikit-learn, psycopg2, Docker, Judge0, cgroup, next steps`

---

### `docs/backend_progress_update_aug01.md`
**Size:** ~18,000 bytes | **Type:** Backend Progress Update — **Session 5 (2026-08-01)**

**What it contains:**
- **Phase 13:** ML Focus RF model — synthetic data generator (2,400 rows, 3 archetypes), training script, AUC=0.9266, `focus_model.py` fully rewritten with correct 6 signal names
- **Phase 14:** 5 new proctoring SocketIO events added — `tab_switch`, `fullscreen_exit`, `screen_share_stopped`, `lockdown_violation`, `behavioral_signals` (full ML pipeline per event)
- **Phase 15:** Jitsi integration verified — room generation, gate-check delivery, `session_started` broadcast contract, frontend API pattern
- **Phase 16:** 30-student concurrent simulation — 638 alerts, 18.7s wall clock, 32 pred/sec throughput, risk breakdown
- **Phase 17:** All 5 ML models completed — knowledge tracing verified, plagiarism upgraded to TF-IDF cosine with identifier normalization, code_quality fixed for standalone use
- **Phase 18:** ML routes fully rewritten — 11 endpoints with correct signal names, batch rank computation, `/compare-code`, `/health`
- **Phase 19:** FocusScore schema updated — 8 individual columns → 1 JSON `signals` column (⚠️ migration required)
- **Phase 20:** 26-test standalone ML test suite — all 5 models, 26/26 tests passing, no Flask/DB required
- Full files-changed table (11 files modified/created this session)
- Updated current status table + ordered next steps (DB migrate → Flask start → auth test → commits 5–10)

**Search keywords:** `ML models, focus RF, AUC 0.9266, proctoring, tab switch, fullscreen exit, screen share, lockdown, behavioral signals, Jitsi, 30 students, simulation, plagiarism TF-IDF, cosine similarity, identifier normalization, code quality radon, knowledge tracing, holistic ranking, FocusScore JSON, ML routes, test suite, 26 tests, flask db migrate, commits 5-10`

---

### `docs/docker_setup_doc.md`
**Size:** 26,698 bytes | **Type:** Docker Deep-Dive Documentation

**What it contains:**
- Why Docker is used (Judge0 needs Linux, Flask doesn't need Docker locally)
- How Docker works on Windows (WSL2 + docker-desktop internal distro)
- All 3 images: judge0:1.13.0 (3.29GB), postgres:13 (624MB), redis:5.0.9 (144MB)
- What Judge0 is and how it sandboxes code (isolate tool)
- docker-compose.judge0.yml — every line explained
- judge0.conf — every config key explained with WHY
- Container architecture diagram (how all 4 containers talk to each other)
- All commands: start, stop, restart, logs, exec
- Full cgroup debug log: 8 steps, 5 failed approaches, the fix that worked
- How Flask talks to Judge0 (full request flow)
- Judge0 language IDs table
- Issues summary table (7 errors, root causes, fixes)
- Daily quick reference commands

**Search keywords:** `Docker, Judge0, cgroup, WSL2, isolate, docker-compose, judge0.conf, containers, postgres, redis, language IDs, cgroup v1, cgroup v2, sandbox, privileged`

---

### `docs/git_commit_plan.md`
**Size:** ~4,128 bytes | **Type:** Git Workflow Document

**What it contains:**
- Full 10-commit rollout plan across all sessions
- Commit history table: what hash, what message, what files for each commit
- Session 1 (commits 1–4): scaffold, models, auth — ✅ done
- Session 2 (commits 5–8): admin, instructor, student, execution — ✅ done
- Session 3 (commit 19b6c50): super admin + institution admin extensions — ✅ done
- Commit rules: one concern per commit, message format, never commit .env/venv
- .gitignore rules summary
- Quick git commands cheatsheet

**Search keywords:** `git, commits, commit plan, push, github, NexLab repo, commit history, session 1, session 2, session 3, git workflow`

---

### `docs/backend_progress_update_aug04.md`  ← **LATEST DOCUMENT**
**Size:** ~22,000 bytes | **Type:** Backend Progress Update — **Session 3 (2026-08-03/04)**

**What it contains:**
- **Platform Super Admin** — 5 feature groups, 17 new routes fully implemented
  - Billing & Plan Management (upgrade/downgrade, Groq limit override)
  - Global Audit Log (cross-institution, filterable, with actor enrichment)
  - Institution Onboarding Workflow (live checklist, mark active/reset)
  - Global Analytics (overview, groq trend, sessions trend, peak usage, cross-institution comparison)
  - Platform Configuration (key-value config store, maintenance mode, feature flags)
- **Institution Admin Extensions** — 6 new features, 14 new routes
  - Reset User Password (with automatic force-logout)
  - Experiment Usage Report (session counts per experiment, last N days)
  - CSV Export — student progress + full user list
  - Institution Settings (editable: logo, address, email, domain; locked: name, plan, code)
  - Session Management (live sessions view, paginated history, force terminate with SocketIO)
  - Groq Budget Tracking (today's usage vs limit, 7-day trend, exhaustion flag)
- **Migration** `b2c3d4e5f6a7` — 9 new columns on institutions + new platform_config table
- **Test results:** 48/48 platform admin tests ✅ + 51/51 institution admin tests ✅ (99 total)
- Full explanation of how tests work and what each tests
- All fixes encountered during testing (IPv4 vs IPv6, token key, LabSession schema)
- Complete feature inventory table — all 33 platform admin + all 24 institution admin features
- Files changed table, git commit hashes, next steps checklist

**Search keywords:** `platform admin, super admin, billing, plan, groq limit, audit log, onboarding, analytics, platform config, maintenance mode, feature flags, institution admin, password reset, experiment usage, CSV export, institution settings, session management, terminate session, groq budget, migration b2c3d4e5f6a7, 48 tests, 51 tests, test_platform_admin, test_institution_admin, session 3, aug04`

---

## FOLDER: `research papers/` ← DO NOT MOVE
> Original academic PDF files and datasets. Left exactly as-is.

| File | Description |
|---|---|
| `Spark_Real-Time_Monitoring_of_Multi-Faceted_Programming_Exercises.pdf` | Core inspiration for focus scoring and real-time monitoring |
| `2025.EDM.short-papers.83.pdf` | Educational data mining paper |
| `2510.18881v1.pdf` | Research paper on virtual labs |
| `Comp Applic In Engineering - 2025 - Zampirolli - Intelligent Feedback...pdf` | Intelligent feedback for programming — AI hints inspiration |
| `JELTP_v3sp1_19.pdf` | Journal paper on virtual lab platforms |
| `s41598-025-96540-3.pdf` | Student behavior analysis paper |
| `-Artificial-Intelligence-based-Online-Exam-Proctoring-System-master/` | Full proctoring system source code (reference) |
| `Students suspicious behaviors detection dataset fo/` | Behavioral dataset for ML training reference |

---

## FOLDER: `backend/`
> All source code. Not documentation — see `docs/backend_progress_doc.md` for the full breakdown of what's in here.

Key sub-folders:
- `app/` — Flask application (models, blueprints, ML, sockets, services)
- `docker/` — docker-compose files, judge0.conf, Dockerfile
- `database/` — init.sql, seed.py
- `ml_training/` — training scripts and dataset folder
- `ml_models/` — trained .pkl files go here
- `templates/` — HTML templates (PDF lab record)
- `venv/` — Python 3.13 virtual environment

---

## Quick Search Guide

| I'm looking for... | Go to |
|---|---|
| What the platform does (full feature list) | `docs/VIRTUAL LAB PLATFORM - COMPLETE.md` |
| What each user role can do | `docs/Final Roles, Features and Completworkflow.md` |
| All API endpoints | `docs/backend_progress_doc.md` → Section 3 |
| How to start Judge0 | `docs/docker_setup_doc.md` → Section 14 |
| Why we built it this way (decisions) | `planning/final_backend_decisions_locked.md` |
| How Docker works for this project | `docs/docker_setup_doc.md` |
| Judge0 cgroup WSL2 fix | `docs/docker_setup_doc.md` → Section 8 |
| Competitor comparison | `planning/backend_ml_docker_competitors.md` |
| IIT Vlabs vs us | `planning/iit_vlabs_vs_your_platform.md` |
| What research papers informed us | `planning/research_papers_deep_dive.md` |
| Python package install errors | `docs/backend_progress_doc.md` → Phase 11 |
| All database models | `docs/backend_progress_doc.md` → Section 2 |
| ML model details (original design) | `docs/final_project_doc_part2.md` |
| ML models — trained + tested (latest) | `docs/backend_progress_update_aug01.md` → Phases 13, 17, 20 |
| Focus RF model (AUC, signals, training) | `docs/backend_progress_update_aug01.md` → Phase 13 |
| Proctoring SocketIO events | `docs/backend_progress_update_aug01.md` → Phase 14 |
| Jitsi integration contract | `docs/backend_progress_update_aug01.md` → Phase 15 |
| 30-student load simulation results | `docs/backend_progress_update_aug01.md` → Phase 16 |
| Plagiarism TF-IDF upgrade | `docs/backend_progress_update_aug01.md` → Phase 17 |
| All ML API endpoints (11 routes) | `docs/backend_progress_update_aug01.md` → Phase 18 |
| FocusScore schema change + migration | `docs/backend_progress_update_aug01.md` → Phase 19 |
| ML test suite (26 tests) | `docs/backend_progress_update_aug01.md` → Phase 20 |
| **Current backend status (LATEST)** | **`docs/backend_progress_update_aug04.md`** |
| **Platform super admin features** | **`docs/backend_progress_update_aug04.md` → Part 1** |
| **Billing & plan management routes** | **`docs/backend_progress_update_aug04.md` → Feature Group 1** |
| **Global audit log route** | **`docs/backend_progress_update_aug04.md` → Feature Group 2** |
| **Institution onboarding workflow** | **`docs/backend_progress_update_aug04.md` → Feature Group 3** |
| **Global analytics routes** | **`docs/backend_progress_update_aug04.md` → Feature Group 4** |
| **Platform config + feature flags** | **`docs/backend_progress_update_aug04.md` → Feature Group 5** |
| **Institution admin extensions** | **`docs/backend_progress_update_aug04.md` → Part 2** |
| **Reset user password route** | **`docs/backend_progress_update_aug04.md` → Feature 1** |
| **CSV export (student progress)** | **`docs/backend_progress_update_aug04.md` → Feature 3** |
| **Session management (live + terminate)** | **`docs/backend_progress_update_aug04.md` → Feature 5** |
| **Groq budget tracking route** | **`docs/backend_progress_update_aug04.md` → Feature 6** |
| **48-test platform admin test suite** | **`docs/backend_progress_update_aug04.md` → Test File 1** |
| **51-test institution admin test suite** | **`docs/backend_progress_update_aug04.md` → Test File 2** |
| **How tests work (technical)** | **`docs/backend_progress_update_aug04.md` → How Tests Work** |
| **All 33 platform admin features (complete list)** | **`docs/backend_progress_update_aug04.md` → Complete Feature Inventory** |
| **All 24 institution admin features (complete list)** | **`docs/backend_progress_update_aug04.md` → Complete Feature Inventory** |
| Old backend status (Session 4) | `docs/backend_progress_doc.md` → Current Status section |
| Git commit plan (all commits) | `docs/git_commit_plan.md` |
| What was committed in Session 3 (aug04) | `docs/git_commit_plan.md` → commit `19b6c50` |
| Frontend integration guide | `docs/FRONTEND_INTEGRATION_GUIDE.md` |
