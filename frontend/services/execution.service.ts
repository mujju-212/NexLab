import { apiClient } from './api-client';
import type { RunCodeRequest, RunCodeResponse } from '@/types';

export const executionService = {

  // ── Run Code (authenticated, stores attempt) ────────────────────────────────
  // POST /api/execution/run
  // Request: { files: { main: '<code>' }, language, stdin?, experiment_id?, session_id?, is_final_submission? }
  // Response: { status, stdout, stderr, compile_output, time, memory, quality_metrics?, quality_score? }
  async runCode(payload: RunCodeRequest): Promise<RunCodeResponse> {
    const { data } = await apiClient.post<RunCodeResponse>('/execution/run', payload);
    return data;
  },

  // ── Auto-save Code Version (every 30 seconds) ───────────────────────────────
  // POST /api/execution/save
  // Response: { status: 'saved' }
  async autoSave(payload: {
    experiment_id: string;
    session_id: string;
    files: { main: string };
  }): Promise<void> {
    await apiClient.post('/execution/save', payload);
  },

  // ── Dev-only run (no auth — for testing only) ───────────────────────────────
  // POST /api/execution/run-dev
  // Note: only use in development; uses Judge0 directly without storing attempts
  async runCodeDev(code: string, language: string, stdin = ''): Promise<RunCodeResponse> {
    const { data } = await apiClient.post<RunCodeResponse>('/execution/run-dev', {
      code, language, stdin,
    });
    return data;
  },
};
