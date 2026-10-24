'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Container, Layers, RefreshCw,
  Server, XCircle, Zap,
} from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import AdminMonitoringTabs from '@/components/layout/AdminMonitoringTabs';
import { executionService, type EngineHealth } from '@/services/execution.service';
import styles from './engine.module.css';

function StatusPill({ ok, goodLabel, badLabel }: { ok: boolean; goodLabel: string; badLabel: string }) {
  return (
    <span className={`${styles.pill} ${ok ? styles.good : styles.bad}`}>
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      {ok ? goodLabel : badLabel}
    </span>
  );
}

export default function DockerResourcesPage() {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await executionService.getEngineHealth();
      setHealth(data);
      setLastUpdated(new Date());
      setError('');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error ?? err?.message ?? 'Could not load execution-engine health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const timer = window.setInterval(() => void fetchHealth(), 30_000);
    return () => window.clearInterval(timer);
  }, [fetchHealth]);

  const grouped = (health?.routing ?? []).reduce<Record<string, EngineHealth['routing']>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});
  const imageEntries = Object.entries(health?.images ?? {});

  return (
    <AdminShell
      activePage="System Monitoring"
      title="Execution Resources"
      subtitle="Execution daemon status, container load, language routing, and configured images."
    >
      <AdminMonitoringTabs active="execution" />
      <div className={styles.page}>
        <div className={styles.toolbar}>
          {lastUpdated && (
            <span className={styles.updated}>
              <Clock size={13} /> Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button type="button" className={styles.refresh} onClick={() => void fetchHealth()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh status
          </button>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading && !health && (
          <div className={styles.loading} aria-label="Loading execution health">
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        )}

        {health && (
          <>
            {!health.ready && (
              <div className={styles.warning} role="status">
                <AlertTriangle size={16} />
                <span>
                  The execution service is not ready. Check daemon connectivity, the execution toggle, and the image list below.
                  {health.daemon_error ? ` Detail: ${health.daemon_error}` : ''}
                </span>
              </div>
            )}

            <div className={styles.stats}>
              <article className={styles.card}>
                <p className={styles.cardLabel}><Server size={14} /> Daemon</p>
                <StatusPill ok={health.daemon_ok} goodLabel={`Online · ${health.daemon_version || 'version unavailable'}`} badLabel="Unavailable" />
              </article>
              <article className={styles.card}>
                <p className={styles.cardLabel}><Zap size={14} /> Execution switch</p>
                <StatusPill ok={health.enabled} goodLabel="Enabled" badLabel="Disabled" />
              </article>
              <article className={styles.card}>
                <p className={styles.cardLabel}><Container size={14} /> Containers</p>
                <p className={styles.cardValue}>{health.active_containers}</p>
                <p className={styles.cardDetail}>{health.orphan_containers} orphan container{health.orphan_containers === 1 ? '' : 's'}</p>
              </article>
              <article className={styles.card}>
                <p className={styles.cardLabel}><Layers size={14} /> Docker-routed languages</p>
                <p className={styles.cardValue}>{health.docker_languages}</p>
                <p className={styles.cardDetail}>From configured compiler routing</p>
              </article>
            </div>

            <div className={styles.grid}>
              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Language routing</h2>
                    <p className={styles.panelSub}>Engine and version reported for each configured language.</p>
                  </div>
                  {health.overrides && <span className={styles.pill + ' ' + styles.neutral}>Overrides active</span>}
                </header>
                {health.overrides && <p className={styles.action}>Routing overrides: <code>{health.overrides}</code></p>}
                {Object.keys(grouped).length === 0 ? (
                  <div className={styles.empty}>No language routing data was returned.</div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Language group</th><th>Language</th><th>Version</th><th>Engine</th></tr></thead>
                      <tbody>
                        {Object.entries(grouped).flatMap(([group, languages]) => languages.map((language, index) => (
                          <tr key={language.id}>
                            <td>{index === 0 ? group : ''}</td>
                            <td>{language.label}</td>
                            <td className={styles.mono}>{language.version || '—'}</td>
                            <td><span className={`${styles.pill} ${language.engine === 'docker' ? styles.neutral : styles.good}`}>{language.engine}</span></td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Configured images</h2>
                    <p className={styles.panelSub}>Presence checks returned by the execution service.</p>
                  </div>
                  <span className={`${styles.pill} ${(health.missing_images ?? []).length ? styles.bad : styles.good}`}>
                    {(health.missing_images ?? []).length ? `${health.missing_images.length} missing` : 'All present'}
                  </span>
                </header>
                {imageEntries.length === 0 ? (
                  <div className={styles.empty}>No image status data was returned.</div>
                ) : (
                  <div className={styles.imageList}>
                    {imageEntries.map(([image, present]) => (
                      <div className={styles.imageRow} key={image}>
                        {present ? <CheckCircle2 size={15} color="#059669" /> : <XCircle size={15} color="#dc2626" />}
                        <span className={styles.imageName}>{image}</span>
                      </div>
                    ))}
                  </div>
                )}
                {health.action && <p className={styles.action}><strong>Suggested action:</strong> <code>{health.action}</code></p>}
              </section>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
