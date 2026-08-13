import { apiClient } from './api-client';
import type {
  StudentDashboard, SectionSubject, Experiment,
  ContentModule, QuizQuestion, LabSession, ConceptMastery,
  StudentRanking, Grade, Notification
} from '@/types';

export const studentService = {

  // ── Dashboard ───────────────────────────────────────────────────────────────
  // GET /api/student/dashboard
  async getDashboard(): Promise<StudentDashboard> {
    const { data } = await apiClient.get<StudentDashboard>('/student/dashboard');
    return data;
  },

  // ── Subjects & Experiments ──────────────────────────────────────────────────
  // GET /api/student/subjects
  async getSubjects(): Promise<SectionSubject[]> {
    const { data } = await apiClient.get<{ subjects: SectionSubject[] }>('/student/subjects');
    return data.subjects;
  },

  // GET /api/student/experiments/<subject_id>
  async getExperiments(subjectId: string): Promise<Experiment[]> {
    const { data } = await apiClient.get<{ experiments: Experiment[] }>(`/student/experiments/${subjectId}`);
    return data.experiments;
  },

  // ── Pre-Lab Content ─────────────────────────────────────────────────────────
  // GET /api/student/prelab/<experiment_id>
  async getPreLabContent(experimentId: string): Promise<ContentModule[]> {
    const { data } = await apiClient.get<{ modules: ContentModule[] }>(`/student/prelab/${experimentId}`);
    return data.modules;
  },

  // POST /api/student/prelab/<module_id>/complete  (text/video/pdf)
  async markModuleComplete(moduleId: string): Promise<void> {
    await apiClient.post(`/student/prelab/${moduleId}/complete`);
  },

  // ── Quiz Gate ───────────────────────────────────────────────────────────────
  // GET /api/student/prelab/<module_id>/quiz/start
  async getQuizQuestions(moduleId: string): Promise<QuizQuestion[]> {
    const { data } = await apiClient.get<{ questions: QuizQuestion[] }>(`/student/prelab/${moduleId}/quiz/start`);
    return data.questions;
  },

  // POST /api/student/prelab/<module_id>/quiz/submit
  async submitQuiz(moduleId: string, answers: Record<string, string>) {
    const { data } = await apiClient.post(`/student/prelab/${moduleId}/quiz/submit`, { answers });
    return data; // { score, passed, threshold, attempts_used, correct_count, total_points }
  },

  // GET /api/student/sessions/<session_id>/check-gate
  async checkGate(sessionId: string) {
    const { data } = await apiClient.get(`/student/sessions/${sessionId}/check-gate`);
    return data; // { gate_passed, session, jitsi_room, focus_ml_enabled, lockdown_enabled }
  },

  // ── Sessions ────────────────────────────────────────────────────────────────
  // GET /api/student/sessions
  async getSessions(): Promise<LabSession[]> {
    const { data } = await apiClient.get<{ sessions: LabSession[] }>('/student/sessions');
    return data.sessions;
  },

  // POST /api/student/sessions/<session_id>/catchup
  async startCatchup(sessionId: string) {
    const { data } = await apiClient.post(`/student/sessions/${sessionId}/catchup`);
    return data;
  },

  // ── Grades & Analytics ──────────────────────────────────────────────────────
  // GET /api/student/grades
  async getGrades(): Promise<Grade[]> {
    const { data } = await apiClient.get<{ grades: Grade[] }>('/student/grades');
    return data.grades;
  },

  // GET /api/student/mastery
  async getMastery(): Promise<ConceptMastery[]> {
    const { data } = await apiClient.get<{ mastery: ConceptMastery[] }>('/student/mastery');
    return data.mastery;
  },

  // GET /api/student/rankings
  async getRankings(): Promise<StudentRanking[]> {
    const { data } = await apiClient.get<{ rankings: StudentRanking[] }>('/student/rankings');
    return data.rankings;
  },

  // GET /api/student/history
  async getHistory() {
    const { data } = await apiClient.get<{ history: unknown[] }>('/student/history');
    return data.history;
  },

  // ── Notifications ───────────────────────────────────────────────────────────
  // GET /api/student/notifications
  async getNotifications(): Promise<Notification[]> {
    const { data } = await apiClient.get<{ notifications: Notification[] }>('/student/notifications');
    return data.notifications;
  },

  // ── Anonymous Feedback ──────────────────────────────────────────────────────
  // POST /api/student/feedback
  async submitFeedback(payload: {
    session_id: string;
    experiment_clarity?: number;
    session_pacing?: number;
    ai_hint_helpfulness?: number;
    overall_rating?: number;
    comment?: string;
  }): Promise<void> {
    await apiClient.post('/student/feedback', payload);
  },

  // ── PDF Lab Record ──────────────────────────────────────────────────────────
  // GET /api/student/lab-record/<subject_id>/download
  async getLabRecordUrl(subjectId: string): Promise<string> {
    const { data } = await apiClient.get<{ pdf_url: string }>(`/student/lab-record/${subjectId}/download`);
    return data.pdf_url;
  },
};
