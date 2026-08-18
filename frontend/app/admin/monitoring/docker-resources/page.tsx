'use client';

import type { Metadata } from 'next';
import { useEffect, useState, useCallback } from 'react';
import { executionService, type EngineHealth } from '@/services/execution.service';
import {
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Server,
  Container, Layers, Zap, Clock, ChevronDown, ChevronUp
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
      <CheckCircle2 className="w-3 h-3" />
      {label ?? 'OK'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
      <XCircle className="w-3 h-3" />
      {label ?? 'Error'}
    </span>
  );
}

function EngineBadge({ engine }: { engine: string }) {
  if (engine === 'docker') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
        <Container className="w-3 h-3" />
        Docker
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
      Browser
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DockerResourcesPage() {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showImages, setShowImages] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await executionService.getEngineHealth();
      setHealth(data);
      setLastUpdated(new Date());
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load engine health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Group routing by group
  const grouped = health?.routing.reduce<Record<string, typeof health.routing>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Docker Execution Engine</h1>
          <p className="text-slate-400 text-sm mt-1">
            Sandbox runner health, image presence, and per-language routing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !health && (
        <div className="text-center text-slate-400 py-16 text-sm">Loading engine health…</div>
      )}

      {health && (
        <>
          {/* Status cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Daemon</span>
              </div>
              <StatusBadge ok={health.daemon_ok} label={health.daemon_ok ? `v${health.daemon_version}` : 'Down'} />
            </div>

            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Master Switch</span>
              </div>
              <StatusBadge ok={health.enabled} label={health.enabled ? 'Enabled' : 'Disabled'} />
            </div>

            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Container className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Containers</span>
              </div>
              <div className="text-2xl font-bold text-white">{health.active_containers}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {health.orphan_containers} orphan{health.orphan_containers !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Routing</span>
              </div>
              <div className="text-2xl font-bold text-white">{health.docker_languages}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                languages on Docker
              </div>
            </div>
          </div>

          {/* Per-language routing table */}
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-white">Language Routing</h2>
              {health.overrides && (
                <p className="text-xs text-amber-400 mt-1">
                  Overrides active: <code className="font-mono">{health.overrides}</code>
                </p>
              )}
            </div>
            <div className="divide-y divide-slate-700/30">
              {Object.entries(grouped).map(([group, langs]) => (
                <div key={group}>
                  <div className="px-5 py-2 bg-slate-700/20 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {group}
                  </div>
                  {langs.map(lang => (
                    <div key={lang.id} className="flex items-center px-5 py-3 gap-4 hover:bg-slate-700/20 transition-colors">
                      <div className="w-28 shrink-0">
                        <span className="font-medium text-slate-200 text-sm">{lang.label}</span>
                      </div>
                      <div className="flex-1 text-xs text-slate-500 font-mono">{lang.version}</div>
                      <EngineBadge engine={lang.engine} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Images */}
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            <button
              onClick={() => setShowImages(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-700/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-white">Docker Images</h2>
                {health.missing_images.length > 0 ? (
                  <span className="text-xs font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full">
                    {health.missing_images.length} missing
                  </span>
                ) : (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    All present
                  </span>
                )}
              </div>
              {showImages ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showImages && (
              <div className="border-t border-slate-700/50 divide-y divide-slate-700/30">
                {Object.entries(health.images).map(([img, present]) => (
                  <div key={img} className="flex items-center gap-3 px-5 py-3">
                    {present
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    }
                    <span className="font-mono text-xs text-slate-300">{img}</span>
                  </div>
                ))}
                {health.action && (
                  <div className="px-5 py-3 bg-amber-900/20 border-t border-amber-700/30">
                    <p className="text-xs text-amber-300">
                      <strong>Action required:</strong>{' '}
                      <code className="font-mono">{health.action}</code>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
