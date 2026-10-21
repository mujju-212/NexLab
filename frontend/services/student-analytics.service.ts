import { apiClient } from './api-client';

// ── TypeScript Definitions for Two-Track Student Analytics ──────────────────

export interface UnifiedStudentOverview {
  student_id: string;
  academic: {
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
    ranks: Record<string, {
      position: number;
      cohort_size: number;
      percentile: number;
      rank_score: number;
      components?: Record<string, number>;
    }>;
    standing: {
      band: 'ok' | 'watch' | 'high' | 'critical';
      primary_reason: string;
    };
  };
  platform: {
    rating: number;
    level: number;
    level_name: string;
    global_rank: number | null;
    global_percentile: number | null;
    rank_movement: number;
    problems_solved: number;
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
    streak_days: number;
    badges: Array<{
      id: string;
      badge_type: string;
      earned_at: string;
      title?: string;
      icon?: string;
    }>;
  };
  unlocks: {
    unlocked_tiers: string[];
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
    rating: number;
    next_unlock: {
      tier: string;
      requirement: string;
      current: number;
      target: number;
      progress_pct: number;
    } | null;
  };
  knowledge_map: Array<{
    topic: string;
    academic_score: number | null;
    practice_strength: number | null;
    blended_score: number;
    band: 'Mastered' | 'Proficient' | 'Learning' | 'Developing' | 'Needs Practice' | 'Critical Gap' | string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  highlights: {
    strong_topics: string[];
    focus_topics: string[];
    suggestions: string[];
    next_unlock: {
      tier: string;
      requirement: string;
      current: number;
      target: number;
      progress_pct: number;
    } | null;
  };
  profile?: {
    name: string;
    avatar_url?: string | null;
    roll_number?: string | null;
    department_year: string;
    institution_name: string;
    quote: string;
  };
  summary_kpis?: {
    overall_progress: {
      value: number;
      delta: string;
      sparkline: number[];
    };
    concepts_mastered: {
      mastered: number;
      total: number;
      delta: string;
      bars: number[];
    };
    experiments_completed: {
      completed: number;
      assigned: number;
      pct: number;
    };
    practice_problems_solved: {
      total: number;
      delta: string;
      easy: number;
      medium: number;
      hard: number;
      bars: number[];
    };
  };
  learning_trend?: Array<{
    week: string;
    label: string;
    academic_grade: number;
    practice_rating_scaled: number;
    practice_rating_raw: number;
  }>;
  strongest_concepts?: Array<{
    name: string;
    score: number;
    icon?: string;
  }>;
  focus_next_concepts?: Array<{
    name: string;
    score: number;
    icon?: string;
  }>;
  recent_activity?: Array<{
    id: string;
    title: string;
    category: string;
    type: string;
    status: string;
    status_color?: string;
    score_display: string;
    time_ago: string;
  }>;
  upcoming_goals?: Array<{
    id: string;
    title: string;
    type: string;
    current_display: string;
    progress_pct: number;
    color: string;
  }>;
  achievements?: Array<{
    id: string;
    title: string;
    subtitle: string;
    category: string;
    icon: string;
    badge_color: 'gold' | 'fire' | 'purple' | string;
    value_display: string;
  }>;
}

export interface SubjectAnalyticsItem {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  total_experiments: number;
  completed_experiments: number;
  completion_pct: number;
  subject_average: number;
  experiments: Array<{
    experiment_id: string;
    exp_number: number;
    title: string;
    final_grade: number | null;
    is_completed: boolean;
    weightage: number;
  }>;
}

export interface ScopedMasteryResponse {
  student_id: string;
  subject_id: string | null;
  scope_average: number;
  concepts: Array<{
    concept: string;
    mastery_score: number;
    is_weak: boolean;
    experiment_count: number;
    band?: string;
  }>;
  weak_concepts: string[];
  prerequisite_blocks: Array<{
    concept: string;
    blocked_by: string[];
  }>;
}

export interface UnifiedRanksResponse {
  student_id: string;
  academic: Record<string, {
    position: number;
    cohort_size: number;
    percentile: number;
    rank_score: number;
    components?: {
      mastery: number;
      engagement: number;
      effort: number;
      efficiency: number;
      consistency: number;
    };
  }>;
  platform: {
    rating: number;
    level: number;
    level_name: string;
    global_rank: number | null;
    global_percentile: number | null;
    rank_movement: number;
  };
}

export interface GentleStandingResponse {
  student_id: string;
  status_label: string;
  standing_band: 'ok' | 'watch' | 'high' | 'critical';
  primary_reason: string;
  suggestions: string[];
}

export interface AttendanceRollupResponse {
  scheduled_sessions: number;
  attended_sessions: number;
  attendance_rate: number;
  active_participant_sessions: number;
  active_rate: number;
  sessions?: Array<{
    session_id: string;
    title: string;
    date: string | null;
    status: string;
    attended: boolean;
    is_active: boolean;
  }>;
}

export interface IntegrityTransparencyResponse {
  confidence_score: number;
  risk_label: string;
  proctor_events_count: number;
  events_by_type: Record<string, number>;
  recent_events: Array<{
    event_type: string;
    severity: string;
    created_at: string;
    session_title: string;
  }>;
}

export interface TrendsResponse {
  student_id: string;
  points_count: number;
  grades_trend: Array<{
    index: number;
    experiment_id: string;
    experiment_title: string;
    final_grade: number;
    auto_grade: number | null;
    created_at: string | null;
  }>;
}

export interface ForecastResponse {
  student_id: string;
  historical_points: Array<{ index: number; score: number; label: string }>;
  projected_points: Array<{ index: number; projected: number; lower_95: number; upper_95: number; label: string }>;
  trajectory_slope: number;
  trajectory_status: 'improving' | 'declining' | 'stable';
  confidence_interval_width: number;
}

export interface PracticeMasteryItem {
  topic: string;
  strength: number;
  band: 'Mastered' | 'Proficient' | 'Learning' | 'Needs Practice';
  solved_count: number;
  attempted_count: number;
  by_difficulty: {
    easy: { solved: number; attempted: number };
    medium: { solved: number; attempted: number };
    hard: { solved: number; attempted: number };
  };
}

export interface AcademicLeaderboardItem {
  position: number;
  student_id: string;
  name: string;
  rank_score: number;
  mastery: number;
  engagement: number;
  effort: number;
  efficiency: number;
  consistency: number;
  percentile: number;
  is_current_user?: boolean;
}

export interface AcademicLeaderboardResponse {
  scope_level: string;
  scope_id: string | null;
  cohort_size: number;
  leaderboard: AcademicLeaderboardItem[];
  current_user?: AcademicLeaderboardItem | null;
}

export interface PlatformLeaderboardResponse {
  scope: 'global' | 'topic' | 'institution';
  scope_id: string | null;
  period: 'all_time' | 'monthly' | 'weekly';
  cohort_size: number;
  leaderboard: Array<{
    position: number;
    student_id: string;
    full_name: string;
    avatar_url: string | null;
    rating: number;
    level: number;
    level_name: string;
    problems_solved: number;
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
    percentile: number;
    is_current_user?: boolean;
  }>;
  current_user: {
    position: number | null;
    rating: number;
    percentile: number | null;
  } | null;
}

export interface ContentUnlocksResponse {
  student_id?: string;
  unlocked_tiers: string[];
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  rating: number;
  next_unlock: {
    tier: string;
    requirement: string;
    current: number;
    target: number;
    progress_pct: number;
  } | null;
}

export interface AcademicDashboardResponse {
  student: {
    id: string;
    name: string;
    department_year: string;
    avatar_url: string;
  };
  kpi_metrics: {
    overall_score: number;
    overall_delta: number;
    sparkline_overall: number[];
    subjects_enrolled: number;
    subjects_on_track: number;
    subjects_ring_pct: number;
    experiments_completed: number;
    experiments_total: number;
    experiments_completion_pct: number;
    attendance_rate: number;
    attendance_period: string;
    attendance_mini_bars: number[];
    academic_rank: string;
    rank_position: number;
    rank_cohort: number;
    rank_delta: string;
    rank_percentile_text: string;
    sparkline_rank: number[];
  };
  performance_trend: {
    weeks: string[];
    overall: number[];
    subjects: Array<{
      code: string;
      name: string;
      color: string;
      data: number[];
    }>;
  };
  subject_performance: Array<{
    code: string;
    name: string;
    full_name: string;
    avg_grade: number;
    completed: number;
    total: number;
    completion_pct: number;
    trend_pct: number;
    sparkline: number[];
    color: string;
    bg: string;
    badge_bg: string;
    text_color: string;
  }>;
  concept_mastery: Array<{
    concept: string;
    subject: string;
    mastery: number;
    color: string;
  }>;
  attendance_breakdown: {
    rate: number;
    present: number;
    absent: number;
    excused: number;
    total: number;
    period_label: string;
  };
  risk_and_guidance: {
    status: string;
    status_color: string;
    subtitle: string;
    items: Array<{
      id: string;
      title: string;
      description: string;
      type: 'success' | 'warning' | 'info';
      icon: string;
    }>;
  };
  recent_grades: Array<{
    id: string;
    exp_title: string;
    subject: string;
    auto: string;
    manual: string;
    viva: string;
    final: string;
    final_num: number;
    status: string;
    status_type: 'graded' | 'review';
    date: string;
  }>;
  completion_progress: Array<{
    code: string;
    name: string;
    completed: number;
    total: number;
    completion_pct: number;
    color: string;
  }>;
  filter_options: {
    subjects: Array<{ id: string; label: string }>;
    semesters: Array<{ id: string; label: string }>;
    experiments: Array<{ id: string; label: string }>;
    date_ranges: Array<{ id: string; label: string }>;
  };
}

export interface PlatformDashboardResponse {
  student_profile: {
    id: string;
    name: string;
    department_year: string;
    avatar_url: string;
    quote: string;
  };
  standing: {
    rating: number;
    rating_delta: number;
    sparkline_rating: number[];
    global_rank: number;
    global_percentile: number;
    top_percent: number;
    level: number;
    level_name: string;
    current_xp: number;
    next_level_xp: number;
    streak_days: number;
    week_dots: Array<{ day: string; active: boolean }>;
  };
  badges: Array<{
    id: string;
    title: string;
    subtext: string;
    type: string;
    color: string;
    bg: string;
    badge_text?: string;
    icon?: string;
  }>;
  kpi_metrics: {
    problems_solved: {
      value: number;
      delta: string;
      breakdown: { easy: number; medium: number; hard: number };
      bars: number[];
    };
    acceptance_rate: {
      value: number;
      delta: string;
      sparkline: number[];
    };
    avg_time: {
      value: string;
      delta: string;
      sparkline: number[];
    };
    hints_used: {
      value: number;
      delta: string;
      bars: number[];
    };
  };
  activity_trend: {
    weeks: string[];
    problems_series: number[];
    xp_series: number[];
    max_problems: number;
    max_xp: number;
  };
  difficulty_distribution: {
    total: number;
    easy: { count: number; pct: number; color: string };
    medium: { count: number; pct: number; color: string };
    hard: { count: number; pct: number; color: string };
  };
  topic_performance: {
    strongest: Array<{ topic: string; pct: number; color: string }>;
    needs_focus: Array<{ topic: string; pct: number; color: string }>;
  };
  recent_submissions: Array<{
    id: string;
    problem: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    result: string;
    is_accepted: boolean;
    time: string;
    xp: string;
    date: string;
  }>;
  next_unlocks: Array<{
    id: string;
    title: string;
    current: number;
    target: number;
    pct: number;
    reward: string;
    color: string;
    icon_bg: string;
  }>;
  leaderboard: {
    current_scope: string;
    entries: Array<{
      rank: number;
      name: string;
      initials: string;
      rating: number;
      avatar_color: string;
      is_current_user: boolean;
    }>;
  };
  filter_options: {
    problem_types: Array<{ id: string; label: string }>;
    difficulties: Array<{ id: string; label: string }>;
    topics: Array<{ id: string; label: string }>;
    date_ranges: Array<{ id: string; label: string }>;
  };
}

// ── API Client Methods ───────────────────────────────────────────────────────

export const studentAnalyticsService = {
  /**
   * Fetches the unified two-track overview fusing Academic, Platform, Unlocks, and Blended Knowledge.
   */
  async getOverview(params?: { period?: string }): Promise<UnifiedStudentOverview> {
    const { data } = await apiClient.get<UnifiedStudentOverview>('/student/analytics/overview', { params });
    return data;
  },

  /**
   * Fetches academic performance grouped by enrolled subjects.
   */
  async getSubjects(): Promise<SubjectAnalyticsItem[]> {
    const { data } = await apiClient.get<{ subjects: SubjectAnalyticsItem[] }>('/student/analytics/subjects');
    return data.subjects || [];
  },

  /**
   * Fetches scoped concept mastery with weak spots and prerequisite blockers.
   */
  async getMastery(subjectId?: string): Promise<ScopedMasteryResponse> {
    const params = subjectId ? { subject_id: subjectId } : {};
    const { data } = await apiClient.get<ScopedMasteryResponse>('/student/analytics/mastery', { params });
    return data;
  },

  /**
   * Fetches unified rankings across academic scopes (section, subject, year, dept, inst) and platform rating.
   */
  async getRanks(): Promise<UnifiedRanksResponse> {
    const { data } = await apiClient.get<UnifiedRanksResponse>('/student/analytics/ranks');
    return data;
  },

  /**
   * Fetches gentle health standing and positive pedagogical advice.
   */
  async getStanding(): Promise<GentleStandingResponse> {
    const { data } = await apiClient.get<GentleStandingResponse>('/student/analytics/standing');
    return data;
  },

  /**
   * Fetches attendance and active engagement rates.
   */
  async getAttendance(subjectId?: string): Promise<AttendanceRollupResponse> {
    const params = subjectId ? { subject_id: subjectId } : {};
    const { data } = await apiClient.get<AttendanceRollupResponse>('/student/analytics/attendance', { params });
    return data;
  },

  /**
   * Fetches student's own integrity record (proctoring events transparency).
   */
  async getIntegrity(): Promise<IntegrityTransparencyResponse> {
    const { data } = await apiClient.get<IntegrityTransparencyResponse>('/student/analytics/integrity');
    return data;
  },

  /**
   * Fetches historical performance trajectory.
   */
  async getTrends(): Promise<TrendsResponse> {
    const { data } = await apiClient.get<TrendsResponse>('/student/analytics/trends');
    return data;
  },

  /**
   * Computes trajectory forecast with 95% confidence band.
   */
  async getForecast(): Promise<ForecastResponse> {
    const { data } = await apiClient.get<ForecastResponse>('/student/analytics/forecast');
    return data;
  },

  /**
   * Fetches Track-2 competitive standing (rating, level, streak, badges).
   */
  async getPlatformStanding() {
    const { data } = await apiClient.get('/student/analytics/platform-standing');
    return data;
  },

  /**
   * Fetches practice problem topic strengths and difficulty solve breakdown.
   */
  async getPracticeMastery(): Promise<PracticeMasteryItem[]> {
    const { data } = await apiClient.get<{ topics: PracticeMasteryItem[] }>('/student/analytics/practice-mastery');
    return data.topics || [];
  },

  /**
   * Fetches tiered content access and unlock progression.
   */
  async getContentUnlocks(): Promise<ContentUnlocksResponse> {
    const { data } = await apiClient.get<ContentUnlocksResponse>('/student/analytics/unlocks');
    return data;
  },

  /**
   * Fetches blended competency map (60% Academic + 40% Practice).
   */
  async getKnowledgeMap(): Promise<UnifiedStudentOverview['knowledge_map']> {
    const { data } = await apiClient.get<{ knowledge_map: UnifiedStudentOverview['knowledge_map'] }>('/student/analytics/knowledge-map');
    return data.knowledge_map || [];
  },

  /**
   * Fetches academic holistic leaderboard across institution, department, section, or subject.
   */
  async getAcademicLeaderboard(params?: {
    scope_level?: 'institution' | 'department' | 'section' | 'subject';
    scope_id?: string;
    limit?: number;
  }): Promise<AcademicLeaderboardResponse> {
    const { data } = await apiClient.get<AcademicLeaderboardResponse>('/analytics/leaderboard', { params });
    return data;
  },

  /**
   * Fetches competitive platform leaderboard with scope & period filters.
   */
  async getPlatformLeaderboard(params?: {
    scope?: 'global' | 'topic' | 'institution';
    scope_id?: string;
    period?: 'all_time' | 'monthly' | 'weekly';
    limit?: number;
  }): Promise<PlatformLeaderboardResponse> {
    const { data } = await apiClient.get<PlatformLeaderboardResponse>('/platform/leaderboard', { params });
    return data;
  },

  /**
   * Fetches the comprehensive academic performance analytics dashboard
   * matching the world-class reference mockup.
   */
  async getAcademicDashboard(params?: {
    subject_id?: string;
    semester?: string;
    experiment_id?: string;
    period?: string;
  }): Promise<AcademicDashboardResponse> {
    const { data } = await apiClient.get<AcademicDashboardResponse>(
      '/student/analytics/academic-dashboard',
      { params }
    );
    return data;
  },

  /**
   * Fetches the comprehensive platform practice analytics dashboard
   * matching the world-class reference mockup.
   */
  async getPlatformDashboard(params?: {
    problem_type?: string;
    difficulty?: string;
    topic?: string;
    period?: string;
  }): Promise<PlatformDashboardResponse> {
    const { data } = await apiClient.get<PlatformDashboardResponse>(
      '/student/analytics/platform-dashboard',
      { params }
    );
    return data;
  },

  /**
   * Fetches the comprehensive interactive knowledge map dashboard
   * matching the world-class reference mockup.
   */
  async getKnowledgeMapDashboard(params?: {
    view?: 'blended' | 'academic' | 'practice';
    subject?: string;
    topic?: string;
    period?: string;
  }): Promise<KnowledgeMapDashboardResponse> {
    const { data } = await apiClient.get<KnowledgeMapDashboardResponse>(
      '/student/analytics/knowledge-map-dashboard',
      { params }
    );
    return data;
  },
};

export interface KnowledgeMapConcept {
  id: string;
  name: string;
  domain: string;
  score: number;
  status: 'Strong' | 'Good' | 'Moderate' | 'Weak' | 'Not Started';
  color: string;
  band: 'strong' | 'good' | 'moderate' | 'weak' | 'not_started';
  academic_score: number;
  practice_strength: number;
  blended_score: number;
}

export interface KnowledgeMapDomain {
  id: string;
  name: string;
  score: number;
  color: string;
  concepts: KnowledgeMapConcept[];
}

export interface KnowledgeMapDashboardResponse {
  student_id: string;
  view_mode: 'blended' | 'academic' | 'practice';
  subject_filter: string;
  topic_filter: string;
  period_filter: string;
  kpi_summary: {
    blended_mastery_score: number;
    blended_delta: string;
    concepts_mastered: number;
    total_concepts: number;
    mastery_bars: number[];
    strong_areas_count: number;
    areas_to_improve_count: number;
    not_started_count: number;
  };
  mindmap: {
    root: {
      id: string;
      name: string;
      score: number;
      color: string;
    };
    domains: KnowledgeMapDomain[];
  };
  concept_details: {
    id: string;
    name: string;
    domain: string;
    breadcrumb: string;
    status_badge: string;
    mastery_score: number;
    practice_strength: number;
    academic_strength: number;
    callout_reason: string;
    recommended_steps: Array<{
      step: number;
      title: string;
      action_label: string;
      action_link: string;
    }>;
    practice_stats: {
      attempted: number;
      solved: number;
      acceptance_rate: number;
      avg_time_mins: number;
    };
    experiment_stats: {
      count: number;
      avg_grade: number;
      last_submission: string;
    };
  };
  top_strengths: Array<{
    rank: number;
    name: string;
    concept_name: string;
    subject_code: string;
    score: number;
  }>;
  focus_next: Array<{
    rank: number;
    name: string;
    concept_name: string;
    score: number;
  }>;
  learning_path_unlocks: Array<{
    id: string;
    title: string;
    current_display: string;
    progress_pct: number;
    icon: string;
    color: string;
  }>;
}


