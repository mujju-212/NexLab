<div align="center">

<img src="files/logo.png" alt="NexLab Logo" width="240" />

# NexLab
### Next-Generation AI-Powered Virtual Laboratory & Learning Experience Platform

**Enterprise multi-tenant virtual lab engineered for engineering colleges, autonomous universities, and self-serve programmers.**  
Live proctored coding labs · 65 role-scoped AI agent tools · Dockerized code execution · Invariant-driven automated grading · ML behavioral focus scoring · MOSS-grade plagiarism clustering · 2,700+ problem practice tier.

---

[![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Flask 3.0](https://img.shields.io/badge/Flask-3.0.3-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15_(App_Router)-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17_(103_Tables)-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC_Cloud-002B36?style=flat-square)](https://livekit.io/)
[![Groq LPU](https://img.shields.io/badge/AI-Groq%20%7C%20OpenRouter%20%7C%20Gemini-F05A28?style=flat-square)](https://groq.com/)
[![Docker Runner](https://img.shields.io/badge/Code_Runner-Docker_Sandbox-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

<br />

<img src="files/hero.png" alt="NexLab Hero Banner" width="100%" />

<br />

[Features](#-key-features--capabilities) •
[Architecture](#-system-architecture) •
[Role Portals](#-role-based-portals) •
[AI Harness](#-ai-copilot--agent-harness) •
[ML & Proctoring](#-ml-behavioral-proctoring--integrity) •
[Code Execution](#-sandboxed-code-execution-engine) •
[Quickstart](#-quickstart--local-setup) •
[Demo Credentials](#-default-demo-credentials) •
[System Invariants](#-the-8-system-invariants) •
[Documentation](#-documentation-index)

---

</div>

## 📌 Executive Overview

Traditional computer science and engineering laboratory courses suffer from three fundamental problems:
1. **Passive "Copy-Paste" Labs**: Students submit code written elsewhere with no verification of independent problem-solving or process.
2. **Blind Observation**: Instructors cannot monitor 40–80 simultaneous live coding sessions, leading to unobserved malpractice and delayed intervention.
3. **Subjective & Brittle Grading**: Evaluation is manual, unstandardized, and vulnerable to grade inflation or omission audits.

**NexLab** solves this by unifying a **sandboxed coding IDE**, **continuous behavioral proctoring**, a **mathematically invariant grading engine**, and **role-aware AI agents** into a multi-tenant platform tailored for higher education institutions.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   NEXLAB CORE                                    │
│                                                                                  │
│  [Multi-Tenant PG17] ──► [Flask 3.0 API & Sockets] ──► [Next.js 15 App Shell]   │
│           │                           │                              │           │
│           ▼                           ▼                              ▼           │
│  103 Scoped Tables           538 REST Endpoints              Role-Scoped UIs     │
│  UUID Primary Keys           21 Socket.IO Events             Mobile Responsive   │
│  Tenant RLS Isolation        Background Schedulers           Dark Glassmorphism  │
│                                                                                  │
│  [Docker Sandbox Engine] ──► [ML Proctoring Suite] ──► [Claw-Code AI Harness]    │
│  Zero-Network Containers     Random Forest Focus (0.926) 65 Role Tools          │
│  100ms Per-Test Verdicts     MOSS-Grade Plagiarism           Multi-Model Cooldown│
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Features & Capabilities

- **Institutional Multi-Tenancy**: Complete logical separation (`institution_id` isolation) across all 103 database tables, authentication flows, RAG documents, and audit logs.
- **Continuous Behavioral Proctoring**: Mandatory screen share on join, automated 30-second snapshot capture, tab-switch monitoring, fullscreen enforcement, and an ML-based focus scoring model.
- **Interactive Experiment Studio**: Structured lab creation with markdown instruction steps, starter templates, hidden/public test suites, and multi-component weighted grading rubrics.
- **Invariant-Enforced Grading Engine**: 5-part rubrics summing to 100 points. Unassessed components are excluded from the denominator rather than marked as zero, ensuring audit compliance.
- **Claw-Code AI Harness**: 65 autonomous tools across 5 personas. Delivers multi-turn autonomous problem resolution, institutional RAG memory, and strict anti-hallucination guarantees.
- **Socratic Tutoring**: AI hints guide students methodically through algorithmic thinking without giving away solutions. Escalating hint levels deduct small, capped rubric penalties.
- **Enterprise Sandboxed Execution**: Custom Docker runner executing user submissions inside network-isolated, CPU-capped, memory-limited containers with millisecond-precision timing.
- **Free Platform Tier**: Standalone practice portal featuring **2,700+ DSA and system programming exercises**, daily challenges, gamified XP, streak tracking, and course leaderboards.

---

## 🏛 Role-Based Portals

NexLab ships with 5 dedicated, role-tailored application interfaces accessible from unified authentication:

| Role | Route Base | Target Audience | Primary Responsibilities |
|---|---|---|---|
| **Platform Super Admin** | `/admin` | Cloud Operations & Platform Leads | Tenant provisioning, global billing, system governance, platform quotas, two-person approvals |
| **Institution Admin** | `/institution` | Deans, HODs, Lab Superintendents | Tenant academic hierarchy, department setup, faculty/student rosters, AI token budgeting, audit logs |
| **Lab Instructor** | `/instructor` | Professors, TAs, Lab Assistants | Experiment authoring, live lab conductor room, grading hub, viva voce sessions, cohort analytics |
| **Enrolled Student** | `/student` | College Students in Enrolled Cohorts | Live lab participation, code submission, pre-lab quizzes, Socratic hints, personal mastery dashboards |
| **Free Platform User** | `/practice` | Self-directed Learners & Open Users | 2,700+ problem practice bank, tracks, daily quests, XP progression, community leaderboards |

### 1. Platform Super Admin (`/admin/dashboard`)
- **Tenant Management**: Provision, suspend, and configure institutions with custom domains and resource quotas.
- **Governance & Approvals**: Two-person rule enforcement for destructive operational changes.
- **Platform Analytics**: Global aggregation of platform health, active containers, execution latency, and AI provider consumption.

### 2. Institution Admin (`/institution/dashboard`)
- **Academic Structure Hierarchy**: Manage Academic Years &rarr; Departments &rarr; Batches &rarr; Sections &rarr; Subjects.
- **User Lifecycle**: Batch user onboarding, credential issuance, role reassignment, and session termination.
- **AI Quota & Spending Control**: Enforce daily/monthly token meters per student and department; fail-closed token gates.
- **Compliance & Audit Trails**: Real-time audit logs of administrative actions, grade modifications, and security anomalies.

### 3. Instructor Portal (`/instructor/dashboard`)
- **Experiment Authoring Studio**: Create experiments with rich theory notes, interactive checkpoints, starter code, test suites, and customizable rubrics.
- **Live Conductor Conference**:
  - Live broadcast announcements and instant polls.
  - One-at-a-time student screen and camera stream inspection.
  - Remote actions: extend lab duration, grant extra attempts, or force-submit stale sessions.
  - Interactive viva voce grading directly inside the live conference view.
- **Automated Grading Hub**: Review automated test verdicts, inspect diffs, adjust subjective viva scores, and publish grades.
- **11-Tab Analytics Suite**: Deep insights across Overview, Students, Experiments, Attendance, Engagement, Mastery, Rankings, Integrity, Trends, and AI Usage.

### 4. Student Experience (`/student/dashboard`)
- **Proctored Lab Runner**: Clean, distraction-free IDE supporting Python, C, C++, and Java with real-time test execution.
- **Socratic AI Tutor**: On-demand algorithmic guidance with 3 escalating tiers:
  - *Tier 1 (Conceptual Hint)*: -3 rubric points
  - *Tier 2 (Logic / Edge Case Hint)*: -7 rubric points
  - *Tier 3 (Pseudo-code Approach)*: -12 rubric points (deductions capped at -15 total)
- **Pre-Lab Quiz Gates**: Automated comprehension checks verifying students understand lab objectives before unlocking the compiler.
- **Personal Learning Analytics**: Radar charts for concept mastery, historical score distributions, and viva feedback records.

### 5. Free Practice Platform (`/practice/dashboard`)
- **2,700+ Curated Problems**: Full taxonomy across Data Structures, Algorithms, Mathematics, and System Design.
- **Gamification Mechanics**: XP gains, level milestones, streak freezes, and daily/weekly quest completions.
- **Interactive Playground**: Ad-hoc code execution with custom stdin inputs for experimentation.

---

## 🤖 AI Copilot & Agent Harness

NexLab features a shared **Claw-Code multi-turn Agent Engine** (`backend/app/ai/harness.py`). The authenticated JWT deterministically selects the user's role scope, permission catalog, persona, and tenant memory boundaries.

```
                      User Prompt + Page Context
                                  │
                                  ▼
                ┌───────────────────────────────────┐
                │       Tenant Governance Gate      │
                │  (Token Quotas & Institution RLS) │
                └─────────────────┬─────────────────┘
                                  │ Pass
                                  ▼
                ┌───────────────────────────────────┐
                │   Planner Loop (Max 6 Turns)      │
                │   Selects from 65 Role Tools      │
                └─────────────────┬─────────────────┘
                                  │
               ┌──────────────────┴──────────────────┐
               ▼                                     ▼
     Direct Execution Tools                Destructive Action Cards
     (Database / Analytics)                (User Confirmation Required)
               │                                     │
               └──────────────────┬──────────────────┘
                                  │ Observation Result
                                  ▼
                ┌───────────────────────────────────┐
                │      Synthesized Response         │
                │  (Socratic / Strict Invariants)   │
                └───────────────────────────────────┘
```

### Tool Catalog Breakdown (65 Tools Total)
- **Institution Admin (30 Tools)**: Campus auto-provisioning, department creation, student enrollment, quota reconfiguration, executive report compilation.
- **Instructor (14 Tools)**: Automated lab conductor, bulk experiment autograding, assignment creation, section analytics extraction.
- **Student (10 Tools)**: Socratic code analysis, test failure explanation, syntax correction, experiment note summarization.
- **Platform User (11 Tools)**: Algorithm hints, time/space complexity inspection, problem search, study plan recommendations.

### Multi-Provider Resilience Chain
1. **Primary**: **Groq LPU Engine** (`qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`) for sub-second streaming inference.
2. **Secondary Fallback**: **OpenRouter Free Pool** (5 rotating sub-second coding/reasoning models).
3. **Tertiary Last-Resort**: **Gemini 2.5/3.0 Flash** for high-context failover.
- **Automatic Cooldowns**: HTTP 429 &rarr; 60s cooldown; HTTP 400/404 &rarr; 3600s cooldown; HTTP 5xx &rarr; 300s cooldown.
- **Honest AI Guarantee**: The harness strictly forbids hallucinated confirmations—no success message is rendered without a verified database observation.

---

## 🧠 ML Behavioral Proctoring & Integrity

NexLab pairs continuous real-time WebSockets with machine learning pipelines to maintain exam-grade academic integrity without intrusive desktop surveillance:

```
Telemetry Signals (30s Windows)
├── Tab Switching Frequency
├── Fullscreen Exits
├── Keystroke Burst Dynamics
├── Mouse / Idle Timeouts
└── WebRTC Frame Hash
           │
           ▼
┌──────────────────────────────────────┐
│  Random Forest Focus Classifier      │
│  (Trained Model: ROC-AUC = 0.9266)   │
└──────────────────┬───────────────────┘
                   │
                   ▼
         Live Student Risk Score
  (Normal: 0-30 | Suspicious: 31-70 | Critical: 71-100)
```

- **Live Screen Sampling**: Lightweight client canvas capture uploads 30-second image frames directly to secure storage for instructor scrub-bar playback.
- **MOSS-Grade Plagiarism Detection**: Post-lab background workers execute a two-stage code similarity analysis:
  1. *Fast Pre-filter*: Fast `difflib` token overlap pre-screening.
  2. *Deep Vectorization*: TF-IDF N-gram token cosine matrix calculation.
  - Pairs scoring &ge; 0.85 similarity are automatically clustered with diffs flagged in the instructor's integrity dashboard.
- **Bayesian Knowledge Tracing (BKT)**: Tracks student mastery per DSA concept across attempts to predict weak areas and recommend personalized revision paths.

---

## 🐳 Sandboxed Code Execution Engine

Code submitted during live labs, assignments, or practice sessions executes inside a disposable, secure Docker sandbox (`backend/app/exec_engine/`):

- **Network-Isolated**: Container runs with `--net=none` to prevent external network calls or data exfiltration.
- **Resource Constrained**: Hard memory limits (default 256MB) and CPU quotas (0.5 vCPU).
- **Non-Root Execution**: Runs under an unprivileged user inside a read-only root filesystem.
- **Timeout Reaper**: Strict process reapers kill runaway infinite loops or fork bombs within 2–5 seconds.

### Standardized Verdict Table

| Verdict | Name | Description |
|---|---|---|
| **AC** | Accepted | Code executed within time and memory limits; output matched all test cases. |
| **WA** | Wrong Answer | Code completed successfully, but output differed from the expected test oracle. |
| **TLE** | Time Limit Exceeded | Execution exceeded the per-problem CPU time threshold (e.g., 2.0s). |
| **MLE** | Memory Limit Exceeded | Memory consumption breached container memory quota (e.g., 256MB). |
| **CE** | Compilation Error | The language compiler exited with non-zero status (compiler stderr returned to user). |
| **RE** | Runtime Error | Process raised an uncaught exception (e.g., SIGSEGV, ZeroDivisionError). |

---

## 📐 System Architecture

```mermaid
flowchart TD
    subgraph Clients["Frontend Clients (Next.js 15 + React 19)"]
        UI_Admin["Institution / Platform Admin"]
        UI_Instr["Instructor Live Conductor"]
        UI_Stud["Student IDE & Runner"]
        UI_Free["Practice Platform Tier"]
    end

    subgraph Gateway["Reverse Proxy & Real-time Layer"]
        Proxy["Next.js API & Rewrite Proxy (:3000)"]
        SocketServer["Flask-SocketIO WebSockets (:5000)"]
    end

    subgraph BackendCore["NexLab Backend (Flask 3.0)"]
        AuthModule["JWT Auth & Role Gate"]
        Harness["Claw-Code AI Agent Harness"]
        LiveManager["Live Lab Session Conductor"]
        GradingEngine["Invariant Rubric Engine"]
        AnalyticsEngine["Nightly Snapshot Jobs"]
    end

    subgraph ExternalServices["Storage & Third-Party Engines"]
        Postgres[("PostgreSQL 17\n(103 Multi-Tenant Tables)")]
        LiveKitCloud["LiveKit Cloud\n(Video & Audio Streams)"]
        DockerRunner["Docker Engine Sandbox\n(Network-Isolated Runner)"]
        AIProviders["Groq LPU / OpenRouter / Gemini"]
    end

    Clients -->|HTTP / JSON| Proxy
    Clients <-->|Socket Events| SocketServer
    Proxy -->|Internal Proxy| BackendCore
    SocketServer <--> BackendCore

    BackendCore --> Postgres
    BackendCore --> LiveKitCloud
    BackendCore --> DockerRunner
    Harness --> AIProviders
```

---

## 🛠 Tech Stack

| Domain | Technology | Version | Purpose / Architectural Role |
|---|---|---|---|
| **Frontend Framework** | **Next.js** | 15.x | App Router architecture, server components, dynamic layout shells |
| **UI Library** | **React** | 19.x | Component state management, reactive interfaces, modern hooks |
| **Styling** | **CSS Modules** | Standard | Zero-runtime CSS isolation, dark-mode glassmorphic theme tokens |
| **Backend Framework** | **Flask** | 3.0.3 | Modular blueprint API, app factory architecture, CLI tooling |
| **Database** | **PostgreSQL** | 17.x | 103 tenant-scoped tables, UUID primary keys, JSONB analytics stores |
| **ORM & Migrations** | **SQLAlchemy / Alembic** | 3.1 / 1.13 | Declarative models, automatic boot DDL healing, migration history |
| **Real-time Engine** | **Flask-SocketIO** | 5.3.6 | Bidirectional 21-event protocol for proctoring and live labs |
| **WebRTC Video** | **LiveKit Cloud** | Modern | Low-latency screen sharing and instructor viva conference rooms |
| **Sandboxed Runner** | **Docker** | Optional | Ephemeral, throwaway execution containers per submission |
| **AI Inference** | **Groq LPU / OpenRouter** | Modern | Sub-second streaming responses for 65 role-scoped agent tools |
| **ML Libraries** | **Scikit-Learn / NumPy** | 1.4 / 1.26 | Random Forest focus scoring, TF-IDF code similarity matrix |

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- **Python**: `3.11` to `3.13`
- **Node.js**: `18.x` or `20.x` LTS (with `npm` 9+)
- **PostgreSQL**: `16` or `17` (listening on port `5432` or `5433`)
- **Docker** *(Optional)*: Required only if running submissions through container sandboxes.

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/mujju-212/NexLab.git
cd NexLab
```

---

### Step 2: Configure Environment Variables

#### Backend Configuration
Copy `backend/.env.example` to `backend/.env`:
```bash
# Windows (PowerShell)
Copy-Item backend/.env.example backend/.env

# Linux / macOS
cp backend/.env.example backend/.env
```
Ensure your database credentials in `backend/.env` are correct:
```env
FLASK_ENV=development
SECRET_KEY=nexlab-local-dev-secret-key-32bytes
JWT_SECRET_KEY=nexlab-jwt-secure-signing-secret
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/virtuallab
GROQ_API_KEY=gsk_your_groq_key_here
DOCKER_RUNNER_ENABLED=false
```

#### Frontend Configuration
Verify `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:5000
```

---

### Step 3: Install Dependencies & Bootstrap Database

#### Windows (Native PowerShell)
```powershell
# 1. Setup Python Virtual Environment
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Bootstrap Super Admin Account
python bootstrap_superadmin.py superadmin@nexlab.io "SuperAdmin@2026" "Platform Super Admin"

# 3. Seed Complete 2-Month Demo Dataset (Idempotent)
python database/seed_complete_demo.py
cd ..

# 4. Setup Frontend Dependencies
cd frontend
npm install
cd ..
```

#### Linux / macOS (Automated Bash)
```bash
# Run one-shot automated bootstrap
chmod +x setup.sh
./setup.sh --seed

# Bootstrap Super Admin & Demo Data
cd backend
python3 bootstrap_superadmin.py superadmin@nexlab.io 'SuperAdmin@2026' "Platform Super Admin"
python3 database/seed_complete_demo.py
cd ..
```

---

### Step 4: Launching the Platform

#### Option A: Windows One-Click Launcher
Run the built-in startup script from the root directory:
```powershell
.\start_all.ps1
# or double-click start_all.bat
```
*(Automatically terminates stale port processes, opens separate console windows for Flask and Next.js, and serves the application).*

#### Option B: Linux / macOS Launcher
```bash
chmod +x up.sh
./up.sh
```

#### Option C: Manual Terminal Launch
**Terminal 1 (Backend)**:
```bash
cd backend
# Windows: .\venv\Scripts\python.exe run.py
# Linux:   source venv/bin/activate && python run.py
```
**Terminal 2 (Frontend)**:
```bash
cd frontend
npm run dev
```

Visit **http://localhost:3000** in your browser.

---

## 🔑 Default Demo Credentials

The database seeder (`seed_complete_demo.py`) initializes a full two-month academic semester (SKIT college tenant) with realistic test records, attendance matrices, proctoring alerts, and analytics:

| Portal / Role | Email Address | Password | Context / Notes |
|---|---|---|---|
| **Platform Super Admin** | `superadmin@nexlab.io` | `SuperAdmin@2026` | Global multi-tenant administration & approvals |
| **Institution Admin** | `admin@skit.edu.in` | `SkitAdmin@2026` | SKIT engineering college tenant administrator |
| **Lab Instructor** | `anitha.rao@skit.edu.in` | `Instructor@2026` | Senior Professor (DSA & Algorithms Lab) |
| **Student (Baseline)** | `rahul.sharma@skit.edu.in` | `Student@2026` | Student enrolled in Semester 3 CSE Section A |
| **Cohort Students** | `priya.deshmukh@skit.edu.in`<br />*(or any `SKIT2026002…016`)* | `TempStud@2026` | Diverse student profiles with varying attendance/grades |
| **Free Platform User** | `dev.patel@gmail.com` | `Platform@2026` | Self-serve user practicing on public problem bank |

---

## ⚖ The 8 System Invariants

NexLab enforces 8 strict architectural rules across its business logic:

1. **Rubric Sum Invariant**: Rubric weights must total exactly 100. Unassessed components are excluded from the score denominator (never counted as 0), and unassessed submissions evaluate to `NULL`, preventing audit flaws.
2. **Hint Penalty Invariant**: Socratic AI hints incur graded deductions: L1 = -3, L2 = -7, L3 = -12 points. Maximum total hint deductions are strictly capped at 15 points.
3. **One-at-a-Time Proctoring**: Instructors inspect live students one at a time via synchronized video/screen streams, preventing browser WebRTC overload while ensuring deep supervision.
4. **Socratic AI Guarantee**: AI assistance provided to students and practice users must never reveal code solutions directly. Hints must remain strictly conceptual and pedagogical.
5. **Honest AI Guarantee**: An agent cannot report success on actions (e.g. creating subjects or modifying users) without an explicit database observation verified in the tool return.
6. **Strict Tenant Boundaries**: Every tenant query explicitly filters by `institution_id`. Cross-tenant AI or data queries immediately return HTTP 403 Forbidden.
7. **Empty States are Truthful**: The platform never paints fake mock data over empty states. If a department or experiment catalog is empty, it is rendered cleanly as empty.
8. **Fail-Closed Governance**: If AI quota tracking or database integrity limits are unavailable, AI execution fails closed rather than allowing unmetered consumption.

---

## 📁 Repository Structure

```
Major project/
├── backend/
│   ├── app/
│   │   ├── admin/            # Superadmin tenant governance & approval endpoints
│   │   ├── ai/               # Claw-Code harness, 65 role tools, multi-model router
│   │   ├── analytics/        # Analytical aggregation engines, risk models, daily KPIs
│   │   ├── auth/             # Multi-tenant JWT auth, password security, role gating
│   │   ├── exec_engine/      # Docker container lifecycle, limits, canonical verdicts
│   │   ├── institution/      # Department, user roster, quota, and audit blueprints
│   │   ├── instructor/       # Experiment studio, rubric manager, session coordinator
│   │   ├── ml/               # Random Forest focus scoring, plagiarism, knowledge tracing
│   │   ├── models/           # 103 SQLAlchemy declarative models with UUID PKs
│   │   ├── platform_user/    # Free practice tier problem bank, quests, and XP engine
│   │   ├── sockets/          # 21 Socket.IO events for live proctoring & conductor room
│   │   ├── student/          # Student lab runner, pre-lab quizzes, submission history
│   │   └── jobs.py           # 12 APScheduler background cron tasks
│   ├── database/             # PostgreSQL schema DDL, demo seeders, test scripts
│   ├── migrations/           # Alembic revision tree
│   └── run.py                # Flask Socket.IO application entry point
├── frontend/
│   ├── app/                  # Next.js 15 App Router (/admin, /institution, /instructor, /student, /practice)
│   ├── components/
│   │   ├── exercise/         # Sandboxed code editor, test runner, output consoles
│   │   ├── instructor/       # Live conductor conference, grading hub, rubric builder
│   │   ├── layout/           # Responsive navigation drawer shells, agent chat drawers
│   │   └── practice/         # Daily quests, challenge cards, problem catalogs
│   ├── services/             # Axios API client, auth interceptors, SWR caching layers
│   ├── store/                # Zustand client state (auth session, active labs)
│   └── next.config.ts        # Next.js API rewrites and Socket.IO proxy routing
├── docs/                     # Comprehensive 33-file technical documentation suite
├── files/                    # Brand assets, high-res logo, and hero banners
├── screenshots/              # Responsive viewport UI verification captures
├── setup.sh                  # One-shot bootstrap script for Linux/macOS
├── start_all.ps1             # PowerShell dual-server launcher
├── start_all.bat             # Windows Command Prompt launcher
└── walkthrough.py            # 34-step automated end-to-end API verification suite
```

---

## 🧪 Testing & Verification

NexLab includes an end-to-end verification script that exercises all 34 steps of a complete academic lifecycle through real HTTP endpoints:

```bash
# Execute end-to-end API walkthrough test
python walkthrough.py
```

The test validates:
1. Superadmin bootstrapping and institution creation.
2. Department, academic year, batch, section, and subject provisioning.
3. Instructor and student onboarding with role verification.
4. Experiment authoring with multi-step rubrics and test suites.
5. Live session scheduling, screen share socket signaling, and student submission.
6. Execution engine test verification (AC/WA) and invariant rubric grade calculation.
7. AI harness role routing and token metering enforcement.

---

## 📖 Documentation Index

For exhaustive technical references, inspect the dedicated [`docs/`](docs/) directory:

- [**01-platform/01-overview.md**](docs/01-platform/01-overview.md) — Comprehensive architecture and product philosophy.
- [**02-database/02-table-reference.md**](docs/02-database/02-table-reference.md) — Reference for all 103 PostgreSQL tables and columns.
- [**03-backend/03-api-reference.md**](docs/03-backend/03-api-reference.md) — Route catalog detailing all 538 backend endpoints.
- [**04-ai/02-roles-and-tools.md**](docs/04-ai/02-roles-and-tools.md) — Detailed catalog of all 65 AI agent tools.
- [**07-ml/01-ml-system.md**](docs/07-ml/01-ml-system.md) — ML training pipeline, focus models, and plagiarism algorithms.
- [**08-operations/01-setup-and-run.md**](docs/08-operations/01-setup-and-run.md) — Production deployment and operations guide.

---

## 📄 License

This project is developed for major project evaluation and institutional deployment. Distributed under the **MIT License**. See `LICENSE` for details.
