import { apiClient } from './api-client';

/** Assist modes offered by the student Compiler page. */
export type CodeAssistMode = 'hint' | 'explain_error' | 'review' | 'ask';

export interface CodeAssistResponse {
  mode: CodeAssistMode;
  answer: string;
  language: string;
  is_fallback: boolean;
  model_used: string | null;
  latency_ms: number;
}

export const aiService = {

  // ── Playground Code Assistant ───────────────────────────────────────────────
  // POST /api/ai/code-assist
  // Standalone help for the Compiler page: no experiment, no grade deduction.
  async codeAssist(payload: {
    mode: CodeAssistMode;
    code: string;
    language: string;
    error?: string;
    stdout?: string;
    question?: string;
  }): Promise<CodeAssistResponse> {
    const { data } = await apiClient.post<CodeAssistResponse>(
      '/ai/code-assist', payload, { timeout: 40_000 },
    );
    return data;
  },

  // ── Progressive 3-Level Hint ────────────────────────────────────────────────
  // POST /api/ai/hint
  // Response: { hint, hint_level, hints_used, deduction_pct, is_fallback, latency_ms }
  async getHint(payload: {
    experiment_id: string;
    session_id?: string;
    hint_level: 1 | 2 | 3;
    code: string;
    error?: string;
    language: string;
  }) {
    const { data } = await apiClient.post('/ai/hint', payload);
    return data;
  },

  // ── Multi-turn Help Chat ────────────────────────────────────────────────────
  // POST /api/ai/chat
  // Response: { response: string }
  async chat(payload: {
    experiment_id?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    language?: string;
  }): Promise<{ response: string }> {
    const { data } = await apiClient.post<{ response: string }>('/ai/chat', payload);
    return data;
  },

  // ── Generate Viva Questions (instructor only) ───────────────────────────────
  // POST /api/ai/viva/generate
  // Response: { viva_session_id, questions: [{ question, expected_topics }] }
  async generateViva(payload: {
    student_id: string;
    experiment_id: string;
    code: string;
    grade_id?: string;
  }) {
    const { data } = await apiClient.post('/ai/viva/generate', payload);
    return data;
  },

  // ── Evaluate a Viva Answer ──────────────────────────────────────────────────
  // POST /api/ai/viva/evaluate
  // Response: { score: 0-10, feedback: string }
  async evaluateVivaAnswer(payload: {
    viva_session_id: string;
    question_index: number;
    question: string;
    answer: string;
    code?: string;
  }) {
    const { data } = await apiClient.post('/ai/viva/evaluate', payload);
    return data;
  },

  // ── Finish Viva Session (instructor) ────────────────────────────────────────
  // POST /api/ai/viva/<viva_session_id>/finish
  async finishViva(vivaSessionId: string) {
    const { data } = await apiClient.post(`/ai/viva/${vivaSessionId}/finish`);
    return data;
  },

  // ── Get Viva Session Record ─────────────────────────────────────────────────
  // GET /api/ai/viva/<viva_session_id>
  async getVivaSession(vivaSessionId: string) {
    const { data } = await apiClient.get(`/ai/viva/${vivaSessionId}`);
    return data;
  },
};
