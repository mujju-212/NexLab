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

export interface HarnessGeneratedDoc {
  id: string;
  title: string;
  format: string;
  file_size_bytes: number;
  download_url: string;
  created_at?: string;
}

export interface HarnessSource {
  type: 'document' | 'web';
  filename?: string;
  page?: number;
  text?: string;
  title?: string;
  url?: string;
  snippet?: string;
}

export interface HarnessChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode: 'chat' | 'agent';
  tool_calls?: Array<{ tool: string; args?: Record<string, any>; result?: any; error?: string }>;
  pending_action?: Record<string, any> | null;
  sources?: HarnessSource[];
  generated_doc?: HarnessGeneratedDoc | null;
  socratic_filtered?: boolean;
  total_tokens?: number;
  created_at: string;
  applied?: boolean;
}

export interface HarnessChatSession {
  id: string;
  institution_id?: string | null;
  user_id: string;
  role_scope?: string;
  title: string;
  mode: 'chat' | 'agent';
  is_pinned: boolean;
  compact_memory?: string | null;
  page_context?: Record<string, any>;
  message_count: number;
  last_message?: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface HarnessDocument {
  id: string;
  institution_id?: string | null;
  uploaded_by: string;
  scope_type?: string;
  doc_type?: string;
  filename: string;
  file_size: number;
  page_count: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

export interface HarnessMessageResponse {
  session_id: string;
  session_title: string;
  user_message: HarnessChatMessage;
  assistant_message: HarnessChatMessage;
  pending_action?: Record<string, any> | null;
  generated_doc?: HarnessGeneratedDoc | null;
  socratic_filtered?: boolean;
  sources?: HarnessSource[];
  run_id?: string | null;
}

export const aiService = {

  // ── Unified Multi-Role AI Harness (Student, Free Learner, Instructor, Institution Admin, Platform Admin) ──

  async listHarnessSessions(): Promise<HarnessChatSession[]> {
    const { data } = await apiClient.get<{ sessions: HarnessChatSession[] }>('/ai/harness/sessions');
    return data.sessions || [];
  },

  async createHarnessSession(payload?: {
    title?: string;
    mode?: 'chat' | 'agent';
    page_context?: Record<string, any>;
  }): Promise<HarnessChatSession> {
    const { data } = await apiClient.post<{ session: HarnessChatSession }>('/ai/harness/sessions', payload ?? {});
    return data.session;
  },

  async getHarnessSession(sessionId: string): Promise<{ session: HarnessChatSession; messages: HarnessChatMessage[] }> {
    const { data } = await apiClient.get<{ session: HarnessChatSession; messages: HarnessChatMessage[] }>(
      `/ai/harness/sessions/${sessionId}`
    );
    return data;
  },

  async updateHarnessSession(
    sessionId: string,
    payload: { title?: string; is_pinned?: boolean; page_context?: Record<string, any> }
  ): Promise<HarnessChatSession> {
    const { data } = await apiClient.patch<{ session: HarnessChatSession }>(
      `/ai/harness/sessions/${sessionId}`,
      payload
    );
    return data.session;
  },

  async deleteHarnessSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/ai/harness/sessions/${sessionId}`);
  },

  async sendHarnessMessage(payload: {
    prompt: string;
    mode?: 'chat' | 'agent';
    session_id?: string;
    doc_id?: string;
    web_search?: boolean;
    page_context?: Record<string, any>;
  }): Promise<HarnessMessageResponse> {
    const { data } = await apiClient.post<HarnessMessageResponse>('/ai/harness/message', payload, {
      timeout: 200_000,
    });
    return data;
  },

  async executeHarnessAction(payload: {
    action_payload: Record<string, any>;
    message_id?: string;
  }): Promise<{ success: boolean; result: any }> {
    const { data } = await apiClient.post<{ success: boolean; result: any }>(
      '/ai/harness/actions/execute',
      payload
    );
    return data;
  },

  async listHarnessDocuments(): Promise<HarnessDocument[]> {
    const { data } = await apiClient.get<{ documents: HarnessDocument[] }>('/ai/harness/documents');
    return data.documents || [];
  },

  async uploadHarnessDocument(file: File, scopeType?: string): Promise<{ document: HarnessDocument; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (scopeType) formData.append('scope_type', scopeType);
    const { data } = await apiClient.post<{ success: boolean; document: HarnessDocument; message: string }>(
      '/ai/harness/documents/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }
    );
    return data;
  },

  async deleteHarnessDocument(docId: string): Promise<void> {
    await apiClient.delete(`/ai/harness/documents/${docId}`);
  },

  async downloadGeneratedDocument(docId: string, defaultFilename = 'nexlab_document.md'): Promise<void> {
    const resp = await apiClient.get(`/ai/generated-docs/${docId}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(resp.data);
    const a = document.createElement('a');
    a.href = url;
    const cd = resp.headers['content-disposition'] as string | undefined;
    const match = cd?.match(/filename="?([^";]+)"?/);
    a.download = match?.[1] ?? defaultFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // ── Playground Code Assistant ───────────────────────────────────────────────
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
  async chat(payload: {
    experiment_id?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    language?: string;
  }): Promise<{ response: string }> {
    const { data } = await apiClient.post<{ response: string }>('/ai/chat', payload);
    return data;
  },

  // ── Topic Explainer (P5) ────────────────────────────────────────────────────
  async explainTopic(topic: string): Promise<{ explanation: string; model_used: string | null; is_fallback: boolean }> {
    const { data } = await apiClient.post<{ explanation: string; model_used: string | null; is_fallback: boolean }>(
      '/ai/explain-topic', { topic }, { timeout: 40_000 },
    );
    return data;
  },

  // ── Generate Viva Questions (instructor only) ───────────────────────────────
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
  async finishViva(vivaSessionId: string) {
    const { data } = await apiClient.post(`/ai/viva/${vivaSessionId}/finish`);
    return data;
  },

  // ── Get Viva Session Record ─────────────────────────────────────────────────
  async getVivaSession(vivaSessionId: string) {
    const { data } = await apiClient.get(`/ai/viva/${vivaSessionId}`);
    return data;
  },
};
