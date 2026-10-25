import { apiClient } from './api-client';
import type { PlatformContentBlock } from '@/types/platform-content';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Institution {
  id: string;
  name: string;
  code: string;
  email_domain: string | null;
  logo_url: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  is_active: boolean;
  contact_email: string;
  address: string | null;
  onboarded_at: string;
  onboarding_status: 'pending' | 'active' | 'suspended';
  plan_updated_at: string | null;
  billing_email: string | null;
  billing_notes: string | null;
  groq_limit_override: number | null;
  checklist: {
    has_users: boolean;
    has_experiments: boolean;
    has_environment: boolean;
  };
}

export interface CreateInstitutionDto {
  name: string;
  code: string;
  contact_email: string;
  email_domain?: string;
  address?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  admin_name?: string;
}

export interface PlatformDashboard {
  institutions: { total: number; active: number };
  users: { total: number };
  live_sessions: { active: number };
}

export interface PlatformAnalytics {
  period_days: number;
  total_users: number;
  new_users: number;
  total_sessions: number;
  sessions_in_period: number;
  active_institutions: number;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string | null;
}

// ── Admin Service ──────────────────────────────────────────────────────────────

export const adminService = {

  // ── Institution CRUD ─────────────────────────────────────────────────────────

  // GET /api/admin/institutions
  async listInstitutions(): Promise<Institution[]> {
    const { data } = await apiClient.get<{ institutions: Institution[] }>('/admin/institutions');
    return data.institutions;
  },

  // POST /api/admin/institutions
  // Creates institution + institution_admin user automatically
  async createInstitution(dto: CreateInstitutionDto): Promise<{
    institution: Institution;
    admin_user: { id: string; email: string; full_name: string };
    temp_password: string;
  }> {
    const { data } = await apiClient.post('/admin/institutions', dto);
    return data;
  },

  // GET /api/admin/institutions/<id>
  async getInstitution(id: string): Promise<{ institution: Institution; stats: Record<string, number> }> {
    const { data } = await apiClient.get(`/admin/institutions/${id}`);
    return data;
  },

  // PATCH /api/admin/institutions/<id>
  async updateInstitution(id: string, payload: Partial<Pick<Institution, 'name' | 'plan' | 'is_active' | 'email_domain'>>): Promise<Institution> {
    const { data } = await apiClient.patch<{ institution: Institution }>(`/admin/institutions/${id}`, payload);
    return data.institution;
  },

  // POST /api/admin/institutions/<id>/suspend
  async suspendInstitution(id: string, reason?: string): Promise<void> {
    await apiClient.post(`/admin/institutions/${id}/suspend`, { reason });
  },

  // POST /api/admin/institutions/<id>/activate
  async activateInstitution(id: string): Promise<void> {
    await apiClient.post(`/admin/institutions/${id}/activate`);
  },

  // POST /api/admin/institutions/<id>/reset-admin-password
  async resetAdminPassword(id: string): Promise<{ email: string; temp_password: string; must_change_password: boolean }> {
    const { data } = await apiClient.post(`/admin/institutions/${id}/reset-admin-password`, {});
    return data;
  },

  // ── Platform Dashboard ───────────────────────────────────────────────────────

  // GET /api/admin/dashboard
  async getDashboard(): Promise<PlatformDashboard> {
    const { data } = await apiClient.get<PlatformDashboard>('/admin/dashboard');
    return data;
  },

  // GET /api/admin/health
  async getHealth(): Promise<{ health: Record<string, string> }> {
    const { data } = await apiClient.get('/admin/health');
    return data;
  },

  // GET /api/admin/stats/snapshot
  async getStatsSnapshot() {
    const { data } = await apiClient.get('/admin/stats/snapshot');
    return data;
  },

  // ── Platform Analytics (platform blueprint) ──────────────────────────────────

  // GET /api/platform/analytics/overview
  async getAnalyticsOverview(days = 30): Promise<PlatformAnalytics> {
    const { data } = await apiClient.get<PlatformAnalytics>('/platform/analytics/overview', { params: { days } });
    return data;
  },

  // GET /api/platform/analytics/groq-trend
  async getGroqTrend(days = 7) {
    const { data } = await apiClient.get<{ days: number; trend: { date: string; total: number }[] }>('/platform/analytics/groq-trend', { params: { days } });
    return data.trend;
  },

  // GET /api/platform/analytics/sessions-trend
  async getSessionsTrend(days = 14) {
    const { data } = await apiClient.get<{ trend: { date: string; sessions: number }[] }>('/platform/analytics/sessions-trend', { params: { days } });
    return data.trend;
  },

  // GET /api/platform/analytics/cross-institution
  async getCrossInstitutionAnalytics() {
    const { data } = await apiClient.get<{ institutions: { id: string; name: string; plan: string; users: number; sessions: number; sessions_per_user: number }[] }>('/platform/analytics/cross-institution');
    return data.institutions;
  },

  // ── Onboarding ───────────────────────────────────────────────────────────────

  // GET /api/platform/institutions/pending
  async getPendingInstitutions() {
    const { data } = await apiClient.get('/platform/institutions/pending');
    return data;
  },

  // GET /api/platform/institutions/<iid>/onboarding
  async getOnboardingChecklist(iid: string) {
    const { data } = await apiClient.get(`/platform/institutions/${iid}/onboarding`);
    return data;
  },

  // ── Platform Config & Feature Flags ─────────────────────────────────────────

  // GET /api/platform/config
  async getPlatformConfig(): Promise<{ config: Record<string, string> }> {
    const { data } = await apiClient.get('/platform/config');
    return data;
  },

  // PATCH /api/platform/config
  async updatePlatformConfig(updates: Record<string, string>): Promise<void> {
    await apiClient.patch('/platform/config', updates);
  },

  // GET /api/platform/config/features
  async getFeatureFlags(): Promise<{ features: Record<string, boolean> }> {
    const { data } = await apiClient.get('/platform/config/features');
    return data;
  },

  // PATCH /api/platform/config/features/<flag>
  async toggleFeatureFlag(flag: string, enabled: boolean): Promise<void> {
    await apiClient.patch(`/platform/config/features/${flag}`, { enabled });
  },

  // ── Groq Usage ───────────────────────────────────────────────────────────────

  // GET /api/admin/groq-usage
  async getGroqUsage() {    const { data } = await apiClient.get<{ date: string; usage: { institution_id: string; count: number }[] }>('/admin/groq-usage');
    return data;
  },

  // GET /api/platform/analytics/ai-usage/cross-institution (C6 roll-up)
  async getAiUsageCrossInstitution(days = 30): Promise<{
    days: number;
    institutions: Array<{
      institution_id: string;
      name: string;
      plan: string;
      calls: number;
      tokens: number;
      cost_usd: number;
      by_feature: Record<string, number>;
    }>;
  }> {
    const { data } = await apiClient.get('/platform/analytics/ai-usage/cross-institution', { params: { days } });
    return data;
  },

  // PATCH /api/platform/institutions/<iid>/billing/groq-limit
  async updateGroqLimit(iid: string, limit: number | null): Promise<void> {
    await apiClient.patch(`/platform/institutions/${iid}/billing/groq-limit`, { limit });
  },

  // GET /api/platform/institutions/<iid>/billing
  async getBilling(iid: string) {
    const { data } = await apiClient.get(`/platform/institutions/${iid}/billing`);
    return data;
  },

  // PATCH /api/platform/institutions/<iid>/billing/plan
  async updatePlan(iid: string, plan: string, billingEmail?: string): Promise<void> {
    await apiClient.patch(`/platform/institutions/${iid}/billing/plan`, { plan, billing_email: billingEmail });
  },

  // ── User Search ───────────────────────────────────────────────────────────────

  // GET /api/admin/users/search?q=&role=&institution_id=
  async searchUsers(params: { q?: string; role?: string; institution_id?: string }) {
    const { data } = await apiClient.get('/admin/users/search', { params });
    return data;
  },


  // ── Audit Logs ────────────────────────────────────────────────────────────────


  // GET /api/platform/audit-logs
  async getAuditLogs(params?: { institution_id?: string; days?: number; page?: number }) {
    const { data } = await apiClient.get<{ total: number; page: number; pages: number; logs: AuditLogEntry[] }>('/platform/audit-logs', { params });
    return data;
  },
};


