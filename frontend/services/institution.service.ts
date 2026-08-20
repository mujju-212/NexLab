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

  async getRecentAnnouncements() {
    const { data } = await apiClient.get('/institution/announcements/recent');
    return data.announcements;
  },

  // ── Audit Log ─────────────────────────────────────────────────────────────────

  async getAuditLog(params?: { action?: string; days?: number; limit?: number; offset?: number; q?: string }): Promise<AuditLogPage> {
    const { data } = await apiClient.get<AuditLogPage>('/institution/audit-log', { params });
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
