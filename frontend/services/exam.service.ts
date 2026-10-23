import { apiClient } from './api-client';

// ── Types ────────────────────────────────────────────────────────────────────
export type ExamType = 'mcq' | 'coding' | 'mixed';
export type QuestionType = 'mcq' | 'coding';
export type WindowState = 'upcoming' | 'open' | 'closed';
export type AttemptStatus = 'in_progress' | 'submitted' | 'expired';

export interface ExamTestCase {
  input: string;
  expected: string;
  hidden?: boolean;
  weight?: number;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_type: QuestionType;
  prompt: string;
  points: number;
  display_order: number;
  explanation?: string | null;
  // MCQ
  options?: string[];
  correct_answer?: string | null;
  // Coding
  language?: string | null;
  starter_code?: string | null;
  test_cases?: ExamTestCase[];
}

export interface Exam {
  id: string;
  institution_id: string;
  subject_id: string;
  created_by?: string | null;
  title: string;
  description?: string | null;
  exam_type: ExamType;
  available_from: string | null;
  due_at: string | null;
  duration_minutes: number;
  max_attempts: number;
  pass_threshold: number;
  shuffle_questions: boolean;
  proctor_focus_enabled?: boolean;
  proctor_lockdown_enabled?: boolean;
  max_violations?: number;
  is_published: boolean;
  window_state: WindowState;
  question_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  // instructor list/detail extras
  attempt_count?: number;
  subject_name?: string;
  subject_code?: string;
  questions?: ExamQuestion[];
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  score: number;
  total_points: number;
  max_points: number;
  passed: boolean;
  status: AttemptStatus;
  created_at?: string | null;
  answers?: Record<string, unknown>;
}

export interface StudentExamItem {
  id: string;
  title: string;
  description?: string | null;
  exam_type: ExamType;
  subject_id: string;
  subject_name?: string;
  subject_code?: string;
  subject_color?: string;
  available_from: string | null;
  due_at: string | null;
  duration_minutes: number;
  max_attempts: number;
  pass_threshold: number;
  question_count: number;
  window_state: WindowState;
  attempts_used: number;
  attempts_remaining: number;
  latest_status: AttemptStatus | null;
  best_score: number | null;
  passed?: boolean;
  submitted_at?: string | null;
  has_in_progress: boolean;
}

export interface ProctorConfig {
  focus_enabled: boolean;
  lockdown_enabled: boolean;
  max_violations: number;
}

export interface ViolationSummary {
  total: number;
  by_type: Record<string, number>;
}

export interface StartExamResponse {
  attempt: ExamAttempt;
  exam: Exam;
  questions: ExamQuestion[];
  answers: Record<string, unknown>;
  expires_at: string;
  server_now: string;
  resumed: boolean;
  proctor?: ProctorConfig;
  violations?: ViolationSummary;
}

export interface ExamResultReviewItem {
  id: string;
  question_type: QuestionType;
  prompt: string;
  points: number;
  your_answer: unknown;
  correct: boolean;
  earned: number;
  explanation?: string | null;
  options?: string[];
  correct_answer?: string | null;
  results?: Array<Record<string, unknown>>;
}

export interface ExamResult {
  attempt: ExamAttempt;
  exam: { id: string; title: string; pass_threshold: number; exam_type: ExamType };
  score: number;
  passed: boolean;
  total_points: number;
  max_points: number;
  review: ExamResultReviewItem[];
}

export interface InstructorAnswerRow {
  question_id: string;
  prompt: string;
  question_type: string | null;
  options: string[];
  student_answer: string | number | null;
  student_answer_text: string | number | null;
  correct_answer: string | number | null;
  correct_answer_text: string | number | null;
  is_correct: boolean | null;
  earned: number | null;
  points: number | null;
  test_results?: Array<{ index: number; passed: boolean; hidden: boolean }> | null;
}

export interface ProctorViolationRow {
  event_type: string;
  severity: string | null;
  payload: Record<string, unknown>;
  recorded_at: string | null;
}

