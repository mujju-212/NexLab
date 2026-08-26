import { apiClient } from './api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InstitutionUser {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  role: 'student' | 'instructor' | 'institution_admin';
  roll_number?: string;
  staff_id?: string | null;
  department_id?: string | null;
  year_of_study?: number | null;
  semester?: number | null;
  phone?: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateUserDto {
  full_name: string;
  email: string;
  role: 'student' | 'instructor';
  password?: string;
  roll_number?: string;
  staff_id?: string;
  department_id?: string;
  year_of_study?: number;
  semester?: number;
  phone?: string;
}

export interface UpdateUserDto {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  roll_number?: string;
  staff_id?: string;
  department_id?: string | null;
  year_of_study?: number;
  semester?: number;
}

export interface Department {
  id: string;
  name: string;
  code?: string | null;
  created_at: string;
}

export interface AcademicYear {
  id: string;
  year_label: string;
  is_active: boolean;
}

export interface Batch {
  id: string;
  name: string;
  program?: string;
  year_id: string;
}

export interface Section {
  id: string;
  name: string;
  batch_id: string;
  class_teacher_id?: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  env_profile_id?: string;
  total_marks?: number;
}

export interface InstitutionDashboard {
  stats: {
    instructors: number;
    students: number;
    subjects: number;
    live_sessions: number;
  };
  upcoming_sessions: Array<{
    id: string;
    title?: string;
    scheduled_at: string;
    status: string;
  }>;
}

export interface AnalyticsOverview {
  period_days: number;
  sessions: { total: number; completed: number; completion_rate_pct: number };
  students: { total: number; at_risk: number; at_risk_pct: number };
  instructors: { active_this_month: number };
  peak_hours: Array<{ hour: number; session_count: number }>;
}

export interface AtRiskStudent {
  student_id: string;
  full_name: string;
  email: string;
  roll_number?: string;
  avg_mastery: number;
  concepts_tracked: number;
}

export interface SectionComparison {
  section_id: string;
  section_name: string;
  enrolled: number;
  avg_score: number;
}

// ── New analytics types (B1–B9 + Instructors + Proctoring) ─────────────────

export interface AttendanceSummary {
  total_sessions: number;
  total_attendance_records: number;
  present_count: number;
  absent_count: number;
  avg_attendance_rate: number;
  by_status: Record<string, number>;
  by_session: Array<{
    session_id: string; session_title: string;
    scheduled_at: string; total: number; present: number; rate: number;
  }>;
  period: { from: string; to: string };
}

export interface GradeDistribution {
  total_grades: number;
  avg_score: number;
  median_score: number | null;
  pass_rate: number;
  distribution: { range: string; count: number; pct: number }[];
  by_section: Array<{ section_id: string; section_name: string; avg_score: number; total: number }>;
  period: { from: string; to: string };
}

export interface ExperimentUsage {
  total_experiments: number;
  experiments: Array<{
    experiment_id: string; title: string; subject_name: string;
    times_used: number; avg_score: number | null; avg_completion_pct: number | null;
  }>;
  period: { from: string; to: string };
}

export interface AnalyticsTrend {
  grain: string;
  series: Array<{ period: string; sessions: number; submissions: number; avg_score: number | null }>;
  period: { from: string; to: string };
}

export interface InstructorPerf {
  instructor_id: string;
  full_name: string;
  email: string;
  sessions_run: number;
  subjects_count: number;
  sections_count: number;
  avg_attendance: number | null;
  avg_final_grade: number | null;
  avg_focus_score: number | null;
  avg_feedback: number | null;
}

export interface ProctoringReport {
  total_records: number;
  institution_avg: Record<string, number | null>;
  proctor_event_totals: Record<string, number>;
  at_risk_students: Array<{
    student_id: string; full_name: string | null; roll_number: string | null;
    samples: number; avg_focus_score: number | null;
    signals: Record<string, number | null>;
    proctor_events: Record<string, number>;
  }>;
  period: { from: string; to: string };
}

export interface EngagementReport {
  total_students: number;
  active_students: number;
  dormant_students: number;
  at_risk_count: number;
  engagement_rate: number;
  at_risk_students: Array<{
    student_id: string; full_name: string | null; roll_number: string | null;
    sessions_attended: number; total_time_minutes: number; avg_score: number | null;
    concept_mastery: number | null; focus_score: number | null;
  }>;
  period: { from: string; to: string };
}

