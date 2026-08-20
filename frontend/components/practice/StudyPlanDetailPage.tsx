'use client';
/**
 * StudyPlanDetailPage — shared, used by:
 *   /student/practice/study-plans/[slug]
 *   /practice/library/study-plans/[slug]
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import styles from './PracticePages.module.css';
import { apiClient } from '@/services/api-client';

interface ProblemRow {
  id: string; slug: string; lc_id: string; title: string;
  difficulty: 'Easy'|'Medium'|'Hard'; nexlab_topic: string; status: string;
}
interface Section {
  id: string; title: string; order_index: number;
  problems: ProblemRow[]; solved_count: number;
}
interface Plan {
  id: string; slug: string; title: string; description: string;
  icon: string; total_problems: number; difficulty_mix: string;
  estimated_days: number; badge_id: string;
}
interface Progress {
  solved_slugs: string[]; completed_at: string|null;
}

function diffClass(d: string) {
  if (d === 'Easy') return styles.easy;
  if (d === 'Medium') return styles.medium;
  return styles.hard;
}

export default function StudyPlanDetailPage({
  planSlug, baseRoute
}: { planSlug: string; baseRoute: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan|null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [progress, setProgress] = useState<Progress|null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/practice/plans/${planSlug}`);
        setPlan(res.data.plan);
        setSections(res.data.sections || []);
        setProgress(res.data.progress || null);
        // Open first section by default
        if (res.data.sections?.length) {
          setOpenSections(new Set([res.data.sections[0].id]));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [planSlug]);

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const enroll = async () => {
    if (!plan) return;
    setEnrolling(true);
    try {
      await apiClient.post(`/practice/plans/${plan.id}/enroll`);
      setProgress({ solved_slugs: [], completed_at: null });
    } catch (e) { console.error(e); }
    finally { setEnrolling(false); }
  };

  if (loading) return <div className={styles.loading}>Loading study plan…</div>;
  if (!plan) return <div className={styles.loading}>Plan not found.</div>;

  const totalSolved = progress?.solved_slugs?.length || 0;
  const pct = plan.total_problems ? Math.round(totalSolved / plan.total_problems * 100) : 0;
  const enrolled = !!progress;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.push(`${baseRoute}?tab=plans`)}>
        <ArrowLeft size={14} /> Study Plans
      </button>

      {/* Hero */}
      <div className={styles.planHero}>
        <div className={styles.planHeroLeft}>
          <div className={styles.planHeroIcon}>{plan.icon}</div>
          <div>
            <h1 className={styles.planHeroTitle}>{plan.title}</h1>
            <p className={styles.planHeroDesc}>{plan.description}</p>
            <div className={styles.planHeroMeta}>
              <span className={styles.metaChip}>{plan.total_problems} problems</span>
              <span className={styles.metaChipGray}>{plan.difficulty_mix}</span>
              {plan.estimated_days && (
                <span className={styles.metaChipGray}>{plan.estimated_days} days</span>
              )}
              {enrolled && (
                <span className={styles.metaChip}>✓ Enrolled</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.overallProgress}>
          <div className={styles.overallTitle}>Your Progress</div>
          <div className={styles.overallNumbers}>
            {totalSolved} <span>/ {plan.total_problems}</span>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressPct}>{pct}% complete</div>
          {!enrolled && (
            <button className={styles.enrollBtn} onClick={enroll} disabled={enrolling}>
              {enrolling ? 'Enrolling…' : 'Start This Plan'}
            </button>
          )}
          {enrolled && progress?.completed_at && (
            <div style={{ marginTop: '.65rem', color: '#15803d', fontSize: '.8rem', fontWeight: 800 }}>
              🎉 Completed!
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      {sections.map(sec => {
        const isOpen = openSections.has(sec.id);
        return (
          <div key={sec.id} className={styles.sectionCard}>
            <div className={styles.sectionHeader} onClick={() => toggleSection(sec.id)}>
              <span className={styles.sectionTitle}>{sec.title}</span>
              <div className={styles.sectionProgress}>
                {sec.solved_count === sec.problems.length && sec.problems.length > 0
                  ? <span className={styles.sectionDone}>✓ {sec.problems.length}</span>
                  : <span className={styles.sectionCount}>{sec.solved_count}/{sec.problems.length}</span>
                }
              </div>
              <ChevronDown
                size={16}
                className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
              />
            </div>

            {isOpen && (
              <div className={styles.probList}>
                {sec.problems.map((p, i) => (
                  <div
                    key={p.id}
                    className={styles.probRow}
                    onClick={() => router.push(`${baseRoute}/${p.slug}`)}
                  >
                    <span className={styles.probRowNum}>{i + 1}</span>
                    <span className={styles.probRowTitle}>{p.title}</span>
                    <span className={`${styles.diffBadge} ${diffClass(p.difficulty)}`}>{p.difficulty}</span>
                    <span className={styles.statusIcon}>
                      {p.status === 'solved'
                        ? <CheckCircle2 size={15} className={styles.solved} />
                        : <Circle size={15} className={styles.todo} />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
