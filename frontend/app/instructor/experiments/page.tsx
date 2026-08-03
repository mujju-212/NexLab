'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FlaskConical, Plus, Search, Filter, BookOpen, Code, FileText, CheckCircle2,
  Clock, ShieldAlert, Sparkles, Layers, Terminal, X, Save, Upload, Video, HelpCircle
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface Experiment {
  id: string;
  title: string;
  subject: string;
  version: string;
  status: 'Ready' | 'Draft';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  languages: string[];
  aim: string;
  testCasesCount: number;
  gateThreshold: number;
  updatedAt: string;
}

const INITIAL_EXPERIMENTS: Experiment[] = [
  {
    id: 'exp-stack',
    title: 'Stack Data Structure Implementation',
    subject: 'Data Structures (CS301)',
    version: 'v1.0.0',
    status: 'Ready',
    difficulty: 'Medium',
    languages: ['Python', 'C++'],
    aim: 'Implement LIFO Stack with push, pop, and peek operations.',
    testCasesCount: 5,
    gateThreshold: 75,
    updatedAt: 'Jul 24, 2026',
  },
  {
    id: 'exp-titration',
    title: 'Acid-Base Titration Analysis',
    subject: 'Chemistry (CH101)',
    version: 'v1.2.0',
    status: 'Ready',
    difficulty: 'Easy',
    languages: ['Python'],
    aim: 'Determine molarity of unknown HCl using standardized NaOH.',
    testCasesCount: 4,
    gateThreshold: 70,
    updatedAt: 'Jul 20, 2026',
  },
  {
    id: 'exp-cpu-sched',
    title: 'CPU Process Scheduling Simulator',
    subject: 'Operating Systems (CS302)',
    version: 'v0.9.0',
    status: 'Draft',
    difficulty: 'Hard',
    languages: ['C', 'C++'],
    aim: 'Simulate FCFS, SJF, and Round Robin scheduling algorithms.',
    testCasesCount: 6,
    gateThreshold: 80,
    updatedAt: 'Jul 28, 2026',
  },
  {
    id: 'exp-sql-join',
    title: 'Relational Database Joins & Aggregations',
    subject: 'DBMS (CS303)',
    version: 'v1.0.0',
    status: 'Ready',
    difficulty: 'Medium',
    languages: ['SQL'],
    aim: 'Master INNER, LEFT, RIGHT joins and GROUP BY queries.',
    testCasesCount: 8,
    gateThreshold: 75,
    updatedAt: 'Jul 15, 2026',
  },
];

