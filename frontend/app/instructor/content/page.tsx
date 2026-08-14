'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Video, FileText, HelpCircle, Plus, ArrowUp, ArrowDown,
  Trash2, X, ExternalLink,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { instructorService } from '@/services/instructor.service';
import styles from '../shared.module.css';

interface ExpLite { id: string; title: string; exp_number: string }

interface ContentModule {
  id: string;
  module_type: 'text' | 'video' | 'pdf' | 'quiz';
  title: string;
  content_data: Record<string, unknown> | null;
  display_order: number;
  min_watch_pct: number;
  question_count?: number;
}

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Something went wrong';

export default function ContentLibraryPage() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<ExpLite[]>([]);
  const [expId, setExpId] = useState('');
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-module form
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<ContentModule['module_type']>('video');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newHtml, setNewHtml] = useState('');
  const [minWatchPct, setMinWatchPct] = useState(80);

  const toast3 = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load experiments once ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const exps = (await experimentService.listMine()) as ExpLite[];
        setExperiments(exps);
        if (exps.length > 0) setExpId(exps[0].id);
      } catch (err) {
        toast3(errText(err));
      }
    })();
  }, []);

  const loadModules = async (id: string) => {
    setLoading(true);
    try {
      const res = await instructorService.listContent(id);
      setModules(res.content_modules ?? []);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expId) loadModules(expId);
    else setModules([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expId]);

  const handleAdd = async () => {
    if (!expId || !newTitle.trim()) {
      toast3('Title is required');
      return;
    }
    setBusy(true);
    try {
      let content_data: Record<string, unknown> = {};
      if (newType === 'text') content_data = { html: newHtml };
      if (newType === 'video') content_data = { url: newUrl };
      if (newType === 'pdf') content_data = { url: newUrl };
      if (newType === 'quiz') {
        content_data = { pass_threshold: 70, max_attempts: 3, cooldown_minutes: 30, shuffle: true };
      }
      await instructorService.addContentModule(expId, {
        module_type: newType,
        title: newTitle.trim(),
        content_data,
        ...(newType === 'video' ? { min_watch_pct: minWatchPct } : {}),
      });
      toast3('Module added');
      setShowAdd(false);
      setNewTitle(''); setNewUrl(''); setNewHtml('');
      await loadModules(expId);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (m: ContentModule) => {
    if (!window.confirm(`Delete module "${m.title}"?`)) return;
    try {
      await instructorService.deleteContentModule(expId, m.id);
      toast3('Module deleted');
      await loadModules(expId);
    } catch (err) {
      toast3(errText(err));
    }
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const next = [...modules];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setModules(next); // optimistic
    try {
      await instructorService.reorderContent(expId, next.map((m) => m.id));
    } catch (err) {
      toast3(errText(err));
      await loadModules(expId);
    }
  };

  const typeIcon = (t: ContentModule['module_type']) =>
    t === 'video' ? <Video size={20} /> :
    t === 'pdf' ? <FileText size={20} /> :
    t === 'quiz' ? <HelpCircle size={20} /> : <BookOpen size={20} />;

  const typeLabel = (t: ContentModule['module_type']) =>
    t === 'video' ? 'Video' : t === 'pdf' ? 'PDF' : t === 'quiz' ? 'Quiz' : 'Text';

  return (
    <InstructorShell
      activePage="Content Library"
      title="Pre-Lab Content Library"
      subtitle="Manage the text, video, PDF, and quiz modules students must complete before joining a lab session"
    >
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#201b2e',
          color: '#fff', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <select className={styles.select} style={{ maxWidth: 380 }}
          value={expId} onChange={(e) => setExpId(e.target.value)}>
          <option value="">Select an experiment…</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>Exp {e.exp_number} — {e.title}</option>
          ))}
        </select>
        <button type="button" className={styles.primaryBtn} disabled={!expId} onClick={() => setShowAdd(true)}>
          <Plus size={16} strokeWidth={2} /> Add Content Module
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/experiments')}>
          <BookOpen size={16} strokeWidth={1.9} /> Experiment Authoring
        </button>
      </div>

      {/* Module List */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Content Modules</h2>
            <p className={styles.sectionSub}>
              {loading ? 'Loading…' : expId
                ? `${modules.length} module(s) in student completion order`
                : 'Select an experiment to manage its pre-lab content'}
            </p>
          </div>
        </div>

        <div className={styles.list}>
          {modules.map((m, i) => (
            <div key={m.id} className={styles.listRow}>
              <div className={styles.rowIcon}>{typeIcon(m.module_type)}</div>
              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p className={styles.rowTitle}>{i + 1}. {m.title}</p>
                  <span className={`${styles.pill} ${styles.pillBlue}`}>{typeLabel(m.module_type)}</span>
                </div>
                <p className={styles.rowSub}>
                  {m.module_type === 'quiz' && `${m.question_count ?? 0} question(s)`}
                  {m.module_type === 'video' && `Min watch: ${m.min_watch_pct ?? 80}%`}
                  {(m.module_type === 'video' || m.module_type === 'pdf') && typeof m.content_data?.url === 'string'
                    ? ' · URL attached' : ''}
                </p>
              </div>
              <div className={styles.rowSide}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {(m.module_type === 'video' || m.module_type === 'pdf') && typeof m.content_data?.url === 'string' && (
                    <a className={styles.ghostBtn} style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      href={String(m.content_data.url)} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Open
                    </a>
                  )}
                  {m.module_type === 'quiz' && (
                    <button type="button" className={styles.ghostBtn}
                      style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5 }}
                      onClick={() => router.push(`/instructor/experiments/${expId}/edit?tab=content`)}>
                      <HelpCircle size={12} /> Questions
                    </button>
                  )}
                  <button type="button" className={styles.ghostBtn}
                    style={{ minHeight: 32, padding: '0 8px' }}
                    disabled={i === 0} onClick={() => handleMove(i, -1)}>
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" className={styles.ghostBtn}
                    style={{ minHeight: 32, padding: '0 8px' }}
                    disabled={i === modules.length - 1} onClick={() => handleMove(i, 1)}>
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" className={styles.secondaryBtn}
                    style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, color: '#b91c1c' }}
                    onClick={() => handleDelete(m)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!loading && expId && modules.length === 0 && (
            <p className={styles.sectionSub} style={{ padding: 16 }}>
              No content modules yet. Add the first one students must complete before the lab.
            </p>
          )}
        </div>
      </section>

      {/* ADD MODULE MODAL */}
      {showAdd && (
        <div className={styles.modalOverlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Add Content Module</h3>
                <p className={styles.sectionSub}>Appended to the end of the pre-lab sequence</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setShowAdd(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Module Type</label>
                <select className={styles.select} value={newType}
                  onChange={(e) => setNewType(e.target.value as ContentModule['module_type'])}>
                  <option value="video">Video Walkthrough</option>
                  <option value="pdf">PDF Manual</option>
                  <option value="text">Text / Theory</option>
                  <option value="quiz">Pre-Lab Quiz</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title</label>
                <input type="text" className={styles.input} placeholder="e.g. Stack Concept Walkthrough"
                  value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </div>
            </div>

            {(newType === 'video' || newType === 'pdf') && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{newType === 'video' ? 'Video URL (YouTube / Cloudinary)' : 'PDF URL (Cloudinary)'}</label>
                <input type="text" className={styles.input} placeholder="https://…"
                  value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
              </div>
            )}

            {newType === 'video' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Minimum Watch % to pass gate</label>
                <input type="number" className={styles.input} min={1} max={100}
                  value={minWatchPct} onChange={(e) => setMinWatchPct(Number(e.target.value))} />
              </div>
            )}

            {newType === 'text' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Theory Content (HTML)</label>
                <textarea className={styles.textarea} rows={5}
                  placeholder="<p>Theory explanation…</p>"
                  value={newHtml} onChange={(e) => setNewHtml(e.target.value)} />
              </div>
            )}

            {newType === 'quiz' && (
              <p className={styles.sectionSub}>
                Quiz starts with default config (pass 70%, 3 attempts, 30 min cooldown).
                Add questions afterwards from the experiment editor.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleAdd}>
                {busy ? 'Adding…' : 'Add Module'}
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
