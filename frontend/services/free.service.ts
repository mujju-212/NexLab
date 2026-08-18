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
  /** Static HTML lab path for simulation exercises (e.g. '/simulations/...') */
  simulation_path?: string;
  xp_reward: number;
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

  async getCourse(courseId: string): Promise<{ course: FreeCourse; exercises: FreeExercise[] }> {
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
};
