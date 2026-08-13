import { apiClient } from './api-client';

export const analyticsService = {

  // ── ML: Student Focus Score ──────────────────────────────────────────────────
  // POST /api/ml/focus-score  (signal sent by frontend every 30s)
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
    return data; // { focus_score, label, confidence }
  },

  // ── ML: Student Concept Mastery ─────────────────────────────────────────────
  // GET /api/student/mastery  (JWT-scoped — backend resolves the student)
  async getMastery() {
    const { data } = await apiClient.get('/student/mastery');
    return data; // { mastery: [{ concept, score, ... }] }
  },

  // ── ML: Weak Concepts ───────────────────────────────────────────────────────
  // GET /api/ml/weak-concepts
  async getWeakConcepts() {
    const { data } = await apiClient.get('/ml/weak-concepts');
    return data;
  },

  // ── ML: Student Ranking ─────────────────────────────────────────────────────
  // GET /api/student/rankings  (ml_bp has no rankings route)
  async getRankings() {
    const { data } = await apiClient.get('/student/rankings');
    return data;
  },

  // ── ML: Plagiarism Check (instructor) ──────────────────────────────────────
  // POST /api/ml/plagiarism-check
  async checkPlagiarism(sessionId: string) {
    const { data } = await apiClient.post('/ml/plagiarism-check', { session_id: sessionId });
    return data;
  },

  // ── Institution: High-level Analytics (institution_admin) ──────────────────
  // GET /api/institution/analytics/overview
  async getInstitutionAnalytics() {
    const { data } = await apiClient.get('/institution/analytics/overview');
    return data;
  },

  // ── Admin: Global Analytics (platform_admin) ────────────────────────────────
  // GET /api/platform/analytics/overview  (platform_bp, not admin_bp)
  async getPlatformAnalytics() {
    const { data } = await apiClient.get('/platform/analytics/overview');
    return data;
  },
};
