# NexLab Platform Admin Completion Plan

**Scope:** End-to-end platform-admin control completeness in the current local workspace. No deployed environment, Docker setup, or live-data changes. Preserve tenant records; use only isolated temporary test records. `docs/` and unrelated existing reports are out of scope for commits.

## Completion standard

A control is complete only when (1) there is an admin UI, (2) the backend validates and persists it, (3) its effect is enforced by the relevant runtime path, (4) its mutation is auditable where sensitive, (5) unauthorized roles are rejected, and (6) create/edit/edge/error behavior is regression-tested. UI labels must not claim effects the backend does not deliver.

## Phases and acceptance criteria

### 0. Baseline, inventory, and safety — complete
- Inventory every `/admin/*` page, admin API route, connected service call, and role guard.
- Keep a fixed set of known gaps and record verification limits (SQLite test DB only; no Docker or deployed service).
- Preserve all baseline tenant/product data and unrelated untracked files.

### 1. Platform settings must be real controls — implemented, focused verification passed
- Preserve an explicit `allow_self_registration=false` setting across restarts.
- Validate config keys/types/ranges server-side; reject unknown keys and invalid values without partial writes.
- Make `code_execution_enabled` an effective second gate in every code-run/submit path, while retaining `DOCKER_RUNNER_ENABLED` as the infrastructure gate.
- Wire maintenance settings to the maintenance endpoint, audit changes, expose read-only public status, and show/update a shared maintenance banner for connected users.
- Verify admin health and tenant health report the same effective execution state.

### 2. Institution onboarding and environment profiles — complete with custom execution explicitly retired
- [x] Correctly render nested onboarding checklist data and refresh it after actions.
- [x] Make completion conditional on a satisfied checklist; make reset/complete visible and auditable.
- [x] Define pending-only approve/reject transitions with audit entries; approval explicitly does not claim a build.
- [x] Add tenant-admin request creation and platform-admin review for environment profile records.
- [x] Retire subject-level custom profile assignment because the runtime neither builds nor selects images. Both tenant/admin UI/API state this; code execution continues on the standard runtime. Do not enable Docker or claim custom images execute.

### 3. Institution and billing controls — complete for current admin policy
- [x] Expose safe edit controls for institution name/contact/domain/address/phone/website with validation, all-or-nothing writes, audit events, and a profile UI.
- [x] Align displayed student caps with the runtime quota helper; preserve zero AI-limit overrides and allow resetting to the plan default.
- [x] Add audited billing-plan/email/notes and AI-request-limit controls in institution detail UI/API.
- [x] No separate institution approval queue is needed in the current workflow: only a platform admin can create an institution; creation immediately creates its admin account. Onboarding activation still requires the live checklist.

### 4. User lifecycle and governance — complete for supported roles
- Preserve existing create/search/360/progress/attempt/activity/suspend/activate/password-reset/force-logout controls.
- [x] Add an audited two-distinct-platform-admin approval flow for tenant role/institution moves. Platform-admin grants and moves are refused; approved moves force logout and clear stale department assignments across institutions.
- [x] Keep destructive deletion protected where submissions/history exist.

### 5. Platform-wide operations and audit completeness — complete for reviewed admin mutations
- [x] Add a platform-announcement composer, validation, recipient count re-confirmation, notifications, audit record, and sent-history visibility.
- [x] Ensure config, billing, onboarding, environment requests/decisions, announcements, institution profile edits, and role/institution changes are auditable with actor, action, target, and detail.
- [x] Keep the role matrix descriptive; no unsupported dynamic permission editor is presented.

### 6. Central vs tenant-scoped admin boundaries — implemented
- [x] Keep academic structure and assignments tenant-scoped; add explanatory admin pages with links rather than broadening global authority.
- [x] Replace redirect-only admin academic/assignment pages with explicit boundary explanations and institution deep links.

### 7. Verification and delivery — in progress
- [x] Focused API tests on isolated SQLite cover roles, validation, persistence, audit records, quota limits, announcements, environment decisions, onboarding, and two-person role moves.
- [x] Backend syntax checks, migration DDL smoke test, and `git diff --check` pass.
- [x] Frontend type-check passes after the added pages and controls.
- [ ] Production build remains unverified: prior `npm run build` exceeded the 10-minute timeout and was terminated.
- [ ] Run applicable non-Docker tests; Docker execution/sandbox tests remain blocked by the no-Docker constraint.
- [x] No `backend/dev.db`, deployed environment, or baseline tenant records were changed; test data lived only in throwaway SQLite fixtures.
- [x] Commit only relevant backend/frontend code. Push remains pending until fresh secure GitHub authentication is available; never reuse the exposed token.

## Verified initial findings

- All scanned admin API routes use `require_role('platform_admin')`, except impersonation end which is intentionally available to supported impersonated roles.
- Missing/ineffective controls confirmed: startup forces self-registration on; execution feature flag is not consumed by execution routes; maintenance settings are saved through generic config without the broadcast/listener path; environment profiles have no create API and are not consumed by execution; onboarding UI reads the wrong response shape and completion does not enforce checklist; plan/institution edits are not wired into UI; announcement endpoint has no UI; several `platform.py` mutations are not written to `AuditLog`.
- Academic Setup and Assignments currently redirect to tenant-scoped portals; this is a boundary decision, not yet treated as a bug.

## Status

- Problem Bank create/edit/test-case authoring and lesson-content blocks were implemented and committed locally through `0092b61`.
- Platform admin work is committed locally in `9ceefce` (settings/onboarding/billing), `74c4178` (profile edits, environment request/retirement boundary, announcements, two-admin changes, scope pages), and `b25d198` (legacy route destinations and rejection-path regression coverage). Push remains blocked until fresh secure GitHub authentication is available.
- Focused verification: `backend/tests/test_platform_content_admin.py` plus `backend/tests/test_ranking_sample_gate.py` — 16 passed on isolated SQLite / local Python. Backend syntax checks and `git diff --check` pass. New approval migration passed an isolated SQLite DDL smoke test. Frontend `npm run type-check` passes.
- New admin workflows: institution profile edit; two-admin user role/tenant approvals; platform announcement preview/send/history; environment request review and tenant request form; explicit academic/assignment scope explanations.
- Environment custom-image execution is explicitly retired: profile requests/approvals are auditable catalog/governance records only; subject assignment rejects custom profile IDs; execution remains on standard runtime. No Docker was configured or run.
- Current product onboarding creates an institution only from the platform-admin console, so a separate pending-institution approval queue is not part of the chosen workflow; onboarding completion remains gated by the live checklist.
- Production `npm run build` previously exceeded the 10-minute command timeout and was terminated; build success remains unverified. Full Docker execution/sandbox tests were not run under the no-Docker constraint.
- No deployed environment, `backend/dev.db`, or baseline tenant data was touched.
