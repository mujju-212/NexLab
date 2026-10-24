import { apiClient } from './api-client';
import Cookies from 'js-cookie';

// Consolidated instructor service — pre-lab content, quiz questions,
// simulation upload, plagiarism flags, class analytics, feedback, vivas, catch-ups.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedbackOverviewSessionRow {
  session_id: string;
  session_date?: string;
  experiment_id: string | null;
  experiment_title: string;
  exp_number?: number | null;
  topic?: string;
  scheduled_at: string | null;
  status: string;
  students_enrolled?: number;
  feedbacks_count?: number;
  feedbacks_pct?: number;
  response_count?: number;
  overall_rating: number | null;
  experiment_clarity: number | null;
  session_pacing: number | null;
  ai_hint_helpfulness: number | null;
  subject_id?: string;
  subject_name?: string;
  subject_code?: string;
  section_id?: string;
  section_name?: string;
  batch_id?: string | null;
  batch_name?: string;
  academic_year?: string;
  department_id?: string | null;
  department_name?: string;
  department_code?: string;
}

export interface FeedbackKpis {
  overall_rating: number;
  overall_delta?: string;
  experiment_clarity: number;
  clarity_delta?: string;
  session_pacing: number;
  pacing_delta?: string;
  ai_hint_helpfulness: number;
  ai_delta?: string;
  total_ratings: number;
}

export interface RatingDistributionItem {
  count: number;
  pct: number;
}

export type RatingDistributionMap = Record<string, RatingDistributionItem>;

export interface FeedbackCoverage {
  completed_count: number;
  completed_pct: number;
  not_submitted_count: number;
  not_submitted_pct: number;
  total_enrolled: number;
}

export interface FeedbackTrendPoint {
  period: string;
  overall: number;
  clarity: number;
  pacing: number;
  ai_help: number;
}

export interface SentimentBreakdown {
  all: number;
  positive: number;
  neutral: number;
  needs_attention: number;
}

export interface FeedbackItem {
  id: string;
  session_id?: string;
  experiment_title?: string;
  topic?: string;
  experiment_clarity: number | null;
  session_pacing: number | null;
  ai_hint_helpfulness: number | null;
  overall_rating: number | null;
  comment: string | null;
  helpful_count?: number;
  submitted_at: string | null;
  time_ago?: string;
  subject_id?: string;
  subject_name?: string;
  subject_code?: string;
  section_id?: string;
  section_name?: string;
  batch_id?: string | null;
  batch_name?: string;
  academic_year?: string;
  department_id?: string | null;
  department_name?: string;
  department_code?: string;
}

export interface FeedbackOverviewResponse {
  total: number;
  kpis?: FeedbackKpis;
  averages: {
    experiment_clarity: number | null;
    session_pacing: number | null;
    ai_hint_helpfulness: number | null;
    overall_rating: number | null;
  };
  trends?: FeedbackTrendPoint[];
  rating_distribution?: RatingDistributionMap;
  coverage?: FeedbackCoverage;
  sessions_summary: FeedbackOverviewSessionRow[];
  sentiment_breakdown?: SentimentBreakdown;
  feedback: FeedbackItem[];
}

export interface RatingComparisonItem {
  metric: string;
  session: number;
  subject_avg: number;
}

export interface RecentSessionTrendItem {
  session_id?: string;
  label: string;
  title?: string;
  overall: number;
  clarity: number;
  pacing: number;
  ai_help: number;
  is_current?: boolean;
}

export interface KeyInsightItem {
  id: string;
  type: 'positive' | 'warning' | 'info' | 'purple';
  title: string;
  description: string;
  icon?: string;
}

export interface SessionContextResource {
  name: string;
  type: string;
  size: string;
  format: string;
  icon: string;
}

export interface DetailedRatingBreakdowns {
  overall: RatingDistributionMap;
  clarity: RatingDistributionMap;
  pacing: RatingDistributionMap;
  ai_helpfulness: RatingDistributionMap;
}

