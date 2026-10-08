import { apiClient } from './api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Student360Profile {
  student: {
    id: string;
    full_name: string;
    roll_number: string | null;
    email: string;
    department?: string | null;
    section?: string | null;
  };
  completion: {
    assigned: number;
    completed: number;
    completion_pct: number;
  };
  attendance: {
    scheduled_sessions: number;
    attended_sessions: number;
    attendance_rate: number;
    active_participant_sessions: number;
    active_rate: number;
  };
  grades: {
    average: number;
    trend_slope: number;
    recent: Array<{
      experiment_id: string;
      experiment_title: string;
      final_grade: number;
      auto_grade: number | null;
      manual_grade: number | null;
      created_at: string | null;
    }>;
  };
  mastery: {
    scope_avg: number;
    weak_concepts: string[];
    concepts: Array<{
      concept: string;
      mastery_score: number;
      is_weak: boolean;
      experiment_count: number;
    }>;
  };
  risk: {
    unified_risk_score: number;
    risk_band: 'critical' | 'high' | 'watch' | 'ok';
    primary_reason: string;
    components: Record<string, { value: number; penalty: number; contribution: number }>;
  };
  ranks: Record<string, {
    position: number;
    cohort_size: number;
    percentile: number;
    rank_score: number;
    components?: Record<string, number>;
  }>;
  violations?: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface StruggleQuadrantData {
  medians: { effort: number; outcome: number };
  quadrants: {
    thriving: Array<{ student_id: string; full_name: string; roll_number: string | null; effort: number; outcome: number }>;
    struggling: Array<{ student_id: string; full_name: string; roll_number: string | null; effort: number; outcome: number }>;
    coasting: Array<{ student_id: string; full_name: string; roll_number: string | null; effort: number; outcome: number }>;
    disengaged: Array<{ student_id: string; full_name: string; roll_number: string | null; effort: number; outcome: number }>;
  };
  students: Array<{
    student_id: string;
    full_name: string;
    roll_number: string | null;
    effort: number;
    outcome: number;
    quadrant: 'thriving' | 'struggling' | 'coasting' | 'disengaged';
  }>;
}

export interface ErrorClustersResponse {
  experiment_id: string;
  total_failed_attempts: number;
  clusters: Array<{
    signature: string;
    count: number;
    error_type: string;
    sample_message: string;
    affected_students_pct: number;
  }>;
}

export interface LeaderboardRankItem {
  student_id: string;
  student_name: string;
  roll_number?: string | null;
  rank_position: number;
  rank_score: number;
  percentile: number;
  cohort_size: number;
  components: {
    mastery: number;
    engagement: number;
    effort: number;
    efficiency: number;
    consistency: number;
  };
}

export interface LeaderboardResponse {
  scope_level: string;
  scope_id?: string | null;
  cohort_size: number;
  leaderboard: LeaderboardRankItem[];
}

export interface ForecastData {
  student_id: string;
  current_average: number;
  projected_final: number;
  confidence_interval: {
    lower_95: number;
    upper_95: number;
  };
  trajectory_slope: number;
  historical_points: Array<{ week: number; grade: number; label?: string }>;
  projection_points: Array<{ week: number; projected: number; lower: number; upper: number; label?: string }>;
}

export interface PrerequisiteGraphData {
  student_id: string;
  subject_id?: string;
  nodes: Array<{ id: string; concept: string; mastery: number; is_deficient: boolean }>;
  edges: Array<{ from: string; to: string }>;
  blocked_concepts: string[];
}

export interface IntegrityConfidenceData {
  student_id: string;
  integrity_confidence: number;
  review_recommended: boolean;
  violation_density: number;
  violations: Array<{
    event_type: string;
    severity: string;
    recorded_at: string;
    payload?: Record<string, unknown>;
  }>;
  plagiarism_flags: Array<{
    similarity_pct: number;
    status: string;
    counterpart_name: string;
    detected_at: string | null;
  }>;
  anomalies: Array<{
    type: string;
    description: string;
    attempt_number: number;
    created_at: string | null;
  }>;
}

