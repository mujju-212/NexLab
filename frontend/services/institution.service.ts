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
}

export interface SectionSubjectDetail {
  id: string;
  section_id: string;
  subject_id: string;
  subject_name: string;
  subject_code?: string;
  instructor_id: string;
  instructor_name: string;
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

  async createSubject(dto: { name: string; code?: string; description?: string }): Promise<Subject> {
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

  async getAuditLog(params?: { action?: string; days?: number; limit?: number }): Promise<AuditLog[]> {
    const { data } = await apiClient.get<{ logs: AuditLog[] }>('/institution/audit-log', { params });
    return data.logs;
  },

  // ── Section Detail ────────────────────────────────────────────────────────────

  async getSectionStudents(sectionId: string): Promise<InstitutionUser[]> {
    const { data } = await apiClient.get<{ users: InstitutionUser[] }>('/institution/users', {
      params: { role: 'student' },
    });
    // Backend returns all students; filter client-side until dedicated endpoint exists
    return data.users;
  },

  async getSectionSubjects(sectionId: string): Promise<SectionSubjectDetail[]> {
    const resp = await apiClient.get(`/institution/sections/${sectionId}/subjects`).catch(() => ({ data: { section_subjects: [] } }));
    return (resp.data as any).section_subjects ?? [];
  },

  async getInstructorSessions(instructorId: string) {
    const resp = await apiClient.get('/institution/sessions', {
      params: { instructor_id: instructorId },
    }).catch(() => ({ data: { sessions: [] } }));
    return (resp.data as any).sessions ?? [];
  },
};
