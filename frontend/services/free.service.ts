import { apiClient } from './api-client';

export interface FreeCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  language: string;
  exercise_count: number;
  total_xp?: number;
  is_published: boolean;
  order_index: number;
}

export interface FreeExercise {
  id: string;
  course_id: string;
  order_index: number;
  title: string;
  description: string;
  hint_text: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  exercise_type: 'coding' | 'mcq' | 'reading' | 'simulation';
  allowed_languages: string[];
  starter_code: Record<string, string>;
  test_cases: Array<{ input: string; expected: string; hidden: boolean }>;
  mcq_options?: string[];
  simulation_path?: string;
  xp_reward: number;
  tags?: string[];
  acceptance_rate?: number;
  solves_count?: number;
  solves_display?: string;
  is_solved?: boolean;
  is_attempted?: boolean;
  is_locked?: boolean;
  action_label?: string;
}

export interface CourseUserProgress {
  user_id: string | null;
  solved_count: number;
  attempted_count: number;
  unsolved_count: number;
  earned_xp: number;
  total_xp: number;
  pct_solved: number;
  pct_xp: number;
  solved_ids: string[];
  attempted_ids: string[];
  rank_in_course: number;
  global_rank: number;
  top_percentile: number;
}

export interface TopicSummaryItem {
  name: string;
  solved: number;
  total: number;
  pct: number;
}

export interface RunResult {
  results: Array<{
    input: string; expected: string; output: string;
    passed: boolean; time_ms: number | null; memory_kb: number | null;
    status: string; stderr?: string; compile_output?: string; error?: string;
  }>;
  passed: number;
  total: number;
  score: number;
  all_passed: boolean;
}

export interface SubmitResult {
  passed: number;
  total: number;
  score: number;
  solved: boolean;
  xp_earned: number;
  status: 'solved' | 'attempted';
  results?: Array<{
    input: string; expected: string; output: string;
    passed: boolean; time_ms: number | null; memory_kb: number | null;
    status: string; stderr?: string; compile_output?: string; error?: string;
  }>;
}

export interface Progress {
  total_xp: number;
  total_solved: number;
  by_course: Record<string, { solved: number; attempted: number; xp: number }>;
  records: Array<{ exercise_id: string; course_id: string; status: string; best_score: number; xp_earned: number }>;
}