export interface InstructorStudentRow {
  student_id: string;
  student_name: string;
  student_email: string;
  attempts_count: number;
  attempts_used: number;
  best_score: number | null;
  best_attempt_id: string | null;
  best_passed: boolean;
  latest_status: AttemptStatus;
  latest_submitted_at: string | null;
  violation_count: number;
  best_violations: number;
  attempts: InstructorAttemptRow[];
}

export interface InstructorAttemptRow {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: AttemptStatus;
  score: number;
  total_points: number;
  max_points: number;
  passed: boolean;
  answers?: InstructorAnswerRow[];
  answered_count?: number;
  violations?: ProctorViolationRow[];
  violation_count?: number;
  started_at: string | null;
  submitted_at: string | null;
}

export interface ExamCreatePayload {
  title: string;
  subject_id: string;
  description?: string;
  exam_type?: ExamType;
  available_from?: string | null;
  due_at?: string | null;
  duration_minutes?: number;
  max_attempts?: number;
  pass_threshold?: number;
  shuffle_questions?: boolean;
  proctor_focus_enabled?: boolean;
  proctor_lockdown_enabled?: boolean;
  max_violations?: number;
}

export type ExamUpdatePayload = Partial<ExamCreatePayload> & { is_published?: boolean };

export interface QuestionPayload {
  question_type?: QuestionType;
  prompt?: string;
  points?: number;
  display_order?: number;
  explanation?: string | null;
  options?: string[];
  correct_answer?: string | null;
  language?: string | null;
  starter_code?: string | null;
  test_cases?: ExamTestCase[];
}

export interface SubjectOption {
  subject_id: string;
  subject_name: string;
  subject_code: string;
}

