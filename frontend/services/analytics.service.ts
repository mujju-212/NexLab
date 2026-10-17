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

  async getInstructorOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
  }): Promise<InstructorOverviewData> {
    const { data } = await apiClient.get<InstructorOverviewData>('/instructor/analytics/overview', { params });
    return data;
  },

  async getCohortMatrix(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
  }): Promise<CohortMatrixData> {
    const { data } = await apiClient.get<CohortMatrixData>('/instructor/analytics/cohort-matrix', { params });
    return data;
  },

  async getExperimentsOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
  }): Promise<ExperimentsOverviewData> {
    const { data } = await apiClient.get<ExperimentsOverviewData>('/instructor/analytics/experiments-overview', { params });
    return data;
  },

  async getTrendsOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
  }): Promise<TrendsOverviewData> {
    const { data } = await apiClient.get<TrendsOverviewData>('/instructor/analytics/trends-overview', { params });
    return data;
  },

  async getMasteryOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    subject_id?: string;
    experiment_id?: string;
    days?: number;
  }): Promise<MasteryOverviewData> {
    const { data } = await apiClient.get<MasteryOverviewData>('/instructor/analytics/mastery-overview', { params });
    return data;
  },

  async getEngagementOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
  }): Promise<EngagementOverviewData> {
    const { data } = await apiClient.get<EngagementOverviewData>('/instructor/analytics/engagement-overview', { params });
    return data;
  },

  async getIntegrityOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
    student_id?: string;
  }): Promise<IntegrityOverviewData> {
    const { data } = await apiClient.get<IntegrityOverviewData>('/instructor/analytics/integrity-overview', { params });
    return data;
  },

  async getRankingsOverview(params?: {
    scope?: string;
    section_subject_id?: string;
    section?: string;
    subject?: string;
    days?: number;
    search?: string;
  }): Promise<RankingsOverviewData> {
    const { data } = await apiClient.get<RankingsOverviewData>('/instructor/analytics/rankings-overview', { params });
    return data;
  },

  async getAiUsageOverview(params?: {
    section_subject_id?: string;
    section?: string;
    subject?: string;
    experiment_id?: string;
    days?: number;
    search?: string;
  }): Promise<AiUsageOverviewResponse> {
    const { data } = await apiClient.get<AiUsageOverviewResponse>('/instructor/analytics/ai-usage-overview', { params });
    return data;
  },
};


export interface NeedsAttentionStudent {
  student_id: string;
  student_name: string;
  roll_number: string;
  risk_band: 'critical' | 'high' | 'watch' | 'ok';
  score: number;
  risk_score?: number;
  trend: 'deteriorating' | 'improving' | 'stable';
  trend_points: number[];
  primary_warning_driver: string;
  suggested_action: string;
  email?: string;
}

export interface InstructorOverviewData {
  kpis: {
    active_students: {
      value: number;
      total_enrolled: number;
      delta: number;
      delta_direction: string;
      label: string;
      sparkline: number[];
    };
    class_avg_grade: {
      value: string;
      raw_value: number;
      delta: number;
      delta_direction: string;
      label: string;
      sparkline: number[];
    };
    focus_engagement: {
      value: string;
      raw_value: number;
      delta: number;
      delta_direction: string;
      label: string;
      sparkline: number[];
    };
    needs_attention: {
      value: number;
      total_at_risk: number;
      delta: number;
      delta_direction: string;
      label: string;
      sparkline: number[];
    };
  };
  needs_attention_students: NeedsAttentionStudent[];
  risk_distribution: {
    total_students: number;
    bands: Array<{
      name: string;
      count: number;
      percentage: number;
      color: string;
    }>;
  };
  risk_trend: Array<{
    date: string;
    critical: number;
    high: number;
    watch: number;
  }>;
  struggle_quadrant: {
    medians: { effort: number; outcome: number };
    students: Array<{
      student_id: string;
      student_name: string;
      roll_number: string;
      effort: number;
      outcome: number;
      quadrant: 'thriving' | 'grinding' | 'coasting' | 'disengaged';
    }>;
  };
  quality_distribution: {
    total_submissions: number;
    breakdown: Array<{
      grade: string;
      count: number;
      percentage: number;
      color: string;
    }>;
  };
  filters: {
    sections: Array<{
      section_subject_id: string;
      section_name: string;
      subject_name: string;
      student_count: number;
    }>;
    experiments: Array<{
      experiment_id: string;
      exp_number: number;
      title: string;
      difficulty: string;
    }>;
  };
  all_experiments?: Array<{
    id: string;
    title: string;
    subject_id?: string;
    subject_name?: string;
  }>;
  updated_at: string;
}