export const freeService = {
  // Public — no auth needed
  async listCourses(params?: { difficulty?: string; language?: string; tag?: string }) {
    const { data } = await apiClient.get<{ courses: FreeCourse[] }>('/free/courses', { params });
    return data.courses;
  },

  async getCourse(courseId: string): Promise<{
    course: FreeCourse & { estimated_hours?: string; topic_count?: number };
    exercises: FreeExercise[];
    user_progress?: CourseUserProgress;
    topics_summary?: TopicSummaryItem[];
  }> {
    const { data } = await apiClient.get(`/free/courses/${courseId}`);
    return data;
  },

  async getExercise(exerciseId: string): Promise<FreeExercise> {
    const { data } = await apiClient.get<{ exercise: FreeExercise }>(`/free/exercises/${exerciseId}`);
    return data.exercise;
  },

  // Auth required
  async runCode(exerciseId: string, code: string, language: string): Promise<RunResult> {
    const { data } = await apiClient.post<RunResult>(`/free/exercises/${exerciseId}/run`, { code, language });
    return data;
  },

  async submitCode(exerciseId: string, code: string, language: string): Promise<SubmitResult> {
    const { data } = await apiClient.post<SubmitResult>(`/free/exercises/${exerciseId}/submit`, { code, language });
    return data;
  },

  async submitMcq(exerciseId: string, answer: string) {
    const { data } = await apiClient.post(`/free/exercises/${exerciseId}/answer`, { answer });
    return data;
  },

  async completeSimulation(exerciseId: string): Promise<SubmitResult> {
    const { data } = await apiClient.post<SubmitResult>(`/free/exercises/${exerciseId}/complete`);
    return data;
  },

  async getProgress(): Promise<Progress> {
    const { data } = await apiClient.get<Progress>('/free/progress');
    return data;
  },

  async getCourseProgress(courseId: string) {
    const { data } = await apiClient.get(`/free/progress/${courseId}`);
    return data;
  },

  async getLeaderboard(courseId: string) {
    const { data } = await apiClient.get(`/free/leaderboard/${courseId}`);
    return data;
  },

  // ── Free Analytics Redesign (Track 2 Unified Platform) ───────────────────
  async getFreeOverview(): Promise<FreeAnalyticsOverview> {
    const { data } = await apiClient.get<FreeAnalyticsOverview>('/free/analytics/overview');
    return data;
  },

  async getStanding(): Promise<FreePlatformStanding> {
    const { data } = await apiClient.get<FreePlatformStanding>('/free/analytics/standing');
    return data;
  },

  async getActivity(days: number = 365): Promise<FreeActivityData> {
    const { data } = await apiClient.get<FreeActivityData>('/free/analytics/activity', { params: { days } });
    return data;
  },

  async getAccuracy(): Promise<FreeAccuracyData> {
    const { data } = await apiClient.get<FreeAccuracyData>('/free/analytics/accuracy');
    return data;
  },

  async getCoursesAnalytics(): Promise<FreeCoursesAnalytics> {
    const { data } = await apiClient.get<FreeCoursesAnalytics>('/free/analytics/courses');
    return data;
  },

  async getTopicStrength(): Promise<{ topic_strength: FreeTopicMasteryItem[] }> {
    const { data } = await apiClient.get<{ topic_strength: FreeTopicMasteryItem[] }>('/free/analytics/topic-strength');
    return data;
  },

  async getUnlocks(): Promise<FreeUnlocksData> {
    const { data } = await apiClient.get<FreeUnlocksData>('/free/analytics/unlocks');
    return data;
  },

  async getPlatformLeaderboard(params?: { scope?: string; scope_id?: string; period?: string; limit?: number }): Promise<FreeLeaderboardResponse> {
    const { data } = await apiClient.get<FreeLeaderboardResponse>('/free/analytics/leaderboard', { params });
    return data;
  },

  async getRecommendations(limit: number = 5): Promise<{ recommendations: FreeRecommendation[] }> {
    const { data } = await apiClient.get<{ recommendations: FreeRecommendation[] }>('/free/analytics/recommendations', { params: { limit } });
    return data;
  },

  async getShowcase(slug: string): Promise<FreeShowcaseData> {
    const { data } = await apiClient.get<FreeShowcaseData>(`/free/analytics/showcase/${slug}`);
    return data;
  },

  async getMyShowcase(): Promise<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }> {
    const { data } = await apiClient.get<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }>('/free/analytics/showcase/me');
    return data;
  },

  async toggleShowcase(profile_public: boolean): Promise<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }> {
    const { data } = await apiClient.patch<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }>('/free/analytics/showcase', { profile_public });
    return data;
  },

  async getSubmissions(limit: number = 20): Promise<{
    submissions: Array<{
      id: string;
      problem_id: string;
      title: string;
      slug: string;
      difficulty: string;
      nexlab_topic: string;
      status: string;
      is_solved: boolean;
      language: string;
      passed: number;
      total: number;
      time_ms: number;
      memory_kb: number;
      xp_earned: number;
      submitted_at: string;
    }>;
    total: number;
  }> {
    const { data } = await apiClient.get('/free/analytics/submissions', { params: { limit } });
    return data;
  },
};

// ── Types for Free User Analytics ──────────────────────────────────────────

export interface FreeBadgeItem {
  badge_id: string;
  icon: string;
  title: string;
  desc: string;
  earned_at: string | null;
}

export interface FreePlatformStanding {
  student_id: string;
  student_name?: string;
  accuracy?: number;
  rating: number;
  level: number;
  level_name: string;
  total_xp: number;
  next_level_xp: number | null;
  global_rank: number | null;
  global_percentile: number;
  rank_movement: number;
  problems_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  streak_days: number;
  badges: FreeBadgeItem[];
}

export interface FreeDifficultyMix {
  easy: number;
  medium: number;
  hard: number;
  total_solved: number;
  total_attempted: number;
  acceptance_rate: number;
}

export interface FreeTopicMasteryItem {
  topic: string;
  strength: number;
  band: 'Mastered' | 'Proficient' | 'Learning' | 'Needs Practice';
  solved_by_difficulty: {
    Easy: number;
    Medium: number;
    Hard: number;
  };
  total_solved: number;
  total_attempted: number;
  accuracy_pct: number;
}