// ── Service ──────────────────────────────────────────────────────────────────
export const examService = {
  // ══ Instructor ══════════════════════════════════════════════════════════
  /** Unique subjects the instructor teaches (for the exam creation form). */
  async listSubjectOptions(): Promise<SubjectOption[]> {
    const { data } = await apiClient.get<{ section_subjects: Array<{ subject_id: string; subject_name: string; subject_code: string }> }>(
      '/instructor/section-subjects'
    );
    const seen = new Map<string, SubjectOption>();
    for (const ss of data.section_subjects || []) {
      if (ss.subject_id && !seen.has(ss.subject_id)) {
        seen.set(ss.subject_id, {
          subject_id: ss.subject_id,
          subject_name: ss.subject_name || '',
          subject_code: ss.subject_code || '',
        });
      }
    }
    return Array.from(seen.values());
  },

  async listExams(subjectId?: string): Promise<Exam[]> {
    const { data } = await apiClient.get<{ exams: Exam[] }>(
      '/instructor/exams', { params: subjectId ? { subject_id: subjectId } : {} }
    );
    return data.exams;
  },

  async createExam(payload: ExamCreatePayload): Promise<Exam> {
    const { data } = await apiClient.post<{ exam: Exam }>('/instructor/exams', payload);
    return data.exam;
  },

  async getExam(id: string): Promise<Exam> {
    const { data } = await apiClient.get<{ exam: Exam }>(`/instructor/exams/${id}`);
    return data.exam;
  },

  async updateExam(id: string, payload: ExamUpdatePayload): Promise<Exam> {
    const { data } = await apiClient.patch<{ exam: Exam }>(`/instructor/exams/${id}`, payload);
    return data.exam;
  },

  async deleteExam(id: string): Promise<void> {
    await apiClient.delete(`/instructor/exams/${id}`);
  },

  async addQuestion(examId: string, payload: QuestionPayload): Promise<ExamQuestion> {
    const { data } = await apiClient.post<{ question: ExamQuestion }>(
      `/instructor/exams/${examId}/questions`, payload
    );
    return data.question;
  },

  async updateQuestion(qid: string, payload: QuestionPayload): Promise<ExamQuestion> {
    const { data } = await apiClient.patch<{ question: ExamQuestion }>(
      `/instructor/exams/questions/${qid}`, payload
    );
    return data.question;
  },

  async deleteQuestion(qid: string): Promise<void> {
    await apiClient.delete(`/instructor/exams/questions/${qid}`);
  },

  async reorderQuestions(examId: string, order: string[]): Promise<ExamQuestion[]> {
    const { data } = await apiClient.post<{ questions: ExamQuestion[] }>(
      `/instructor/exams/${examId}/questions/reorder`, { order }
    );
    return data.questions;
  },

  async getAttempts(examId: string): Promise<InstructorAttemptRow[]> {
    const { data } = await apiClient.get<{ attempts: InstructorAttemptRow[] }>(
      `/instructor/exams/${examId}/attempts`
    );
    return data.attempts;
  },

  /** One row per student (best score), each expandable to its attempts. */
  async getStudentResults(examId: string): Promise<InstructorStudentRow[]> {
    const { data } = await apiClient.get<{ students: InstructorStudentRow[] }>(
      `/instructor/exams/${examId}/attempts`
    );
    return data.students ?? [];
  },

  // ══ Student ═════════════════════════════════════════════════════════════
  async listMyExams(): Promise<{ exams: StudentExamItem[]; server_now: string }> {
    const { data } = await apiClient.get<{ exams: StudentExamItem[]; server_now: string }>('/student/exams');
    return data;
  },

  async getMyExam(id: string): Promise<{
    exam: Exam; server_now: string; attempts_used: number; attempts_remaining: number;
    can_start: boolean; in_progress_attempt: ExamAttempt | null; latest_attempt: ExamAttempt | null;
  }> {
    const { data } = await apiClient.get(`/student/exams/${id}`);
    return data;
  },

  async startExam(id: string): Promise<StartExamResponse> {
    const { data } = await apiClient.post<StartExamResponse>(`/student/exams/${id}/start`);
    return data;
  },

  async saveAttempt(examId: string, attemptId: string, answers: Record<string, unknown>): Promise<void> {
    await apiClient.post(`/student/exams/${examId}/attempt/${attemptId}/save`, { answers });
  },

  // ── Proctoring (timed exams) ─────────────────────────────────────────────
  // POST /api/student/exams/<exam_id>/attempt/<attempt_id>/violation
  async recordViolation(
    examId: string,
    attemptId: string,
    eventType: string,
    detail?: string,
    questionId?: string,
  ): Promise<{
    recorded: boolean;
    violations: ViolationSummary;
    max_violations: number;
    remaining_before_auto_submit: number | null;
    auto_submitted: boolean;
  }> {
    const { data } = await apiClient.post(
      `/student/exams/${examId}/attempt/${attemptId}/violation`,
      { event_type: eventType, detail, question_id: questionId, client_ts: new Date().toISOString() },
    );
    return data;
  },

  async submitAttempt(examId: string, attemptId: string, answers: Record<string, unknown>): Promise<{
    attempt: ExamAttempt; score: number; passed: boolean; status: AttemptStatus; already_submitted?: boolean;
  }> {
    const { data } = await apiClient.post(`/student/exams/${examId}/attempt/${attemptId}/submit`, { answers });
    return data;
  },

  async getResult(examId: string): Promise<ExamResult> {
    const { data } = await apiClient.get<ExamResult>(`/student/exams/${examId}/result`);
    return data;
  },

  async runCode(examId: string, payload: {
    question_id?: string;
    code: string;
    language?: string;
    stdin?: string;
  }): Promise<{
    results: Array<{
      index: number;
      input: string;
      expected: string | null;
      actual: string;
      stderr: string;
      compile_output?: string;
      passed: boolean;
      status: string;
      time_ms?: number;
      memory_kb?: number;
    }>;
    language: string;
  }> {
    const { data } = await apiClient.post(`/student/exams/${examId}/run-code`, payload);
    return data;
  },
};
