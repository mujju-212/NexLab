import { apiClient } from './api-client';
import type { RunCodeRequest, RunCodeResponse } from '@/types';

/** One entry of the compiler language catalog (GET /api/execution/languages). */
export interface CompilerLanguage {
  id: string;              // canonical id sent back on run, e.g. 'csharp'
  label: string;           // 'C#'
  version: string;         // 'Mono 6.6.0'
  judge0_id: number;
  engine: 'judge0' | 'docker' | 'browser'; // execution engine for this language
  editor_mode: string;     // highlighter profile: python | clike | javascript | sql | shell | r | ruby | php | matlab
  filename: string;        // 'Main.cs' — used for the download filename
  line_comment: string;    // '//' — used by the Ctrl+/ comment toggle
  group: string;           // picker optgroup
  hint: string | null;     // language gotcha shown under the picker
  starter: string;         // starter snippet
}


/** Flattened Judge0 verdict returned by POST /api/execution/playground. */
export interface PlaygroundResult {
  language: string;
  label: string;
  status: string;                 // 'Accepted', 'Compilation Error', …
  status_id: number | null;
  success: boolean;
  is_compile_error: boolean;
  is_runtime_error: boolean;
  stdout: string;
  stderr: string;
  compile_output: string;
  message: string;
  exit_code: number | null;
  exit_signal: number | null;
  time_ms: number;
  memory_kb: number;
}

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

  // ── Compiler: language catalog ──────────────────────────────────────────────
  // GET /api/execution/languages
  // Response: { languages: CompilerLanguage[], groups: string[] }
  async listLanguages(): Promise<{ languages: CompilerLanguage[]; groups: string[] }> {
    const { data } = await apiClient.get<{ languages: CompilerLanguage[]; groups: string[] }>(
      '/execution/languages',
    );
    return data;
  },

  // ── Compiler: free-form run ─────────────────────────────────────────────────
  // POST /api/execution/playground
  // Not tied to an experiment — stores no attempt and never affects a grade.
  // Judge0 polls up to 30s, so this call overrides the client's 15s default.
  async runPlayground(payload: {
    code: string;
    language: string;
    stdin?: string;
  }): Promise<PlaygroundResult> {
    const { data } = await apiClient.post<PlaygroundResult>(
      '/execution/playground', payload, { timeout: 45_000 },
    );
    return data;
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