export interface IntegrityReviewQueueItem {
  student_id: string;
  student_name: string;
  roll_number?: string | null;
  integrity_confidence: number;
  violations_count: number;
  plagiarism_count: number;
  anomalies_count: number;
  primary_flag: string;
}

export interface InterventionItem {
  id: string;
  student_id: string;
  student_name?: string;
  instructor_id: string;
  instructor_name?: string;
  action_type: string;
  note: string;
  target_date?: string | null;
  status: string;
  outcome: 'open' | 'improved' | 'no_change' | 'deteriorated';
  outcome_note?: string | null;
  risk_score_before?: number | null;
  risk_score_after?: number | null;
  risk_delta?: number | null;
  created_at: string;
  resolved_at?: string | null;
}

// ── Analytics Service ──────────────────────────────────────────────────────────

export const analyticsService = {

  // ── Canonical Student 360 ──────────────────────────────────────────────────
  async getStudent360(studentId: string, scopeLevel?: string, scopeId?: string): Promise<Student360Profile> {
    const params: Record<string, string> = {};
    if (scopeLevel) params.scope_level = scopeLevel;
    if (scopeId) params.scope_id = scopeId;
    const { data } = await apiClient.get<Student360Profile>(`/analytics/student/${studentId}/overview`, { params });
    if (data && (data as any).student) {
      const s = (data as any).student;
      if (!s.full_name && s.name) s.full_name = s.name;
    }
    if (data && (data as any).grades) {
      const g = (data as any).grades;
      if (g.average === undefined && g.avg_grade !== undefined) g.average = g.avg_grade;
      if (!g.recent && g.history) g.recent = g.history;
    }
    if (data && (data as any).risk) {
      const r = (data as any).risk;
      if (r.unified_risk_score === undefined && r.risk_score !== undefined) r.unified_risk_score = r.risk_score;
    }
    return data;
  },

  async getStudentRanks(studentId: string): Promise<Record<string, LeaderboardRankItem>> {
    const { data } = await apiClient.get<{ student_id: string; ranks: Record<string, LeaderboardRankItem> }>(
      `/analytics/student/${studentId}/ranks`
    );
    return data.ranks;
  },

  async getStudentMastery(studentId: string, scopeLevel?: string, scopeId?: string) {
    const params: Record<string, string> = {};
    if (scopeLevel) params.scope_level = scopeLevel;
    if (scopeId) params.scope_id = scopeId;
    const { data } = await apiClient.get(`/analytics/student/${studentId}/mastery`, { params });
    return data;
  },

  async getStudentPrerequisites(studentId: string, subjectId?: string, threshold?: number): Promise<PrerequisiteGraphData> {
    const params: Record<string, string | number> = {};
    if (subjectId) params.subject_id = subjectId;
    if (threshold !== undefined) params.threshold = threshold;
    const { data } = await apiClient.get<PrerequisiteGraphData>(`/analytics/student/${studentId}/prerequisites`, { params });
    return data;
  },

  async getStudentCompletion(studentId: string, scopeLevel?: string, scopeId?: string) {
    const params: Record<string, string> = {};
    if (scopeLevel) params.scope_level = scopeLevel;
    if (scopeId) params.scope_id = scopeId;
    const { data } = await apiClient.get(`/analytics/student/${studentId}/completion`, { params });
    return data;
  },

  async getStudentIntegrity(studentId: string): Promise<IntegrityConfidenceData> {
    const { data } = await apiClient.get<IntegrityConfidenceData>(`/analytics/student/${studentId}/integrity`);
    return data;
  },

  async getStudentForecast(studentId: string): Promise<ForecastData> {
    const { data } = await apiClient.get<ForecastData>(`/analytics/student/${studentId}/forecast`);
    return data;
  },

  async getAttemptReplay(studentId: string, experimentId: string) {
    const { data } = await apiClient.get(`/analytics/attempt-replay/${studentId}/${experimentId}`);
    return data;
  },

  // ── Advanced Cohort Analytics ───────────────────────────────────────────────
  async getStruggleQuadrant(scopeLevel?: string, scopeId?: string): Promise<StruggleQuadrantData> {
    const params: Record<string, string> = {};
    if (scopeLevel) params.scope_level = scopeLevel;
    if (scopeId) params.scope_id = scopeId;
    const { data } = await apiClient.get<StruggleQuadrantData>('/analytics/struggle-quadrant', { params });
    return data;
  },

  async getExperimentErrors(experimentId: string): Promise<ErrorClustersResponse> {
    const { data } = await apiClient.get<ErrorClustersResponse>(`/analytics/error-clusters/${experimentId}`);
    return data;
  },

  async getScopeRankings(scopeLevel = 'section', scopeId?: string, limit = 50): Promise<LeaderboardResponse> {
    const params: Record<string, string | number> = { scope_level: scopeLevel, limit };
    if (scopeId) params.scope_id = scopeId;
    const { data } = await apiClient.get<LeaderboardResponse>('/analytics/rankings/scope', { params });
    return data;
  },

  async getIntegrityReviewQueue(scopeLevel?: string, scopeId?: string): Promise<IntegrityReviewQueueItem[]> {
    const params: Record<string, string> = {};
    if (scopeLevel) params.scope_level = scopeLevel;
    if (scopeId) params.scope_id = scopeId;
    const { data } = await apiClient.get<{ review_queue: IntegrityReviewQueueItem[]; queue?: IntegrityReviewQueueItem[] }>('/analytics/integrity/review-queue', { params });
    return data.queue || data.review_queue || [];
  },

  // ── Interventions Tracking ─────────────────────────────────────────────────
  async createIntervention(payload: {
    student_id: string;
    action_type: string;
    note: string;
    target_date?: string;
  }): Promise<InterventionItem> {
    const { data } = await apiClient.post<InterventionItem>('/analytics/interventions', payload);
    return data;
  },

  async updateInterventionOutcome(
    interventionId: string,
    payload: { outcome: string; outcome_note?: string }
  ): Promise<InterventionItem> {
    const { data } = await apiClient.post<InterventionItem>(`/analytics/interventions/${interventionId}/outcome`, payload);
    return data;
  },

  async listInterventions(studentId?: string): Promise<InterventionItem[]> {
    const params: Record<string, string> = {};
    if (studentId) params.student_id = studentId;
    const { data } = await apiClient.get<{ interventions: InterventionItem[] }>('/analytics/interventions', { params });
    return data.interventions || [];
  },

  // ── Early Warning (Tier 2 Integration) ─────────────────────────────────────
  async getEarlyWarning(sectionSubjectId: string) {
    const { data } = await apiClient.get(`/instructor/tier2/early-warning/${sectionSubjectId}`);
    return data;
  },

  // ── Existing ML & Legacy Methods ───────────────────────────────────────────
  async sendFocusSignals(payload: {
    session_id: string;
    tab_switches_per_min: number;
    idle_seconds: number;
    typing_speed_wpm: number;
    mouse_events_per_min: number;
    copy_paste_count: number;
    focus_time_pct: number;
  }) {
    const { data } = await apiClient.post('/ml/focus-score', payload);
    return data;
  },

  async getMastery() {
    const { data } = await apiClient.get('/student/mastery');
    return data;
  },

  async getWeakConcepts() {
    const { data } = await apiClient.get('/ml/weak-concepts');
    return data;
  },

  async getRankings() {
    const { data } = await apiClient.get('/student/rankings');
    return data;
  },

  async checkPlagiarism(sessionId: string) {
    const { data } = await apiClient.post('/ml/plagiarism-check', { session_id: sessionId });
    return data;
  },

  async getInstitutionAnalytics() {
    const { data } = await apiClient.get('/institution/analytics/overview');
    return data;
  },

  async getPlatformAnalytics() {
    const { data } = await apiClient.get('/platform/analytics/overview');
    return data;
  },
};