export interface AIUsageReport {
  total_calls: number;
  total_tokens: number;
  by_feature: Record<string, { calls: number; tokens: number }>;
  top_consumers: Array<{
    user_id: string; full_name: string | null; role: string;
    calls: number; tokens: number;
  }>;
  period: { from: string; to: string };
}

/** Feature keys toggleable via AIPolicy.features_enabled */
export const AI_FEATURES: { key: string; label: string; desc: string }[] = [
  { key: 'hint',          label: 'Progressive Hints',        desc: 'Step-by-step guidance when students get stuck' },
  { key: 'chat',          label: 'Help Chat',                desc: 'Multi-turn assistant inside the lab' },
  { key: 'code_assist',   label: 'Playground Assistant',     desc: 'Free-practice code hints & error explanations' },
  { key: 'viva_generate', label: 'Viva Question Generation', desc: 'Auto-generated questions from submitted code' },
  { key: 'viva_evaluate', label: 'Viva Answer Evaluation',   desc: 'AI scoring of viva answers' },
  { key: 'agent',         label: 'Agentic Assistant (Beta)', desc: 'Autonomous tool-using assistant — off until launched' },
];

export interface AIPolicy {
  institution_id: string;
  ai_enabled_global: boolean;
  ai_enabled_students: boolean;
  ai_enabled_instructors: boolean;
  features_enabled: Record<string, boolean>;
  daily_token_quota: number | null;
  monthly_token_quota: number | null;
  per_student_daily_quota: number | null;
  hard_stop: boolean;
  updated_at: string | null;
}

