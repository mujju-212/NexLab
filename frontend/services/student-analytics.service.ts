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
    band: 'Mastered' | 'Proficient' | 'Learning' | 'Needs Practice';
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

// ── API Client Methods ───────────────────────────────────────────────────────

export const studentAnalyticsService = {
  /**
   * Fetches the unified two-track overview fusing Academic, Platform, Unlocks, and Blended Knowledge.
   */
  async getOverview(): Promise<UnifiedStudentOverview> {
    const { data } = await apiClient.get<UnifiedStudentOverview>('/student/analytics/overview');
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
   * Fetches competitive platform leaderboard with scope & period filters.
   */
  async getPlatformLeaderboard(params: {
    scope?: 'global' | 'topic' | 'institution';
    scope_id?: string;
    period?: 'all_time' | 'monthly' | 'weekly';
    limit?: number;
  }): Promise<PlatformLeaderboardResponse> {
    const { data } = await apiClient.get<PlatformLeaderboardResponse>('/platform/leaderboard', { params });
    return data;
  },
};
