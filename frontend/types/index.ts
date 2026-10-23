// ─── User / Auth ──────────────────────────────────────────────────────────────
// Roles match backend JWT payload exactly
export type Role = 'platform_admin' | 'institution_admin' | 'instructor' | 'student' | 'free_user';

export interface User {
  id: string;
  email: string;
  full_name: string;            // backend uses full_name not name
  role: Role;
  institution_id: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Academic Structure ───────────────────────────────────────────────────────
export interface Subject {
  id: string;
  name: string;
  code: string;
  institution_id: string;
  icon?: string;
  description?: string;
  total_marks?: number;
}

export interface SectionSubject {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  description?: string;
  icon?: string;
  subject_icon?: string;
  instructor_id: string;
  total_experiments?: number;
  completed_experiments?: number;
  progress_percentage?: number;
  status?: 'completed' | 'in_progress' | 'not_started';
  concept_tags?: string[];
}

// ─── Experiment ───────────────────────────────────────────────────────────────
export interface Experiment {
  id: string;
  exp_number: number;
  title: string;
  aim: string;
  theory: string;
  problem_statement: string;
  concept_tags: string[];
  subject_id: string;
  institution_id: string;
  is_published: boolean;
  allow_ai_hints: boolean;
  rubric_test_cases: number;
  rubric_lab_report: number;
  rubric_code_quality: number;
  rubric_viva: number;
  created_at: string;
  student_status?: 'completed' | 'in_progress' | 'not_started';
  completed_at?: string | null;
  score?: number | null;
  delivery_mode?: 'lab' | 'exam' | 'practice';
  weightage?: number;
  grade_scale?: number;
  available_from?: string | null;
  due_at?: string | null;
  max_attempts?: number | null;
  pass_threshold?: number | null;
  shuffle_questions?: boolean;
  window_state?: 'always_open' | 'upcoming' | 'active' | 'closed';
}

// ─── Pre-Lab Content ──────────────────────────────────────────────────────────
export interface ContentModule {
  id: string;
  page_id?: string | null;
  type: 'text' | 'video' | 'pdf' | 'quiz' | 'markdown' | 'code' | 'image'
      | 'html' | 'link' | 'file' | 'assign' | 'viva';
  title: string;
  display_order: number;
  completed: boolean;
  score: number | null;
  content_data?: Record<string, unknown>;
  quiz_config?: {
    pass_threshold: number;
    max_attempts: number;
    cooldown_minutes: number;
    shuffle: boolean;
    time_limit_minutes?: number | null;
    attempts_used: number;
    last_attempt_at: string | null;
  };
  viva_config?: {
    pass_threshold: number;
    count: number;
    questions: {
      index: number;
      question: string;
      topics: string[];
      difficulty: string | null;
    }[];
    attempts_used: number;
  };
}

export interface QuizQuestion {
  id: string;
  question_text: string;
  options: Record<string, string>;   // { A: '...', B: '...', C: '...', D: '...' }
  points: number;
}

// ─── Session ──────────────────────────────────────────────────────────────────
// Status values match backend LabSession model exactly
export type SessionStatus = 'scheduled' | 'active' | 'ended';

export interface LabSession {
  id: string;
  experiment_id: string;
  section_subject_id: string;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  status: SessionStatus;
  jitsi_room_name: string | null;
  focus_ml_enabled: boolean;
  lockdown_enabled: boolean;
  catchup_enabled: boolean;
  catchup_deadline: string | null;
  gate_score_threshold: number;
}

// ─── Gate Check Response ───────────────────────────────────────────────────────
// Returned by GET /student/sessions/<id>/check-gate
export interface GateResult {
  gate_passed:      boolean;
  feedback_submitted?: boolean;
  session:          LabSession;
  jitsi_room:       string | null;   // kept for backward compat
  livekit_token:    string | null;   // null when LiveKit is not configured
  livekit_url:      string;          // wss://... or empty string
  focus_ml_enabled: boolean;
  lockdown_enabled: boolean;
  session_status:   string;
  can_join_live:    boolean;
}

// ─── Code Execution ───────────────────────────────────────────────────────────
// Supported language keys (a subset of the catalog in backend app/execution/languages.py)
export type Language = 'python' | 'cpp' | 'c' | 'java' | 'javascript' | 'r';

export interface RunCodeRequest {
  files: { main: string };           // { main: '<source code>' }
  language: Language;
  stdin?: string;
  experiment_id?: string;
  session_id?: string;
  is_final_submission?: boolean;
}

export interface RunCodeResponse {
  status: string;                    // e.g. 'Accepted', 'Runtime Error'
  status_id?: number | null;         // Judge0-compatible verdict code (3 = Accepted)
  stdout: string;
  stderr: string;
  compile_output: string;
  time_ms: number | null;            // wall time in ms (null if runner didn't report)
  memory_kb: number | null;          // peak memory in KB (null when unreadable)
  quality_metrics?: Record<string, unknown>;  // only on is_final_submission
  quality_score?: number;
  test_cases_passed?: number;        // aggregate tests passed (from run result)
  test_cases_total?: number;         // aggregate tests run
  is_final_submission?: boolean;
}

// ─── Grading ──────────────────────────────────────────────────────────────────
export interface Grade {
  id: string;
  auto_grade: number | null;
  manual_grade: number | null;
  manual_feedback: string | null;
  viva_grade: number | null;
  code_quality_grade: number | null;
  hint_deduction: number;
  final_grade: number | null;
  is_locked: boolean;
  graded_at: string | null;
}

// ─── ML / Analytics ───────────────────────────────────────────────────────────
export interface ConceptMastery {
  concept: string;
  mastery_score: number;             // 0–100
  experiment_count: number;
  last_updated: string | null;
}

export interface StudentRanking {
  section_subject_id: string;
  rank_score: number;
  rank_position: number | null;
  components: {
    mastery: number;
    engagement: number;
    effort: number;
    efficiency: number;
    consistency: number;
  };
  updated_at: string | null;
}

export interface FocusScore {
  id: string;
  session_id: string;
  focus_score: number;               // 0–100
  signals: Record<string, number>;
  computed_at: string;
}

// ─── Dashboard Aggregate (from GET /student/dashboard) ───────────────────────
export interface StudentDashboard {
  subjects_enrolled: number;
  upcoming_sessions: LabSession[];
  top_concepts: ConceptMastery[];
  weak_concepts: ConceptMastery[];
  best_rank: StudentRanking | null;
  avg_grade: number | null;
  total_submissions: number;
  unread_notifications: number;
  hints_used_today: number;
  overall_progress?: number;
  daily_streak?: number;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface Notification {
  id: string;
  type: string;                      // session_reminder | grade_published | alert | announcement | catchup_available
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
}
