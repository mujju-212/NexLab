import { apiClient } from './api-client';

// Instructor Experience service — analytics (6 tabs), Live Conductor,
// checkpoints/rubric, bulk grading, settings, dashboard attention, reports.

// ── Analytics types ────────────────────────────────────────────────────────────

export interface ExpAnalyticsRow {
  experiment_id: string;
  exp_number: number;
  title: string;
  difficulty: number | null;
  avg_score: number | null;
  avg_tc_score: number | null;
  completion_pct: number | null;
  total_students: number;
  avg_attempts: number | null;
  avg_exec_time_ms: number | null;
  quality_distribution: Record<string, number>;
  hint_usage_per_student: number | null;
}

export interface TrajectoryData {
  student: { id: string; full_name: string; roll_number: string | null };
  grade_timeline: {
    session_id: string | null;
    scheduled_at: string | null;
    experiment_id: string | null;
    final_grade: number | null;
    auto_grade: number | null;
    quiz_grade: number | null;
    viva_grade: number | null;
    code_quality_grade: number | null;
    hint_deduction: number | null;
    class_avg?: number | null;
  }[];
  concepts: { concept: string; mastery_score: number; experiment_count: number }[];
  ranking_components: {
    mastery: number; engagement: number; effort: number;
    efficiency: number; consistency: number; rank_score: number; rank_position: number | null;
  } | null;
}

export interface TrendRow {
  week: string;
  session_count: number;
  avg_score: number | null;
  avg_attendance: number | null;
  avg_focus: number | null;
  avg_completion: number | null;
}

export interface EngagementRow {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  avg_focus_score: number | null;
  attempt_count: number;
  time_on_task_sec: number;
  hint_reliance: number;
  auto_save_ratio: number;
}

export interface IntegrityRow {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  integrity_score: number;
  proctor_events: {
    tab_switch: number; fullscreen_exit: number; copy_paste: number;
    lockdown_violation: number; total: number;
  };
  plagiarism_flags: {
    student_a_id: string; student_b_id: string; similarity_pct: number;
    status: string; detected_at: string | null;
  }[];
}

export interface AiUsageRow {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  total_tokens: number;
  estimated_cost_usd: number;
  total_calls: number;
  tokens_per_experiment: number;
  feature_breakdown: Record<string, number>;
}

// ── Conductor types ────────────────────────────────────────────────────────────

export interface Checkpoint {
  id: string;
  experiment_id: string;
  order: number;
  title: string;
  description: string | null;
  test_case_ids: string[];
  weight: number;
  is_gated: boolean;
  page_id: string | null;
}

export interface SparkRow {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  focus_score: number | null;
  attempts: number;
  proctor_events: number;
  verified_checkpoints: number;
  checkpoints: Record<string, string>;
  priority_score: number;
}

export interface ModeRules {
  code: string;
  quiz: string;
  submit: boolean | string;
  proctor: string;
  label: string;
}

export interface LiveState {
  session: Record<string, unknown>;
  mode: string;
  mode_rules: ModeRules;
  live_page_state: {
    current_page_id: string | null;
    launched_page_ids: string[];
    page_timer_ends_at: string | null;
    launched_quiz_module_id: string | null;
  } | null;
  experiment: {
    id: string;
    title: string;
    exp_number: number;
    content_modules?: { id: string; title: string; module_type: string }[];
  } | null;
  checkpoints: Checkpoint[];
  spark_grid: SparkRow[];
  pages: { id: string; title: string; display_order: number }[];
  attendance: { student_id: string; status: string }[];
  chat: {
    id: string; session_id: string; from_id: string; to_id: string | null;
    text: string; at: string; from_name?: string; to_name?: string;
  }[];
  proctor_policy: {
    lockdown_fullscreen: boolean; block_copy_paste: boolean; block_tab_switch: boolean;
    plagiarism_scan: boolean; focus_ml: boolean; webcam_required: boolean;
  };
  /** True only when the behavioural focus pipeline is actually collecting. */
  focus_ml_enabled?: boolean;
  /** Newest-first proctor events for the live console. */
  proctor_feed?: {
    id: string; student_id: string; student_name: string;
    event_type: string; severity: 'high' | 'medium' | 'low';
    payload: Record<string, unknown>; recorded_at: string | null;
  }[];
}

