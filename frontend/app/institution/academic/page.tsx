'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type AcademicYear, type Batch, type Section, type Subject, type InstitutionUser, type Department, type SectionSubjectDetail } from '@/services/institution.service';
import { ChevronRight, Plus, X, ChevronDown, Users, BookOpen, UserCheck, GraduationCap, Edit3, Trash2, Building2 } from 'lucide-react';
import styles from '../dashboard/page.module.css';

type Tab = 'structure' | 'departments' | 'sections' | 'subjects' | 'enroll';

export default function AcademicPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) ?? 'structure');

  // Data
  const [years,    setYears]    = useState<AcademicYear[]>([]);
  const [batches,  setBatches]  = useState<Batch[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<InstitutionUser[]>([]);
  const [instructors, setInstructors] = useState<InstitutionUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toast, setToast]       = useState<string|null>(null);

  // Selected for enroll/assign
  const [selectedSection,  setSelectedSection]  = useState('');
  const [selectedSubject,  setSelectedSubject]  = useState('');
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubjectDetail[]>([]);
  const [ssLoading, setSsLoading] = useState(false);

  // Modals
  const [showYearModal,    setShowYearModal]    = useState(false);
  const [showBatchModal,   setShowBatchModal]   = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showDeptModal,    setShowDeptModal]    = useState(false);
  const [yearLabel,   setYearLabel]   = useState('');
  const [batchForm,   setBatchForm]   = useState({ year_id:'', name:'', program:'' });
  const [sectionForm, setSectionForm] = useState({ batch_id:'', name:'' });
  const [subjectForm, setSubjectForm] = useState({ name:'', code:'', description:'' });
  const [deptForm,    setDeptForm]    = useState({ name:'', code:'' });

  // Edit state
  const [editYearId, setEditYearId] = useState<string|null>(null);
  const [editYearLabel, setEditYearLabel] = useState('');
  const [editBatch, setEditBatch] = useState<any>(null);
  const [editSection, setEditSection] = useState<any>(null);
  const [editSubject, setEditSubject] = useState<any>(null);
  const [editDept, setEditDept] = useState<Department|null>(null);

  const toast3 = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const deleteEntity = async (type: string, id: string) => {
    if (!confirm(`Delete this ${type}? This cannot be undone.`)) return;
    try {
      const { apiClient } = await import('@/services/api-client');
      await apiClient.delete(`/institution/${type}/${id}`);
      toast3(`${type} deleted.`); loadAll();
    } catch { toast3(`Delete failed — backend may not support this yet.`); }
  };

  const updateEntity = async (type: string, id: string, body: any, close: ()=>void) => {
    try {
      const { apiClient } = await import('@/services/api-client');
      await apiClient.patch(`/institution/${type}/${id}`, body);
      toast3(`Updated!`); close(); loadAll();
    } catch { toast3(`Update failed — backend may not support this yet.`); }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [y, b, s, sub, studs, insts, depts] = await Promise.all([
        institutionService.getAcademicYears(),
        institutionService.getBatches(),
        institutionService.getSections(),
        institutionService.getSubjects(),
        institutionService.listUsers({ role: 'student' }),
        institutionService.listUsers({ role: 'instructor' }),
        institutionService.listDepartments(),
      ]);
      setYears(y); setBatches(b); setSections(s); setSubjects(sub);
      setStudents(studs.filter(u => u.is_active));
      setInstructors(insts.filter(u => u.is_active));
      setDepartments(depts);
    } catch {
      toast3('Could not load academic data. Please retry.');
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  // Load subjects already assigned to the picked section (race-guarded on quick switches).
  useEffect(() => {
    if (!selectedSection) { setSectionSubjects([]); return; }
    let active = true;
    setSsLoading(true);
    institutionService.getSectionSubjects(selectedSection)
      .then(list => { if (active) setSectionSubjects(list); })
      .catch(() => { if (active) setSectionSubjects([]); })
      .finally(() => { if (active) setSsLoading(false); });
    return () => { active = false; };
  }, [selectedSection]);

  const refreshSectionSubjects = async () => {
    if (!selectedSection) return;
    try { setSectionSubjects(await institutionService.getSectionSubjects(selectedSection)); } catch { /* keep prior list */ }
  };

  const createDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await institutionService.createDepartment(deptForm);
      toast3('Department created!');
      setShowDeptModal(false); setDeptForm({ name:'', code:'' });
      loadAll();
    } catch (err: any) { toast3(err?.response?.data?.error ?? 'Failed to create department.'); }
  };

  const saveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDept) return;
    try {
      await institutionService.updateDepartment(editDept.id, { name: editDept.name, code: editDept.code ?? undefined });
      toast3('Department updated!'); setEditDept(null); loadAll();
    } catch (err: any) { toast3(err?.response?.data?.error ?? 'Update failed.'); }
  };

  const removeDept = async (id: string) => {
    if (!confirm('Delete this department? This cannot be undone.')) return;
    try {
      await institutionService.deleteDepartment(id);
      toast3('Department deleted.'); loadAll();
    } catch (err: any) { toast3(err?.response?.data?.error ?? 'Delete failed — users may still be assigned to it.'); }
  };

  const wrap = (fn: () => Promise<unknown>, close: () => void, msg: string) =>
    async (e: React.FormEvent) => {
      e.preventDefault();
      try { await fn(); toast3(msg); close(); loadAll(); } catch { toast3('Failed.'); }
    };

  const enrollStudents = async () => {
    if (!selectedSection || selectedStudents.length === 0) { toast3('Select a section and at least one student.'); return; }
    setEnrolling(true);
    try {
      const res = await institutionService.enrollStudents(selectedSection, selectedStudents);
      toast3(`Enrolled ${res.enrolled} students successfully.`);
      setSelectedStudents([]);
    } catch { toast3('Enrollment failed.'); }
    finally { setEnrolling(false); }
  };

  const assignSubject = async () => {
    if (!selectedSection || !selectedSubject || !selectedInstructor) { toast3('Select section, subject, and instructor.'); return; }
    setAssigning(true);
    try {
      await institutionService.assignSubjectToSection({ section_id: selectedSection, subject_id: selectedSubject, instructor_id: selectedInstructor });
      toast3('Subject assigned to section with instructor!');
      setSelectedSubject(''); setSelectedInstructor('');
      refreshSectionSubjects();
    } catch { toast3('Assignment failed.'); }
    finally { setAssigning(false); }
  };

  const changeSSInstructor = async (ssId: string, instructorId: string) => {
    try {
      await institutionService.updateSectionSubject(ssId, { instructor_id: instructorId });
      toast3('Instructor updated.');
      refreshSectionSubjects();
    } catch { toast3('Could not update instructor.'); }
  };

  const removeSS = async (ssId: string) => {
    if (!confirm('Remove this subject from the section?')) return;
    try {
      await institutionService.deleteSectionSubject(ssId);
      toast3('Subject assignment removed.');
      refreshSectionSubjects();
    } catch { toast3('Could not remove assignment.'); }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const tabs: { id: Tab; label: string; Icon: any }[] = [
    { id:'structure',    label:'Years & Batches',  Icon: GraduationCap },
    { id:'departments',  label:'Departments',      Icon: Building2 },
    { id:'sections',     label:'Sections',         Icon: Users },
    { id:'subjects',     label:'Subjects',         Icon: BookOpen },
    { id:'enroll',       label:'Enroll & Assign',  Icon: UserCheck },
  ];

  return (
    <InstitutionShell activePage="Academic" title="Academic Structure"
      subtitle="Manage departments, sections, subjects and student enrollment.">

      {toast && <div style={{ position:'fixed', bottom:24, right:24, zIndex:300, background:'#201b2e', color:'#fff', padding:'12px 20px', borderRadius:12, fontSize:14, fontWeight:600 }}>{toast}</div>}

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className={`${styles.tab} ${tab===id?styles.tabActive:''}`} onClick={() => setTab(id)}
            style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ═══════════ DEPARTMENTS (Years → Batches → Sections) ═══════════ */}
      {tab==='structure' && (
        <>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Academic Years & Departments</h2>
            <div style={{ display:'flex', gap:8 }}>
              <button className={styles.btnSecondary} onClick={()=>setShowBatchModal(true)}><Plus size={13}/> Add Batch</button>
              <button className={styles.btnPrimary}   onClick={()=>setShowYearModal(true)}><Plus size={13}/> Add Year</button>
            </div>
          </div>

          {loading ? <div className={styles.emptyState}>Loading…</div> :
           years.length===0 ? (
            <div className={styles.emptyState}>
              <GraduationCap size={32} strokeWidth={1.4} style={{ color:'#d8b4fe', marginBottom:8 }}/>
              <p>No academic years yet. Start by adding an academic year.</p>
              <button className={styles.btnPrimary} onClick={()=>setShowYearModal(true)}><Plus size={14}/> Add First Year</button>
            </div>
           ) : years.map(yr => (
            <div key={yr.id} className={styles.treeCard} style={{ marginBottom:14 }}>
              {/* Year header */}
              <div className={styles.treeItem} style={{ background:'rgba(245,243,255,0.6)', borderRadius:10, marginBottom:8 }}>
                <ChevronDown size={15} style={{ color:'#9333ea' }}/>
                <span className={styles.treeLabel} style={{ fontSize:15 }}>{yr.year_label}</span>
                {yr.is_active && <span className={styles.badgeActive} style={{ fontSize:10 }}>Active</span>}
                <span className={styles.treeCount}>{batches.filter(b=>b.year_id===yr.id).length} departments</span>
                <button onClick={()=>{setEditYearId(yr.id);setEditYearLabel(yr.year_label);}} style={{ background:'none',border:'none',cursor:'pointer',color:'#9333ea',padding:4 }} title="Edit"><Edit3 size={13}/></button>
                <button onClick={()=>deleteEntity('academic-years',yr.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4 }} title="Delete"><Trash2 size={13}/></button>
              </div>

              {/* Batches = Departments */}
              {batches.filter(b=>b.year_id===yr.id).length === 0 ? (
                <p style={{ fontSize:13, color:'#9891a6', padding:'4px 12px' }}>No departments — <button onClick={()=>setShowBatchModal(true)} style={{ background:'none', border:'none', color:'#9333ea', cursor:'pointer', fontWeight:700, fontSize:13 }}>Add one</button></p>
              ) : batches.filter(b=>b.year_id===yr.id).map(batch => (
                <div key={batch.id} style={{ marginLeft:16, marginBottom:8 }}>
                  {/* Batch header */}
                  <div className={styles.treeItem} style={{ background:'rgba(245,243,255,0.35)', borderRadius:9 }}>
                    <ChevronRight size={13} style={{ color:'#c084fc' }}/>
                    <span className={styles.treeLabel}>{batch.name}</span>
                    {batch.program && <span style={{ fontSize:12, color:'#9891a6', fontStyle:'italic' }}>{batch.program}</span>}
                    <span className={styles.treeCount}>{sections.filter(s=>s.batch_id===batch.id).length} sections</span>
                    <button onClick={()=>setEditBatch(batch)} style={{ background:'none',border:'none',cursor:'pointer',color:'#9333ea',padding:4 }} title="Edit"><Edit3 size={12}/></button>
                    <button onClick={()=>deleteEntity('batches',batch.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4 }} title="Delete"><Trash2 size={12}/></button>
                    <button className={styles.btnSecondary} style={{ padding:'3px 10px', fontSize:12, marginLeft:'auto' }}
                      onClick={() => { setSectionForm(f=>({...f, batch_id:batch.id})); setShowSectionModal(true); }}>
                      <Plus size={11}/> Section
                    </button>
                  </div>

                  {/* Sections under batch */}
                  <div style={{ marginLeft:20, marginTop:4, display:'flex', flexDirection:'column', gap:4 }}>
                    {sections.filter(s=>s.batch_id===batch.id).map(sec=>(
                      <div key={sec.id} className={styles.treeItem} style={{ background:'rgba(255,255,255,0.6)', borderRadius:8 }}>
                        <div style={{ width:6, height:6, borderRadius:'50%', background:'#d8b4fe', flexShrink:0 }}/>
                        <span style={{ fontSize:13.5, fontWeight:600, color:'#463f57', flex:1 }}>{sec.name}</span>
                        <button onClick={()=>setEditSection(sec)} style={{ background:'none',border:'none',cursor:'pointer',color:'#9333ea',padding:4 }} title="Edit"><Edit3 size={12}/></button>
                        <button onClick={()=>deleteEntity('sections',sec.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4 }} title="Delete"><Trash2 size={12}/></button>
                        <button onClick={() => { setSelectedSection(sec.id); setTab('enroll'); }}
                          style={{ background:'rgba(124,58,237,0.08)', border:'none', borderRadius:7, padding:'3px 10px', fontSize:12, color:'#7c3aed', fontWeight:700, cursor:'pointer' }}>
                          Manage →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ═══════════ SECTIONS TABLE ═══════════ */}
      {tab==='sections' && (
        <>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>All Sections</h2>
            <button className={styles.btnPrimary} onClick={()=>setShowSectionModal(true)}><Plus size={13}/> Add Section</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Section</th><th>Department / Batch</th><th>Year</th><th>Actions</th></tr></thead>
              <tbody>
                {loading?<tr><td colSpan={4} style={{ textAlign:'center', color:'#9891a6', padding:32 }}>Loading…</td></tr>:
                 sections.length===0?<tr><td colSpan={4} style={{ textAlign:'center', color:'#9891a6', padding:32 }}>No sections yet.</td></tr>:
                 sections.map(sec=>{
                   const batch=batches.find(b=>b.id===sec.batch_id);
                   const year=years.find(y=>y.id===batch?.year_id);
                   return (
                     <tr key={sec.id}>
                       <td style={{ fontWeight:700, color:'#201b2e' }}>{sec.name}</td>
                       <td>{batch?.name??'—'} {batch?.program&&<span style={{ color:'#9891a6', fontSize:12 }}>({batch.program})</span>}</td>
                       <td>{year?.year_label??'—'}</td>
                       <td>
                         <button className={styles.btnSecondary} style={{ padding:'5px 12px', fontSize:12 }}
                           onClick={() => { setSelectedSection(sec.id); setTab('enroll'); }}>
                           Manage Students & Subjects
                         </button>
                       </td>
                     </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════ DEPARTMENTS ═══════════ */}
      {tab==='departments' && (
        <>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Academic Departments</h2>
            <button className={styles.btnPrimary} onClick={()=>setShowDeptModal(true)}><Plus size={13}/> Add Department</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Department Name</th><th>Code</th><th>Users Assigned</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
              <tbody>
                {loading?<tr><td colSpan={4} style={{ textAlign:'center', color:'#9891a6', padding:32 }}>Loading…</td></tr>:
                 departments.length===0?(
                  <tr><td colSpan={4} style={{ textAlign:'center', color:'#9891a6', padding:32 }}>
                    No departments yet. Add one (e.g. "Computer Science") so students and faculty can be organised by department.
                  </td></tr>
                 ):
                 departments.map(d=>{
                   const userCount = [...students, ...instructors].filter(u => u.department_id === d.id).length;
                   return (
                    <tr key={d.id}>
                      <td style={{ fontWeight:700, color:'#201b2e' }}>{d.name}</td>
                      <td><code style={{ background:'#faf5ff', color:'#7c3aed', padding:'2px 8px', borderRadius:6, fontSize:12 }}>{d.code??'—'}</code></td>
                      <td style={{ color:'#726a85' }}>{userCount}</td>
                      <td style={{ textAlign:'right' }}>
                        <button onClick={()=>setEditDept(d)} className={styles.btnSecondary} style={{ padding:'4px 8px', fontSize:12, marginRight:4 }}><Edit3 size={12}/></button>
                        <button onClick={()=>removeDept(d.id)} style={{ background:'none',border:'1px solid #fecaca',borderRadius:8,padding:'4px 8px',cursor:'pointer',color:'#ef4444' }}><Trash2 size={12}/></button>
                      </td>
                    </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════ SUBJECTS ═══════════ */}
      {tab==='subjects' && (
        <>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Subjects</h2>
            <button className={styles.btnPrimary} onClick={()=>setShowSubjectModal(true)}><Plus size={13}/> Add Subject</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Subject Name</th><th>Code</th><th>Description</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
              <tbody>
                {loading?<tr><td colSpan={3} style={{ textAlign:'center', color:'#9891a6', padding:32 }}>Loading…</td></tr>:
                 subjects.length===0?<tr><td colSpan={3} style={{ textAlign:'center', color:'#9891a6', padding:32 }}>No subjects yet.</td></tr>:
                 subjects.map(sub=>(
                  <tr key={sub.id}>
                    <td style={{ fontWeight:700, color:'#201b2e' }}>{sub.name}</td>
                    <td><code style={{ background:'#faf5ff', color:'#7c3aed', padding:'2px 8px', borderRadius:6, fontSize:12 }}>{sub.code??'—'}</code></td>
                    <td style={{ color:'#726a85' }}>{sub.description??'—'}</td>
                    <td style={{ textAlign:'right' }}>
                      <button onClick={()=>setEditSubject(sub)} className={styles.btnSecondary} style={{ padding:'4px 8px', fontSize:12, marginRight:4 }}><Edit3 size={12}/></button>
                      <button onClick={()=>deleteEntity('subjects',sub.id)} style={{ background:'none',border:'1px solid #fecaca',borderRadius:8,padding:'4px 8px',cursor:'pointer',color:'#ef4444' }}><Trash2 size={12}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════ ENROLL & ASSIGN ═══════════ */}
      {tab==='enroll' && (
        <>
          {/* Section picker */}
          <div style={{ marginBottom:20 }}>
            <label className={styles.fieldLabel} style={{ display:'block', marginBottom:8 }}>Select Section to Manage</label>
            <select className={styles.select} style={{ maxWidth:360 }} value={selectedSection} onChange={e=>setSelectedSection(e.target.value)}>
              <option value="">Choose a section…</option>
              {sections.map(s=>{
                const b=batches.find(b=>b.id===s.batch_id);
                return <option key={s.id} value={s.id}>{s.name} — {b?.name??''}</option>;
              })}
            </select>
          </div>

          {selectedSection && (
            <div className={styles.grid2}>

              {/* Enroll Students */}
              <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:24, boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:'#faf5ff', display:'flex', alignItems:'center', justifyContent:'center', color:'#9333ea' }}>
                    <Users size={17} strokeWidth={1.8}/>
                  </div>
                  <div>
                    <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Enroll Students</p>
                    <p style={{ margin:0, fontSize:12, color:'#9891a6' }}>{selectedStudents.length} selected</p>
                  </div>
                </div>

                <div style={{ maxHeight:280, overflowY:'auto', display:'flex', flexDirection:'column', gap:4, marginBottom:14 }}>
                  {students.length===0 ? <p style={{ color:'#9891a6', fontSize:13 }}>No active students found.</p> :
                   students.map(s=>(
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, cursor:'pointer', background: selectedStudents.includes(s.id)?'rgba(245,243,255,0.9)':'rgba(255,255,255,0.5)', border:'1px solid', borderColor: selectedStudents.includes(s.id)?'rgba(124,58,237,0.3)':'transparent', transition:'all .12s' }}>
                      <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={()=>toggleStudent(s.id)} style={{ accentColor:'#9333ea' }}/>
                      <div>
                        <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:'#201b2e' }}>{s.full_name}</p>
                        <p style={{ margin:0, fontSize:11.5, color:'#9891a6' }}>{s.roll_number??s.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <button className={styles.btnPrimary} onClick={enrollStudents} disabled={enrolling||selectedStudents.length===0} style={{ width:'100%', justifyContent:'center' }}>
                  {enrolling?'Enrolling…':`Enroll ${selectedStudents.length} Student${selectedStudents.length!==1?'s':''}`}
                </button>
              </div>

              {/* Assign Subject + Instructor */}
              <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:24, boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:'#ecfdf5', display:'flex', alignItems:'center', justifyContent:'center', color:'#10b981' }}>
                    <BookOpen size={17} strokeWidth={1.8}/>
                  </div>
                  <div>
                    <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Assign Subject + Instructor</p>
                    <p style={{ margin:0, fontSize:12, color:'#9891a6' }}>Link a subject and instructor to this section</p>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Subject</label>
                  <select className={styles.select} value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)}>
                    <option value="">Choose subject…</option>
                    {subjects.map(s=><option key={s.id} value={s.id}>{s.name} {s.code?`(${s.code})`:''}</option>)}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Instructor</label>
                  <select className={styles.select} value={selectedInstructor} onChange={e=>setSelectedInstructor(e.target.value)}>
                    <option value="">Choose instructor…</option>
                    {instructors.map(i=><option key={i.id} value={i.id}>{i.full_name} — {i.email}</option>)}
                  </select>
                </div>

                <button className={styles.btnPrimary} onClick={assignSubject} disabled={assigning||!selectedSubject||!selectedInstructor} style={{ width:'100%', justifyContent:'center', marginTop:8, background:'linear-gradient(135deg,#10b981,#059669)' }}>
                  {assigning?'Assigning…':'Assign Subject & Instructor'}
                </button>
              </div>
            </div>
          )}

          {/* Currently assigned subjects for this section */}
          {selectedSection && (
            <div style={{ background:'rgba(255,255,255,0.78)', borderRadius:18, border:'1px solid rgba(255,255,255,0.9)', padding:24, boxShadow:'0 2px 10px rgba(0,0,0,0.05)', marginTop:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'#fffbeb', display:'flex', alignItems:'center', justifyContent:'center', color:'#f59e0b' }}>
                  <BookOpen size={17} strokeWidth={1.8}/>
                </div>
                <div>
                  <p style={{ margin:0, fontFamily:'Space Grotesk,sans-serif', fontSize:15, fontWeight:700, color:'#201b2e' }}>Assigned Subjects</p>
                  <p style={{ margin:0, fontSize:12, color:'#9891a6' }}>{sectionSubjects.length} subject{sectionSubjects.length!==1?'s':''} linked to this section</p>
                </div>
              </div>

              {ssLoading ? (
                <p style={{ color:'#9891a6', fontSize:13, padding:'8px 0' }}>Loading…</p>
              ) : sectionSubjects.length===0 ? (
                <p style={{ color:'#9891a6', fontSize:13, padding:'8px 0' }}>No subjects assigned to this section yet. Use the panel above to link one.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {sectionSubjects.map(ss => (
                    <div key={ss.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'rgba(245,243,255,0.5)', borderRadius:12, flexWrap:'wrap' }}>
                      <BookOpen size={15} style={{ color:'#9333ea', flexShrink:0 }}/>
                      <div style={{ flex:1, minWidth:160 }}>
                        <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#201b2e' }}>
                          {ss.subject_name}{ss.subject_code?` (${ss.subject_code})`:''}
                        </p>
                        {ss.co_instructor_name && (
                          <p style={{ margin:'2px 0 0', fontSize:12, color:'#9891a6' }}>Co-instructor: {ss.co_instructor_name}</p>
                        )}
                      </div>
                      <select className={styles.select} style={{ maxWidth:220, padding:'6px 10px', fontSize:13 }}
                        value={ss.instructor_id}
                        onChange={e=>changeSSInstructor(ss.id, e.target.value)} title="Change instructor">
                        {!instructors.some(i=>i.id===ss.instructor_id) && (
                          <option value={ss.instructor_id}>{ss.instructor_name} (inactive)</option>
                        )}
                        {instructors.map(i=><option key={i.id} value={i.id}>{i.full_name}</option>)}
                      </select>
                      <button onClick={()=>removeSS(ss.id)} style={{ background:'none', border:'1px solid #fecaca', borderRadius:8, padding:'6px 8px', cursor:'pointer', color:'#ef4444', flexShrink:0 }} title="Remove assignment">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!selectedSection && (
            <div className={styles.emptyState}>
              <UserCheck size={32} strokeWidth={1.4} style={{ color:'#d8b4fe', marginBottom:8 }}/>
              <p>Select a section above to enroll students and assign subjects.</p>
            </div>
          )}
        </>
      )}

      {/* ─── Year Modal ─── */}
      {showYearModal && (
        <div className={styles.modalOverlay} onClick={()=>setShowYearModal(false)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>New Academic Year</h2>
              <button onClick={()=>setShowYearModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={wrap(()=>institutionService.createAcademicYear(yearLabel),()=>setShowYearModal(false),'Year created!')}>
              <div className={styles.field}><label className={styles.fieldLabel}>Year Label</label>
                <input className={styles.input} placeholder="e.g. 2024-25" required value={yearLabel} onChange={e=>setYearLabel(e.target.value)}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setShowYearModal(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Batch Modal ─── */}
      {showBatchModal && (
        <div className={styles.modalOverlay} onClick={()=>setShowBatchModal(false)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>New Department / Batch</h2>
              <button onClick={()=>setShowBatchModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={wrap(()=>institutionService.createBatch(batchForm),()=>setShowBatchModal(false),'Batch created!')}>
              <div className={styles.field}><label className={styles.fieldLabel}>Academic Year</label>
                <select className={styles.select} required value={batchForm.year_id} onChange={e=>setBatchForm(f=>({...f,year_id:e.target.value}))}>
                  <option value="">Select year…</option>{years.map(y=><option key={y.id} value={y.id}>{y.year_label}</option>)}</select></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Department / Batch Name</label>
                <input className={styles.input} placeholder="e.g. CSE Department or B.Tech CSE 2024" required value={batchForm.name} onChange={e=>setBatchForm(f=>({...f,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Program (optional)</label>
                <input className={styles.input} placeholder="e.g. B.Tech" value={batchForm.program} onChange={e=>setBatchForm(f=>({...f,program:e.target.value}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setShowBatchModal(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Section Modal ─── */}
      {showSectionModal && (
        <div className={styles.modalOverlay} onClick={()=>setShowSectionModal(false)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>New Section</h2>
              <button onClick={()=>setShowSectionModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={wrap(()=>institutionService.createSection(sectionForm),()=>setShowSectionModal(false),'Section created!')}>
              <div className={styles.field}><label className={styles.fieldLabel}>Department / Batch</label>
                <select className={styles.select} required value={sectionForm.batch_id} onChange={e=>setSectionForm(f=>({...f,batch_id:e.target.value}))}>
                  <option value="">Select department…</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Section Name</label>
                <input className={styles.input} placeholder="e.g. Section A" required value={sectionForm.name} onChange={e=>setSectionForm(f=>({...f,name:e.target.value}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setShowSectionModal(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Subject Modal ─── */}
      {showSubjectModal && (
        <div className={styles.modalOverlay} onClick={()=>setShowSubjectModal(false)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>New Subject</h2>
              <button onClick={()=>setShowSubjectModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={wrap(()=>institutionService.createSubject(subjectForm),()=>setShowSubjectModal(false),'Subject created!')}>
              <div className={styles.field}><label className={styles.fieldLabel}>Subject Name *</label>
                <input className={styles.input} placeholder="e.g. Data Structures" required value={subjectForm.name} onChange={e=>setSubjectForm(f=>({...f,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Subject Code</label>
                <input className={styles.input} placeholder="e.g. CS301" value={subjectForm.code} onChange={e=>setSubjectForm(f=>({...f,code:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Description</label>
                <textarea className={styles.textarea} style={{ minHeight:80 }} value={subjectForm.description} onChange={e=>setSubjectForm(f=>({...f,description:e.target.value}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setShowSubjectModal(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Year Modal ─── */}
      {editYearId && (
        <div className={styles.modalOverlay} onClick={()=>setEditYearId(null)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>Edit Academic Year</h2>
              <button onClick={()=>setEditYearId(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={e=>{e.preventDefault();updateEntity('academic-years',editYearId,{year_label:editYearLabel},()=>setEditYearId(null));}}>
              <div className={styles.field}><label className={styles.fieldLabel}>Year Label</label>
                <input className={styles.input} required value={editYearLabel} onChange={e=>setEditYearLabel(e.target.value)}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setEditYearId(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Batch Modal ─── */}
      {editBatch && (
        <div className={styles.modalOverlay} onClick={()=>setEditBatch(null)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>Edit Batch</h2>
              <button onClick={()=>setEditBatch(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={e=>{e.preventDefault();updateEntity('batches',editBatch.id,{name:editBatch.name,program:editBatch.program},()=>setEditBatch(null));}}>
              <div className={styles.field}><label className={styles.fieldLabel}>Name</label>
                <input className={styles.input} required value={editBatch.name} onChange={e=>setEditBatch((b:any)=>({...b,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Program</label>
                <input className={styles.input} value={editBatch.program??''} onChange={e=>setEditBatch((b:any)=>({...b,program:e.target.value}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setEditBatch(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Section Modal ─── */}
      {editSection && (
        <div className={styles.modalOverlay} onClick={()=>setEditSection(null)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>Edit Section</h2>
              <button onClick={()=>setEditSection(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={e=>{e.preventDefault();updateEntity('sections',editSection.id,{name:editSection.name,class_teacher_id:editSection.class_teacher_id||null},()=>setEditSection(null));}}>
              <div className={styles.field}><label className={styles.fieldLabel}>Section Name</label>
                <input className={styles.input} required value={editSection.name} onChange={e=>setEditSection((s:any)=>({...s,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Class Teacher</label>
                <select className={styles.select} value={editSection.class_teacher_id??''}
                  onChange={e=>setEditSection((s:any)=>({...s,class_teacher_id:e.target.value||null}))}>
                  <option value="">— None assigned —</option>
                  {instructors.map(i=><option key={i.id} value={i.id}>{i.full_name}</option>)}
                </select>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setEditSection(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Subject Modal ─── */}
      {editSubject && (
        <div className={styles.modalOverlay} onClick={()=>setEditSubject(null)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>Edit Subject</h2>
              <button onClick={()=>setEditSubject(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={e=>{e.preventDefault();updateEntity('subjects',editSubject.id,{name:editSubject.name,code:editSubject.code,description:editSubject.description},()=>setEditSubject(null));}}>
              <div className={styles.field}><label className={styles.fieldLabel}>Name</label>
                <input className={styles.input} required value={editSubject.name} onChange={e=>setEditSubject((s:any)=>({...s,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Code</label>
                <input className={styles.input} value={editSubject.code??''} onChange={e=>setEditSubject((s:any)=>({...s,code:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Description</label>
                <textarea className={styles.textarea} style={{minHeight:80}} value={editSubject.description??''} onChange={e=>setEditSubject((s:any)=>({...s,description:e.target.value}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setEditSubject(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Add Department Modal ─── */}
      {showDeptModal && (
        <div className={styles.modalOverlay} onClick={()=>setShowDeptModal(false)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>Add Department</h2>
              <button onClick={()=>setShowDeptModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={createDepartment}>
              <div className={styles.field}><label className={styles.fieldLabel}>Department Name *</label>
                <input className={styles.input} required placeholder="e.g. Computer Science"
                  value={deptForm.name} onChange={e=>setDeptForm(f=>({...f,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Code</label>
                <input className={styles.input} placeholder="e.g. CSE"
                  value={deptForm.code} onChange={e=>setDeptForm(f=>({...f,code:e.target.value.toUpperCase()}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setShowDeptModal(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create Department</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Department Modal ─── */}
      {editDept && (
        <div className={styles.modalOverlay} onClick={()=>setEditDept(null)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 className={styles.modalTitle}>Edit Department</h2>
              <button onClick={()=>setEditDept(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9891a6' }}><X size={20}/></button>
            </div>
            <form onSubmit={saveDept}>
              <div className={styles.field}><label className={styles.fieldLabel}>Department Name</label>
                <input className={styles.input} required value={editDept.name}
                  onChange={e=>setEditDept(d=>d && ({...d,name:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.fieldLabel}>Code</label>
                <input className={styles.input} value={editDept.code??''}
                  onChange={e=>setEditDept(d=>d && ({...d,code:e.target.value.toUpperCase()}))}/></div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={()=>setEditDept(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