// ═══ Platform Admin — User Management + User-360 (Phase 1) ═══════════════════

export interface AdminDirectoryUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  institution_id: string | null;
  institution_name: string | null;
  account_type: 'institution' | 'direct';
  status: 'active' | 'suspended' | 'pending_deletion' | string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string | null;
  last_login: string | null;
}

export interface AdminUser360 {
  user: AdminDirectoryUser & {
    suspension_reason?: string | null;
    suspended_until?: string | null;
    institution_name?: string | null;
  };
  stats: {
    course_solves: number;
    practice_submissions: number;
    practice_accepted: number;
    total_xp: number;
    level: number | null;
    level_name: string | null;
    grades: number;
    exam_attempts: number;
  };
}

export interface AdminUserProgress {
  xp: { total_xp: number; level: number; level_name: string; streak_days: number; problems_solved: number } | null;
  rating: { rating: number | null; global_rank: number | null; easy_solved?: number; medium_solved?: number; hard_solved?: number } | null;
  topic_strength: { topic: string; strength: number; total_solved: number; total_attempted: number }[];
  courses: { courses: { id: string; title: string; completion_pct: number; xp_earned: number; cert_eligible: boolean }[]; enrolled_courses: number; completed_courses: number };
  activity_summary: { total_submissions?: number; current_streak?: number; longest_streak?: number } | null;
  heatmap: { date: string; count: number; level: number }[];
}