export interface AIUsageSummary {
  institution_id: string;
  window_days: number;
  summary: {
    calls: number;
    tokens: number;
    cost_usd: number;
    by_feature: Record<string, { calls: number; tokens: number }>;
    by_model: Record<string, { calls: number; tokens: number }>;
  };
  logs: Array<{
    id: string; user_id: string | null; role: string; feature: string;
    model: string; provider: string; total_tokens: number;
    estimated_cost_usd: number; success: boolean; created_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface AgentRun {
  id: string;
  institution_id: string;
  user_id: string;
  prompt: string;
  tool_calls: Array<{ tool: string; args: Record<string, unknown>; result?: unknown; error?: string }>;
  result: string;
  total_tokens: number;
  status: 'completed' | 'pending_confirm' | 'error';
  created_at: string;
  pending_action?: { tool: string; payload: Record<string, unknown> } | null;
  answer?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  created_at: string;
  actor_id: string;
  actor_name?: string;
  actor_email?: string;
  actor_role?: string;
}

export interface AuditLogPage {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
  days: number;
  actions: string[];
}

export interface PlanUsage {
  plan: string;
  students: { used: number; limit: number; remaining: number; percent: number };
  instructors: { used: number; limit: number | null };
  subjects: number;
}

export interface NotificationPrefs {
  email_sessions: boolean;
  email_announcements: boolean;
  email_user_activity: boolean;
  email_weekly_digest: boolean;
  push_sessions: boolean;
  push_announcements: boolean;
}

export interface DashboardActivity {
  days: Array<{ date: string; label: string; sessions: number; submissions: number; total: number }>;
  total_week: number;
  delta_pct: number;
}

export interface SystemHealth {
  components: Array<{ label: string; status: string; ok: boolean }>;
  all_ok: boolean;
  maintenance: boolean;
}

export interface ScheduleSessionDto {
  title: string;
  section_id: string;
  subject_id: string;
  scheduled_at: string;
  duration_minutes: number;
  instructor_id?: string;
}

export interface BulkScheduleDto {
  section_id: string;
  subject_id: string;
  instructor_id?: string;
  title_prefix: string;
  day_of_week: number; // 0=Mon … 6=Sun
  start_time: string;  // HH:MM (24-h)
  start_date: string;  // YYYY-MM-DD
  end_date: string;    // YYYY-MM-DD
  duration_minutes: number;
}

export interface BulkScheduleConflict {
  date: string;
  time: string;
  reason: string;
}

export interface BulkScheduleResult {
  created: SessionEnriched[];
  conflicts: BulkScheduleConflict[];
  created_count: number;
  skipped_count: number;
  message?: string;
}

export interface SessionEnriched {
  id: string;
  title?: string;
  status: string;
  scheduled_at: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes: number;
  instructor_id?: string;
  instructor_name?: string;
  subject_name?: string;
  subject_code?: string;
  section_name?: string;
  section_id?: string;
  student_count?: number;
}

export interface SectionSubjectDetail {
  id: string;
  section_id: string;
  section_name?: string | null;
  subject_id: string;
  subject_name: string;
  subject_code?: string;
  instructor_id: string;
  instructor_name: string;
  co_instructor_id?: string | null;
  co_instructor_name?: string | null;
}

export interface UserDetail extends InstitutionUser {
  sections: Array<{
    section_id: string;
    section_name: string;
    batch_name: string;
    year_label: string;
  }>;
  subjects?: Array<{
    subject_name: string;
    subject_code?: string;
    instructor_name?: string;
  }>;
}

export interface UserEnrolment {
  section_id: string;
  section_name: string;
  batch_id: string;
  batch_name?: string | null;
  program?: string | null;
  enrolled_at?: string | null;
}

export interface UserRecord {
  user: InstitutionUser & { department_name?: string | null };
  enrolments: UserEnrolment[];
  teaching: SectionSubjectDetail[];
}

// ── Institution Service ────────────────────────────────────────────────────────

export const institutionService = {

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard(): Promise<InstitutionDashboard> {
    const { data } = await apiClient.get<InstitutionDashboard>('/institution/dashboard');
    return data;
  },

  // ── User Management ───────────────────────────────────────────────────────────

  // params.q searches full_name, email, roll_number, and staff_id
  async listUsers(params?: { role?: string; department_id?: string; q?: string }): Promise<InstitutionUser[]> {
    const { data } = await apiClient.get<{ users: InstitutionUser[] }>('/institution/users', { params });
    return data.users;
  },

  async getUser(userId: string): Promise<UserRecord> {
    const { data } = await apiClient.get<UserRecord>(`/institution/users/${userId}`);
    return data;
  },

  async createUser(dto: CreateUserDto): Promise<InstitutionUser> {
    const { data } = await apiClient.post<{ user: InstitutionUser }>('/institution/users', dto);
    return data.user;
  },

  async updateUser(userId: string, dto: UpdateUserDto): Promise<InstitutionUser> {
    const { data } = await apiClient.patch<{ user: InstitutionUser }>(`/institution/users/${userId}`, dto);
    return data.user;
  },

  async changeUserRole(userId: string, role: 'student' | 'instructor' | 'institution_admin'): Promise<InstitutionUser> {
    const { data } = await apiClient.patch<{ user: InstitutionUser }>(`/institution/users/${userId}/role`, { role });
    return data.user;
  },

  async deleteUser(userId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/users/${userId}`);
    return data;
  },

  async toggleUserActive(userId: string): Promise<{ is_active: boolean }> {
    const { data } = await apiClient.patch(`/institution/users/${userId}/toggle-active`);
    return data;
  },

  // ── Departments ────────────────────────────────────────────────────────────

  async listDepartments(): Promise<Department[]> {
    const { data } = await apiClient.get<{ departments: Department[] }>('/institution/departments');
    return data.departments;
  },

  async createDepartment(dto: { name: string; code?: string }): Promise<Department> {
    const { data } = await apiClient.post<{ department: Department }>('/institution/departments', dto);
    return data.department;
  },

  async updateDepartment(deptId: string, dto: { name?: string; code?: string }): Promise<Department> {
    const { data } = await apiClient.patch<{ department: Department }>(`/institution/departments/${deptId}`, dto);
    return data.department;
  },

  async deleteDepartment(deptId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/departments/${deptId}`);
    return data;
  },

  // ── Section update/delete (create + list already exist below) ──────────────

  async updateSection(sectionId: string, dto: { name?: string; class_teacher_id?: string | null }): Promise<Section> {
    const { data } = await apiClient.patch<{ section: Section }>(`/institution/sections/${sectionId}`, dto);
    return data.section;
  },

  async deleteSection(sectionId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/sections/${sectionId}`);
    return data;
  },

  async forceLogoutUser(userId: string): Promise<void> {
    await apiClient.post(`/institution/users/${userId}/force-logout`);
  },

  async bulkUploadUsers(file: File): Promise<{ created: number; skipped: number; skipped_emails: string[] }> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post('/institution/users/bulk-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  // ── Academic Structure ────────────────────────────────────────────────────────

  async getAcademicYears(): Promise<AcademicYear[]> {
    const { data } = await apiClient.get<{ years: AcademicYear[] }>('/institution/academic-years');
    return data.years;
  },

  async createAcademicYear(year_label: string): Promise<AcademicYear> {
    const { data } = await apiClient.post<{ year: AcademicYear }>('/institution/academic-years', { year_label });
    return data.year;
  },

  async getBatches(yearId?: string): Promise<Batch[]> {
    const { data } = await apiClient.get<{ batches: Batch[] }>('/institution/batches', {
      params: yearId ? { year_id: yearId } : {},
    });
    return data.batches;
  },

  async createBatch(dto: { year_id: string; name: string; program?: string }): Promise<Batch> {
    const { data } = await apiClient.post<{ batch: Batch }>('/institution/batches', dto);
    return data.batch;
  },

  async getSections(batchId?: string): Promise<Section[]> {
    const { data } = await apiClient.get<{ sections: Section[] }>('/institution/sections', {
      params: batchId ? { batch_id: batchId } : {},
    });
    return data.sections;
  },

  async createSection(dto: { batch_id: string; name: string }): Promise<Section> {
    const { data } = await apiClient.post<{ section: Section }>('/institution/sections', dto);
    return data.section;
  },

  async enrollStudents(sectionId: string, studentIds: string[]): Promise<{ enrolled: number }> {
    const { data } = await apiClient.post(`/institution/sections/${sectionId}/enroll`, { student_ids: studentIds });
    return data;
  },

  // ── Subjects ──────────────────────────────────────────────────────────────────

  async getSubjects(): Promise<Subject[]> {
    const { data } = await apiClient.get<{ subjects: Subject[] }>('/institution/subjects');
    return data.subjects;
  },

  async createSubject(dto: { name: string; code?: string; description?: string; total_marks?: number }): Promise<Subject> {
    const { data } = await apiClient.post<{ subject: Subject }>('/institution/subjects', dto);
    return data.subject;
  },

  async assignSubjectToSection(dto: {
    section_id: string;
    subject_id: string;
    instructor_id: string;
  }): Promise<void> {
    await apiClient.post('/institution/section-subjects', dto);
  },

  // ── Analytics ─────────────────────────────────────────────────────────────────

  async getAnalyticsOverview(): Promise<AnalyticsOverview> {
    const resp = await apiClient.get('/institution/analytics/overview');
    return resp.data as AnalyticsOverview;
  },

  async getAtRiskStudents(threshold = 40): Promise<AtRiskStudent[]> {
    const { data } = await apiClient.get<{ at_risk_students: AtRiskStudent[] }>(
      '/institution/analytics/students-at-risk',
      { params: { threshold } },
    );
    return data.at_risk_students;
  },

  async getSectionComparison(): Promise<SectionComparison[]> {
    const { data } = await apiClient.get<{ sections: SectionComparison[] }>(
      '/institution/analytics/section-comparison',
    );
    return data.sections;
  },

  async getAnalyticsAttendance(params?: { days?: number; from?: string; to?: string }): Promise<AttendanceSummary> {
    const { data } = await apiClient.get<AttendanceSummary>('/institution/analytics/attendance', { params });
    return data;
  },

  async getAnalyticsGrades(params?: { days?: number; from?: string; to?: string }): Promise<GradeDistribution> {
    const { data } = await apiClient.get<GradeDistribution>('/institution/analytics/grades', { params });
    return data;
  },

  async getAnalyticsExperiments(params?: { days?: number; from?: string; to?: string }): Promise<ExperimentUsage> {
    const { data } = await apiClient.get<ExperimentUsage>('/institution/analytics/experiment-usage', { params });
    return data;
  },

  async getAnalyticsTrends(params?: { grain?: string; days?: number; from?: string; to?: string }): Promise<AnalyticsTrend> {
    const { data } = await apiClient.get<AnalyticsTrend>('/institution/analytics/trends', { params });
    return data;
  },

  async getAnalyticsInstructors(params?: { days?: number; from?: string; to?: string }): Promise<{ instructors: InstructorPerf[]; period: { from: string; to: string } }> {
    const { data } = await apiClient.get('/institution/analytics/instructors', { params });
    return data;
  },

  async getAnalyticsProctoring(params?: { days?: number; session_id?: string; student_id?: string }): Promise<ProctoringReport> {
    const { data } = await apiClient.get<ProctoringReport>('/institution/analytics/proctoring', { params });
    return data;
  },

  async getAnalyticsEngagement(params?: { days?: number; from?: string; to?: string }): Promise<EngagementReport> {
    const { data } = await apiClient.get<EngagementReport>('/institution/analytics/engagement', { params });
    return data;
  },

  async getAnalyticsAIUsage(params?: { days?: number }): Promise<AIUsageReport> {
    const { data } = await apiClient.get<AIUsageReport>('/institution/analytics/ai-usage', { params }).catch(() => ({
      data: { total_calls: 0, total_tokens: 0, by_feature: {}, top_consumers: [], period: { from: '', to: '' } },
    }));
    return data as AIUsageReport;
  },

  // ── AI Governance (policy + usage) ──────────────────────────────────────────

  async getAiPolicy(): Promise<AIPolicy> {
    const { data } = await apiClient.get<{ policy: AIPolicy }>('/institution/ai-policy');
    return data.policy;
  },

  async updateAiPolicy(patch: Partial<{
    ai_enabled_global: boolean;
    ai_enabled_students: boolean;
    ai_enabled_instructors: boolean;
    features_enabled: Record<string, boolean>;
    daily_token_quota: number | null;
    monthly_token_quota: number | null;
    per_student_daily_quota: number | null;
    hard_stop: boolean;
  }>): Promise<AIPolicy> {
    const { data } = await apiClient.patch<{ policy: AIPolicy }>('/institution/ai-policy', patch);
    return data.policy;
  },

  async getAiUsageSummary(params?: { days?: number; feature?: string; limit?: number }): Promise<AIUsageSummary> {
    const { data } = await apiClient.get<AIUsageSummary>('/institution/ai-usage', { params });
    return data;
  },

  // ── Announcements ─────────────────────────────────────────────────────────────

  async sendAnnouncement(dto: {
    title: string;
    message: string;
    target: 'all' | 'students' | 'instructors';
    section_id?: string;
  }): Promise<{ sent_to: number; target: string }> {
    const { data } = await apiClient.post('/institution/announcements', dto);
    return data;
  },

  // Rich targeting (A5): narrow by department / batch / academic year / section
  // on top of the base all|students|instructors filter.
  async sendTargetedAnnouncement(dto: {
    title: string;
    message: string;
    target: 'all' | 'students' | 'instructors';
    department_id?: string;
    batch_id?: string;
    section_id?: string;
    academic_year?: number;
  }): Promise<{ sent_to: number; target: string }> {
    const { data } = await apiClient.post('/institution/announcements/targeted', dto);
    return data;
  },

  async getRecentAnnouncements() {
    const { data } = await apiClient.get('/institution/announcements/recent');
    return data.announcements;
  },

  // ── Audit Log ─────────────────────────────────────────────────────────────────

  async getAuditLog(params?: { action?: string; days?: number; limit?: number; offset?: number; q?: string; from?: string; to?: string }): Promise<AuditLogPage> {
    const { data } = await apiClient.get<AuditLogPage>('/institution/audit-log', { params });
    return data;
  },

  // Download the audit log as CSV (same filters as getAuditLog).
  async exportAuditLog(params?: { action?: string; days?: number; q?: string; from?: string; to?: string }): Promise<void> {
    const resp = await apiClient.get('/institution/audit-log/export', { params, responseType: 'blob' });
    const url = window.URL.createObjectURL(resp.data);
    const a = document.createElement('a');
    a.href = url;
    // Filename comes from Content-Disposition; fall back if not parseable.
    const cd = resp.headers['content-disposition'] as string | undefined;
    const match = cd?.match(/filename="?([^";]+)"?/);
    a.download = match?.[1] ?? `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // ── Agentic AI (WS-D) ────────────────────────────────────────────────────────

  async agentQuery(prompt: string): Promise<AgentRun> {
    const { data } = await apiClient.post<AgentRun>('/ai/agent/query', { prompt });
    return data;
  },

  async agentRuns(params?: { page?: number; per_page?: number }): Promise<{ runs: AgentRun[]; total: number }> {
    const { data } = await apiClient.get('/ai/agent/runs', { params });
    return data;
  },

  async agentRun(runId: string): Promise<AgentRun> {
    const { data } = await apiClient.get<AgentRun>(`/ai/agent/runs/${runId}`);
    return data;
  },

  async agentApply(runId: string): Promise<{ success: boolean; sent_to: number; target: string; run_id: string }> {
    const { data } = await apiClient.post(`/ai/agent/runs/${runId}/apply`);
    return data;
  },

  // ── Section Detail ────────────────────────────────────────────────────────────

  async getSectionStudents(sectionId: string): Promise<InstitutionUser[]> {
    const { data } = await apiClient.get<{ students: InstitutionUser[] }>(
      `/institution/sections/${sectionId}/students`,
    );
    return data.students ?? [];
  },

  async unenrollStudent(sectionId: string, studentId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/sections/${sectionId}/students/${studentId}`);
    return data;
  },

  async transferStudents(fromSectionId: string, dto: { to_section_id: string; student_ids: string[] }): Promise<{ moved: number; to_section_id: string }> {
    const { data } = await apiClient.post(`/institution/sections/${fromSectionId}/transfer`, dto);
    return data;
  },

  async getSectionSubjects(sectionId: string): Promise<SectionSubjectDetail[]> {
    const resp = await apiClient.get(`/institution/sections/${sectionId}/subjects`).catch(() => ({ data: { section_subjects: [] } }));
    return (resp.data as any).section_subjects ?? [];
  },

  // Returns ALL section-subject assignments for the institution in one call.
  // Used to build the sectionSubjectsMap in the Academic structure tree.
  async listAllSectionSubjects(): Promise<SectionSubjectDetail[]> {
    const resp = await apiClient.get('/institution/section-subjects').catch(() => ({ data: { section_subjects: [] } }));
    return (resp.data as any).section_subjects ?? [];
  },

  async updateSectionSubject(ssId: string, dto: { instructor_id: string }): Promise<SectionSubjectDetail> {
    const { data } = await apiClient.patch<{ section_subject: SectionSubjectDetail }>(`/institution/section-subjects/${ssId}`, dto);
    return data.section_subject;
  },

  async deleteSectionSubject(ssId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/section-subjects/${ssId}`);
    return data;
  },

  async getInstructorSessions(instructorId: string) {
    const resp = await apiClient.get('/institution/sessions', {
      params: { instructor_id: instructorId },
    }).catch(() => ({ data: { sessions: [] } }));
    return (resp.data as any).sessions ?? [];
  },

  // ── Sessions ──────────────────────────────────────────────────────────────────

  async scheduleSession(dto: ScheduleSessionDto): Promise<any> {
    const { data } = await apiClient.post('/institution/sessions', dto);
    return data.session ?? data;
  },

  async updateSession(sessionId: string, dto: { status?: string; title?: string; scheduled_at?: string; duration_minutes?: number }): Promise<any> {
    const { data } = await apiClient.patch(`/institution/sessions/${sessionId}`, dto);
    return data.session ?? data;
  },

  async cancelSession(sessionId: string): Promise<any> {
    return this.updateSession(sessionId, { status: 'cancelled' });
  },

  async bulkScheduleSessions(dto: BulkScheduleDto): Promise<BulkScheduleResult> {
    const { data } = await apiClient.post<BulkScheduleResult>(
      '/institution/sessions/bulk-schedule', dto
    );
    return data;
  },



  async updateAcademicYear(yearId: string, dto: { year_label?: string; is_active?: boolean }): Promise<AcademicYear> {
    const { data } = await apiClient.patch<{ year: AcademicYear }>(`/institution/academic-years/${yearId}`, dto);
    return data.year;
  },

  async deleteAcademicYear(yearId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/academic-years/${yearId}`);
    return data;
  },

  async updateBatch(batchId: string, dto: { name?: string; program?: string }): Promise<Batch> {
    const { data } = await apiClient.patch<{ batch: Batch }>(`/institution/batches/${batchId}`, dto);
    return data.batch;
  },

  async deleteBatch(batchId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/batches/${batchId}`);
    return data;
  },

  async updateSubject(subjectId: string, dto: { name?: string; code?: string; description?: string; total_marks?: number }): Promise<Subject> {
    const { data } = await apiClient.patch<{ subject: Subject }>(`/institution/subjects/${subjectId}`, dto);
    return data.subject;
  },

  async deleteSubject(subjectId: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/institution/subjects/${subjectId}`);
    return data;
  },

  // ── Plan usage / settings / health ──────────────────────────────────────────

  async getPlanUsage(): Promise<PlanUsage> {
    const { data } = await apiClient.get<PlanUsage>('/institution/plan-usage');
    return data;
  },

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    const { data } = await apiClient.get<{ notifications: NotificationPrefs }>('/institution/settings/notifications');
    return data.notifications;
  },

  async updateNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const { data } = await apiClient.patch<{ notifications: NotificationPrefs }>('/institution/settings/notifications', prefs);
    return data.notifications;
  },

  async getDashboardActivity(): Promise<DashboardActivity> {
    const { data } = await apiClient.get<DashboardActivity>('/institution/dashboard/activity');
    return data;
  },

  async getSystemHealth(): Promise<SystemHealth> {
    const { data } = await apiClient.get<SystemHealth>('/institution/system-health');
    return data;
  },
};