export interface ChatMessage {
  id: string; session_id: string; from_id: string; to_id: string | null;
  text: string; at: string; from_name?: string; to_name?: string;
}

export interface ReportRow {
  id: string;
  kind: string;
  status: string;
  params: Record<string, unknown> | null;
  created_at: string | null;
  completed_at: string | null;
  error: string | null;
}

// ── Tier 1: management tools ─────────────────────────────────────────────────

export interface InterventionRow {
  id: string;
  student_id: string;
  student_name?: string | null;
  roll_number?: string | null;
  action_type: string;
  note?: string | null;
  follow_up_at?: string | null;
  outcome: 'open' | 'improved' | 'no_change' | 'worsened';
  outcome_note?: string | null;
  created_at?: string | null;
}

export interface MasteryHeatmap {
  students: Array<{ student_id: string; full_name: string; roll_number: string | null }>;
  concepts: string[];
  values: Array<{ student_id: string; values: (number | null)[] }>;
  concept_avgs: Array<{ concept: string; avg: number; students: number }>;
  weak_flags: Array<{ student_id: string; concept: string; mastery: number }>;
  threshold: number;
}

export interface ExtensionRow {
  id: string;
  student_id: string;
  student_name?: string | null;
  experiment_id: string;
  experiment_title?: string | null;
  reason?: string | null;
  extension_until: string;
  excused: boolean;
  created_at?: string | null;
}

export interface EarlyWarningRow {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  risk_score: number;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
  mastery_avg?: number | null;
  days_since_submission?: number | null;
  avg_focus?: number | null;
}

export interface ErrorAnalysis {
  experiment_id: string;
  title: string;
  total_attempts: number;
  error_attempts: number;
  error_rate_pct: number;
  errors: Array<{ label: string; count: number; sample: string }>;
}

export interface BankQuestionRow {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: string | null;
  explanation?: string | null;
  tags: string[];
}

export interface TeacherNoteRow {
  id: string;
  student_id: string;
  note: string;
  author?: string | null;
  created_at?: string | null;
}

export interface HintEffectiveness {
  experiment_id: string;
  title: string;
  students_with_attempts: number;
  hint_users: number;
  non_hint_users: number;
  pass_rate_hint_users: number | null;
  pass_rate_non_users: number | null;
  avg_hints_passed: number;
  avg_hints_failed: number;
  level_distribution: Record<string, number>;
  top_users: Array<{ name: string; hints: number; passed: boolean; best_pass_pct: number }>;
}

export interface InstructorSearchHit {
  type: string; id: string; label: string;
  sub_label?: string | null; link: string;
}

// ── Exam types (instructor) ──────────────────────────────────────────────────

export interface InstructorExam {
  id: string;
  institution_id: string;
  subject_id: string;
  created_by?: string;
  title: string;
  description?: string;
  exam_type: 'mcq' | 'coding' | 'mixed';
  available_from: string | null;
  due_at: string | null;
  duration_minutes: number;
  max_attempts: number;
  pass_threshold: number;
  shuffle_questions: boolean;
  is_published: boolean;
  grade_weight: number;
  window_state: 'upcoming' | 'open' | 'closed';
  question_count: number;
  attempt_count?: number;
  subject_name?: string;
  subject_code?: string;
  created_at: string;
  updated_at: string;
  questions?: Record<string, any>[];
}

export interface CreateExamPayload {
  title: string;
  subject_id: string;
  description?: string;
  exam_type?: 'mcq' | 'coding' | 'mixed';
  duration_minutes?: number;
  max_attempts?: number;
  pass_threshold?: number;
  shuffle_questions?: boolean;
  available_from?: string | null;
  due_at?: string | null;
  grade_weight?: number;
}