export interface AdminUserGrades {
  grades: { id: string; final_grade: number | null; source_kind?: string; source_title?: string | null; graded_at?: string | null }[];
  exam_attempts: { id: string; exam_id: string; status: string; score: number | null; submitted_at: string | null }[];
  certificates: { course_id: string; certificate_id?: string; course_title?: string }[];
}

export interface AdminUserAttempts {
  lab_attempts: { total: number; items: { id: string; experiment_title: string | null; compile_status: string | null; execution_time_ms: number | null; created_at: string | null }[] };
  practice_submissions: { total: number; items: { id: string; problem_title: string | null; language: string; status: string; passed: number | null; total_cases: number | null; xp_earned: number | null; submitted_at: string | null }[] };
}

export interface AdminUserActivity {
  by_user: { id: string; action: string; severity: string; detail: string | null; created_at: string }[];
  about_user: { id: string; action: string; severity: string; detail: string | null; created_at: string }[];
}

export const adminUsersService = {
  async createUser(dto: { email: string; full_name: string; role: string; institution_id?: string }): Promise<{ user: AdminDirectoryUser; temp_password: string; must_change_password: boolean }> {
    const { data } = await apiClient.post('/admin/users', dto);
    return data;
  },

  async listUsers(params: { q?: string; role?: string; institution_id?: string; status?: string; sort?: string; page?: number; per_page?: number }): Promise<{ total: number; page: number; pages: number; users: AdminDirectoryUser[] }> {
    const { data } = await apiClient.get('/admin/users', { params });
    return data;
  },

  async getUser360(userId: string): Promise<AdminUser360> {
    const { data } = await apiClient.get(`/admin/users/${userId}`);
    return data;
  },

  async getUserProgress(userId: string): Promise<AdminUserProgress> {
    const { data } = await apiClient.get(`/admin/users/${userId}/progress`);
    return data;
  },

  async getUserGrades(userId: string): Promise<AdminUserGrades> {
    const { data } = await apiClient.get(`/admin/users/${userId}/grades`);
    return data;
  },

  async getUserAttempts(userId: string, page = 1): Promise<AdminUserAttempts> {
    const { data } = await apiClient.get(`/admin/users/${userId}/attempts`, { params: { page } });
    return data;
  },

  async getUserActivity(userId: string): Promise<AdminUserActivity> {
    const { data } = await apiClient.get(`/admin/users/${userId}/activity`);
    return data;
  },

  async renameUser(userId: string, fullName: string): Promise<{ user: AdminDirectoryUser }> {
    const { data } = await apiClient.patch(`/admin/users/${userId}`, { full_name: fullName });
    return data;
  },

  async suspendUser(userId: string, reason: string, until?: string): Promise<{ user: AdminDirectoryUser }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/suspend`, { reason, until });
    return data;
  },

  async activateUser(userId: string): Promise<{ user: AdminDirectoryUser }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/activate`, {});
    return data;
  },

  async resetUserPassword(userId: string): Promise<{ temp_password: string; must_change_password: boolean }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/reset-password`, {});
    return data;
  },

  async forceLogoutUser(userId: string): Promise<{ forced: boolean }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/force-logout`, {});
    return data;
  },
};


