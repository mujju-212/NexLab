'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type InstitutionUser } from '@/services/institution.service';
import { apiClient } from '@/services/api-client';
import {
  User, Mail, Phone, Hash, GraduationCap, BookOpen,
  Radio, ToggleRight, ToggleLeft, LogOut, ArrowLeft,
  Calendar, BarChart3, CheckCircle
} from 'lucide-react';
import styles from '../../dashboard/page.module.css';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [user,     setUser]     = useState<InstitutionUser | null>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState<string | null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Load user from list (no single-user endpoint yet)
        const all = await institutionService.listUsers();
        const u = all.find(x => x.id === id);
        if (!u) { router.push('/institution/users'); return; }
        setUser(u);

        // Load their section enrolments
        const sAll = await institutionService.getSections();
        // Load section_students for each section to find this user's sections
        const mySections: any[] = [];
        for (const sec of sAll) {
          try {
            const { data } = await apiClient.get(`/institution/sections/${sec.id}/students`).catch(() => ({ data: { students: [] } }));
            const studs: any[] = (data as any)?.students ?? [];
            if (studs.some((s: any) => s.id === id)) mySections.push(sec);
          } catch {}
        }
        setSections(mySections);

        // For instructors â€” get their sessions
        if (u.role === 'instructor') {
          const sess = await institutionService.getInstructorSessions(id);
          setSessions(sess);
        }
      } finally { setLoading(false); }
    };
    load();
  }, [id]);

  const toggleActive = async () => {
    if (!user) return;
    try {
      await institutionService.toggleUserActive(user.id);
      setUser(u => u ? { ...u, is_active: !u.is_active } : u);
      toast3(`${user.full_name} ${user.is_active ? 'deactivated' : 'activated'}.`);
    } catch { toast3('Action failed.'); }
  };

  const forceLogout = async () => {
    if (!user) return;
    try { await institutionService.forceLogoutUser(user.id); toast3('User logged out.'); }
    catch { toast3('Force logout failed.'); }
  };

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '??';
  const avatarBg = user?.role === 'student' ? '#9333ea' : '#10b981';

  if (loading) return (
    <InstitutionShell activePage="Users" title="Loadingâ€¦">
      <div className={styles.emptyState}>Loading profileâ€¦</div>
    </InstitutionShell>
  );

  if (!user) return null;

  return (
    <InstitutionShell activePage="Users"
      title={user.full_name}
      subtitle={user.role === 'student' ? 'Student Profile' : 'Instructor Profile'}>

      {toast && <div style={{ position:'fixed', bottom:24, right:24, zIndex:300, background:'#201b2e', color:'#fff', padding:'12px 20px', borderRadius:12, fontSize:14, fontWeight:600 }}>{toast}</div>}

      {/* Back button */}
      <button className={styles.btnSecondary} style={{ marginBottom:20 }} onClick={() => router.push('/institution/users')}>
        <ArrowLeft size={14} /> Back to Users
      </button>

      <div className={styles.profileGrid}>

        {/* â”€â”€ Profile Card â”€â”€ */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Identity */}
          <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:28, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, marginBottom:24 }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:`linear-gradient(135deg,${avatarBg},${avatarBg}cc)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:24, fontWeight:700, fontFamily:'Space Grotesk,sans-serif' }}>
                {initials}
              </div>
              <div style={{ textAlign:'center' }}>
                <p style={{ margin:0, fontSize:18, fontWeight:700, color:'#201b2e', fontFamily:'Space Grotesk,sans-serif' }}>{user.full_name}</p>
                <span className={`${styles.badgeRole} ${user.role==='student'?styles.badgeStudent:styles.badgeInstructor}`} style={{ marginTop:4, display:'inline-block' }}>
                  {user.role}
                </span>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { Icon: Mail,  label: 'Email',       value: user.email },
                { Icon: Phone, label: 'Phone',       value: user.phone ?? 'â€”' },
                { Icon: Hash,  label: 'Roll No.',    value: user.roll_number ?? 'â€”' },
              ].map(({ Icon, label, value }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'rgba(245,243,255,0.5)', borderRadius:10 }}>
                  <Icon size={14} style={{ color:'#9333ea', flexShrink:0 }} />
                  <div>
                    <p style={{ margin:0, fontSize:10.5, fontWeight:700, color:'#9891a6', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
                    <p style={{ margin:'2px 0 0', fontSize:13.5, fontWeight:600, color:'#201b2e' }}>{value}</p>
                  </div>
                </div>
              ))}

              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background: user.is_active?'rgba(240,253,244,0.8)':'rgba(248,250,252,0.8)', borderRadius:10 }}>
                <CheckCircle size={14} style={{ color: user.is_active?'#22c55e':'#9891a6', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:10.5, fontWeight:700, color:'#9891a6', textTransform:'uppercase', letterSpacing:'0.05em' }}>Status</p>
                  <p style={{ margin:'2px 0 0', fontSize:13.5, fontWeight:600, color: user.is_active?'#16a34a':'#9891a6' }}>{user.is_active?'Active':'Inactive'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:16, border:'1px solid rgba(255,255,255,0.9)', padding:18, boxShadow:'0 2px 8px rgba(0,0,0,0.04)', display:'flex', flexDirection:'column', gap:10 }}>
            <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:700, color:'#9891a6', textTransform:'uppercase', letterSpacing:'0.05em' }}>Actions</p>
            <button className={styles.btnSecondary} onClick={toggleActive} style={{ justifyContent:'center' }}>
              {user.is_active ? <><ToggleRight size={14}/> Deactivate Account</> : <><ToggleLeft size={14}/> Activate Account</>}
            </button>
            <button className={styles.btnDanger} onClick={forceLogout} style={{ justifyContent:'center' }}>
              <LogOut size={13} /> Force Logout
            </button>
          </div>
        </div>

        {/* â”€â”€ Right column â”€â”€ */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Academic Enrollment (Students) */}
          {user.role === 'student' && (
            <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'#faf5ff', display:'flex', alignItems:'center', justifyContent:'center', color:'#9333ea' }}>
                  <GraduationCap size={17} strokeWidth={1.8} />
                </div>
                <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Academic Enrollment</p>
              </div>

              {sections.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 16px', color:'#9891a6', fontSize:14 }}>
                  Not enrolled in any section yet.
                </div>
              ) : sections.map(sec => (
                <div key={sec.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'rgba(245,243,255,0.5)', borderRadius:12, marginBottom:8 }}>
                  <BookOpen size={14} style={{ color:'#9333ea', flexShrink:0 }} />
                  <div>
                    <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#201b2e' }}>{sec.name}</p>
                    <p style={{ margin:'2px 0 0', fontSize:12, color:'#9891a6' }}>Section ID: {sec.id.slice(0,8)}â€¦</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sessions (Instructors) */}
          {user.role === 'instructor' && (
            <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'#ecfdf5', display:'flex', alignItems:'center', justifyContent:'center', color:'#10b981' }}>
                  <Radio size={17} strokeWidth={1.8} />
                </div>
                <div>
                  <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Sessions Conducted</p>
                  <p style={{ margin:0, fontSize:12, color:'#9891a6' }}>{sessions.length} total sessions</p>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 16px', color:'#9891a6', fontSize:14 }}>
                  No sessions conducted yet.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Session</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {sessions.slice(0, 10).map((s: any) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight:600, color:'#201b2e' }}>{s.title ?? 'Lab Session'}</td>
                          <td><span className={s.status==='active'?styles.badgeActive:styles.badgeInactive}>{s.status}</span></td>
                          <td style={{ color:'#726a85', fontSize:13 }}>
                            {new Date(s.scheduled_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Joined date */}
          <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:16, border:'1px solid rgba(255,255,255,0.9)', padding:18, boxShadow:'0 2px 8px rgba(0,0,0,0.04)', display:'flex', alignItems:'center', gap:12 }}>
            <Calendar size={16} style={{ color:'#9333ea', flexShrink:0 }} />
            <div>
              <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#9891a6', textTransform:'uppercase' }}>Member Since</p>
              <p style={{ margin:'2px 0 0', fontSize:14, fontWeight:600, color:'#201b2e' }}>
                {new Date(user.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </InstitutionShell>
  );
}