export interface SessionFeedbackDetailsResponse {
  session: {
    id: string;
    title: string;
    experiment_id: string | null;
    experiment_title: string;
    topic: string;
    exp_number: number;
    status: string;
    subject_name: string;
    subject_code: string;
    section_name: string;
    batch_name: string;
    academic_year: string;
    department_name: string;
    scheduled_at: string | null;
    formatted_date: string;
    formatted_time: string;
    duration_hours: string;
    duration_minutes: number;
    students_enrolled: number;
    feedback_submitted: number;
    feedback_pct: number;
  };
  kpis: {
    overall_rating: number;
    experiment_clarity: number;
    session_pacing: number;
    ai_hint_helpfulness: number;
    total_responses: number;
  };
  rating_distribution: RatingDistributionMap;
  detailed_breakdowns?: DetailedRatingBreakdowns;
  rating_comparison: RatingComparisonItem[];
  recent_sessions_trend: RecentSessionTrendItem[];
  key_insights: KeyInsightItem[];
  sentiment_breakdown: SentimentBreakdown;
  feedback: FeedbackItem[];
  context: {
    aim: string;
    theory: string;
    problem_statement: string;
    difficulty_level: number;
    test_cases_count: number;
    attendance_turnout_pct: number;
    students_present: number;
    instructor_name?: string;
    live_conductor_status?: string;
    description?: string;
    learning_objectives?: string[];
    resources?: SessionContextResource[];
  };
}

export interface SessionFeedbackData {
  session_id: string;
  total: number;
  averages: {
    experiment_clarity: number | null;
    session_pacing: number | null;
    ai_hint_helpfulness: number | null;
    overall_rating: number | null;
  };
  feedback: FeedbackItem[];
}

