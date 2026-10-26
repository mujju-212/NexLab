import { apiClient } from './api-client';

export interface PlatformCourse {
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

export interface PlatformExercise {
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
  acceptance_rate?: number | null;
  solves_count?: number;
  solves_display?: string;
  is_solved?: boolean;
  is_attempted?: boolean;
  is_locked?: boolean;
  action_label?: string;
}

export interface PlatformCourseLeaderboardItem {
  rank: number;
  user_id: string;
  name: string;
  xp: number;
  solved: number;
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
  rank_in_course: number | null;
  global_rank: number | null;
  top_percentile: number | null;
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

export interface McqSubmitResult {
  correct: boolean;
  your_answer: string;
  correct_answer: string;
  explanation: string | null;
  xp_earned: number;
}

export interface CompletionResult {
  solved: boolean;
  xp_earned: number;
  status: 'solved' | 'attempted';
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

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const memoryCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 35_000; // 35 seconds

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCached<T>(key: string, data: T): T {
  memoryCache.set(key, { data, timestamp: Date.now() });
  return data;
}

export function invalidatePlatformCache(): void {
  memoryCache.clear();
}

export const platformUserService = {
  // Public — no auth needed
  async listCourses(params?: { difficulty?: string; language?: string; tag?: string }) {
    const cacheKey = `courses_${JSON.stringify(params || {})}`;
    const cached = getCached<PlatformCourse[]>(cacheKey);
    if (cached) return cached;

    const { data } = await apiClient.get<{ courses: PlatformCourse[] }>('/platform-user/courses', { params });
    return setCached(cacheKey, data.courses);
  },

  async getCourse(courseId: string): Promise<{
    course: PlatformCourse & { estimated_hours?: string; topic_count?: number };
    exercises: PlatformExercise[];
    user_progress?: CourseUserProgress;
    topics_summary?: TopicSummaryItem[];
  }> {
    const cacheKey = `course_${courseId}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;

    const { data } = await apiClient.get(`/platform-user/courses/${courseId}`);
    return setCached(cacheKey, data);
  },

  async getExercise(exerciseId: string): Promise<PlatformExercise> {
    const { data } = await apiClient.get<{ exercise: PlatformExercise }>(`/platform-user/exercises/${exerciseId}`);
    return data.exercise;
  },

  // Auth required
  async runCode(exerciseId: string, code: string, language: string): Promise<RunResult> {
    const { data } = await apiClient.post<RunResult>(`/platform-user/exercises/${exerciseId}/run`, { code, language });
    return data;
  },

  async submitCode(exerciseId: string, code: string, language: string): Promise<SubmitResult> {
    const { data } = await apiClient.post<SubmitResult>(`/platform-user/exercises/${exerciseId}/submit`, { code, language });
    invalidatePlatformCache();
    return data;
  },

  async submitMcq(exerciseId: string, answer: string): Promise<McqSubmitResult> {
    const { data } = await apiClient.post<McqSubmitResult>(`/platform-user/exercises/${exerciseId}/answer`, { answer });
    invalidatePlatformCache();
    return data;
  },

  async completeSimulation(exerciseId: string): Promise<CompletionResult> {
    const { data } = await apiClient.post<CompletionResult>(`/platform-user/exercises/${exerciseId}/complete`);
    invalidatePlatformCache();
    return data;
  },

  async getProgress(): Promise<Progress> {
    const cacheKey = 'user_progress';
    const cached = getCached<Progress>(cacheKey);
    if (cached) return cached;

    const { data } = await apiClient.get<Progress>('/platform-user/progress');
    return setCached(cacheKey, data);
  },

  async getCourseProgress(courseId: string) {
    const { data } = await apiClient.get(`/platform-user/progress/${courseId}`);
    return data;
  },

  async getLeaderboard(courseId: string): Promise<{ leaderboard: PlatformCourseLeaderboardItem[] }> {
    const { data } = await apiClient.get<{ leaderboard: PlatformCourseLeaderboardItem[] }>(`/platform-user/leaderboard/${courseId}`);
    return data;
  },

  // ── Free Analytics Redesign (Track 2 Unified Platform) ───────────────────
  async getPlatformOverview(): Promise<PlatformAnalyticsOverview> {
    const cacheKey = 'analytics_overview';
    const cached = getCached<PlatformAnalyticsOverview>(cacheKey);
    if (cached) return cached;

    const { data } = await apiClient.get<PlatformAnalyticsOverview>('/platform-user/analytics/overview');
    return setCached(cacheKey, data);
  },

  async getStanding(): Promise<PlatformStanding> {
    const { data } = await apiClient.get<PlatformStanding>('/platform-user/analytics/standing');
    return data;
  },

  async getActivity(days: number = 365): Promise<PlatformActivityData> {
    const { data } = await apiClient.get<PlatformActivityData>('/platform-user/analytics/activity', { params: { days } });
    return data;
  },

  async getAccuracy(): Promise<PlatformAccuracyData> {
    const { data } = await apiClient.get<PlatformAccuracyData>('/platform-user/analytics/accuracy');
    return data;
  },

  async getCoursesAnalytics(): Promise<PlatformCoursesAnalytics> {
    const { data } = await apiClient.get<PlatformCoursesAnalytics>('/platform-user/analytics/courses');
    return data;
  },

  async getTopicStrength(): Promise<{ topic_strength: PlatformTopicMasteryItem[] }> {
    const { data } = await apiClient.get<{ topic_strength: PlatformTopicMasteryItem[] }>('/platform-user/analytics/topic-strength');
    return data;
  },

  async getUnlocks(): Promise<PlatformUnlocksData> {
    const { data } = await apiClient.get<PlatformUnlocksData>('/platform-user/analytics/unlocks');
    return data;
  },

  async getPlatformLeaderboard(params?: { scope?: string; scope_id?: string; period?: string; limit?: number }): Promise<PlatformLeaderboardResponse> {
    const { data } = await apiClient.get<PlatformLeaderboardResponse>('/platform-user/analytics/leaderboard', { params });
    return data;
  },

  async getRecommendations(limit: number = 5): Promise<{ recommendations: PlatformRecommendation[] }> {
    const { data } = await apiClient.get<{ recommendations: PlatformRecommendation[] }>('/platform-user/analytics/recommendations', { params: { limit } });
    return data;
  },

  async getShowcase(slug: string): Promise<PlatformShowcaseData> {
    const { data } = await apiClient.get<PlatformShowcaseData>(`/platform-user/analytics/showcase/${slug}`);
    return data;
  },

  async getMyShowcase(): Promise<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }> {
    const { data } = await apiClient.get<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }>('/platform-user/analytics/showcase/me');
    return data;
  },

  async toggleShowcase(profile_public: boolean): Promise<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }> {
    const { data } = await apiClient.patch<{ profile_public: boolean; profile_slug: string | null; share_url: string | null }>('/platform-user/analytics/showcase', { profile_public });
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
    const { data } = await apiClient.get('/platform-user/analytics/submissions', { params: { limit } });
    return data;
  },
};

// ── Types for Free User Analytics ──────────────────────────────────────────

export interface PlatformBadgeItem {
  badge_id: string;
  icon: string;
  title: string;
  desc: string;
  earned_at: string | null;
}

export interface PlatformStanding {
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
  badges: PlatformBadgeItem[];
}

export interface PlatformDifficultyMix {
  easy: number;
  medium: number;
  hard: number;
  total_solved: number;
  total_attempted: number;
  acceptance_rate: number;
}

export interface PlatformTopicMasteryItem {
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

export interface PlatformUnlocksData {
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

export interface PlatformActivityData {
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

export interface PlatformAccuracyData {
  acceptance_rate: number;
  first_try_rate: number;
  avg_attempts: number;
  total_attempts: number;
  total_solved: number;
  difficulty_mix: PlatformDifficultyMix;
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

export interface PlatformCourseItem {
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

export interface PlatformCoursesAnalytics {
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
  courses: PlatformCourseItem[];
}

export interface PlatformAnalyticsOverview {
  standing: PlatformStanding;
  difficulty_mix: PlatformDifficultyMix;
  topic_strength: PlatformTopicMasteryItem[];
  unlocks: PlatformUnlocksData;
  activity: PlatformActivityData;
  courses: PlatformCourseItem[];
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

export interface PlatformLeaderboardResponse {
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

export interface PlatformRecommendation {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  topic: string;
  acceptance: number;
  reason: string;
}

export interface PlatformShowcaseData {
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
  badges: PlatformBadgeItem[];
  top_topics: PlatformTopicMasteryItem[];
  recent_solves: Array<{
    title: string;
    difficulty: string;
    solved_at: string | null;
  }>;
  share_url: string;
}

