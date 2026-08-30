import { apiClient } from './api-client';
import type { RunCodeRequest, RunCodeResponse } from '@/types';

/** One entry of the compiler language catalog (GET /api/execution/languages). */
export interface CompilerLanguage {
  id: string;              // canonical id sent back on run, e.g. 'csharp'
  label: string;           // 'C#'
  version: string;         // '.NET 10 / C# 14'
  engine: 'docker' | 'browser'; // execution engine for this language
  editor_mode: string;     // highlighter profile: python | clike | javascript | sql | shell | r | html | css
  filename: string;        // 'Main.cs' — used for the download filename
  line_comment: string;    // '//' — used by the Ctrl+/ comment toggle
  group: string;           // picker optgroup
  hint: string | null;     // language gotcha shown under the picker
  starter: string;         // starter snippet
}


/** Flattened verdict returned by POST /api/execution/playground. */
export interface PlaygroundResult {
  language: string;
  label: string;
  engine: 'docker';               // which engine handled this run
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
  time_ms: number | null;         // null if runner didn't report
  compile_ms: number | null;      // compile phase duration (null if not compiled)
  memory_kb: number | null;       // null when cgroup peak is unreadable (cgroup v1 + WSL)
  truncated?: boolean;            // output was truncated
  image?: string;                 // image used
  images?: string[];              // generated plot images (base64 data URIs)
}

/** Response from GET /api/execution/engine-health */
export interface EngineHealth {
  enabled: boolean;
  daemon_ok: boolean;
  daemon_version: string;
  daemon_error: string;
  ready: boolean;
  images: Record<string, boolean>;
  missing_images: string[];
  action: string | null;
  active_containers: number;
  orphan_containers: number;
  routing: Array<{
    id: string;
    label: string;
    version: string;
    engine: string;
    group: string;
  }>;
  docker_languages: number;
  overrides: string;
}


export const executionService = {

  // ── Run Code (authenticated, stores attempt) ────────────────────────────────
  // POST /api/execution/run
  // Request: { files: { main: '<code>' }, language, stdin?, experiment_id?, session_id?, is_final_submission? }
  // Response: { status, status_id, stdout, stderr, compile_output, time_ms, memory_kb, quality_metrics?, quality_score? }
  async runCode(payload: RunCodeRequest): Promise<RunCodeResponse> {
    const { data } = await apiClient.post<RunCodeResponse>('/execution/run', payload, { timeout: 180_000 });
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
  // Kotlin/JVM compiles can take a few seconds, so this call overrides the
  // client's 15s default with a longer timeout.
  async runPlayground(payload: {
    code: string;
    language: string;
    stdin?: string;
    packages?: string[] | string;
  }): Promise<PlaygroundResult> {
    const { data } = await apiClient.post<PlaygroundResult>(
      '/execution/playground', payload, { timeout: 180_000 },
    );
    return data;
  },

  // ── Engine health (admin only) ───────────────────────────────────────────────
  // GET /api/execution/engine-health
  // Returns Docker engine status, image list, and per-language routing.
  async getEngineHealth(): Promise<EngineHealth> {
    const { data } = await apiClient.get<EngineHealth>('/execution/engine-health');
    return data;
  },
};
