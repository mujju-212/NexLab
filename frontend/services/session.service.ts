import { apiClient } from './api-client';
import Cookies from 'js-cookie';

export const sessionService = {

  // ── Instructor: List sessions ─────────────────────────────────────────────────
  // GET /api/instructor/sessions (enriched with experiment/section labels)
  async list() {
    const { data } = await apiClient.get('/instructor/sessions');
    return data;
  },

  // ── Instructor: My teaching assignments (for the schedule wizard) ───────────
  // GET /api/instructor/section-subjects
  async getSectionSubjects() {
    const { data } = await apiClient.get('/instructor/section-subjects');
    return data;
  },

  // ── Instructor: Dashboard aggregates ──────────────────────────────────────────
  // GET /api/instructor/dashboard
  async getDashboard() {
    const { data } = await apiClient.get('/instructor/dashboard');
    return data;
  },

  // ── Instructor: Schedule / Start / End ────────────────────────────────────────
  // POST /api/instructor/sessions
  async schedule(payload: {
    section_subject_id: string;
    experiment_id: string;
    scheduled_at: string;
    duration_minutes?: number;
    gate_score_threshold?: number;
    late_join_window_min?: number;
    focus_ml_enabled?: boolean;
    lockdown_enabled?: boolean;
    catchup_enabled?: boolean;
    catchup_deadline?: string;
  }) {
    const { data } = await apiClient.post('/instructor/sessions', payload);
    return data;
  },

  // POST /api/instructor/sessions/<id>/start
  async start(id: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${id}/start`);
    return data;
  },

  // POST /api/instructor/sessions/<id>/end
  async end(id: string) {
    const { data } = await apiClient.post(`/instructor/sessions/${id}/end`);
    return data;
  },

  // ── Instructor: Live Dashboard ────────────────────────────────────────────────
  // GET /api/instructor/sessions/<id>/dashboard
  async getLiveDashboard(id: string) {
    const { data } = await apiClient.get(`/instructor/sessions/${id}/dashboard`);
    return data;
  },

  // ── Instructor: Attendance ────────────────────────────────────────────────────
  // GET /api/instructor/sessions/<id>/attendance
  async getAttendance(id: string) {
    const { data } = await apiClient.get(`/instructor/sessions/${id}/attendance`);
    return data;
  },

  // GET /api/instructor/sessions/<id>/attendance/summary
  async getAttendanceSummary(id: string) {
    const { data } = await apiClient.get(`/instructor/sessions/${id}/attendance/summary`);
    return data;
  },

  // POST /api/instructor/sessions/<id>/attendance/<student_id>/override
  async overrideAttendance(id: string, studentId: string, status: string, reason: string) {
    const { data } = await apiClient.post(
      `/instructor/sessions/${id}/attendance/${studentId}/override`,
      { status, reason }
    );
    return data;
  },

  // GET /api/instructor/sessions/<id>/attendance/export (authenticated CSV download)
  async exportAttendanceCsv(id: string) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const token = Cookies.get('access_token');
    const res = await fetch(`${base}/instructor/sessions/${id}/attendance/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ── Student: Get My Sessions ──────────────────────────────────────────────────
  // GET /api/student/sessions (handled in studentService)

  // ── Student: Gate Check ───────────────────────────────────────────────────────
  // GET /api/student/sessions/<id>/check-gate (handled in studentService)
};
