'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type InstitutionUser, type UserEnrolment, type SectionSubjectDetail } from '@/services/institution.service';
import {
  User, Mail, Phone, Hash, GraduationCap, BookOpen,
  Radio, ToggleRight, ToggleLeft, LogOut, ArrowLeft,
  Calendar, BarChart3, CheckCircle, KeyRound, Copy,
  Check, Eye, EyeOff, ShieldCheck, RefreshCw, X
} from 'lucide-react';
import styles from '../../dashboard/page.module.css';

function generateRandomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 8; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Nx-${rand}!${Math.floor(Math.random() * 89 + 10)}`;
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const queryClient = useQueryClient();
  const [user,     setUser]     = useState<InstitutionUser | null>(null);
  const [sections, setSections] = useState<UserEnrolment[]>([]);
  const [teaching, setTeaching] = useState<SectionSubjectDetail[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [toast,    setToast]    = useState<string | null>(null);

  // Password reset modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [showPasswordText, setShowPasswordText] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessPassword, setResetSuccessPassword] = useState<string | null>(null);
  const [copiedResetCreds, setCopiedResetCreds] = useState(false);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // One call returns the profile, section enrolments, and teaching load.
  // Shares the ['institution','users','record',id] cache key with the users
  // list drawer — opening a profile right after browsing the list is instant.
  const { isPending: loading, isError } = useQuery({
    queryKey: ['institution', 'users', 'record', id],
    queryFn: async () => {
      const rec = await institutionService.getUser(id);
      setUser(rec.user);
      setSections(rec.enrolments ?? []);
      setTeaching(rec.teaching ?? []);
      // Instructors also get their conducted-session history.
      if (rec.user.role === 'instructor') {
        try { setSessions(await institutionService.getInstructorSessions(id)); } catch { /* non-fatal */ }
      }
      return rec;
    },
    staleTime: 30 * 1000,
    retry: false,
  });

  // A failed load (deleted/foreign user) bounces back to the list.
  useEffect(() => {
    if (isError) router.push('/institution/users');
  }, [isError, router]);

  const toggleActive = async () => {
    if (!user) return;
    try {
      await institutionService.toggleUserActive(user.id);
      setUser(u => u ? { ...u, is_active: !u.is_active } : u);
      // keep list + record caches honest
      queryClient.invalidateQueries({ queryKey: ['institution', 'users'] });
      toast3(`${user.full_name} ${user.is_active ? 'deactivated' : 'activated'}.`);
    } catch { toast3('Action failed.'); }
  };

  const forceLogout = async () => {
    if (!user) return;
    try { await institutionService.forceLogoutUser(user.id); toast3('User logged out.'); }
    catch { toast3('Force logout failed.'); }
  };

  const handleOpenResetModal = () => {
    setResetPasswordInput(generateRandomPassword());
    setMustChangePassword(true);
    setShowPasswordText(true);
    setResetSuccessPassword(null);
    setCopiedResetCreds(false);
    setShowResetModal(true);
  };

  const handleConfirmReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;
    setIsResetting(true);
    try {
      const res = await institutionService.resetUserPassword(
        user.id,
        resetPasswordInput.trim() || undefined,
        mustChangePassword
      );
      const finalPw = res.temp_password || res.new_password || resetPasswordInput.trim();
      setResetSuccessPassword(finalPw);
      queryClient.invalidateQueries({ queryKey: ['institution', 'users'] });
      toast3(`Password reset for ${user.full_name}`);
    } catch (err: any) {
      toast3(err?.response?.data?.error ?? 'Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!user || !resetSuccessPassword) return;
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://nexlab.app/login';
    const text = `NexLab Account Credentials\nName: ${user.full_name}\nEmail: ${user.email}\nRole: ${user.role}\nPassword: ${resetSuccessPassword}\nLogin Portal: ${loginUrl}\nNote: Please change your password upon first login.`;
    navigator.clipboard.writeText(text);
    setCopiedResetCreds(true);
    setTimeout(() => setCopiedResetCreds(false), 2500);
  };

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '??';
  const avatarBg = user?.role === 'student' ? '#9333ea' : '#10b981';

  if (loading) return (
    <InstitutionShell activePage="Users" title="Loading…">
      <div className={styles.emptyState}>Loading profile…</div>
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

        {/* ── Profile Card ── */}
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
                { Icon: Phone, label: 'Phone',       value: user.phone ?? '—' },
                { Icon: Hash,  label: 'Roll No.',    value: user.roll_number ?? '—' },
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
            <button
              className={styles.btnSecondary}
              onClick={handleOpenResetModal}
              style={{ justifyContent:'center', color:'#7c3aed', borderColor:'rgba(124,58,237,0.35)', background:'#faf5ff' }}
            >
              <KeyRound size={14} /> Reset Password
            </button>
            <button className={styles.btnSecondary} onClick={toggleActive} style={{ justifyContent:'center' }}>
              {user.is_active ? <><ToggleRight size={14}/> Deactivate Account</> : <><ToggleLeft size={14}/> Activate Account</>}
            </button>
            <button className={styles.btnDanger} onClick={forceLogout} style={{ justifyContent:'center' }}>
              <LogOut size={13} /> Force Logout
            </button>
          </div>
        </div>

        {/* ── Right column ── */}
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
                <div key={sec.section_id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'rgba(245,243,255,0.5)', borderRadius:12, marginBottom:8 }}>
                  <BookOpen size={14} style={{ color:'#9333ea', flexShrink:0 }} />
                  <div>
                    <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#201b2e' }}>{sec.section_name}</p>
                    <p style={{ margin:'2px 0 0', fontSize:12, color:'#9891a6' }}>
                      {sec.batch_name ?? 'Unassigned batch'}{sec.program ? ` · ${sec.program}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Teaching assignments (Instructors) */}
          {user.role === 'instructor' && (
            <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'#faf5ff', display:'flex', alignItems:'center', justifyContent:'center', color:'#9333ea' }}>
                  <BookOpen size={17} strokeWidth={1.8} />
                </div>
                <div>
                  <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Teaching Assignments</p>
                  <p style={{ margin:0, fontSize:12, color:'#9891a6' }}>{teaching.length} subject{teaching.length === 1 ? '' : 's'} assigned</p>
                </div>
              </div>
              {teaching.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 16px', color:'#9891a6', fontSize:14 }}>
                  No subjects assigned yet.
                </div>
              ) : teaching.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'rgba(245,243,255,0.5)', borderRadius:12, marginBottom:8 }}>
                  <BookOpen size={14} style={{ color:'#9333ea', flexShrink:0 }} />
                  <div>
                    <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#201b2e' }}>
                      {t.subject_name}{t.subject_code ? ` (${t.subject_code})` : ''}
                    </p>
                    <p style={{ margin:'2px 0 0', fontSize:12, color:'#9891a6' }}>
                      Section {t.section_name ?? '—'}{t.co_instructor_name ? ` · with ${t.co_instructor_name}` : ''}
                    </p>
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

      {/* ── MODAL: Reset Password ─────────────────────────────────────────── */}
      {showResetModal && (
        <div className={styles.modalOverlay} onClick={() => setShowResetModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            {resetSuccessPassword ? (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', background: '#ecfdf5',
                    color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}>
                    <ShieldCheck size={28} />
                  </div>
                  <h3 className={styles.modalTitle} style={{ margin: 0 }}>Password Reset Successfully</h3>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>
                    The new credentials for <strong>{user.full_name}</strong> are ready.
                  </p>
                </div>

                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14,
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#64748b' }}>Account Email:</span>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{user.email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                    <span style={{ color: '#64748b' }}>New Password:</span>
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14,
                      color: '#7c3aed', background: '#ede9fe', padding: '3px 8px', borderRadius: 6
                    }}>
                      {resetSuccessPassword}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#64748b' }}>Force Logout:</span>
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>Active sessions revoked</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    style={{ justifyContent: 'center', width: '100%', padding: '10px 16px' }}
                    onClick={handleCopyCredentials}
                  >
                    {copiedResetCreds ? <Check size={16} /> : <Copy size={16} />}
                    {copiedResetCreds ? 'Copied to Clipboard!' : 'Copy Full Credentials'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    style={{ justifyContent: 'center', width: '100%' }}
                    onClick={() => setShowResetModal(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmReset}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: '#faf5ff',
                      color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <h3 className={styles.modalTitle} style={{ margin: 0, fontSize: 16 }}>Reset User Password</h3>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{user.full_name} ({user.email})</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className={styles.fieldLabel} style={{ margin: 0 }}>New Password</label>
                    <button
                      type="button"
                      onClick={() => setResetPasswordInput(generateRandomPassword())}
                      style={{
                        background: 'none', border: 'none', color: '#7c3aed', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                      }}
                    >
                      <RefreshCw size={11} /> Generate Random
                    </button>
                  </div>

                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showPasswordText ? 'text' : 'password'}
                      className={styles.input}
                      value={resetPasswordInput}
                      onChange={e => setResetPasswordInput(e.target.value)}
                      placeholder="Enter new password (min. 6 characters)"
                      required
                      style={{
                        fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5,
                        paddingRight: 40, letterSpacing: showPasswordText ? '0.04em' : 'normal'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      style={{
                        position: 'absolute', right: 10, background: 'none', border: 'none',
                        cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex'
                      }}
                    >
                      {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
                    Must be at least 6 characters. Leave as generated or type a custom one.
                  </p>
                </div>

                <div style={{
                  background: 'rgba(245,243,255,0.6)', border: '1px solid #ede9fe',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 20
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={mustChangePassword}
                      onChange={e => setMustChangePassword(e.target.checked)}
                      style={{ accentColor: '#7c3aed', width: 15, height: 15 }}
                    />
                    <span style={{ fontSize: 12.5, color: '#334155', fontWeight: 500 }}>
                      Require user to change password on first login
                    </span>
                  </label>
                </div>

                <div className={styles.modalFooter} style={{ margin: 0, paddingTop: 14 }}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setShowResetModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={isResetting || !resetPasswordInput.trim()}
                  >
                    {isResetting ? 'Resetting…' : 'Apply Password Reset'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}

