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
}

export interface ChatMessage {
  id: string; session_id: string; from_id: string; to_id: string | null;
  text: string; at: string; from_name?: string;
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

  async finalizeGrades(sessionId: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${sessionId}/finalize-grades`);
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
  async listReports(): Promise<ReportRow[]> {
    const { data } = await apiClient.get<{ reports: ReportRow[] }>('/instructor/reports');
    return data.reports;
  },

  async requestReport(kind: string, params?: Record<string, unknown>): Promise<ReportRow> {
    const { data } = await apiClient.post<{ report: ReportRow }>('/instructor/reports', { kind, params });
    return data.report;
  },

  async downloadReport(reportId: string) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const token = (await import('js-cookie')).default.get('access_token');
    const res = await fetch(`${base}/instructor/reports/${reportId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${reportId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
