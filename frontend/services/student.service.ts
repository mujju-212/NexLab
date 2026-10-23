import { apiClient } from './api-client';
import type {
  StudentDashboard, SectionSubject, Experiment,
  ContentModule, QuizQuestion, LabSession, ConceptMastery,
  StudentRanking, Grade, Notification
} from '@/types';

export type { ContentModule, QuizQuestion };

export interface SearchHit {
  type: string; id: string; label: string;
  sub_label?: string | null; link: string;
}

/** One test-case outcome from a graded-assignment submission. Hidden tests omit the I/O fields. */
export interface AssignmentTestResult {
  index: number;
  passed: boolean;
  hidden: boolean;
  input?: string;
  expected?: string;
  actual?: string;
  status?: string;
  stderr?: string;
}

/** Response of POST /student/prelab/<module_id>/assignment/submit. */
export interface AssignmentSubmitResult {
  score: number;
  best_score: number;
  passed: boolean;
  threshold: number;
  passed_tests: number;
  total_tests: number;
  attempts_used: number;
  results: AssignmentTestResult[];
}

/** Response of POST /student/prelab/<module_id>/viva/submit. */
export interface VivaSubmitResult {
  score: number;
  best_score: number;
  passed: boolean;
  threshold: number;
  per_question: { index: number; score: number; feedback: string }[];
  attempts_used: number;
}

/** Page shape returned by getPreLabContent. */
export interface ContentPage {
  id: string;
  title: string;
  display_order: number;
}

export interface ExperimentDetail {
  id: string;
  title: string;
  exp_number?: number;
  aim?: string;
  subject_id?: string;
  subject_name?: string;
  subject_code?: string;
  icon?: string;
  concept_tags?: string[];
  difficulty_level?: number;
  allowed_languages?: string[];
}

/** Full getPreLabContent response (new shape includes pages and experiment metadata). */
export interface PreLabContentResponse {
  modules: ContentModule[];
  pages: ContentPage[];
  experiment?: ExperimentDetail;
  /** Server clock (ISO-Z) so deadline countdowns never trust the client clock. */
  server_now?: string;
}

/** Response of GET /student/prelab/<module_id>/quiz/start. */
export interface QuizStartResponse {
  questions: QuizQuestion[];
  /** Optional per-quiz countdown (Feature 3); null = untimed. */
  time_limit_minutes: number | null;
  /** Server clock (ISO-Z) captured when the questions were fetched. */
  server_now: string;
}

// ── Exam types ───────────────────────────────────────────────────────────────

export interface StudentExam {
  id: string;
  title: string;
  description?: string;
  exam_type: 'mcq' | 'coding' | 'mixed';
  subject_id: string;
  available_from: string | null;
  due_at: string | null;
  duration_minutes: number;
  max_attempts: number;
  pass_threshold: number;
  question_count: number;
  window_state: 'upcoming' | 'open' | 'closed';
  attempts_used: number;
  attempts_remaining: number;
  latest_status: string | null;
  best_score: number | null;
  has_in_progress: boolean;
}

export interface StudentExamDetail {
  exam: Record<string, any>;
  server_now: string;
  attempts_used: number;
  attempts_remaining: number;
  can_start: boolean;
  in_progress_attempt: Record<string, any> | null;
  latest_attempt: Record<string, any> | null;
}

export interface ExamStartResponse {
  attempt: Record<string, any>;
  exam: Record<string, any>;
  questions: Record<string, any>[];
  answers: Record<string, any>;
  expires_at: string;
  server_now: string;
  resumed: boolean;
}

export interface ExamSubmitResponse {
  attempt: Record<string, any>;
  score: number;
  passed: boolean;
  status: string;
  already_submitted?: boolean;
}

export interface ExamResultResponse {
  attempt: Record<string, any>;
  exam: { id: string; title: string; pass_threshold: number; exam_type: string };
  score: number;
  passed: boolean;
  total_points: number;
  max_points: number;
  review: Record<string, any>[];
}