export interface FreeUnlocksData {
  unlocked_tiers: string[];
  medium_unlocked: boolean;
  hard_unlocked: boolean;
  contests_unlocked: boolean;
  next_unlock: {
    target: string;
    requirement: string;
    current: string;
    progress_pct: number;
  };
  stats: {
    easy_solved: number;
    medium_solved: number;
    rating: number;
    level: number;
  };
}

export interface FreeActivityData {
  heatmap: Array<{
    date: string;
    count: number;
    level: number;
  }>;
  summary: {
    total_active_days: number;
    total_submissions: number;
    current_streak: number;
    longest_streak: number;
    max_daily_count: number;
    most_active_date: string | null;
  };
  solve_trend: Array<{
    date: string;
    cumulative_solved: number;
    new_solves: number;
  }>;
  xp_trend: Array<{
    date: string;
    cumulative_xp: number;
    delta_xp: number;
  }>;
}

export interface FreeAccuracyData {
  acceptance_rate: number;
  first_try_rate: number;
  avg_attempts: number;
  total_attempts: number;
  total_solved: number;
  difficulty_mix: FreeDifficultyMix;
  personal_bests: {
    longest_streak_days: number;
    fastest_solve_ms: number | null;
    hardest_problem_cracked: {
      id: string;
      slug: string;
      title: string;
      difficulty: string;
      acceptance: number;
    } | null;
    most_active_day: {
      date: string | null;
      count: number;
    };
    peak_rating: number;
  };
}

export interface FreeCourseItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty: string;
  tags: string[];
  language: string;
  exercise_count: number;
  solved_count: number;
  attempted_count: number;
  xp_earned: number;
  total_xp_possible: number;
  completion_pct: number;
  cert_eligible: boolean;
  certificate_id: string | null;
  completed_at: string | null;
}

export interface FreeCoursesAnalytics {
  total_courses: number;
  enrolled_courses: number;
  enrolled_this_month?: number;
  completed_courses: number;
  completed_pct?: number;
  active_courses?: number;
  total_exercises_catalog: number;
  total_exercises_solved: number;
  total_course_xp: number;
  overall_completion_pct: number;
  certificates: Array<{
    certificate_id: string;
    course_id: string;
    course_title: string;
    course_slug: string;
    completed_at: string;
    verification_slug: string;
    download_url?: string;
    type?: string;
  }>;
  courses: FreeCourseItem[];
}

export interface FreeAnalyticsOverview {
  standing: FreePlatformStanding;
  difficulty_mix: FreeDifficultyMix;
  topic_strength: FreeTopicMasteryItem[];
  unlocks: FreeUnlocksData;
  activity: FreeActivityData;
  courses: FreeCourseItem[];
  course_summary: {
    enrolled_courses: number;
    completed_courses: number;
    total_exercises_solved: number;
    certificates: Array<{
      certificate_id: string;
      course_id: string;
      course_title: string;
      course_slug: string;
      completed_at: string;
      verification_slug: string;
    }>;
  };
  highlights: string[];
}

export interface FreeLeaderboardResponse {
  scope: string;
  period: string;
  cohort_size: number;
  leaderboard: Array<{
    position: number;
    student_id: string;
    student_name: string;
    avatar_url: string | null;
    profile_slug: string | null;
    rating: number;
    level: number;
    level_name: string;
    problems_solved: number;
    percentile: number;
    streak_days: number;
  }>;
  my_standing: {
    position: number;
    student_id: string;
    student_name: string;
    avatar_url: string | null;
    profile_slug: string | null;
    rating: number;
    level: number;
    level_name: string;
    problems_solved: number;
    percentile: number;
    streak_days: number;
  } | null;
}

export interface FreeRecommendation {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  topic: string;
  acceptance: number;
  reason: string;
}

export interface FreeShowcaseData {
  slug: string;
  display_name: string;
  standing: {
    rating: number;
    level: number;
    level_name: string;
    total_xp: number;
    global_percentile: number;
    streak_days: number;
    problems_solved: number;
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
  };
  badges: FreeBadgeItem[];
  top_topics: FreeTopicMasteryItem[];
  recent_solves: Array<{
    title: string;
    difficulty: string;
    solved_at: string | null;
  }>;
  share_url: string;
}