export default function ExperimentsPage() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<Experiment[]>(INITIAL_EXPERIMENTS);
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('Data Structures (CS301)');
  const [newAim, setNewAim] = useState('');
  const [newTheory, setNewTheory] = useState('');
  const [newDifficulty, setNewDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [newThreshold, setNewThreshold] = useState<number>(75);

  const filteredExperiments = experiments.filter((exp) => {
    const matchSubject = selectedSubject === 'All' || exp.subject.includes(selectedSubject);
    const matchStatus = statusFilter === 'All' || exp.status === statusFilter;
    const matchSearch = exp.title.toLowerCase().includes(searchTerm.toLowerCase()) || exp.aim.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSubject && matchStatus && matchSearch;
  });

  const handleSaveExperiment = () => {
    if (!newTitle) return;
    const created: Experiment = {
      id: `exp-${Date.now()}`,
      title: newTitle,
      subject: newSubject,
      version: 'v1.0.0',
      status: 'Ready',
      difficulty: newDifficulty,
      languages: ['Python', 'C++'],
      aim: newAim || 'Understand fundamental concepts through interactive simulation and coding.',
      testCasesCount: 5,
      gateThreshold: newThreshold,
      updatedAt: 'Today',
    };
    setExperiments([created, ...experiments]);
    setShowModal(false);
    // Reset modal
    setWizardStep(1);
    setNewTitle('');
    setNewAim('');
    setNewTheory('');
  };

  return (
    <InstructorShell
      activePage="Experiments"
      title="Content & Experiment Preparation"
      subtitle="Workflow 2: Author lab experiments, define test cases, attached media, pre-lab quizzes, and docker setups"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => setShowModal(true)}>
          <Plus size={16} strokeWidth={2} /> Create Experiment
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/content')}>
          <BookOpen size={16} strokeWidth={1.9} /> Content Library
        </button>
        <button type="button" className={styles.ghostBtn} onClick={() => router.push('/instructor/sessions/schedule')}>
          <Sparkles size={16} strokeWidth={1.9} /> Schedule Session
        </button>
      </div>

      {/* Filter Tabs */}
      <div className={styles.tabRow}>
        {['All Subjects', 'CS301 Data Structures', 'CS302 OS', 'CS303 DBMS', 'CH101 Chemistry'].map((subj) => {
          const key = subj.startsWith('All') ? 'All' : subj.split(' ')[0];
          return (
            <button
              key={subj}
              type="button"
              className={`${styles.tabChip} ${selectedSubject === key ? styles.tabChipActive : ''}`}
              onClick={() => setSelectedSubject(key)}
            >
              {subj}
            </button>
          );
        })}
      </div>

      {/* KPI Stats */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Total Experiments</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>{experiments.length}</p>
          <p className={styles.kpiSub}>Across 4 subjects</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Ready for Live Session</p>
          <p className={styles.kpiValue} style={{ color: '#0f766e' }}>{experiments.filter(e => e.status === 'Ready').length}</p>
          <p className={styles.kpiSub}>Gate threshold configured</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>In Draft / Review</p>
          <p className={styles.kpiValue} style={{ color: '#b45309' }}>{experiments.filter(e => e.status === 'Draft').length}</p>
          <p className={styles.kpiSub}>Pending test case review</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Cloud Storage & Metadata</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>Synced</p>
          <p className={styles.kpiSub}>PostgreSQL + Cloudinary</p>
        </div>
      </div>

      {/* Experiment List Section */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Authoring Library</h2>
            <p className={styles.sectionSub}>Manage aims, test cases, rubrics, and pre-lab readiness requirements.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['All', 'Ready', 'Draft'].map((st) => (
              <button
                key={st}
                type="button"
                className={`${styles.tabChip} ${statusFilter === st ? styles.tabChipActive : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.list}>
          {filteredExperiments.map((exp) => (
            <div key={exp.id} className={styles.listRow}>
              <div className={styles.rowIcon}>
                <FlaskConical size={20} strokeWidth={1.9} />
              </div>
              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className={styles.rowTitle}>{exp.title}</p>
                  <span className={`${styles.badge} ${exp.status === 'Ready' ? styles.greenBadge : styles.amberBadge}`}>
                    {exp.version} · {exp.status}
                  </span>
                </div>
                <p className={styles.rowMeta}>
                  {exp.subject} · Difficulty: <strong>{exp.difficulty}</strong> · Languages: {exp.languages.join(', ')}
                </p>
                <p className={styles.rowSub}>
                  🎯 Aim: {exp.aim} | 🧪 {exp.testCasesCount} Test Cases | 🔒 Gate Threshold: {exp.gateThreshold}%
                </p>
              </div>
              <div className={styles.rowSide}>
                <span className={styles.rowMeta}>Updated {exp.updatedAt}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => router.push('/instructor/sessions/schedule')}
                  >
                    Schedule
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
                    onClick={() => {
                      setNewTitle(exp.title);
                      setNewSubject(exp.subject);
                      setNewAim(exp.aim);
                      setNewThreshold(exp.gateThreshold);
                      setShowModal(true);
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CREATE / EDIT EXPERIMENT MODAL (Workflow 2 Wizard) */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Workflow 2: Author Experiment</h3>
                <p className={styles.sectionSub}>Step {wizardStep} of 3: {wizardStep === 1 ? 'Basic Info & Aim' : wizardStep === 2 ? 'Test Cases & Rubric' : 'Pre-Lab & Gate Threshold'}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            {wizardStep === 1 && (
              <div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Experiment Title</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Queue Data Structure & Array Implementation"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Subject</label>
                  <select className={styles.select} value={newSubject} onChange={(e) => setNewSubject(e.target.value)}>
                    <option>Data Structures (CS301)</option>
                    <option>Operating Systems (CS302)</option>
                    <option>DBMS (CS303)</option>
                    <option>Chemistry (CH101)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Aim of Experiment</label>
                  <textarea
                    className={styles.textarea}
                    placeholder="State the clear educational aim..."
                    value={newAim}
                    onChange={(e) => setNewAim(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Theory & Concepts</label>
                  <textarea
                    className={styles.textarea}
                    placeholder="Explain background theoretical principles, mathematical formulas, or algorithms..."
                    value={newTheory}
                    onChange={(e) => setNewTheory(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className={styles.primaryBtn} onClick={() => setWizardStep(2)}>
                    Next: Test Cases →
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Difficulty Level</label>
                  <select className={styles.select} value={newDifficulty} onChange={(e) => setNewDifficulty(e.target.value as any)}>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Visible & Hidden Test Cases</label>
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600 }}>Test Case #1 (Visible sample)</p>
                    <input className={styles.input} style={{ marginBottom: '8px' }} placeholder="Input: Push 5, Push 10, Pop" defaultValue="Push 5, Push 10, Pop" />
                    <input className={styles.input} placeholder="Expected Output: 10" defaultValue="10" />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>CO / PO Mapping</label>
                  <input className={styles.input} defaultValue="CO-2 (Apply Stack Data Structures), PO-1 (Engineering Knowledge)" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setWizardStep(1)}>
                    ← Back
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={() => setWizardStep(3)}>
                    Next: Pre-Lab Gate →
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Pre-Lab Gate Threshold Score (% required to unlock Live Lab)</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(Number(e.target.value))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Pre-Lab Assets (Videos, PDFs, Starters)</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span className={styles.pillBlue}><Video size={12} /> Video Attached</span>
                    <span className={styles.pillPurple}><FileText size={12} /> Lab Manual PDF</span>
                    <span className={styles.pillGreen}><Code size={12} /> Starter Python File</span>
                    <span className={styles.pillAmber}><HelpCircle size={12} /> 5-Question Quiz</span>
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '12px', marginTop: '14px' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                    ✅ Ready for Publish: System will version metadata to PostgreSQL & files to Cloudinary (v1.0.0).
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setWizardStep(2)}>
                    ← Back
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={handleSaveExperiment}>
                    <Save size={16} /> Save & Publish Experiment
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