// In-memory cache to eliminate redundant network waterfalls on tab switching
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export const studentService = {

  clearCache(): void {
    memoryCache.clear();
  },

  // ── Dashboard ───────────────────────────────────────────────────────────────
  // GET /api/student/dashboard
  async getDashboard(): Promise<StudentDashboard> {
    const { data } = await apiClient.get<StudentDashboard>('/student/dashboard');
    return data;
  },

  // ── Subjects & Experiments ──────────────────────────────────────────────────
  // GET /api/student/subjects
  async getSubjects(force = false): Promise<SectionSubject[]> {
    if (!force) {
      const cached = getCached<SectionSubject[]>('student_subjects');
      if (cached) return cached;
    }
    const { data } = await apiClient.get<{ subjects: SectionSubject[] }>('/student/subjects');
    setCached('student_subjects', data.subjects, 30_000); // 30s cache
    return data.subjects;
  },

  // GET /api/student/experiments/<subject_id>
  async getExperiments(subjectId: string, force = false): Promise<Experiment[]> {
    const cacheKey = `student_experiments_${subjectId}`;
    if (!force) {
      const cached = getCached<Experiment[]>(cacheKey);
      if (cached) return cached;
    }
    const { data } = await apiClient.get<{ experiments: Experiment[] }>(`/student/experiments/${subjectId}`);
    setCached(cacheKey, data.experiments, 60_000); // 60s cache
    return data.experiments;
  },

  // ── Pre-Lab Content ─────────────────────────────────────────────────────────
  // GET /api/student/prelab/<experiment_id>
  async getPreLabContent(experimentId: string): Promise<PreLabContentResponse> {
    const { data } = await apiClient.get<PreLabContentResponse>(`/student/prelab/${experimentId}`);
    return data;
  },

  // POST /api/student/prelab/<module_id>/complete  (text/video/pdf)
  async markModuleComplete(moduleId: string): Promise<void> {
    await apiClient.post(`/student/prelab/${moduleId}/complete`);
  },

  // POST /api/student/prelab/<module_id>/assignment/submit  (graded coding task)
  async submitAssignment(
    moduleId: string,
    payload: { code: string; language?: string; packages?: string[] | string },
  ): Promise<AssignmentSubmitResult> {
    const { data } = await apiClient.post<AssignmentSubmitResult>(
      `/student/prelab/${moduleId}/assignment/submit`, payload,
    );
    return data;
  },

  // POST /api/student/prelab/<module_id>/viva/submit  (AI viva block)
  async submitVivaAnswers(
    moduleId: string,
    answers: Record<string | number, string>,
  ): Promise<VivaSubmitResult> {
    const { data } = await apiClient.post<VivaSubmitResult>(
      `/student/prelab/${moduleId}/viva/submit`, { answers },
    );
    return data;
  },

  // ── Quiz Gate ───────────────────────────────────────────────────────────────
  // GET /api/student/prelab/<module_id>/quiz/start
  async getQuizQuestions(moduleId: string): Promise<QuizStartResponse> {
    const { data } = await apiClient.get<{ questions: QuizQuestion[]; time_limit_minutes?: number | null; server_now?: string }>(`/student/prelab/${moduleId}/quiz/start`);
    return {
      questions: data.questions,
      time_limit_minutes: data.time_limit_minutes ?? null,
      server_now: data.server_now ?? new Date().toISOString(),
    };
  },

  // POST /api/student/prelab/<module_id>/quiz/submit
  async submitQuiz(moduleId: string, answers: Record<string, string>, startedAt?: string | null) {
    const { data } = await apiClient.post(`/student/prelab/${moduleId}/quiz/submit`, { answers, started_at: startedAt ?? undefined });
    return data; // { score, passed, threshold, attempts_used, correct_count, total_points, timed_out }
  },

  // GET /api/student/sessions/<session_id>/check-gate
  async checkGate(sessionId: string) {
    const { data } = await apiClient.get(`/student/sessions/${sessionId}/check-gate`);
    return data; // { gate_passed, session, jitsi_room, focus_ml_enabled, lockdown_enabled }
  },

  // ── Sessions ────────────────────────────────────────────────────────────────
  // GET /api/student/sessions
  async getSessions(): Promise<LabSession[]> {
    const { data } = await apiClient.get<{ sessions: LabSession[] }>('/student/sessions');
    return data.sessions;
  },

  // POST /api/student/sessions/<session_id>/catchup
  async startCatchup(sessionId: string) {
    const { data } = await apiClient.post(`/student/sessions/${sessionId}/catchup`);
    return data;
  },

  // ── Grades & Analytics ──────────────────────────────────────────────────────
  // GET /api/student/grades
  async getGrades(): Promise<Grade[]> {
    const { data } = await apiClient.get<{ grades: Grade[] }>('/student/grades');
    return data.grades;
  },

  // GET /api/student/mastery
  async getMastery(): Promise<ConceptMastery[]> {
    const { data } = await apiClient.get<{ mastery: ConceptMastery[] }>('/student/mastery');
    return data.mastery;
  },

  // GET /api/student/rankings
  async getRankings(): Promise<StudentRanking[]> {
    const { data } = await apiClient.get<{ rankings: StudentRanking[] }>('/student/rankings');
    return data.rankings;
  },

  // GET /api/student/history
  async getHistory() {
    const { data } = await apiClient.get<{ history: unknown[] }>('/student/history');
    return data.history;
  },

  // ── Notifications ───────────────────────────────────────────────────────────
  // GET /api/student/notifications
  async getNotifications(): Promise<Notification[]> {
    const { data } = await apiClient.get<{ notifications: Notification[] }>('/student/notifications');
    return data.notifications;
  },

  // ── Shell search (sessions/experiments/practice problems) ─────────────────
  async search(q: string, types = 'sessions,experiments,problems'): Promise<SearchHit[]> {
    const { data } = await apiClient.get('/student/search', { params: { q, types } })
      .catch(() => ({ data: { results: [] as SearchHit[] } }));
    return data.results ?? [];
  },

  // ── Anonymous Feedback ──────────────────────────────────────────────────────
  // POST /api/student/feedback
  async submitFeedback(payload: {
    session_id: string;
    experiment_clarity?: number;
    session_pacing?: number;
    ai_hint_helpfulness?: number;
    overall_rating?: number;
    comment?: string;
  }): Promise<void> {
    await apiClient.post('/student/feedback', payload);
  },

  // ── PDF Lab Record ──────────────────────────────────────────────────────────
  // GET /api/student/lab-record/<subject_id>/download
  async getLabRecordUrl(subjectId: string): Promise<string> {
    const { data } = await apiClient.get<{ pdf_url: string }>(`/student/lab-record/${subjectId}/download`);
    return data.pdf_url;
  },

  // ── Student Announcements & Engagement ─────────────────────────────────────
  async getAnnouncements(): Promise<{ announcements: any[]; unread_count: number; total: number }> {
    const { data } = await apiClient.get('/student/announcements');
    return data;
  },

  async markAnnouncementRead(id: string): Promise<{ is_read: boolean; views_count: number }> {
    const { data } = await apiClient.post(`/student/announcements/${id}/read`);
    return data;
  },

  async toggleAnnouncementLike(id: string): Promise<{ liked: boolean; likes_count: number }> {
    const { data } = await apiClient.post(`/student/announcements/${id}/like`);
    return data;
  },

  // ── Exams ──────────────────────────────────────────────────────────────────
  // GET /api/student/exams
  async getExams(): Promise<StudentExam[]> {
    const { data } = await apiClient.get<{ exams: StudentExam[]; count: number; server_now: string }>('/student/exams');
    return data.exams;
  },

  // GET /api/student/exams/<examId>
  async getExamDetail(examId: string): Promise<StudentExamDetail> {
    const { data } = await apiClient.get<StudentExamDetail>(`/student/exams/${examId}`);
    return data;
  },

  // POST /api/student/exams/<examId>/start
  async startExam(examId: string): Promise<ExamStartResponse> {
    const { data } = await apiClient.post<ExamStartResponse>(`/student/exams/${examId}/start`);
    return data;
  },

  // POST /api/student/exams/<examId>/attempt/<attemptId>/save
  async saveExamAttempt(examId: string, attemptId: string, answers: Record<string, any>): Promise<void> {
    await apiClient.post(`/student/exams/${examId}/attempt/${attemptId}/save`, { answers });
  },

  // POST /api/student/exams/<examId>/attempt/<attemptId>/submit
  async submitExamAttempt(examId: string, attemptId: string, answers: Record<string, any>): Promise<ExamSubmitResponse> {
    const { data } = await apiClient.post<ExamSubmitResponse>(`/student/exams/${examId}/attempt/${attemptId}/submit`, { answers });
    return data;
  },

  // GET /api/student/exams/<examId>/result
  async getExamResult(examId: string): Promise<ExamResultResponse> {
    const { data } = await apiClient.get<ExamResultResponse>(`/student/exams/${examId}/result`);
    return data;
  },

  // GET /api/student/subjects/<subjectId>/grade-summary
  async getSubjectGradeSummary(subjectId: string): Promise<StudentSubjectGradeSummary> {
    const { data } = await apiClient.get<StudentSubjectGradeSummary>(`/student/subjects/${subjectId}/grade-summary`);
    return data;
  },
};

export interface StudentSubjectGradeSummary {
  subject: {
    id: string;
    name: string;
    code: string;
    total_marks: number;
    total_weightage: number;
    over_allocation: boolean;
  };
  earned_score: number;
  total_possible_score: number;
  items: Array<{
    experiment_id: string | null;
    exam_id?: string | null;
    kind?: 'lab' | 'exam';
    exp_number: number | null;
    title: string;
    delivery_mode: 'lab' | 'exam' | 'practice';
    weightage: number;
    grade_scale: number;
    raw_score: number | null;
    weighted_score: number | null;
    is_graded: boolean;
    status: 'completed' | 'pending';
    window_state?: string;
    available_from?: string | null;
    due_at?: string | null;
  }>;
}