export interface CohortStudentItem {
  student_id: string;
  student_name: string;
  roll_number: string;
  email: string;
  initials: string;
  risk_score: number;
  risk_band: 'critical' | 'high' | 'watch' | 'ok';
  primary_reason: string;
  mastery_pct: number;
  mastery_p: number;
  grade_avg: number;
  grade_p: number;
  attendance_rate: number;
  attendance_p: number;
  focus_score: number;
  violations_count: number;
  trend: 'deteriorating' | 'improving' | 'stable';
  trend_points: number[];
  ranks?: {
    experiment_rank: string;
    section_rank: string;
    cohort_rank: string;
  };
  completion?: {
    completed: number;
    total: number;
    pct: number;
  };
  integrity_confidence?: number;
}


export interface CohortMatrixData {
  kpis: {
    students_in_scope: { value: number; total_enrolled: number; delta: string; sparkline: number[] };
    high_critical_risk: { value: number; percentage: string; delta: string; sparkline: number[] };
    cohort_avg_mastery: { value: string; raw_value: number; delta: string; sparkline: number[] };
    avg_grade: { value: string; raw_value: number; delta: string; sparkline: number[] };
    attendance: { value: string; raw_value: number; delta: string; sparkline: number[] };
  };
  risk_distribution: {
    total_students: number;
    bands: Array<{ name: string; count: number; percentage: number; color: string }>;
  };
  risk_breakdown: Array<{ name: string; value: number; color: string }>;
  insights: Array<{ type: string; color: string; text: string }>;
  students: CohortStudentItem[];
  filters: {
    sections: Array<{ id: string; label: string; section_name: string; subject_name: string; student_count: number }>;
    experiments: Array<{ id: string; label: string }>;
    time_windows: Array<{ id: number; label: string }>;
    active_section_id: string;
    active_experiment_id: string;
    active_days: number;
  };
  updated_at: string;
}

export interface ExperimentsOverviewData {
  kpis: {
    avg_final_score: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      sparkline: number[];
    };
    completion_rate: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      sparkline: number[];
    };
    avg_attempts_to_pass: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      sparkline: number[];
    };
    experiments_need_review: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      sparkline: number[];
    };
  };
  score_by_experiment: Array<{
    id: string;
    exp_number: number;
    title: string;
    short_title: string;
    sub_title: string;
    final_score: number;
    auto_grade: number;
    manual_grade: number;
    completion_pct: number;
    avg_attempts: number;
    exec_time: string;
  }>;
  quality_distribution: {
    total_submissions: number;
    breakdown: Array<{
      grade: string;
      count: number;
      percentage: number;
      color: string;
    }>;
  };
  error_patterns: Array<{
    rank: number;
    signature: string;
    count: number;
    percentage: number;
  }>;
  item_metrics: Array<{
    num: number;
    id: string;
    title: string;
    avg_score: string;
    completion: string;
    avg_attempts: string;
    avg_exec_time: string;
    difficulty_badge: {
      label: string;
      type: string;
    };
    sample_size: number;
    sample_badge: {
      label: string;
      is_sufficient: boolean;
    };
  }>;
  updated_at: string;
}