// ═══ Platform Admin — Institution Drill-down (Phase 2) ═══════════════════════

export interface TenantAnalytics {
  institution: { id: string; name: string; plan: string };
  window_days: number;
  people: { total_users: number; role_counts: Record<string, number>; active_users_30d: number; suspended_users: number };
  sessions: { total: number; live: number; trend: { date: string; count: number }[] };
  ai: { calls_in_window: number; trend: { date: string; count: number }[] };
  executions: { runs_in_window: number; trend: { date: string; count: number }[] };
  learning: { practice_solves_in_window: number; solves_trend: { date: string; count: number }[]; course_solves_total: number };
}

export const adminTenantService = {
  async getInstitutionUsers(iid: string, params: { q?: string; role?: string; status?: string; page?: number; per_page?: number }): Promise<{ institution: { id: string; name: string }; total: number; page: number; pages: number; users: AdminDirectoryUser[] }> {
    const { data } = await apiClient.get(`/admin/institutions/${iid}/users`, { params });
    return data;
  },

  async getInstitutionAnalytics(iid: string, days = 30): Promise<TenantAnalytics> {
    const { data } = await apiClient.get(`/admin/institutions/${iid}/analytics`, { params: { days } });
    return data;
  },
};


// ═══ Platform Admin — Content + Growth Analytics (Phase 3) ══════════════════

export interface AdminPlatformCourse {
  id: string; slug: string; title: string; description: string | null;
  difficulty: string; language: string; tags: string[];
  is_published: boolean; order_index: number;
  exercise_count: number; solves_count: number; created_at: string | null;
}

export interface AdminPlatformExercise {
  id: string; course_id: string; order_index: number; title: string;
  description: string | null; exercise_type: string; difficulty: string;
  xp_reward: number; tags: string[]; solves_count: number; is_published: boolean;
  test_case_count: number; test_cases: { input: string; expected: string; hidden?: boolean }[];
  mcq_options: string[] | null; mcq_answer: string | null; mcq_explanation: string | null;
  starter_code: Record<string, string> | null; allowed_languages: string[] | null;
  simulation_path: string | null; hint_text: string | null;
  content_blocks: PlatformContentBlock[];
}

export interface AdminProblemBankRow {
  id: string; slug: string; lc_id: string | null; title: string;
  difficulty: string; nexlab_topic: string; is_active: boolean; acceptance: number | null;
}

export interface AdminFunnelStage { key: string; label: string; count: number; pct: number; }
export interface AdminCohort { cohort: string; size: number; cells: { week: number; count: number; pct: number | null }[]; }

export const adminContentService = {
  async listCourses(): Promise<{ courses: AdminPlatformCourse[] }> {
    const { data } = await apiClient.get('/admin/content/courses');
    return data;
  },
  async createCourse(dto: { title: string; slug: string; description?: string; difficulty?: string; language?: string; is_published?: boolean }): Promise<{ course: AdminPlatformCourse }> {
    const { data } = await apiClient.post('/admin/content/courses', dto);
    return data;
  },
  async updateCourse(id: string, patch: Record<string, unknown>): Promise<{ course: AdminPlatformCourse }> {
    const { data } = await apiClient.patch(`/admin/content/courses/${id}`, patch);
    return data;
  },
  async deleteCourse(id: string): Promise<void> {
    await apiClient.delete(`/admin/content/courses/${id}`);
  },
  async listExercises(courseId: string): Promise<{ exercises: AdminPlatformExercise[] }> {
    const { data } = await apiClient.get(`/admin/content/courses/${courseId}/exercises`);
    return data;
  },
  async listSimulationAssets(): Promise<{ assets: { path: string; name: string }[] }> {
    const { data } = await apiClient.get('/admin/content/simulation-assets');
    return data;
  },
  async getSimulationAssetSource(path: string): Promise<{ path: string; html: string }> {
    const { data } = await apiClient.get('/admin/content/simulation-assets/source', { params: { path } });
    return data;
  },
  async createExercise(courseId: string, dto: Record<string, unknown>): Promise<{ exercise: AdminPlatformExercise }> {
    const { data } = await apiClient.post(`/admin/content/courses/${courseId}/exercises`, dto);
    return data;
  },
  async updateExercise(id: string, patch: Record<string, unknown>): Promise<{ exercise: AdminPlatformExercise }> {
    const { data } = await apiClient.patch(`/admin/content/exercises/${id}`, patch);
    return data;
  },
  async deleteExercise(id: string): Promise<void> {
    await apiClient.delete(`/admin/content/exercises/${id}`);
  },
  async listProblems(filter: string, page = 1): Promise<{ filter: string; total: number; page: number; pages: number; summary: { no_test_cases: number; disabled: number; total: number }; problems: AdminProblemBankRow[] }> {
    const { data } = await apiClient.get('/admin/content/problems', { params: { filter, page, per_page: 20 } });
    return data;
  },
  async toggleProblem(id: string, isActive: boolean): Promise<void> {
    await apiClient.patch(`/admin/content/problems/${id}`, { is_active: isActive });
  },
};

