'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experienceService } from '@/services/experience.service';
import styles from '../shared.module.css';

interface SettingsShape {
  default_proctor_policy: Record<string, boolean>;
  default_rubric: Record<string, number>;
  default_session_duration_min: number;
  default_late_join_window_min: number;
  default_gate_threshold: number;
  allow_ai_hints: boolean;
  at_risk_avg_threshold: number;
  at_risk_min_threshold: number;
  notification_prefs: string[];
}

const PROCTOR_FIELDS = [
  { key: 'lockdown_fullscreen', label: 'Lockdown fullscreen' },
  { key: 'block_copy_paste',    label: 'Block copy/paste' },
  { key: 'block_tab_switch',    label: 'Block tab switch' },
  { key: 'plagiarism_scan',     label: 'Plagiarism scan' },
  { key: 'focus_ml',            label: 'Focus ML monitoring' },
  { key: 'webcam_required',     label: 'Webcam required' },
];

const RUBRIC_FIELDS = [
  { key: 'test_cases',   label: 'Test cases (%)' },
  { key: 'lab_report',   label: 'Lab report (%)' },
  { key: 'code_quality', label: 'Code quality (%)' },
  { key: 'viva',         label: 'Viva (%)' },
  { key: 'quiz',         label: 'Quiz (%)' },
];

export default function InstructorSettingsPage() {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await experienceService.getSettings();
      setSettings(s as unknown as SettingsShape);
    } catch { /* keep defaults */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await experienceService.patchSettings(settings as unknown as Record<string, unknown>);
      setSettings(updated as unknown as SettingsShape);
      setNotice('Settings saved. New experiments & sessions will use these defaults.');
      setTimeout(() => setNotice(null), 4000);
    } catch (e: any) {
      setNotice(e?.response?.data?.error || 'Failed to save.');
      setTimeout(() => setNotice(null), 4000);
    }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <InstructorShell activePage="Settings" title="Instructor Settings">
        <div style={{ textAlign: 'center', color: '#9891a6', padding: 40 }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </InstructorShell>
    );
  }

  if (!settings) return null;

  const set = (field: string, value: unknown) =>
    setSettings(prev => prev ? { ...prev, [field]: value } : prev);

  const setProctor = (key: string, value: boolean) =>
    setSettings(prev => prev ? {
      ...prev,
      default_proctor_policy: { ...prev.default_proctor_policy, [key]: value },
    } : prev);

  const setRubric = (key: string, value: number) =>
    setSettings(prev => prev ? {
      ...prev,
      default_rubric: { ...prev.default_rubric, [key]: value },
    } : prev);

  const rubricSum = Object.values(settings.default_rubric || {}).reduce((a, b) => a + (b || 0), 0);

  return (
    <InstructorShell activePage="Settings" title="Instructor Settings"
      subtitle="Defaults that pre-fill new experiments, sessions and proctoring policies">
      <div className={styles.actionRow}>
        <button className={styles.primaryBtn} onClick={save} disabled={saving || rubricSum !== 100}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Settings
        </button>
        {rubricSum !== 100 && (
          <span style={{ fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>
            Rubric must sum to 100 (currently {rubricSum})
          </span>
        )}
      </div>

      {notice && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px',
          borderRadius: 12, marginBottom: 20, color: '#166534', fontSize: 13.5, fontWeight: 600,
        }}>
          {notice}
        </div>
      )}

      <div className={styles.gridTwo}>
        {/* Proctor defaults */}
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Default Proctoring Policy</h2>
          <p className={styles.sectionSub}>Pre-fills the proctoring tab of new experiments</p>
          <div className={styles.list} style={{ marginTop: 14 }}>
            {PROCTOR_FIELDS.map(f => (
              <div key={f.key} className={styles.listRow} style={{ cursor: 'pointer' }}
                onClick={() => setProctor(f.key, !settings.default_proctor_policy[f.key])}>
                <div className={styles.rowBody}><div className={styles.rowTitle}>{f.label}</div></div>
                <div className={styles.rowSide}>
                  <div style={{
                    width: 44, height: 24, borderRadius: 12, padding: 2, transition: 'all .15s',
                    background: settings.default_proctor_policy[f.key] ? '#7c3aed' : '#d1d5db',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'all .15s',
                      marginLeft: settings.default_proctor_policy[f.key] ? '22px' : '2px',
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Rubric defaults */}
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Default Rubric</h2>
          <p className={styles.sectionSub}>Pre-fills the rubric tab of new experiments (must sum to 100)</p>
          {RUBRIC_FIELDS.map(f => (
            <div className={styles.formGroup} key={f.key} style={{ marginTop: 12 }}>
              <label className={styles.formLabel}>{f.label}</label>
              <input
                type="number" className={styles.input}
                value={settings.default_rubric[f.key] ?? 0}
                onChange={e => setRubric(f.key, Number(e.target.value))}
                min={0} max={100}
              />
            </div>
          ))}
          <div style={{ fontSize: 12.5, fontWeight: 700, color: rubricSum === 100 ? '#059669' : '#b91c1c' }}>
            Sum: {rubricSum}/100
          </div>
        </section>

        {/* Session defaults */}
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Session Defaults</h2>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Default Duration (minutes)</label>
            <input type="number" className={styles.input}
              value={settings.default_session_duration_min}
              onChange={e => set('default_session_duration_min', Number(e.target.value))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Default Late-Join Window (minutes)</label>
            <input type="number" className={styles.input}
              value={settings.default_late_join_window_min}
              onChange={e => set('default_late_join_window_min', Number(e.target.value))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Default Pre-Lab Gate Threshold (%)</label>
            <input type="number" className={styles.input}
              value={settings.default_gate_threshold}
              onChange={e => set('default_gate_threshold', Number(e.target.value))} />
          </div>
        </section>

        {/* At-risk + AI */}
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>At-Risk Detection</h2>
          <p className={styles.sectionSub}>Thresholds used by the dashboard Attention panel</p>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Avg mastery below (%)</label>
            <input type="number" className={styles.input}
              value={settings.at_risk_avg_threshold}
              onChange={e => set('at_risk_avg_threshold', Number(e.target.value))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Single-concept minimum (%)</label>
            <input type="number" className={styles.input}
              value={settings.at_risk_min_threshold}
              onChange={e => set('at_risk_min_threshold', Number(e.target.value))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', marginTop: 8 }}>
            <input type="checkbox" checked={settings.allow_ai_hints}
              onChange={e => set('allow_ai_hints', e.target.checked)} />
            <span>Enable AI hints by default</span>
          </label>
        </section>
      </div>
    </InstructorShell>
  );
}