export interface TrendsOverviewData {
  kpis: {
    avg_final_score: {
      value: string;
      delta: string;
      delta_direction: string;
      subtext: string;
      sparkline: number[];
    };
    completion_rate: {
      value: string;
      delta: string;
      delta_direction: string;
      subtext: string;
      sparkline: number[];
    };
    attendance_rate: {
      value: string;
      delta: string;
      delta_direction: string;
      subtext: string;
      sparkline: number[];
    };
    focus_engagement: {
      value: string;
      delta: string;
      delta_direction: string;
      subtext: string;
      sparkline: number[];
    };
    at_risk_students: {
      value: string;
      delta: string;
      delta_direction: string;
      subtext: string;
      sparkline: number[];
    };
  };
  longitudinal_performance: Array<{
    date: string;
    full_date: string;
    class_avg: number | null;
    forecast_avg?: number | null;
    ci_lower: number;
    ci_upper: number;
    completion_avg?: number | null;
    completion_forecast?: number | null;
    completion_ci_lower?: number;
    completion_ci_upper?: number;
    attendance_avg?: number | null;
    attendance_forecast?: number | null;
    attendance_ci_lower?: number;
    attendance_ci_upper?: number;
    focus_avg?: number | null;
    focus_forecast?: number | null;
    focus_ci_lower?: number;
    focus_ci_upper?: number;
    students_count: number;
    is_forecast: boolean;
  }>;
  insights: Array<{
    id: string;
    type: string;
    title: string;
    text: string;
    icon: string;
    color: string;
  }>;
  metric_trends_over_time: Array<{
    date: string;
    final_grade: number;
    completion_rate: number;
    attendance: number;
    focus_score: number;
  }>;
  experiment_performance_trend: Array<{
    experiment_id: string;
    label: string;
    full_title: string;
    experiment_avg: number;
    auto_grade?: number;
    manual_grade?: number;
    overall_trend: number;
  }>;
  students_heatmap: Array<{
    student_id: string;
    student_alias: string;
    full_name: string;
    roll_number: string;
    experiments: Array<{
      exp_num: number;
      exp_label: string;
      exp_title: string;
      score: number;
      attempts?: number;
      color_type: 'green' | 'yellow' | 'orange' | 'red';
      color_code: string;
      status_label: string;
    }>;
  }>;
  updated_at: string;
}

