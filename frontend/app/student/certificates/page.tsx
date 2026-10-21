'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import { freeService, type FreeCoursesAnalytics, type FreeCourseItem } from '@/services/free.service';
import { practiceExtraService } from '@/services/practice-extra.service';
import type { SectionSubject } from '@/types';
import { Loader2, Download, ExternalLink, ShieldCheck, Award, BookOpen, CheckCircle2, Copy } from 'lucide-react';
import styles from './page.module.css';

interface HistoryRow {
  experiment_id: string;
  experiment_title: string;
  subject_name?: string;
  subject_code?: string;
  concept_tags: string[];
  last_attempt: string | null;
  total_attempts: number;
  best_tests_passed: number | null;
  tests_total: number | null;
  grade: number | null;
}

const gradeLetter = (pct: number) => (pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 50 ? 'C' : 'F');

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function CertificatesPage() {
  const [activeTab, setActiveTab] = useState<'academic' | 'platform'>('academic');
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [coursesAnalytics, setCoursesAnalytics] = useState<FreeCoursesAnalytics | null>(null);
  const [studyPlans, setStudyPlans] = useState<Array<{
    id: string;
    slug: string;
    title: string;
    difficulty_mix: string;
    total_problems: number;
    completed: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Lab record download state
  const [recordSubject, setRecordSubject] = useState('');
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordMsg, setRecordMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      studentService.getHistory(),
      studentService.getSubjects(),
      freeService.getCoursesAnalytics(),
      practiceExtraService.getPlans(),
    ])
      .then(([hRes, sRes, cRes, pRes]) => {
        if (hRes.status === 'fulfilled') {
          setHistoryRows((hRes.value as HistoryRow[]).filter(r => r.grade != null));
        }
        if (sRes.status === 'fulfilled') {
          setSubjects(sRes.value);
        }
        if (cRes.status === 'fulfilled') {
          setCoursesAnalytics(cRes.value);
        }
        if (pRes.status === 'fulfilled') {
          setStudyPlans(((pRes.value as any)?.plans || []) as any[]);
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load records'))
      .finally(() => setLoading(false));
  }, []);

  const downloadRecord = async () => {
    if (!recordSubject) return;
    setRecordBusy(true);
    setRecordMsg('');
    try {
      const url = await studentService.getLabRecordUrl(recordSubject);
      window.open(url, '_blank');
      setRecordMsg('✅ Lab record PDF generated — opened in a new tab.');
    } catch (e) {
      setRecordMsg(`⚠️ ${e instanceof Error ? e.message : 'Failed to generate lab record'}`);
    } finally {
      setRecordBusy(false);
    }
  };

  const copyCredential = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const earnedCerts = coursesAnalytics?.certificates || [];
  const completedPlans = studyPlans.filter(p => p.completed);
  const totalPlatformCerts = earnedCerts.length + completedPlans.length;
  const inProgressCourses = (coursesAnalytics?.courses || []).filter(c => c.completion_pct > 0 && !c.cert_eligible);

  if (loading) {
    return (
      <StudentShell activePage="Certificates & Records" title="Certificates & Records" subtitle="Accredited academic records and verified platform credentials">
        <div className={styles.loadingBox}><Loader2 size={22} className={styles.spinner} /> Loading verified records…</div>
      </StudentShell>
    );
  }

  return (
    <StudentShell activePage="Certificates & Records" title="Certificates & Records" subtitle="Accredited academic records and verified platform credentials">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {/* Dual Tab Switcher */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'academic' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('academic')}
        >
          <BookOpen size={16} />
          <span>Academic Lab Records ({historyRows.length})</span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'platform' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('platform')}
        >
          <Award size={16} />
          <span>Platform Skill Certifications ({totalPlatformCerts})</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: ACADEMIC LAB RECORDS (ACCREDITED)                                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'academic' && (
        <>
          <div className={styles.accreditationBanner}>
            <div className={styles.accreditationLeft}>
              <div className={styles.accreditationIcon}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <h4 className={styles.accreditationTitle}>Accredited Institutional Lab Records</h4>
                <p className={styles.accreditationSub}>
                  Official coursework records verified by institutional faculty and automated code execution test suites.
                  Complies with laboratory record-sheet archiving guidelines.
                </p>
              </div>
            </div>
          </div>

          {/* Consolidated Lab Record PDF Generation */}
          <div className={styles.recordCard}>
            <h3 className={styles.recordTitle}>📕 Consolidated Subject Lab Record</h3>
            <p className={styles.recordSub}>
              Generate and download the official, faculty-attested PDF record book containing all completed experiments, test outputs, and final grades for your enrolled laboratory courses.
            </p>
            <div className={styles.recordRow}>
              <select
                className={styles.recordSelect}
                value={recordSubject}
                onChange={e => setRecordSubject(e.target.value)}
              >
                <option value="">Select an enrolled laboratory subject…</option>
                {subjects.map(s => (
                  <option key={s.section_subject_id} value={s.subject_id}>
                    {s.subject_name} ({s.subject_code})
                  </option>
                ))}
              </select>
              <button
                className={styles.downloadBtn}
                onClick={downloadRecord}
                disabled={!recordSubject || recordBusy}
                style={{ flex: 'none', padding: '11px 22px' }}
              >
                {recordBusy ? <Loader2 size={16} className={styles.spinner} /> : <Download size={16} style={{ display: 'inline', marginRight: 6 }} />}
                Generate Official Record PDF
              </button>
            </div>
            {recordMsg && <p className={styles.recordMsg}>{recordMsg}</p>}
          </div>

          {/* Verified Receipts Ledger */}
          <div className={styles.ledgerCard}>
            <div className={styles.ledgerHeader}>
              <h4 className={styles.ledgerTitle}>Verified Experiment Receipts ({historyRows.length})</h4>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Tamper-evident grading log</span>
            </div>
            {historyRows.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize: 44 }}>🧪</div>
                <h3>No graded experiments yet</h3>
                <p>Complete lab sessions and obtain teacher grades to generate verified experiment receipts.</p>
              </div>
            ) : (
              <table className={styles.ledgerTable}>
                <thead>
                  <tr>
                    <th>Experiment Title</th>
                    <th>Test Suites</th>
                    <th>Evaluated Grade</th>
                    <th>Completion Date</th>
                    <th>Verification Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(row => {
                    const pct = Math.round(row.grade ?? 0);
                    return (
                      <tr key={row.experiment_id}>
                        <td>
                          <strong>{row.experiment_title}</strong>
                          {row.concept_tags && row.concept_tags.length > 0 && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              {row.concept_tags.slice(0, 3).join(' • ')}
                            </div>
                          )}
                        </td>
                        <td>
                          {row.best_tests_passed != null && row.tests_total ? (
                            <span style={{ color: row.best_tests_passed === row.tests_total ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                              {row.best_tests_passed} / {row.tests_total} passed
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>Assessed</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, marginRight: 8 }}>{pct}/100</span>
                          <span className={styles.gradeBadge}>{gradeLetter(pct)}</span>
                        </td>
                        <td style={{ color: '#64748b', fontSize: 12.5 }}>
                          {fmtDate(row.last_attempt)}
                        </td>
                        <td>
                          <span className={styles.statusBadge} style={{ background: 'rgba(34,197,94,.1)', color: '#16a34a' }}>
                            <CheckCircle2 size={12} /> OFFICIAL ATTESTED
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: PLATFORM SKILL CERTIFICATIONS                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'platform' && (
        <>
          <div className={styles.accreditationBanner}>
            <div className={styles.accreditationLeft}>
              <div className={styles.accreditationIcon} style={{ color: '#d97706' }}>
                <Award size={24} />
              </div>
              <div>
                <h4 className={styles.accreditationTitle}>Competitive Platform Certifications</h4>
                <p className={styles.accreditationSub}>
                  Credentials issued upon 100% completion of curated learning paths and problem sets.
                  Verified credentials can be linked to portfolios, GitHub, or LinkedIn profiles.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Summary Numbers */}
          <div className={styles.summaryBanner}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>📜</div>
              <div>
                <p className={styles.summaryNum}>{totalPlatformCerts}</p>
                <p className={styles.summaryLabel}>Certificates Earned</p>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>⚡</div>
              <div>
                <p className={styles.summaryNum}>{coursesAnalytics?.total_course_xp?.toLocaleString() || 0}</p>
                <p className={styles.summaryLabel}>Course XP Mastered</p>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>🎯</div>
              <div>
                <p className={styles.summaryNum}>{coursesAnalytics?.total_exercises_solved || 0}</p>
                <p className={styles.summaryLabel}>Exercises Cracked</p>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>📚</div>
              <div>
                <p className={styles.summaryNum}>{coursesAnalytics?.completed_courses || 0} / {coursesAnalytics?.total_courses || 0}</p>
                <p className={styles.summaryLabel}>Catalog Tracks Finished</p>
              </div>
            </div>
          </div>

          {/* Earned Certificates Grid */}
          <h4 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
            Earned Competency Certificates ({totalPlatformCerts})
          </h4>

          {totalPlatformCerts === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 48 }}>🏆</div>
              <h3>No platform certificates earned yet</h3>
              <p>Complete all exercises in any track or practice study plan to unlock verified certificates.</p>
            </div>
          ) : (
            <div className={styles.certGrid}>
              {/* Free Course Certificates */}
              {earnedCerts.map(cert => (
                <div key={cert.certificate_id} className={styles.certCard}>
                  <div className={styles.certBanner} style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
                    <div className={styles.certSeal}>🏅</div>
                    <p className={styles.certTitle}>NexLab Verified Credential</p>
                    <p className={styles.certSub}>Open Competency Certification</p>
                  </div>
                  <div className={styles.certBody}>
                    <p className={styles.certExp}>{cert.course_title}</p>
                    <div className={styles.credId}>ID: {cert.certificate_id}</div>
                    <div className={styles.certMeta}>
                      <span>📅 Issued: {fmtDate(cert.completed_at)}</span>
                      <span>✓ 100% Solved</span>
                    </div>
                    <div className={styles.certActions}>
                      <button
                        className={styles.downloadBtn}
                        onClick={() => window.open(`/practice/courses/${cert.course_slug}`, '_blank')}
                      >
                        <ExternalLink size={13} style={{ display: 'inline', marginRight: 4 }} /> View Track
                      </button>
                      <button
                        className={styles.shareBtn}
                        onClick={() => copyCredential(cert.certificate_id)}
                        title="Copy Credential ID"
                      >
                        <Copy size={13} style={{ display: 'inline', marginRight: 4 }} />
                        {copiedId === cert.certificate_id ? 'Copied!' : 'Copy ID'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Study Plan Completion Certificates */}
              {completedPlans.map(plan => (
                <div key={plan.id} className={styles.certCard}>
                  <div className={styles.certBanner} style={{ background: 'linear-gradient(135deg, #0f172a, #2563eb)' }}>
                    <div className={styles.certSeal}>🏅</div>
                    <p className={styles.certTitle}>NexLab Study Plan Credential</p>
                    <p className={styles.certSub}>Practice Curriculum Certification</p>
                  </div>
                  <div className={styles.certBody}>
                    <p className={styles.certExp}>{plan.title}</p>
                    <div className={styles.credId}>PLAN: {plan.slug.toUpperCase()}</div>
                    <div className={styles.certMeta}>
                      <span>🎯 {plan.total_problems} Problems Solved</span>
                      <span>✓ 100% Completed</span>
                    </div>
                    <div className={styles.certActions}>
                      <button
                        className={styles.downloadBtn}
                        onClick={() => practiceExtraService.downloadCertificate(plan.slug)}
                        title="Download official Certificate PDF"
                      >
                        <Download size={13} style={{ display: 'inline', marginRight: 4 }} /> Download PDF
                      </button>
                      <button
                        className={styles.shareBtn}
                        onClick={() => copyCredential(plan.slug)}
                        title="Copy Plan Identifier"
                      >
                        <Copy size={13} style={{ display: 'inline', marginRight: 4 }} />
                        {copiedId === plan.slug ? 'Copied!' : 'Copy ID'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* In-Progress Course Tracks */}
          {inProgressCourses.length > 0 && (
            <div className={styles.ledgerCard} style={{ marginTop: 32 }}>
              <div className={styles.ledgerHeader}>
                <h4 className={styles.ledgerTitle}>In-Progress Course Tracks</h4>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Towards Certificate Eligibility</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {inProgressCourses.map((c: FreeCourseItem) => (
                  <div
                    key={c.id}
                    style={{
                      background: 'rgba(255,255,255,.9)',
                      border: '1px solid #e2e8f0',
                      borderRadius: 14,
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <strong style={{ fontSize: 14, color: '#1e293b' }}>{c.title}</strong>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#475569' }}>
                        {c.difficulty}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 10 }}>
                      <span>{c.solved_count} of {c.exercise_count} solved</span>
                      <strong style={{ color: '#7c3aed' }}>{c.completion_pct}%</strong>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${c.completion_pct}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>+{c.xp_earned} XP</span>
                      <button
                        className={styles.shareBtn}
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => window.open(`/practice/courses/${c.slug}`, '_blank')}
                      >
                        Continue →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </StudentShell>
  );
}
