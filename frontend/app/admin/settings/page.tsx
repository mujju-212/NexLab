'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  Zap, Shield, Save, ToggleLeft, ToggleRight, Loader2, Gauge, Wrench
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import styles from './page.module.css';

interface FeatureFlag {
  key: string;
  label: string;
  desc: string;
}

const FLAG_META: FeatureFlag[] = [
  { key: 'ai_hints_enabled',        label: 'AI Hint System',          desc: 'Allow Groq-powered hints and feedback during lab sessions.' },
  { key: 'code_execution_enabled',  label: 'Code Execution (Docker)', desc: 'Allow students to run code against test cases in the sandbox.' },
  { key: 'allow_self_registration', label: 'Self Registration',       desc: 'Allow new institutions/users to register without approval.' },
];

interface QuotaField {
  key: string;
  label: string;
  desc: string;
}

const QUOTA_FIELDS: QuotaField[] = [
  { key: 'groq_daily_limit',          label: 'Groq Daily AI Call Limit',      desc: 'Platform-wide daily cap on AI calls.' },
  { key: 'platform_user_daily_ai_calls',  label: 'Free User Daily AI Calls',      desc: 'Daily AI calls per platform-direct (non-institution) user.' },
  { key: 'max_students_free',         label: 'Max Students — Free Plan',      desc: 'Student seat cap for free-tier institutions.' },
  { key: 'max_students_pro',          label: 'Max Students — Pro Plan',       desc: 'Student seat cap for pro-tier institutions.' },
  { key: 'max_students_enterprise',  label: 'Max Students — Enterprise',     desc: 'Student seat cap for enterprise institutions.' },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Feature flags
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [flagBusy, setFlagBusy] = useState<string | null>(null);

  // Quota config (string values from backend)
  const [quotas, setQuotas] = useState<Record<string, string>>({});
  const [savingQuotas, setSavingQuotas] = useState(false);

  // Maintenance mode
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const flash = (msg: string) => {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    (async () => {
      try {
        const [configRes, flagsRes] = await Promise.all([
          adminService.getPlatformConfig(),
          adminService.getFeatureFlags(),
        ]);
        const cfg = configRes.config || {};
        setQuotas({
          groq_daily_limit: cfg.groq_daily_limit ?? '200',
          platform_user_daily_ai_calls: cfg.platform_user_daily_ai_calls ?? '10',
          max_students_free: cfg.max_students_free ?? '100',
          max_students_pro: cfg.max_students_pro ?? '500',
          max_students_enterprise: cfg.max_students_enterprise ?? '99999',
        });
        setMaintenanceOn((cfg.maintenance_mode ?? 'false') === 'true');
        setMaintenanceMessage(cfg.maintenance_message ?? '');
        setFlags(flagsRes.features || {});
      } catch {
        setError('Could not load platform configuration.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggleFlag = async (key: string) => {
    const next = !flags[key];
    setFlagBusy(key);
    // optimistic update
    setFlags((prev) => ({ ...prev, [key]: next }));
    try {
      await adminService.toggleFeatureFlag(key, next);
      flash(`${key.replace(/_/g, ' ')} ${next ? 'enabled' : 'disabled'}.`);
    } catch {
      setFlags((prev) => ({ ...prev, [key]: !next })); // rollback
      setError(`Failed to update ${key}.`);
    } finally {
      setFlagBusy(null);
    }
  };

  const handleSaveQuotas = async () => {
    setSavingQuotas(true);
    try {
      await adminService.updatePlatformConfig(quotas);
      flash('Quota configuration saved.');
    } catch {
      setError('Failed to save quota configuration.');
    } finally {
      setSavingQuotas(false);
    }
  };

  const handleSaveMaintenance = async () => {
    setSavingMaintenance(true);
    try {
      await adminService.setMaintenance(maintenanceOn, maintenanceMessage);
      flash(`Maintenance mode ${maintenanceOn ? 'enabled' : 'disabled'}.`);
    } catch {
      setError('Failed to update maintenance mode.');
    } finally {
      setSavingMaintenance(false);
    }
  };

  return (
    <AdminShell
      activePage="Settings"
      title="Platform Settings"
      subtitle="Live platform configuration — feature flags, plan quotas, AI limits and maintenance mode"
    >
      {notice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          ✅ {notice}
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '24px 4px' }}>
          <Loader2 size={18} className="spin" /> Loading platform configuration…
        </div>
      ) : (
        <div className={styles.grid}>

          {/* ── Feature Flags ─────────────────────────────────────────── */}
          <div className={`${styles.settingsCard} ${styles.fullWidth}`}>
            <div className={styles.cardHeader}>
              <Zap size={18} strokeWidth={1.9} color="#f59e0b" />
              <h2 className={styles.cardTitle}>Feature Flags</h2>
            </div>
            <div className={styles.toggleGrid}>
              {FLAG_META.map((f) => {
                const value = !!flags[f.key];
                const busy = flagBusy === f.key;
                return (
                  <div key={f.key} className={styles.toggleRow} onClick={() => !busy && handleToggleFlag(f.key)}>
                    <div>
                      <p className={styles.toggleLabel}>{f.label}</p>
                      <p className={styles.toggleDesc}>{f.desc}</p>
                    </div>
                    <button
                      className={`${styles.toggleBtn} ${value ? styles.toggleOn : styles.toggleOff}`}
                      onClick={(e) => { e.stopPropagation(); if (!busy) handleToggleFlag(f.key); }}
                      disabled={busy}
                    >
                      {busy
                        ? <Loader2 size={24} className="spin" />
                        : value
                          ? <ToggleRight size={28} strokeWidth={1.8} />
                          : <ToggleLeft size={28} strokeWidth={1.8} />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Plan Quotas & AI Limits ──────────────────────────────── */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <Gauge size={18} strokeWidth={1.9} color="#7c3aed" />
              <h2 className={styles.cardTitle}>Quotas & AI Limits</h2>
            </div>
            {QUOTA_FIELDS.map((q) => (
              <div key={q.key} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{q.label}</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  value={quotas[q.key] ?? ''}
                  onChange={(e) => setQuotas((prev) => ({ ...prev, [q.key]: e.target.value }))}
                />
                <p style={{ margin: 0, fontSize: '11.5px', color: '#9891a6' }}>{q.desc}</p>
              </div>
            ))}
            <button className={styles.saveBtn} onClick={handleSaveQuotas} disabled={savingQuotas}>
              {savingQuotas
                ? <><Loader2 size={15} className="spin" /> Saving…</>
                : <><Save size={15} strokeWidth={2} /> Save Quotas</>
              }
            </button>
          </div>

          {/* ── Maintenance Mode ─────────────────────────────────────── */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <Wrench size={18} strokeWidth={1.9} color="#ec4899" />
              <h2 className={styles.cardTitle}>Maintenance Mode</h2>
            </div>
            <div
              className={styles.toggleRow}
              onClick={() => setMaintenanceOn((v) => !v)}
              style={{ marginBottom: '14px' }}
            >
              <div>
                <p className={styles.toggleLabel}>Enable Maintenance Mode</p>
                <p className={styles.toggleDesc}>Shows a maintenance banner to all connected users.</p>
              </div>
              <button
                className={`${styles.toggleBtn} ${maintenanceOn ? styles.toggleOn : styles.toggleOff}`}
                onClick={(e) => { e.stopPropagation(); setMaintenanceOn((v) => !v); }}
              >
                {maintenanceOn
                  ? <ToggleRight size={28} strokeWidth={1.8} />
                  : <ToggleLeft size={28} strokeWidth={1.8} />
                }
              </button>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Maintenance Message</label>
              <textarea
                className={styles.input}
                rows={3}
                placeholder="e.g. We are performing scheduled maintenance. Back by 6 PM IST."
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
              />
            </div>
            <button className={styles.saveBtn} onClick={handleSaveMaintenance} disabled={savingMaintenance}>
              {savingMaintenance
                ? <><Loader2 size={15} className="spin" /> Saving…</>
                : <><Shield size={15} strokeWidth={2} /> Save Maintenance Settings</>
              }
            </button>
          </div>

        </div>
      )}
    </AdminShell>
  );
}
