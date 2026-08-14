'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type AnalyticsOverview, type AtRiskStudent, type SectionComparison } from '@/services/institution.service';
import { AlertTriangle, TrendingUp, Users, CheckCircle, Clock } from 'lucide-react';
import styles from '../dashboard/page.module.css';

type Tab = 'overview' | 'at-risk' | 'sections';

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview,  setOverview]  = useState<AnalyticsOverview | null>(null);
  const [atRisk,    setAtRisk]    = useState<AtRiskStudent[]>([]);
  const [sections,  setSections]  = useState<SectionComparison[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ov, ar, sc] = await Promise.all([
          institutionService.getAnalyticsOverview(),
          institutionService.getAtRiskStudents(),
          institutionService.getSectionComparison(),
        ]);
        setOverview(ov); setAtRisk(ar); setSections(sc);
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const maxScore = sections.length ? Math.max(...sections.map(s => s.avg_score), 1) : 100;

  return (
    <InstitutionShell activePage="Analytics" title="Analytics" subtitle="Institutional performance overview for the last 30 days.">

      <div className={styles.tabs}>
        {(['overview','at-risk','sections'] as Tab[]).map(t => (
          <button key={t} className={`${styles.tab} ${tab===t?styles.tabActive:''}`} onClick={() => setTab(t)}>
            {t==='overview'?'Overview':t==='at-risk'?'Students at Risk':'Section Comparison'}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab==='overview' && (
        <>
          <div className={styles.analyticsGrid}>
            <div className={styles.analyticsCard}>
              <p className={styles.analyticsValue}>{loading?'—':overview?.sessions.total??0}</p>
              <p className={styles.analyticsLabel}>Sessions this month</p>
            </div>
            <div className={styles.analyticsCard}>
              <p className={styles.analyticsValue}>{loading?'—':`${overview?.sessions.completion_rate_pct??0}%`}</p>
              <p className={styles.analyticsLabel}>Completion Rate</p>
              <p className={styles.analyticsNote}>{overview?.sessions.completed??0} completed</p>
            </div>
            <div className={styles.analyticsCard}>
              <p className={styles.analyticsValue}>{loading?'—':overview?.students.total??0}</p>
              <p className={styles.analyticsLabel}>Active Students</p>
            </div>
            <div className={styles.analyticsCard}>
              <p className={styles.analyticsValue} style={{color:overview?.students.at_risk??0>0?'#ef4444':'#22c55e'}}>
                {loading?'—':overview?.students.at_risk??0}
              </p>
              <p className={styles.analyticsLabel}>At-Risk Students</p>
              <p className={styles.analyticsNote}>{overview?.students.at_risk_pct??0}% of total</p>
            </div>
            <div className={styles.analyticsCard}>
              <p className={styles.analyticsValue}>{loading?'—':overview?.instructors.active_this_month??0}</p>
              <p className={styles.analyticsLabel}>Active Instructors</p>
            </div>
          </div>

          {!loading && overview?.peak_hours?.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Peak Usage Hours</h2></div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {overview.peak_hours.map(ph => (
                  <div key={ph.hour} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',background:'rgba(255,255,255,0.7)',borderRadius:12,border:'1px solid rgba(255,255,255,0.9)'}}>
                    <Clock size={16} style={{color:'#9333ea',flexShrink:0}}/>
                    <span style={{fontSize:14,fontWeight:700,color:'#201b2e',width:80}}>
                      {String(ph.hour).padStart(2,'0')}:00 – {String(ph.hour+1).padStart(2,'0')}:00
                    </span>
                    <div style={{flex:1,height:8,background:'#e5e7eb',borderRadius:999,overflow:'hidden'}}>
                      <div style={{height:'100%',background:'linear-gradient(90deg,#9333ea,#a78bfa)',borderRadius:999,width:`${Math.round((ph.session_count/overview.peak_hours[0].session_count)*100)}%`}}/>
                    </div>
                    <span style={{fontSize:13,color:'#726a85',fontWeight:600}}>{ph.session_count} sessions</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* AT-RISK */}
      {tab==='at-risk' && (
        <>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Students at Risk</h2>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#ef4444',fontWeight:600}}>
              <AlertTriangle size={14}/> Avg concept mastery &lt; 40%
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Student</th><th>Roll No.</th><th>Avg Mastery</th><th>Concepts Tracked</th></tr></thead>
              <tbody>
                {loading?<tr><td colSpan={4} style={{textAlign:'center',color:'#9891a6',padding:32}}>Loading…</td></tr>:
                 atRisk.length===0?<tr><td colSpan={4} style={{textAlign:'center',color:'#22c55e',padding:32}}><CheckCircle size={20} style={{display:'inline',marginRight:6}}/>No at-risk students. Great job!</td></tr>:
                 atRisk.map(s=>(
                  <tr key={s.student_id}>
                    <td>
                      <div style={{fontWeight:700,color:'#201b2e'}}>{s.full_name}</div>
                      <div style={{fontSize:12,color:'#9891a6'}}>{s.email}</div>
                    </td>
                    <td style={{color:'#726a85'}}>{s.roll_number??'—'}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div className={styles.progressBar} style={{flex:1,maxWidth:100}}>
                          <div className={styles.progressFill} style={{width:`${s.avg_mastery}%`,background:s.avg_mastery<20?'#ef4444':s.avg_mastery<35?'#f97316':'#eab308'}}/>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:s.avg_mastery<20?'#ef4444':'#f97316'}}>{s.avg_mastery}%</span>
                      </div>
                    </td>
                    <td style={{color:'#726a85'}}>{s.concepts_tracked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* SECTION COMPARISON */}
      {tab==='sections' && (
        <>
          <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Section Performance Comparison</h2></div>
          {loading?<div className={styles.emptyState}>Loading…</div>:
           sections.length===0?<div className={styles.emptyState}><p>No sections with data yet.</p></div>:
           <div style={{display:'flex',flexDirection:'column',gap:10}}>
             {sections.map((sec,i)=>(
              <div key={sec.section_id} style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',background:'rgba(255,255,255,0.75)',borderRadius:14,border:'1px solid rgba(255,255,255,0.9)'}}>
                <span style={{fontSize:13,fontWeight:700,color:i===0?'#9333ea':'#9891a6',width:22,textAlign:'center'}}>#{i+1}</span>
                <div style={{flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:14,fontWeight:700,color:'#201b2e'}}>{sec.section_name}</span>
                    <span style={{fontSize:14,fontWeight:700,color:'#9333ea'}}>{sec.avg_score} pts</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{width:`${(sec.avg_score/maxScore)*100}%`,background:i===0?'linear-gradient(90deg,#9333ea,#a78bfa)':'linear-gradient(90deg,#c4b5fd,#ddd6fe)'}}/>
                  </div>
                  <div style={{fontSize:12,color:'#9891a6',marginTop:4}}>{sec.enrolled} enrolled students</div>
                </div>
              </div>
             ))}
           </div>
          }
        </>
      )}
    </InstitutionShell>
  );
}