export const adminGrowthService = {
  async getFunnel(days = 60): Promise<{ window_days: number; stages: AdminFunnelStage[] }> {
    const { data } = await apiClient.get('/admin/analytics/funnel', { params: { days } });
    return data;
  },
  async getCohorts(weeks = 8): Promise<{ weeks: number; cohorts: AdminCohort[] }> {
    const { data } = await apiClient.get('/admin/analytics/cohorts', { params: { weeks } });
    return data;
  },
  async getPlatformUsers(days = 30): Promise<{
    total: number; active: number; signups_in_window: number;
    growth: { date: string; count: number }[]; dau: { date: string; count: number }[];
    xp_distribution: Record<string, number>;
    top_learners: { id: string; name: string; xp: number }[];
  }> {
    const { data } = await apiClient.get('/admin/analytics/platform-users', { params: { days } });
    return data;
  },
  exportUrl(report: 'users' | 'activity'): string {
    return `/api/admin/analytics/export?report=${report}`;
  },
};


// ═══ Platform Admin — Governance (Phase 4) ══════════════════════════════════

export interface ImpersonationInfo {
  active: boolean; session_id: string; impersonator_id: string;
  impersonator_name?: string; reason?: string; read_only: boolean;
}

export interface ImpersonationSessionRow {
  id: string; admin_name?: string; target_name?: string; target_email?: string;
  reason: string; started_at: string; ended_at: string | null; revoked: boolean; active: boolean;
}

export interface ExportJobRow {
  id: string; user_id: string; kind: string; status: string;
  created_at: string; expires_at: string;
}

export interface JobsMonitor {
  scheduler_running: boolean;
  jobs: { id: string; trigger: string; next_run: string | null }[];
  metric_snapshots: { metric: string; last_day: string | null; last_computed: string | null }[];
}

export const adminGovernanceService = {
  async impersonate(userId: string, reason: string): Promise<{ token: string; session_id: string; expires_in_minutes: number; read_only: boolean }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/impersonate`, { reason });
    return data;
  },

  async endImpersonation(sessionId?: string): Promise<void> {
    await apiClient.post('/admin/impersonation/end', sessionId ? { session_id: sessionId } : {});
  },

  async getImpersonationHistory(): Promise<{ sessions: ImpersonationSessionRow[] }> {
    const { data } = await apiClient.get('/admin/impersonation/history');
    return data;
  },

  async createExport(userId: string, kind: 'gdpr' = 'gdpr'): Promise<{ job: ExportJobRow }> {
    const { data } = await apiClient.post(`/admin/users/${userId}/export`, { kind });
    return data;
  },

  async listExports(): Promise<{ jobs: ExportJobRow[] }> {
    const { data } = await apiClient.get('/admin/exports');
    return data;
  },

  async downloadExport(jobId: string): Promise<Blob> {
    const { data } = await apiClient.get(`/admin/exports/${jobId}`, { responseType: 'blob' });
    return data as Blob;
  },

  async downloadAuditCsv(days = 30): Promise<Blob> {
    const { data } = await apiClient.get('/admin/governance/audit-logs/export', {
      params: { days }, responseType: 'blob',
    });
    return data as Blob;
  },

  async getJobsMonitor(): Promise<JobsMonitor> {
    const { data } = await apiClient.get('/admin/jobs');
    return data;
  },

};