export interface ExamAttemptRow {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: string;
  score: number | null;
  total_points: number;
  max_points: number;
  passed: boolean;
  started_at: string | null;
  submitted_at: string | null;
}

export interface SubmissionItem {
  id?: string;
  type: string;
  title: string;
  status: string;
  score: number | null;
  at: string | null;
  tests?: string;
  language?: string;
  compile_status?: string;
  compile_output?: string;
  stdout?: string;
  stderr?: string;
  files?: Record<string, string> | null;
  execution_time_ms?: number;
  loc?: number;
  quality_grade?: string;
  questions?: {
    id: string;
    question: string;
    options: string[];
    selected: string | null;
    correct_answer?: string | null;
    is_correct?: boolean | null;
    explanation?: string;
  }[];
  total_questions?: number;
}

export interface StudentDetail {
  student: { id: string; full_name: string; roll_number: string | null; email: string };
  attendance_status: string;
  joined_at: string | null;
  total_time_sec: number;
  focus_score: number | null;
  focus_timeline: { at: string | null; score: number }[];
  checkpoints: { id: string; order: number; title: string; status: string; passed_at: string | null }[];
  checkpoints_done: number;
  checkpoints_total: number;
  code_executions: number;
  last_attempt_at: string | null;
  quiz_status: string;
  quiz_score: number | null;
  assignment_status: string;
  assignment_score: number | null;
  final_grade: number | null;
  proctor_events: { tab_switch: number; fullscreen_exit: number; copy_paste: number; lockdown_violation: number; total: number };
  submissions: SubmissionItem[];
  latest_code: { files: Record<string, string> | null; saved_at: string | null; save_type: string | null };
  experiment: { id: string | null; title: string | null };
}