export interface MasteryOverviewData {
  kpis: {
    overall_mastery: {
      value: string;
      raw_value: number;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    mastered_concepts: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    students_at_risk: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    avg_concept_attempts: {
      value: string;
      raw_value?: number;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
  };
  heatmap: {
    columns: string[];
    rows: Array<{
      id: string;
      name: string;
      short_name: string;
      count: number;
      values: number[];
      children?: Array<{
        concept: string;
        mastery: number;
        status: 'mastered' | 'developing' | 'weak';
      }>;
    }>;
    legend: Array<{
      label: string;
      color: string;
      status: string;
    }>;
  };
  prerequisite_graph: {
    nodes: Array<{
      id: string;
      label: string;
      tier: number;
      mastery: number;
      status: 'mastered' | 'developing' | 'weak';
    }>;
    edges: Array<{
      from: string;
      to: string;
    }>;
    key_insight: {
      title: string;
      message: string;
    };
  };
  top_strengths_and_weaknesses: {
    strengths: Array<{
      rank: number;
      concept: string;
      mastery: number;
    }>;
    weaknesses: Array<{
      rank: number;
      concept: string;
      mastery: number;
    }>;
  };
  student_matrix: {
    available_groups: string[];
    default_group: string;
    group_columns: Record<string, string[]>;
    students: Array<{
      student_id: string;
      student_name: string;
      roll_number: string;
      groups: Record<string, Record<string, number>>;
    }>;
  };
  filters: {
    sections: Array<{ id: string; label: string; section_name: string; subject_name: string }>;
    subjects: Array<{ id: string; label: string }>;
    experiments: Array<{ id: string; label: string }>;
    active_section_id: string;
    active_subject_id: string;
    active_experiment_id: string;
    active_days: number;
  };
  updated_at: string;
}

export interface EngagementOverviewData {
  kpis: {
    active_students: {
      value: number;
      total_enrolled: number;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    avg_time_on_task: {
      value: string;
      raw_value: number;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    focus_engagement: {
      value: string;
      raw_value: number;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    high_distraction_sessions: {
      value: number;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
    at_risk_students: {
      value: string;
      delta: string;
      delta_direction: 'up' | 'down' | string;
      label: string;
      sparkline: number[];
    };
  };
  quadrant: {
    medians: {
      effort: number;
      outcome: number;
    };
    counts: {
      thriving: number;
      coasting: number;
      struggling: number;
      disengaged: number;
    };
    students: Array<{
      id: string;
      name: string;
      roll_number: string;
      effort: number;
      outcome: number;
      quadrant: 'thriving' | 'coasting' | 'struggling' | 'disengaged';
      color: string;
    }>;
  };
  trend_over_time: {
    dates: string[];
    series: {
      focus_engagement: number[];
      time_on_task: number[];
      active_coding: number[];
      hint_reliance: number[];
    };
  };
  distribution: {
    total: number;
    segments: Array<{
      label: 'Thriving' | 'Coasting' | 'Struggling' | 'Disengaged' | string;
      count: number;
      percentage: number;
      color: string;
    }>;
  };
  key_insights: Array<{
    id: string;
    type: 'positive' | 'info' | 'warning' | 'danger' | 'highlight' | string;
    icon: string;
    color: string;
    text: string;
  }>;
  student_details: Array<{
    id: string;
    name: string;
    roll_number: string;
    initials: string;
    avatar_color: string;
    status: 'Thriving' | 'Coasting' | 'Struggling' | 'Disengaged';
    engagement_score: number;
    time_on_task: string;
    time_on_task_min: number;
    focus_pct: string;
    focus_pct_num: number;
    hint_reliance: string;
    hint_reliance_num: number;
    tab_switches: number;
    is_high_distraction: boolean;
    trend: number[];
    trend_color: string;
    suggested_action: string;
  }>;
  filters: {
    sections: Array<{ id: string; label: string; section_name: string; subject_name: string }>;
    experiments: Array<{ id: string; label: string }>;
    active_section_id: string;
    active_experiment_id: string;
    active_days: number;
  };
  updated_at: string;
}

export interface IntegrityQueueStudent {
  student_id: string;
  student_name: string;
  roll_number: string;
  avatar: string;
  avatar_color: string;
  section_experiment: string;
  confidence: number | null;
  confidence_color: string;
  evidence_count: number;
  evidence_text: string;
  evidence_types: Array<'document' | 'warning' | 'code' | 'monitor' | string>;
  latest_event: string;
  latest_event_time: string;
  review_status: string;
  review_status_type: 'needs_review' | 'low_evidence' | 'insufficient_data' | string;
  category_tags: string[];
}

export interface IntegrityTimelineEvent {
  id: string;
  time: string;
  date: string;
  title: string;
  severity: 'High' | 'Medium' | 'Low' | 'Info' | string;
  severity_type: 'high' | 'medium' | 'low' | 'info' | string;
  session_tag?: string | null;
  experiment_tag?: string | null;
  description: string;
  icon: 'monitor' | 'document' | 'code' | string;
}

export interface PlagiarismPairItem {
  id: string;
  student_a: string;
  student_b: string;
  experiment: string;
  similarity: number;
  status: string;
  status_type: 'needs_review' | 'under_review' | 'low_priority' | string;
  code_a: string;
  code_b: string;
}

export interface IntegrityOverviewData {
  kpis: {
    integrity_confidence: {
      value: string;
      delta: string;
      direction: 'up' | 'down';
      status: 'positive' | 'warning' | 'danger';
      note: string;
      sparkline: number[];
    };
    review_recommended: {
      value: number;
      delta: string;
      direction: 'up' | 'down';
      status: 'positive' | 'warning' | 'danger';
      note: string;
      sparkline: number[];
    };
    plagiarism_matches: {
      value: number;
      delta: string;
      direction: 'up' | 'down';
      status: 'positive' | 'warning' | 'danger';
      note: string;
      sparkline: number[];
    };
    proctor_events: {
      value: number;
      delta: string;
      direction: 'up' | 'down';
      status: 'positive' | 'warning' | 'danger';
      note: string;
      sparkline: number[];
    };
  };
  review_queue: IntegrityQueueStudent[];
  student_timelines?: Record<string, IntegrityTimelineEvent[]>;
  evidence_mix: {
    total_students: number;
    distribution: Array<{
      name: string;
      count: number;
      percentage: number;
      color: string;
    }>;
    callout_text: string;
    how_it_works: {
      title: string;
      description: string;
    };
  };
  selected_student_timeline: {
    student_id: string;
    student_name: string;
    roll_number: string;
    avatar: string;
    avatar_color: string;
    events: IntegrityTimelineEvent[];
  };
  plagiarism_pairs: PlagiarismPairItem[];
  filters: {
    sections: Array<{ id: string; label: string; section_name: string }>;
    experiments: Array<{ id: string; label: string }>;
    active_section_id: string;
    active_experiment_id: string;
    active_days: number;
  };
  updated_at: string;
}

export interface RankingsPodiumStudent {
  rank: number;
  student_id: string;
  student_name: string;
  roll_number: string;
  avatar: string;
  avatar_color: string;
  rank_score: number;
  max_score: number;
  percentile: number;
  percentile_label: string;
  badge: string;
  podium_theme: 'gold' | 'silver' | 'bronze';
}

export interface ComponentBalanceBreakdown {
  mastery_pct: number;
  engagement_pct: number;
  effort_pct: number;
  efficiency_pct: number;
  consistency_pct: number;
}

export interface RankingsTableRow {
  rank: number;
  student_id: string;
  student_name: string;
  roll_number: string;
  avatar: string;
  avatar_color: string;
  holistic_score: number;
  cohort_percentile: number;
  cohort_percentile_label: string;
  component_balance: ComponentBalanceBreakdown | null;
  insufficient_data: boolean;
  raw_components: {
    mastery: number;
    engagement: number;
    effort: number;
    efficiency: number;
    consistency: number;
  };
}

export interface RankingsOverviewData {
  scope: string;
  scopes: string[];
  total_ranked: number;
  weights: {
    mastery: number;
    engagement: number;
    effort: number;
    efficiency: number;
    consistency: number;
  };
  top_3: RankingsPodiumStudent[];
  students: RankingsTableRow[];
  filters: {
    sections: Array<{ id: string; label: string; section_name: string }>;
    experiments: Array<{ id: string; label: string }>;
    active_section_id: string;
    active_days: number;
  };
  updated_at: string;
}

export interface AiKpiCardData {
  value: string;
  raw_value: number | null;
  label: string;
  subtext: string;
}

export interface AiFeatureItem {
  feature: string;
  name: string;
  color: string;
  count: number;
  tokens: number;
  percentage: number;
}

export interface AiFeatureUtilizationData {
  has_data: boolean;
  features: AiFeatureItem[];
  empty_headline: string;
  empty_subtext: string;
}

export interface AiRelianceEfficacyData {
  has_sufficient_data: boolean;
  empty_headline: string;
  empty_subtext: string;
  avg_grade_ai?: number;
  avg_grade_non_ai?: number;
  delta_pct?: number;
  insight?: string;
}

export interface AiBudgetData {
  is_configured: boolean;
  status: string;
  headline: string;
  subtext: string;
  monthly_token_quota?: number | null;
  tokens_used: number;
  percent_used: number;
}

export interface AiLedgerRow {
  student_id: string;
  student_name: string;
  roll_number: string;
  avatar: string;
  avatar_color: string;
  total_tokens: number;
  total_tokens_formatted: string;
  tokens_per_experiment: number;
  tokens_per_experiment_formatted: string;
  api_requests: number;
  estimated_cost_usd: number;
  estimated_cost_formatted: string;
  usage_trend: 'improving' | 'stable' | 'increasing';
  trend_points: number[];
}

export interface AiUsageOverviewResponse {
  has_data: boolean;
  kpis: {
    total_tokens: AiKpiCardData;
    estimated_cost: AiKpiCardData;
    tokens_per_grade: AiKpiCardData;
    heavy_users: AiKpiCardData;
  };
  feature_utilization: AiFeatureUtilizationData;
  reliance_efficacy: AiRelianceEfficacyData;
  budget: AiBudgetData;
  students_ledger: AiLedgerRow[];
  filters: {
    sections: Array<{ id: string; label: string; section_name: string }>;
    experiments: Array<{ id: string; label: string }>;
    active_section_id: string;
    active_days: number;
  };
  updated_at: string;
}
