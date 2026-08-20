import { apiClient } from './api-client';
import type { Experiment } from '@/types';

// Experiments live under instructor blueprint for write ops,
// and under student blueprint for read ops (by subject)

export const experimentService = {

  // ── Student: Read experiments for a subject ─────────────────────────────────
  // GET /api/student/experiments/<subject_id>
  async getBySubject(subjectId: string): Promise<Experiment[]> {
    const { data } = await apiClient.get<{ experiments: Experiment[] }>(
      `/student/experiments/${subjectId}`
    );
    return data.experiments;
  },

  // ── Instructor: List my experiments ─────────────────────────────────────────
  // GET /api/instructor/experiments?subject_id=
  async listMine(subjectId?: string): Promise<unknown[]> {
    const { data } = await apiClient.get<{ experiments: unknown[] }>(
      '/instructor/experiments', { params: subjectId ? { subject_id: subjectId } : {} }
    );
    return data.experiments;
  },

  // ── Instructor: Create experiment ───────────────────────────────────────────
  // POST /api/instructor/experiments
  async create(payload: Record<string, unknown>): Promise<unknown> {
    const { data } = await apiClient.post<{ experiment: unknown }>(
      '/instructor/experiments', payload
    );
    return data.experiment;
  },

  // ── Instructor: Update experiment ───────────────────────────────────────────
  // PATCH /api/instructor/experiments/<id>  (backend only accepts PATCH)
  async update(id: string, payload: Record<string, unknown>): Promise<unknown> {
    const { data } = await apiClient.patch<{ experiment: unknown }>(
      `/instructor/experiments/${id}`, payload
    );
    return data.experiment;
  },

  // ── Instructor: Publish / unpublish (via PATCH is_published) ────────────────
  async setPublished(id: string, is_published: boolean): Promise<unknown> {
    const { data } = await apiClient.patch<{ experiment: unknown }>(
      `/instructor/experiments/${id}`, { is_published }
    );
    return data.experiment;
  },

  // ── Instructor: Delete experiment ───────────────────────────────────────────
  // DELETE /api/instructor/experiments/<id>
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/instructor/experiments/${id}`);
  },

  // ── Instructor: Test cases ──────────────────────────────────────────────────
  // GET /api/instructor/experiments/<id>/test-cases
  async getTestCases(id: string): Promise<unknown[]> {
    const { data } = await apiClient.get<{ test_cases: unknown[] }>(
      `/instructor/experiments/${id}/test-cases`
    );
    return data.test_cases;
  },

  // POST /api/instructor/experiments/<id>/test-cases  (single or batch)
  async addTestCases(id: string, cases: Record<string, unknown> | Record<string, unknown>[]) {
    const { data } = await apiClient.post<{ created: number }>(
      `/instructor/experiments/${id}/test-cases`, cases
    );
    return data.created;
  },

  // ── Instructor: Generate test cases via Groq ────────────────────────────────
  // POST /api/instructor/experiments/<id>/generate-test-cases
  async generateTestCases(id: string, count = 6): Promise<{ generated: number; test_cases: unknown[] }> {
    const { data } = await apiClient.post<{ generated: number; test_cases: unknown[] }>(
      `/instructor/experiments/${id}/generate-test-cases`, { count }
    );
    return data;
  },

  // ── Instructor: Preview-generate test cases (no experiment id yet) ───────────
  // POST /api/instructor/experiments/generate-test-cases-preview
  // Generates from a raw problem statement WITHOUT persisting — used by the
  // create page, where the experiment does not exist yet. The caller stages the
  // returned rows and saves them via addTestCases() once the experiment is made.
  async previewTestCases(payload: {
    problem_statement: string;
    input_format?: string;
    output_format?: string;
    count?: number;
  }): Promise<{ test_cases: Array<{ input: string; expected_output: string; description?: string; is_hidden?: boolean }>; count: number }> {
    const { data } = await apiClient.post<{ test_cases: Array<{ input: string; expected_output: string; description?: string; is_hidden?: boolean }>; count: number }>(
      '/instructor/experiments/generate-test-cases-preview', payload
    );
    return data;
  },
};