export const experienceService = {

  // ── Analytics (6 tabs) ────────────────────────────────────────────────────────
  async analyticsExperiments(params?: Record<string, unknown>) {
    const { data } = await apiClient.get<{ experiments: ExpAnalyticsRow[] }>(
      '/instructor/analytics/experiments', { params });
    return data.experiments;
  },

  async analyticsTrajectory(studentId: string): Promise<TrajectoryData> {
    const { data } = await apiClient.get<TrajectoryData>(
      `/instructor/analytics/student/${studentId}/trajectory`);
    return data;
  },

  async analyticsTrends(params?: Record<string, unknown>): Promise<TrendRow[]> {
    const { data } = await apiClient.get<{ trends: TrendRow[] }>(
      '/instructor/analytics/trends', { params });
    return data.trends;
  },

  async analyticsEngagement(params?: Record<string, unknown>): Promise<EngagementRow[]> {
    const { data } = await apiClient.get<{ engagement: EngagementRow[] }>(
      '/instructor/analytics/engagement', { params });
    return data.engagement;
  },

  async analyticsIntegrity(params?: Record<string, unknown>) {
    const { data } = await apiClient.get<{ integrity: IntegrityRow[]; clusters: unknown[] }>(
      '/instructor/analytics/integrity', { params });
    return data;
  },

  async analyticsAiUsage(params?: Record<string, unknown>) {
    const { data } = await apiClient.get<{ ai_usage: AiUsageRow[]; by_feature: { feature: string; count: number }[] }>(
      '/instructor/analytics/ai-usage', { params });
    return data;
  },

  async analyticsAtRisk(params?: Record<string, unknown>) {
    const { data } = await apiClient.get<{
      at_risk_students: Array<{
        student_id: string;
        full_name: string;
        roll_number: string | null;
        risk_score: number;
        risk_band: string;
        reasons: string[];
      }>;
      summary: { critical: number; high: number; watch: number; total: number };
    }>('/instructor/analytics/at-risk', { params });
    return data;
  },

  // NOTE: analyticsConceptHeatmap() was removed — it called
  // GET /instructor/analytics/concept-heatmap, a route that was never
  // implemented, and nothing referenced it. Concept mastery is served by
  // getMasteryOverview() -> /instructor/analytics/mastery-overview, which
  // returns the real heatmap columns/rows rendered in MasteryTab.

  /** Lightweight roster for the trajectory picker — avoids the heavy integrity endpoint */
  async analyticsRoster() {
    const { data } = await apiClient.get<{ roster: { student_id: string; full_name: string; roll_number: string | null }[] }>(
      '/instructor/analytics/roster');
    return data;
  },

  // ── Live Conductor ────────────────────────────────────────────────────────────
  async liveState(sessionId: string): Promise<LiveState> {
    const { data } = await apiClient.get<LiveState>(`/instructor/sessions/${sessionId}/live`);
    return data;
  },

  async setMode(sessionId: string, mode: string, reason?: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/mode`, { mode, reason });
    return data;
  },

  async launchPage(sessionId: string, pageId: string, timerSec?: number) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/launch-page`, {
      page_id: pageId, timer_sec: timerSec,
    });
    return data;
  },

  async launchQuiz(sessionId: string, moduleId: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/launch-quiz`, {
      module_id: moduleId,
    });
    return data;
  },

  async setProctor(sessionId: string, pageId: string | null, changes: Record<string, boolean>) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/set-proctor`, {
      page_id: pageId, ...changes,
    });
    return data;
  },

  async forceSubmit(sessionId: string, studentId?: string, reason?: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/force-submit`, {
      student_id: studentId, reason,
    });
    return data;
  },

  async broadcast(sessionId: string, message: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/broadcast`, { message });
    return data;
  },

  async checkpointOverride(sessionId: string, checkpointId: string, studentId: string, status: 'manual_pass' | 'manual_fail') {
    const { data } = await apiClient.post(
      `/instructor/sessions/${sessionId}/checkpoints/${checkpointId}/override`,
      { student_id: studentId, status });
    return data;
  },

  async getChat(sessionId: string, since?: string) {
    const { data } = await apiClient.get<{ messages: ChatMessage[] }>(
      `/instructor/sessions/${sessionId}/chat`, { params: since ? { since } : {} });
    return data.messages;
  },

  async sendChat(sessionId: string, text: string, toId?: string) {
    const { data } = await apiClient.post<{ message: ChatMessage }>(
      `/instructor/sessions/${sessionId}/chat`, { text, to_id: toId });
    return data.message;
  },

  async studentCode(sessionId: string, studentId: string) {
    const { data } = await apiClient.get(`/instructor/sessions/${sessionId}/student-code/${studentId}`);
    return data;
  },

  async studentDetail(sessionId: string, studentId: string): Promise<StudentDetail> {
    const { data } = await apiClient.get<StudentDetail>(
      `/instructor/sessions/${sessionId}/student/${studentId}/detail`);
    return data;
  },

  async finalizeGrades(sessionId: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/finalize-grades`);
    return data;
  },

  // ── Present & Teach — full experiment content (all pages incl. unreleased) ─────
  async getSessionContent(expId: string) {
    const { data } = await apiClient.get<{
      pages: Array<{
        id: string | null; title: string; display_order: number;
        release_at: string | null; is_live?: boolean;
        modules: Array<{ id: string; page_id: string | null; module_type: string; title: string;
          content_data: Record<string, unknown>; display_order: number; question_count?: number;
          questions?: unknown[] }>;
      }>;
      count: number;
      flat: Array<{ id: string; page_id: string | null; module_type: string; title: string;
        content_data: Record<string, unknown>; display_order: number; question_count?: number }>;
    }>(`/instructor/experiments/${expId}/content`);
    return data;
  },

  /** Release / unrelease a content page live (is_live toggle or scheduled release_at). */
  async releasePage(expId: string, pageId: string, payload: { is_live?: boolean; release_at?: string | null }) {
    const { data } = await apiClient.patch(`/instructor/experiments/${expId}/pages/${pageId}`, payload);
    return data;
  },

  // ── Session attach (PATCH) ────────────────────────────────────────────────────
  async patchSession(sessionId: string, payload: Record<string, unknown>) {
    const { data } = await apiClient.patch(`/instructor/sessions/${sessionId}`, payload);
    return data;
  },

  // ── Checkpoint CRUD ───────────────────────────────────────────────────────────
  async listCheckpoints(expId: string) {
    const { data } = await apiClient.get<{ checkpoints: Checkpoint[] }>(
      `/instructor/experiments/${expId}/checkpoints`);
    return data.checkpoints;
  },

  async createCheckpoint(expId: string, payload: Partial<Checkpoint>) {
    const { data } = await apiClient.post<{ checkpoint: Checkpoint }>(
      `/instructor/experiments/${expId}/checkpoints`, payload);
    return data.checkpoint;
  },

  async updateCheckpoint(expId: string, cpId: string, payload: Partial<Checkpoint>) {
    const { data } = await apiClient.patch<{ checkpoint: Checkpoint }>(
      `/instructor/experiments/${expId}/checkpoints/${cpId}`, payload);
    return data.checkpoint;
  },

  async deleteCheckpoint(expId: string, cpId: string) {
    await apiClient.delete(`/instructor/experiments/${expId}/checkpoints/${cpId}`);
  },

  // ── Experiment rubric / type / proctor defaults ───────────────────────────────
  async patchExperimentExtras(expId: string, payload: Record<string, unknown>) {
    const { data } = await apiClient.patch(`/instructor/experiments/${expId}/rubric`, payload);
    return data;
  },

  // ── Bulk grading ──────────────────────────────────────────────────────────────
  async bulkGrade(payload: Record<string, unknown>) {
    const { data } = await apiClient.post('/instructor/grades/bulk', payload);
    return data;
  },

  // ── Instructor settings ───────────────────────────────────────────────────────
  async getSettings() {
    const { data } = await apiClient.get<{ settings: Record<string, unknown> }>('/instructor/settings');
    return data.settings;
  },

  async patchSettings(payload: Record<string, unknown>) {
    const { data } = await apiClient.patch<{ settings: Record<string, unknown> }>('/instructor/settings', payload);
    return data.settings;
  },

  // ── Dashboard attention ───────────────────────────────────────────────────────
  async dashboardAttention() {
    const { data } = await apiClient.get<{
      attention: { signal: string; title: string; detail: string; severity: number; link: string }[];
      has_active_session: boolean;
      quick_actions: { action: string; link: string }[];
    }>('/instructor/dashboard/attention');
    return data;
  },

  // ── Reports ───────────────────────────────────────────────────────────────────
  async listReports(): Promise<ReportRow[]> {    const { data } = await apiClient.get<{ reports: ReportRow[] }>('/instructor/reports');
    return data.reports;
  },

  async requestReport(kind: string, params?: Record<string, unknown>): Promise<ReportRow> {
    const { data } = await apiClient.post<{ report: ReportRow }>('/instructor/reports', { kind, params });
    return data.report;
  },

  async downloadReport(reportId: string, fmt: 'csv' | 'xlsx' = 'csv') {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const token = (await import('js-cookie')).default.get('access_token');
    const res = await fetch(`${base}/instructor/reports/${reportId}/download?format=${fmt}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Download failed';
      try { msg = (await res.json()).error ?? msg; } catch { /* keep */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fmt === 'xlsx'
      ? `report_${reportId.slice(0, 8)}.xlsx`
      : `report_${reportId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ── Tier 1: management tools ──────────────────────────────────────────────

  async listInterventions(status?: 'open' | 'resolved'): Promise<{ interventions: InterventionRow[]; my_students: string[] }> {
    const { data } = await apiClient.get('/instructor/interventions', { params: status ? { status } : {} });
    return data;
  },
  async createIntervention(payload: { student_id: string; action_type: string; note?: string; follow_up_at?: string }): Promise<InterventionRow> {
    const { data } = await apiClient.post<{ intervention: InterventionRow }>('/instructor/interventions', payload);
    return data.intervention;
  },
  async setInterventionOutcome(id: string, outcome: string, outcome_note?: string): Promise<InterventionRow> {
    const { data } = await apiClient.patch<{ intervention: InterventionRow }>(`/instructor/interventions/${id}/outcome`, { outcome, outcome_note });
    return data.intervention;
  },
  async dueInterventions(): Promise<{ due: InterventionRow[] }> {
    const { data } = await apiClient.get('/instructor/interventions/due');
    return data;
  },

  async masteryHeatmap(threshold = 40): Promise<MasteryHeatmap> {
    const { data } = await apiClient.get('/instructor/mastery-heatmap', { params: { threshold } });
    return data;
  },

  async announcementRecipients(): Promise<{ recipients: Array<{ section_subject_id: string; subject_name: string; section_name: string; student_count: number }> }> {
    const { data } = await apiClient.get('/instructor/announcements/recipients');
    return data;
  },
  async instructorAnnounce(payload: { section_subject_id: string; title: string; message: string }): Promise<{ sent_to: number }> {
    const { data } = await apiClient.post('/instructor/announcements', payload);
    return data;
  },
  async listInstructorAnnouncements(): Promise<{ announcements: any[]; unread_count: number; total: number }> {
    const { data } = await apiClient.get('/instructor/announcements');
    return data;
  },
  async markInstructorAnnouncementRead(id: string): Promise<{ is_read: boolean; views_count: number }> {
    const { data } = await apiClient.post(`/instructor/announcements/${id}/read`);
    return data;
  },
  async toggleInstructorAnnouncementLike(id: string): Promise<{ liked: boolean; likes_count: number }> {
    const { data } = await apiClient.post(`/instructor/announcements/${id}/like`);
    return data;
  },


  async listExtensions(experimentId?: string): Promise<{ extensions: ExtensionRow[] }> {
    const { data } = await apiClient.get('/instructor/extensions', { params: experimentId ? { experiment_id: experimentId } : {} });
    return data;
  },
  async grantExtension(payload: { student_id: string; experiment_id: string; extension_until: string; reason?: string; excused?: boolean }): Promise<ExtensionRow> {
    const { data } = await apiClient.post<{ extension: ExtensionRow }>('/instructor/extensions', payload);
    return data.extension;
  },
  async revokeExtension(id: string): Promise<void> {
    await apiClient.delete(`/instructor/extensions/${id}`);
  },

  // ── Tier 2/3 enhancements ─────────────────────────────────────────────────

  async earlyWarning(ssId: string): Promise<{ students: EarlyWarningRow[] }> {
    const { data } = await apiClient.get(`/instructor/early-warning/${ssId}`);
    return data;
  },

  async aiFeedbackDraft(studentId: string, experimentId: string): Promise<{ draft: string; model: string }> {
    const { data } = await apiClient.post('/instructor/ai-feedback-draft', {
      student_id: studentId, experiment_id: experimentId,
    });
    return data;
  },

  async errorAnalysis(experimentId: string): Promise<ErrorAnalysis> {
    const { data } = await apiClient.get(`/instructor/error-analysis/${experimentId}`);
    return data;
  },

  async curveGrades(payload: { experiment_id: string; mode: 'add' | 'factor'; value: number; apply?: boolean }): Promise<{
    applied: boolean; affected?: number; changed?: number; locked_skipped?: number;
    class_avg_before?: number | null; class_avg_after?: number | null;
    rows?: Array<{ student_id: string; before: number | null; after: number | null; locked: boolean }>;
  }> {
    const { data } = await apiClient.post('/instructor/grades/curve', payload);
    return data;
  },
  async setModerationLock(gradeId: string, isLocked: boolean): Promise<void> {
    await apiClient.post('/instructor/grades/moderation', { grade_id: gradeId, is_locked: isLocked });
  },

  async randomStudent(sessionId: string): Promise<{ student_id: string; full_name: string; roll_number: string | null }> {
    const { data } = await apiClient.get(`/instructor/sessions/${sessionId}/random-student`);
    return data;
  },
  async createPoll(sessionId: string, question: string, options: string[]): Promise<{ poll: { id: string; question: string; options: string[] } }> {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/poll`, { question, options });
    return data;
  },
  async closePoll(sessionId: string, pollId: string): Promise<{ poll: { id: string; results: number[]; responses_count: number; is_open: boolean; options: string[]; question: string } }> {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/poll/${pollId}/close`);
    return data;
  },

  async cloneExperiment(expId: string): Promise<{ experiment: { id: string; title: string }; copied: Record<string, number>; message: string }> {
    const { data } = await apiClient.post(`/instructor/experiments/${expId}/clone`);
    return data;
  },

  async listBankQuestions(q?: string): Promise<{ questions: BankQuestionRow[] }> {
    const { data } = await apiClient.get('/instructor/question-bank', { params: q ? { q } : {} });
    return data.questions ? data : { questions: [] };
  },
  async addToBank(payload: { question_text: string; options: string[]; correct_answer: string; explanation?: string; tags?: string[] }): Promise<BankQuestionRow> {
    const { data } = await apiClient.post<{ question: BankQuestionRow }>('/instructor/question-bank', payload);
    return data.question;
  },
  async deleteBankQuestion(id: string): Promise<void> {
    await apiClient.delete(`/instructor/question-bank/${id}`);
  },

  async listNotes(studentId: string): Promise<{ notes: TeacherNoteRow[] }> {
    const { data } = await apiClient.get(`/instructor/notes/${studentId}`);
    return data;
  },
  async addNote(studentId: string, note: string): Promise<TeacherNoteRow> {
    const { data } = await apiClient.post<{ note: TeacherNoteRow }>('/instructor/notes', { student_id: studentId, note });
    return data.note;
  },
  async deleteNote(id: string): Promise<void> {
    await apiClient.delete(`/instructor/notes/${id}`);
  },

  async hintEffectiveness(experimentId: string): Promise<HintEffectiveness> {
    const { data } = await apiClient.get(`/instructor/analytics/hint-effectiveness/${experimentId}`);
    return data;
  },

  // ── Shell search (students/experiments/sessions) ──────────────────────────
  async instructorSearch(q: string, types = 'students,experiments,sessions'): Promise<InstructorSearchHit[]> {
    const { data } = await apiClient.get('/instructor/search', { params: { q, types } })
      .catch(() => ({ data: { results: [] as InstructorSearchHit[] } }));
    return data.results ?? [];
  },

  // ── Exams (Instructor) ──────────────────────────────────────────────────
  async listExams(subjectId?: string): Promise<InstructorExam[]> {
    const params: Record<string, string> = {};
    if (subjectId) params.subject_id = subjectId;
    const { data } = await apiClient.get<{ exams: InstructorExam[] }>('/instructor/exams', { params });
    return data.exams ?? [];
  },

  async createExam(payload: CreateExamPayload): Promise<InstructorExam> {
    const { data } = await apiClient.post<{ exam: InstructorExam }>('/instructor/exams', payload);
    return data.exam;
  },

  async getExam(examId: string): Promise<InstructorExam> {
    const { data } = await apiClient.get<{ exam: InstructorExam }>(`/instructor/exams/${examId}`);
    return data.exam;
  },

  async updateExam(examId: string, payload: Partial<CreateExamPayload> & { is_published?: boolean }): Promise<InstructorExam> {
    const { data } = await apiClient.patch<{ exam: InstructorExam }>(`/instructor/exams/${examId}`, payload);
    return data.exam;
  },

  async deleteExam(examId: string): Promise<void> {
    await apiClient.delete(`/instructor/exams/${examId}`);
  },

  async getExamAttempts(examId: string): Promise<{ attempts: ExamAttemptRow[]; exam: InstructorExam }> {
    const { data } = await apiClient.get(`/instructor/exams/${examId}/attempts`);
    return data;
  },
};