export interface VivaListItem {
  id: string;
  student_id: string;
  full_name: string;
  roll_number: string;
  experiment_id: string;
  experiment: string;
  total_score: number | null;
  status: 'pending' | 'active' | 'completed';
  question_count: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface VivaDetail {
  viva: {
    id: string;
    student_id: string;
    full_name: string;
    experiment: string;
    questions: { q?: string; question?: string; score?: number; feedback?: string }[] | null;
    total_score: number | null;
    status: string;
    completed_at: string | null;
  };
  answers: {
    question_index: number;
    question_text: string;
    answer_text: string;
    score: number | null;
    ai_feedback: string | null;
    submitted_at: string | null;
  }[];
}

export interface CatchupOverview {
  enabled_sessions: {
    session_id: string;
    experiment: string;
    scheduled_at: string | null;
    catchup_deadline: string | null;
    expired: boolean;
    attempts: number;
  }[];
  attempts: {
    student_id: string;
    full_name: string;
    roll_number: string;
    session_id: string;
    experiment: string;
    status: string;
    started_at: string | null;
  }[];
}

export const instructorService = {

  // ── Pre-lab Content Modules ──────────────────────────────────────────────────
  // GET /api/instructor/experiments/<exp_id>/content
  async listContent(expId: string) {
    const { data } = await apiClient.get(`/instructor/experiments/${expId}/content`);
    return data;
  },

  // POST /api/instructor/experiments/<exp_id>/content
  async addContentModule(expId: string, payload: {
    module_type:
      | 'text' | 'video' | 'pdf' | 'quiz' | 'markdown' | 'code' | 'image'
      | 'html' | 'link' | 'file' | 'assign' | 'viva';
    title: string;
    content_data?: Record<string, unknown>;
    display_order?: number;
    min_watch_pct?: number;
    page_id?: string | null;
  }) {
    const { data } = await apiClient.post(`/instructor/experiments/${expId}/content`, payload);
    return data;
  },

  // PATCH /api/instructor/experiments/<exp_id>/content/<module_id>
  async updateContentModule(expId: string, moduleId: string, payload: Record<string, unknown>) {
    const { data } = await apiClient.patch(
      `/instructor/experiments/${expId}/content/${moduleId}`, payload
    );
    return data;
  },

  // DELETE /api/instructor/experiments/<exp_id>/content/<module_id>
  async deleteContentModule(expId: string, moduleId: string) {
    await apiClient.delete(`/instructor/experiments/${expId}/content/${moduleId}`);
  },

  // POST /api/instructor/experiments/<exp_id>/content/reorder
  async reorderContent(expId: string, order: string[]) {
    const { data } = await apiClient.post(`/instructor/experiments/${expId}/content/reorder`, { order });
    return data;
  },

  // GET /api/instructor/experiments/<exp_id>/content/progress-summary
  async getContentProgress(expId: string) {
    const { data } = await apiClient.get(`/instructor/experiments/${expId}/content/progress-summary`);
    return data;
  },

  // ── Content Pages ────────────────────────────────────────────────────────────
  // GET /api/instructor/experiments/<exp_id>/pages
  async listPages(expId: string) {
    const { data } = await apiClient.get(`/instructor/experiments/${expId}/pages`);
    return data;
  },

  // POST /api/instructor/experiments/<exp_id>/pages
  async addPage(expId: string, payload: {
    title?: string;
    display_order?: number;
    is_live?: boolean;
    release_at?: string | null;
  }) {
    const { data } = await apiClient.post(`/instructor/experiments/${expId}/pages`, payload);
    return data;
  },

  // PATCH /api/instructor/experiments/<exp_id>/pages/<page_id>
  async updatePage(expId: string, pageId: string, payload: {
    title?: string;
    display_order?: number;
    is_live?: boolean;
    release_at?: string | null;
  }) {
    const { data } = await apiClient.patch(`/instructor/experiments/${expId}/pages/${pageId}`, payload);
    return data;
  },

  // DELETE /api/instructor/experiments/<exp_id>/pages/<page_id>
  async deletePage(expId: string, pageId: string) {
    await apiClient.delete(`/instructor/experiments/${expId}/pages/${pageId}`);
  },

  // ── AI Viva Generation ───────────────────────────────────────────────────────
  // POST /api/instructor/experiments/<exp_id>/viva/generate
  async generateVivaQuestions(expId: string, payload: {
    source: 'topics' | 'content';
    topics?: string[];
    count?: number;
    difficulty?: number;
  }): Promise<{
    questions: { question: string; expected_answer: string; topics: string[]; difficulty: number | null }[];
    count: number;
    source: string;
    topics: string[];
    difficulty: number | null;
  }> {
    const { data } = await apiClient.post(`/instructor/experiments/${expId}/viva/generate`, payload);
    return data;
  },

  // ── AI Text Extraction ────────────────────────────────────────────────────────
  // POST /api/instructor/experiments/<exp_id>/ai/extract-text
  // Accepts multipart (file) or JSON ({ url })
  async extractTextFromFile(
    expId: string, file: File
  ): Promise<{ text: string; chars: number; source: string }> {
    const form = new FormData();
    form.append('file', file);
    const token = (await import('js-cookie')).default.get('access_token');
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const res = await fetch(`${base}/instructor/experiments/${expId}/ai/extract-text`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Server returned status ${res.status}`);
    }
    return data;
  },

  async extractTextFromUrl(
    expId: string, url: string
  ): Promise<{ text: string; chars: number; source: string }> {
    const { data } = await apiClient.post(
      `/instructor/experiments/${expId}/ai/extract-text`, { url }
    );
    return data;
  },

  // ── AI Content Generation ─────────────────────────────────────────────────────
  // POST /api/instructor/experiments/<exp_id>/ai/generate
  async generateAiContent(
    expId: string,
    payload: {
      source: 'text' | 'experiment';
      text?: string;
      generate: Array<'notes' | 'code' | 'quiz' | 'viva' | 'assignment'>;
      language?: string;
      count_quiz?: number;
      count_viva?: number;
    }
  ): Promise<{
    notes?: { markdown: string };
    assignment?: {
      title?: string;
      instructions: string;
      language: string;
      starter_code: string;
      pass_threshold?: number;
      test_cases: { input?: string; expected?: string; hidden?: boolean; weight?: number }[];
    };
    code_snippets?: { title: string; language: string; description: string; code: string }[];
    quiz_questions?: { question: string; options: string[]; correct_index: number; explanation: string }[];
    viva_questions?: { question: string; expected_answer: string }[];
    _meta?: { model: string; is_fallback: boolean; source: string };
  }> {
    const { data } = await apiClient.post(`/instructor/experiments/${expId}/ai/generate`, payload);
    return data;
  },

  // ── Quiz Questions ───────────────────────────────────────────────────────────
  // GET /api/instructor/content/<module_id>/questions
  async listQuestions(moduleId: string) {
    const { data } = await apiClient.get(`/instructor/content/${moduleId}/questions`);
    return data;
  },

  // POST /api/instructor/content/<module_id>/questions (single or batch)
  async addQuestions(moduleId: string, questions: Record<string, unknown> | Record<string, unknown>[]) {
    const { data } = await apiClient.post(`/instructor/content/${moduleId}/questions`, questions);
    return data;
  },

  // PATCH /api/instructor/content/questions/<question_id>
  async updateQuestion(questionId: string, payload: Record<string, unknown>) {
    const { data } = await apiClient.patch(`/instructor/content/questions/${questionId}`, payload);
    return data;
  },

  // DELETE /api/instructor/content/questions/<question_id>
  async deleteQuestion(questionId: string) {
    await apiClient.delete(`/instructor/content/questions/${questionId}`);
  },

  // PATCH /api/instructor/content/<module_id>/quiz-config
  async updateQuizConfig(moduleId: string, payload: {
    pass_threshold?: number;
    max_attempts?: number;
    cooldown_minutes?: number;
    shuffle?: boolean;
  }) {
    const { data } = await apiClient.patch(`/instructor/content/${moduleId}/quiz-config`, payload);
    return data;
  },

  // ── Simulation Upload ────────────────────────────────────────────────────────
  // GET /api/instructor/experiments/<exp_id>/simulation
  async getSimulationInfo(expId: string) {
    const { data } = await apiClient.get(`/instructor/experiments/${expId}/simulation`);
    return data;
  },

  // GET /api/instructor/experiments/<exp_id>/simulation/prompt
  async getSimulationPrompt(expId: string) {
    const { data } = await apiClient.get(`/instructor/experiments/${expId}/simulation/prompt`);
    return data;
  },

  // POST /api/instructor/experiments/<exp_id>/simulation/upload (multipart)
  async uploadSimulation(expId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    // Use dynamic import for SSR safety (same pattern as extractTextFromFile).
    const token = (await import('js-cookie')).default.get('access_token');
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const res = await fetch(`${base}/instructor/experiments/${expId}/simulation/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw { response: { data } };
    return data;
  },

  // DELETE /api/instructor/experiments/<exp_id>/simulation
  async deleteSimulation(expId: string) {
    await apiClient.delete(`/instructor/experiments/${expId}/simulation`);
  },

  // ── Plagiarism Flags ─────────────────────────────────────────────────────────
  // GET /api/instructor/plagiarism-flags
  async getPlagiarismFlags(experimentId?: string) {
    const { data } = await apiClient.get('/instructor/plagiarism-flags', {
      params: experimentId ? { experiment_id: experimentId } : {},
    });
    return data;
  },

  // PATCH /api/instructor/plagiarism-flags/<flag_id>
  async reviewPlagiarismFlag(flagId: string, status: 'cleared' | 'actioned', review_notes?: string) {
    const { data } = await apiClient.patch(`/instructor/plagiarism-flags/${flagId}`, {
      status, review_notes,
    });
    return data;
  },

  // ── Class Analytics ──────────────────────────────────────────────────────────
  // GET /api/instructor/analytics/section/<section_subject_id>
  async getSectionRankings(sectionSubjectId: string) {
    const { data } = await apiClient.get(`/instructor/analytics/section/${sectionSubjectId}`);
    return data;
  },

  // GET /api/instructor/analytics/student/<student_id>/mastery
  async getStudentMastery(studentId: string) {
    const { data } = await apiClient.get(`/instructor/analytics/student/${studentId}/mastery`);
    return data;
  },

  // ── Session Feedback ─────────────────────────────────────────────────────
  // GET /api/instructor/sessions/<session_id>/feedback
  // GET /api/instructor/feedback-overview
  async getFeedbackOverview(params?: {
    department_id?: string;
    academic_year?: string;
    batch_id?: string;
    section_id?: string;
    subject_id?: string;
    session_id?: string;
    experiment_id?: string;
    date_range?: string;
  }): Promise<FeedbackOverviewResponse> {
    const { data } = await apiClient.get<FeedbackOverviewResponse>("/instructor/feedback-overview", {
      params: params || {},
    });
    return data;
  },

  async getSessionFeedback(sessionId: string): Promise<SessionFeedbackData> {
    const { data } = await apiClient.get<SessionFeedbackData>(`/instructor/sessions/${sessionId}/feedback`);
    return data;
  },

  async getSessionFeedbackDetails(sessionId: string): Promise<SessionFeedbackDetailsResponse> {
    const { data } = await apiClient.get<SessionFeedbackDetailsResponse>(`/instructor/sessions/${sessionId}/feedback-details`);
    return data;
  },

  async upvoteFeedback(feedbackId: string): Promise<{ id: string; helpful_count: number; success: boolean }> {
    const { data } = await apiClient.post<{ id: string; helpful_count: number; success: boolean }>(`/instructor/feedback/${feedbackId}/upvote`);
    return data;
  },

  // ── Viva Review ───────────────────────────────────────────────────────
  // GET /api/instructor/vivas?status=&experiment_id=
  async listVivas(status?: string, experimentId?: string): Promise<VivaListItem[]> {
    const { data } = await apiClient.get<{ vivas: VivaListItem[] }>('/instructor/vivas', {
      params: {
        ...(status ? { status } : {}),
        ...(experimentId ? { experiment_id: experimentId } : {})
      },
    });
    return data.vivas;
  },

  // GET /api/instructor/vivas/<viva_id>
  async getVivaDetail(vivaId: string): Promise<VivaDetail> {
    const { data } = await apiClient.get<VivaDetail>(`/instructor/vivas/${vivaId}`);
    return data;
  },

  // ── Catch-Ups ─────────────────────────────────────────────────────────
  // GET /api/instructor/catchups
  async getCatchups(): Promise<CatchupOverview> {
    const { data } = await apiClient.get<CatchupOverview>('/instructor/catchups');
    return data;
  },
};
