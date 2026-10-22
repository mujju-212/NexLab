import { apiClient } from './api-client';

// Note: Code submission = /execution/run with is_final_submission: true
// This service handles instructor-side grading actions only

export const submissionService = {

  // ── Instructor: List final submissions for an experiment ─────────────────────
  // GET /api/instructor/submissions/<experiment_id> (includes student name/roll, code, rubric, grade breakdown)
  async getSubmissions(experimentId: string, sectionId?: string) {
    const params: Record<string, string> = {};
    if (sectionId && sectionId !== 'all') {
      params.section_id = sectionId;
    }
    const { data } = await apiClient.get(`/instructor/submissions/${experimentId}`, { params });
    return data;
  },

  // ── Instructor: Grade a Student's Submission ─────────────────────────────────
  // POST /api/instructor/grades
  // Backend fields: manual_grade (0–100) + manual_feedback.
  // auto_grade is derived server-side from the best code run.
  async gradeSubmission(payload: {
    student_id: string;
    experiment_id: string;
    session_id?: string;
    manual_grade?: number | null;
    manual_feedback?: string;
  }) {
    const { data } = await apiClient.post('/instructor/grades', payload);
    return data;
  },

  // ── Instructor: Inline comment on a grade ────────────────────────────────────
  // POST /api/instructor/grades/<grade_id>/inline-comment
  async addInlineComment(gradeId: string, payload: {
    file_name?: string;
    line_number: number;
    comment: string;
  }) {
    const { data } = await apiClient.post(`/instructor/grades/${gradeId}/inline-comment`, payload);
    return data;
  },

  // ── Instructor: Code replay (all autosaved versions) ─────────────────────────
  // GET /api/instructor/replay/<student_id>/<experiment_id>
  async getReplay(studentId: string, experimentId: string) {
    const { data } = await apiClient.get(`/instructor/replay/${studentId}/${experimentId}`);
    return data;
  },

  // ── Student: Get My Code Attempts ────────────────────────────────────────────
  // GET /api/student/history
  async getMyHistory() {
    const { data } = await apiClient.get('/student/history');
    return data;
  },

  // ── Student: Get My Grades ───────────────────────────────────────────────────
  // GET /api/student/grades
  async getMyGrades() {
    const { data } = await apiClient.get('/student/grades');
    return data;
  },
};
