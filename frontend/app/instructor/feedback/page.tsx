'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare, Star, Loader2, Building2, Calendar, Layers,
  Users, BookOpen, PlayCircle, Search, Filter, Download
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { sessionService } from '@/services/session.service';
import { instructorService } from '@/services/instructor.service';
import { exportCSV } from '@/lib/analytics-utils';

interface SectionSubjectItem {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  department_id?: string | null;
  department_name?: string;
  department_code?: string;
  academic_year?: string;
  batch_id?: string | null;
  batch_name?: string;
  section_id: string;
  section_name: string;
  student_count: number;
}

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(2);

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function FeedbackPage() {
  // ── 6-Level Cascading Hierarchy Filters ──────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data: ssData } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const sectionSubjects: SectionSubjectItem[] = useMemo(
    () => (ssData?.section_subjects as SectionSubjectItem[]) ?? [],
    [ssData]
  );

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      const code = ss.department_code || ss.department_name;
      if (code) map.set(code, ss.department_name || code);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [sectionSubjects]);

  const academicYears = useMemo(() => {
    const set = new Set<string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (ss.academic_year) set.add(ss.academic_year);
    });
    return Array.from(set);
  }, [sectionSubjects, selectedDept]);

  const availableBatches = useMemo(() => {
    const map = new Map<string, string>();
    sectionSubjects.forEach(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return;
      if (ss.batch_id && ss.batch_name) map.set(ss.batch_id, ss.batch_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sectionSubjects, selectedDept, selectedYear]);

  const availableSections = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.section_id === curr.section_id)) {
        acc.push({ section_id: curr.section_id, section_name: curr.section_name, batch_name: curr.batch_name });
      }
      return acc;
    }, [] as Array<{ section_id: string; section_name: string; batch_name?: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch]);

  const availableSubjects = useMemo(() => {
    return sectionSubjects.filter(ss => {
      if (selectedDept !== 'all' && (ss.department_code || ss.department_name) !== selectedDept) return false;
      if (selectedYear !== 'all' && ss.academic_year !== selectedYear) return false;
      if (selectedBatch !== 'all' && ss.batch_id !== selectedBatch) return false;
      if (selectedSection !== 'all' && ss.section_id !== selectedSection) return false;
      return true;
    }).reduce((acc, curr) => {
      if (!acc.some(s => s.subject_id === curr.subject_id)) {
        acc.push({ subject_id: curr.subject_id, subject_name: curr.subject_name, subject_code: curr.subject_code });
      }
      return acc;
    }, [] as Array<{ subject_id: string; subject_name: string; subject_code: string }>);
  }, [sectionSubjects, selectedDept, selectedYear, selectedBatch, selectedSection]);

  // Fetch Hierarchical Feedback Overview from Backend
  const { data: overview, isLoading } = useQuery({
    queryKey: [
      'instructor',
      'feedback-overview',
      selectedDept,
      selectedYear,
      selectedBatch,
      selectedSection,
      selectedSubject,
      selectedSession,
    ],
    queryFn: () =>
      instructorService.getFeedbackOverview({
        department_id: selectedDept !== 'all' ? selectedDept : undefined,
        academic_year: selectedYear !== 'all' ? selectedYear : undefined,
        batch_id: selectedBatch !== 'all' ? selectedBatch : undefined,
        section_id: selectedSection !== 'all' ? selectedSection : undefined,
        subject_id: selectedSubject !== 'all' ? selectedSubject : undefined,
        session_id: selectedSession !== 'all' ? selectedSession : undefined,
      }),
    staleTime: 30 * 1000,
  });

  const sessionsSummary = overview?.sessions_summary ?? [];
  const avgs = overview?.averages;

  const filteredComments = useMemo(() => {
    const all = overview?.feedback ?? [];
    return all.filter(item => {
      const r = item.overall_rating ?? 0;
      if (ratingFilter === 'high' && r < 4.5) return false;
      if (ratingFilter === 'mid' && (r < 3 || r >= 4.5)) return false;
      if (ratingFilter === 'low' && r >= 3) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (item.comment || '').toLowerCase().includes(q) ||
          (item.experiment_title || '').toLowerCase().includes(q) ||
          (item.subject_name || '').toLowerCase().includes(q) ||
          (item.section_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [overview?.feedback, ratingFilter, searchQuery]);

  const handleExportFeedbackCSV = () => {
    if (!overview || overview.feedback.length === 0) return;
    const rows = overview.feedback.map(f => ({
      'Department': f.department_code || '—',
      'Academic Year': f.academic_year || '—',
      'Batch': f.batch_name || '—',
      'Section': f.section_name || '—',
      'Subject': f.subject_name || '—',
      'Experiment / Session': f.experiment_title,
      'Overall Rating (/5)': f.overall_rating ?? '—',
      'Experiment Clarity (/5)': f.experiment_clarity ?? '—',
      'Session Pacing (/5)': f.session_pacing ?? '—',
      'AI Hint Helpfulness (/5)': f.ai_hint_helpfulness ?? '—',
      'Student Comment': f.comment || '',
      'Submitted At': f.submitted_at ? fmtDate(f.submitted_at) : '—',
    }));
    exportCSV(rows, `student-feedback-sentiment-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <InstructorShell
      activePage="Feedback"
      title="Student Feedback & Multi-Cohort Sentiment"
      subtitle="Analyze post-session student ratings and anonymous feedback across departments, academic years, batches, sections, and subjects."
    >
      {/* ═══ 6-LEVEL CASCADING HIERARCHY FILTER BAR ═══ */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 18,
        boxShadow: '0 4px 16px rgba(15,23,42,0.03)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12, alignItems: 'center' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Building2 size={12} color="#7c3aed" /> Department
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedDept} onChange={e => { setSelectedDept(e.target.value); setSelectedYear('all'); setSelectedBatch('all'); setSelectedSection('all'); setSelectedSession('all'); }}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Calendar size={12} color="#7c3aed" /> Academic Year
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedBatch('all'); setSelectedSection('all'); setSelectedSession('all'); }}>
              <option value="all">All Academic Years</option>
              {academicYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Layers size={12} color="#7c3aed" /> Batch
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedBatch} onChange={e => { setSelectedBatch(e.target.value); setSelectedSection('all'); setSelectedSession('all'); }}>
              <option value="all">All Batches ({availableBatches.length})</option>
              {availableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <Users size={12} color="#7c3aed" /> Section
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedSection} onChange={e => { setSelectedSection(e.target.value); setSelectedSession('all'); }}>
              <option value="all">All Sections ({availableSections.length})</option>
              {availableSections.map(s => <option key={s.section_id} value={s.section_id}>Section {s.section_name} {s.batch_name ? `(${s.batch_name})` : ''}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <BookOpen size={12} color="#7c3aed" /> Subject
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value); setSelectedSession('all'); }}>
              <option value="all">All Assigned Subjects</option>
              {availableSubjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.subject_code})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase' }}>
              <PlayCircle size={12} color="#7c3aed" /> Session / Lab
            </label>
            <select className={styles.select} style={{ width: '100%' }} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              <option value="all">⭐ All Sessions in Scope ({sessionsSummary.length})</option>
              {sessionsSummary.map(s => (
                <option key={s.session_id} value={s.session_id}>
                  {s.experiment_title} · Sec {s.section_name} ({s.response_count} resp)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13.5, padding: '24px 4px' }}>
          <Loader2 size={18} className="animate-spin" /> Loading multi-cohort student feedback…
        </div>
      ) : (
        <>
          {/* ═══ AGGREGATED SENTIMENT KPI CARDS ═══ */}
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Overall Satisfaction</p>
              <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{fmt(avgs?.overall_rating)}</p>
              <p className={styles.kpiSub}>Out of 5.0 · {overview?.total ?? 0} total responses</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Experiment Clarity</p>
              <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{fmt(avgs?.experiment_clarity)}</p>
              <p className={styles.kpiSub}>Problem statement & lab manual quality</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Session Pacing</p>
              <p className={styles.kpiValue} style={{ color: '#b45309' }}>{fmt(avgs?.session_pacing)}</p>
              <p className={styles.kpiSub}>Time allocation vs difficulty</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>AI Hint Helpfulness</p>
              <p className={styles.kpiValue} style={{ color: '#4f46e5' }}>{fmt(avgs?.ai_hint_helpfulness)}</p>
              <p className={styles.kpiSub}>Socratic tutor & hint usefulness</p>
            </div>
          </div>

          {/* ═══ PER-SESSION & EXPERIMENT SENTIMENT ROLLUP TABLE ═══ */}
          {selectedSession === 'all' && sessionsSummary.length > 0 && (
            <section className={styles.sectionCard} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 className={styles.sectionTitle}>Sentiment Breakdown by Subject, Section & Experiment</h2>
                  <p className={styles.sectionSub}>Click any session row to drill into its specific student comments</p>
                </div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
                  onClick={handleExportFeedbackCSV}
                  disabled={!overview || overview.feedback.length === 0}
                >
                  <Download size={14} /> Export Feedback CSV
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Experiment / Lab Session</th>
                      <th>Subject & Section</th>
                      <th>Batch & Academic Year</th>
                      <th>Responses</th>
                      <th>Overall ★</th>
                      <th>Clarity</th>
                      <th>Pacing</th>
                      <th>AI Hints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionsSummary.map(s => (
                      <tr
                        key={s.session_id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedSession(s.session_id)}
                      >
                        <td>
                          <div className={styles.tdStrong} style={{ color: '#4f46e5' }}>{s.experiment_title}</div>
                          <div style={{ fontSize: 11.5, color: '#64748b' }}>{fmtDate(s.scheduled_at)}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.subject_name}</div>
                          <div style={{ fontSize: 11.5, color: '#64748b' }}>Section {s.section_name}</div>
                        </td>
                        <td>
                          <span className={`${styles.pill} ${styles.pillBlue}`} style={{ fontSize: 11 }}>
                            {s.department_code || 'CSE'} · {s.batch_name} ({s.academic_year})
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{s.response_count}</td>
                        <td>
                          {s.overall_rating != null ? (
                            <span className={`${styles.badge} ${s.overall_rating >= 4 ? styles.greenBadge : s.overall_rating >= 3 ? styles.amberBadge : styles.redBadge}`}>
                              ★ {s.overall_rating.toFixed(2)}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(s.experiment_clarity)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(s.session_pacing)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(s.ai_hint_helpfulness)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ═══ ANONYMOUS STUDENT FEEDBACK STREAM ═══ */}
          <section className={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 className={styles.sectionTitle}>Anonymous Student Feedback & Comments</h2>
                <p className={styles.sectionSub}>
                  Showing {filteredComments.length} feedback item{filteredComments.length === 1 ? '' : 's'} · Student identities remain anonymous
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {selectedSession !== 'all' && (
                  <button type="button" className={styles.ghostBtn} style={{ fontSize: 12 }} onClick={() => setSelectedSession('all')}>
                    Show All Sessions
                  </button>
                )}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Search comments or experiment..."
                    style={{ paddingLeft: 30, maxWidth: 230, height: 34, fontSize: 12.5 }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className={styles.tabRow} style={{ gap: 6 }}>
                  {([
                    { id: 'all', label: 'All Ratings' },
                    { id: 'high', label: '★ 4.5+ Positive' },
                    { id: 'mid', label: '★ 3.0–4.4 Neutral' },
                    { id: 'low', label: '≤ 2.9 Needs Attention' },
                  ] as const).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`${styles.tabChip} ${ratingFilter === f.id ? styles.tabChipActive : ''}`}
                      onClick={() => setRatingFilter(f.id)}
                      style={{ fontSize: 11.5, padding: '5px 10px' }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredComments.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 13.5, margin: 0, padding: '16px 0' }}>
                No feedback responses match the selected hierarchy and rating filters.
              </p>
            ) : (
              <div className={styles.list}>
                {filteredComments.map((item) => (
                  <div key={item.id} className={styles.listRow}>
                    <div className={styles.rowIcon}>
                      <MessageSquare size={19} />
                    </div>
                    <div className={styles.rowBody}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span className={styles.rowTitle}>{item.experiment_title}</span>
                        <span className={`${styles.pill} ${styles.pillBlue}`} style={{ fontSize: 10.5 }}>
                          {item.subject_name} · Sec {item.section_name} · {item.batch_name} ({item.academic_year})
                        </span>
                        {item.overall_rating != null && (
                          <span className={`${styles.badge} ${item.overall_rating >= 4 ? styles.greenBadge : item.overall_rating >= 3 ? styles.amberBadge : styles.redBadge}`}>
                            <Star size={11} /> {item.overall_rating}/5 Overall
                          </span>
                        )}
                      </div>
                      <p className={styles.rowSub} style={{ fontSize: 13.5, color: '#1e293b', margin: '4px 0 6px' }}>
                        {item.comment ? `“${item.comment}”` : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(Rating submitted without written comment)</span>}
                      </p>
                      <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span>Clarity: <strong>{item.experiment_clarity ?? '—'}/5</strong></span>
                        <span>Pacing: <strong>{item.session_pacing ?? '—'}/5</strong></span>
                        <span>AI Hints: <strong>{item.ai_hint_helpfulness ?? '—'}/5</strong></span>
                      </div>
                    </div>
                    <span className={styles.rowMeta}>{fmtDate(item.submitted_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </InstructorShell>
  );
}
