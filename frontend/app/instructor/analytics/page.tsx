'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Users, BrainCircuit, Eye, X, RefreshCw,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import { instructorService } from '@/services/instructor.service';
import styles from '../shared.module.css';

interface SectionSubjectLite {
  section_subject_id: string;
  subject_name: string;
  section_name: string;
  student_count: number;
}

interface RankingRow {
  student_id: string;
  full_name: string;
  roll_number: string;
  rank_position: number | null;
  rank_score: number;
  components: {
    mastery: number;
    engagement: number;
    effort: number;
    efficiency: number;
    consistency: number;
  };
}

interface MasteryItem {
  concept: string;
  mastery_score: number;
  experiment_count: number;
}

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Something went wrong';

const readiness = (score: number) =>
  score >= 75 ? { label: 'Strong', pill: styles.pillGreen }
  : score >= 50 ? { label: 'Moderate', pill: styles.pillAmber }
  : { label: 'At Risk', pill: styles.pillBlue };

export default function AnalyticsPage() {
  const router = useRouter();
  const [sections, setSections] = useState<SectionSubjectLite[]>([]);
  const [ssId, setSsId] = useState('');
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [masteryTarget, setMasteryTarget] = useState<RankingRow | null>(null);
  const [mastery, setMastery] = useState<MasteryItem[]>([]);
  const [masteryLoading, setMasteryLoading] = useState(false);

  const toast3 = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load teaching assignments once ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await sessionService.getSectionSubjects();
        const list = (res.section_subjects ?? []) as SectionSubjectLite[];
        setSections(list);
        if (list.length > 0) setSsId(list[0].section_subject_id);
      } catch (err) {
        toast3(errText(err));
      }
    })();
  }, []);

  // ── Load rankings when a section-subject is selected ─────────────────────────
  useEffect(() => {
    if (!ssId) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await instructorService.getSectionRankings(ssId);
        if (mounted) setRankings(res.rankings ?? []);
      } catch (err) {
        if (mounted) toast3(errText(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [ssId]);

  const openMastery = async (row: RankingRow) => {
    setMasteryTarget(row);
    setMastery([]);
    setMasteryLoading(true);
    try {
      const res = await instructorService.getStudentMastery(row.student_id);
      setMastery(res.mastery ?? []);
    } catch (err) {
      toast3(errText(err));
    } finally {
      setMasteryLoading(false);
    }
  };

  const current = sections.find((s) => s.section_subject_id === ssId);
  const avgScore = rankings.length
    ? Math.round(rankings.reduce((sum, r) => sum + r.rank_score, 0) / rankings.length)
    : 0;
  const atRisk = rankings.filter((r) => r.rank_score < 50).length;

  return (
    <InstructorShell
      activePage="Analytics"
      title="Class Analytics & Knowledge Insights"
      subtitle="Holistic student ranking (mastery, engagement, effort, efficiency, consistency) plus per-concept mastery tracing"
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
          value={ssId} onChange={(e) => setSsId(e.target.value)}>
          <option value="">Select a section & subject…</option>
          {sections.map((s) => (
            <option key={s.section_subject_id} value={s.section_subject_id}>
              {s.subject_name} — {s.section_name} ({s.student_count} students)
            </option>
          ))}
        </select>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/live-lab')}>
          <Users size={16} strokeWidth={1.9} /> Open Live Lab Control
        </button>
        <button type="button" className={styles.ghostBtn} onClick={() => router.push('/instructor/grading')}>
          <BarChart3 size={16} strokeWidth={1.9} /> Review Grading
        </button>
      </div>

      {/* KPI Row */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Ranked Students</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{loading ? '…' : rankings.length}</p>
          <p className={styles.kpiSub}>{current ? `${current.subject_name} · ${current.section_name}` : 'Select a section'}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Average Rank Score</p>
          <p className={styles.kpiValue} style={{ color: '#0f766e' }}>{loading ? '…' : avgScore}</p>
          <p className={styles.kpiSub}>Weighted across 5 signals</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>At-Risk Students</p>
          <p className={styles.kpiValue} style={{ color: atRisk > 0 ? '#b45309' : '#16a34a' }}>
            {loading ? '…' : atRisk}
          </p>
          <p className={styles.kpiSub}>Rank score below 50</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Knowledge Tracing</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed', fontSize: 18 }}>
            <BrainCircuit size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Active
          </p>
          <p className={styles.kpiSub}>Updated after each grading</p>
        </div>
      </div>

      {/* Ranking Table */}
      <section className={styles.tableCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Holistic Student Ranking</h2>
            <p className={styles.sectionSub}>
              {loading ? 'Loading…'
                : rankings.length
                  ? 'Weights: mastery 30% · engagement 20% · effort 20% · efficiency 15% · consistency 15%'
                  : 'No ranking data yet — rankings are computed after graded submissions'}
            </p>
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Student</th>
              <th>Score</th>
              <th>Mastery</th>
              <th>Engagement</th>
              <th>Effort</th>
              <th>Efficiency</th>
              <th>Consistency</th>
              <th>Readiness</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => {
              const rd = readiness(r.rank_score);
              return (
                <tr key={r.student_id}>
                  <td className={styles.tdStrong}>#{r.rank_position ?? '—'}</td>
                  <td className={styles.tdStrong}>
                    {r.full_name} <span style={{ color: '#9891a6', fontWeight: 400, fontSize: 12 }}>{r.roll_number}</span>
                  </td>
                  <td className={styles.tdStrong} style={{ color: '#0f62fe' }}>{r.rank_score}</td>
                  <td>{r.components.mastery}</td>
                  <td>{r.components.engagement}</td>
                  <td>{r.components.effort}</td>
                  <td>{r.components.efficiency}</td>
                  <td>{r.components.consistency}</td>
                  <td><span className={`${styles.pill} ${rd.pill}`}>{rd.label}</span></td>
                  <td>
                    <button type="button" className={styles.ghostBtn}
                      style={{ minHeight: 30, padding: '0 10px', fontSize: 11.5 }}
                      onClick={() => openMastery(r)}>
                      <Eye size={12} /> Concepts
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && rankings.length === 0 && ssId && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: '#9891a6', padding: 20 }}>
                  No ranking rows for this section yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* CONCEPT MASTERY MODAL */}
      {masteryTarget && (
        <div className={styles.modalOverlay} onClick={() => setMasteryTarget(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Concept Mastery — {masteryTarget.full_name}</h3>
                <p className={styles.sectionSub}>
                  {masteryTarget.roll_number} · Rank #{masteryTarget.rank_position ?? '—'} · Score {masteryTarget.rank_score}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setMasteryTarget(null)}>
                <X size={18} />
              </button>
            </div>

            {masteryLoading ? (
              <p className={styles.sectionSub}><RefreshCw size={13} style={{ verticalAlign: '-2px' }} /> Loading mastery data…</p>
            ) : mastery.length === 0 ? (
              <p className={styles.sectionSub}>
                No concept mastery records yet — records build up as the student completes graded experiments.
              </p>
            ) : (
              <div className={styles.list}>
                {mastery.map((m) => (
                  <div key={m.concept} className={styles.listRow}>
                    <div className={styles.rowBody}>
                      <p className={styles.rowTitle}>{m.concept}</p>
                      <p className={styles.rowSub}>{m.experiment_count} experiment(s) touched</p>
                    </div>
                    <div className={styles.rowSide}>
                      <span className={`${styles.pill} ${
                        m.mastery_score >= 75 ? styles.pillGreen
                        : m.mastery_score >= 50 ? styles.pillAmber
                        : styles.pillBlue
                      }`}>
                        {m.mastery_score}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className={styles.primaryBtn} onClick={() => setMasteryTarget(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
