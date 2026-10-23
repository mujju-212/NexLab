'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, Save, ArrowRight, ArrowLeft, BookOpen,
  CheckCircle2, HelpCircle, FileCode, Check, X,
  AlertCircle, Sparkles, Lock, MessageSquare, Code
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { experimentService } from '@/services/experiment.service';
import { sessionService } from '@/services/session.service';
import { experienceService } from '@/services/experience.service';
import { executionService, type CompilerLanguage } from '@/services/execution.service';
import styles from './create-experiment.module.css';

interface SectionSubject {
  section_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  section_name: string;
}

const DEFAULT_LANGS = ['python', 'cpp', 'java', 'sql', 'c', 'javascript'];

function NewExperimentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSubjectId = searchParams.get('subject_id') || '';

  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Step (1 to 4)
  const [currentStep, setCurrentStep] = useState(1);

  // Concept Tag Input state
  const [tagInput, setTagInput] = useState('');
  const [tagsList, setTagsList] = useState<string[]>(['stacks', 'arrays']);

  // Clean Form State with no unwanted prefilled text
  const [form, setForm] = useState({
    subject_id: preselectedSubjectId,
    exp_number: 1,
    title: '',
    aim: '',
    difficulty_level: 2,
    time_limit_sec: 60,
    weightage: 100,
    grade_scale: 100,
    delivery_mode: 'lab' as 'lab' | 'exam' | 'practice',
    available_from: '',
    due_at: '',
    duration_minutes: 60,
    max_attempts: 1,
    pass_threshold: 40,
    shuffle_questions: false,
    experiment_type: 'coding',
    allowed_languages: ['python', 'cpp', 'java'],
    enable_viva: true,
    enable_lockdown: true,
    allow_ai_hints: true,
    proctor_defaults: {} as Record<string, boolean>,
    prerequisites: '',
    learning_outcomes: '',

    // Rubric Weight Distribution (Must sum to 100)
    rubric_test_cases: 60,
    rubric_lab_report: 20,
    rubric_code_quality: 10,
    rubric_viva: 10,
    rubric_quiz: 0,
  });

  const { data: instructorDefaults } = useQuery({
    queryKey: ['instructor', 'settings'],
    queryFn: () => experienceService.getSettings(),
    staleTime: 60 * 1000,
  });

  const { data: ssData, isLoading: loadingSS } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  const { data: langData, isLoading: loadingLang } = useQuery({
    queryKey: ['execution', 'languages'],
    queryFn: () => executionService.listLanguages(),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!instructorDefaults) return;
    const rubric = (instructorDefaults.default_rubric || {}) as Record<string, number>;
    const proctor = (instructorDefaults.default_proctor_policy || {}) as Record<string, boolean>;
    setForm(current => ({
      ...current,
      rubric_test_cases: current.rubric_test_cases === 60 ? Number(rubric.test_cases ?? 60) : current.rubric_test_cases,
      rubric_lab_report: current.rubric_lab_report === 20 ? Number(rubric.lab_report ?? 20) : current.rubric_lab_report,
      rubric_code_quality: current.rubric_code_quality === 10 ? Number(rubric.code_quality ?? 10) : current.rubric_code_quality,
      rubric_viva: current.rubric_viva === 10 ? Number(rubric.viva ?? 10) : current.rubric_viva,
      rubric_quiz: current.rubric_quiz === 0 ? Number(rubric.quiz ?? 0) : current.rubric_quiz,
      allow_ai_hints: current.allow_ai_hints === true ? Boolean(instructorDefaults.allow_ai_hints ?? true) : current.allow_ai_hints,
      enable_lockdown: current.enable_lockdown === true ? Boolean(proctor.lockdown_fullscreen ?? true) : current.enable_lockdown,
      proctor_defaults: Object.keys(proctor).length ? proctor : current.proctor_defaults,
    }));
  }, [instructorDefaults]);

  useEffect(() => {
    const list = ssData?.section_subjects ?? [];
    setSectionSubjects(list);
    if (preselectedSubjectId && list.length > 0) {
      const match = list.find((s: SectionSubject) => s.subject_id === preselectedSubjectId);
      if (match) {
        setForm(f => ({ ...f, subject_id: match.subject_id }));
      }
    } else if (list.length > 0 && !form.subject_id) {
      setForm(f => ({ ...f, subject_id: list[0].subject_id }));
    }
  }, [ssData, preselectedSubjectId]);

  useEffect(() => {
    setLanguages((langData?.languages ?? []).filter((l: CompilerLanguage) => l.engine === 'docker'));
  }, [langData]);

  // Unique subjects dropdown list
  const subjects = sectionSubjects.filter(
    (ss: SectionSubject, i: number) => sectionSubjects.findIndex((x: SectionSubject) => x.subject_id === ss.subject_id) === i
  );

  const langOptions: { id: string; label: string }[] = languages.length
    ? languages.map(l => ({ id: l.id, label: l.label }))
    : DEFAULT_LANGS.map(id => ({ id, label: id.toUpperCase() }));

  const toggleLanguage = (langId: string) => {
    setForm(f => ({
      ...f,
      allowed_languages: f.allowed_languages.includes(langId)
        ? f.allowed_languages.filter(l => l !== langId)
        : [...f.allowed_languages, langId],
    }));
  };

  const handleAddTag = (tag: string) => {
    const cleaned = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleaned && !tagsList.includes(cleaned)) {
      setTagsList(prev => [...prev, cleaned]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList(prev => prev.filter(t => t !== tagToRemove));
  };

  // Step Validation & Navigation
  const handleNextStep = () => {
    setError(null);
    if (currentStep === 1) {
      if (!form.subject_id) { setError('Please select a subject.'); return; }
      if (!form.title.trim()) { setError('Experiment title is required.'); return; }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (tagsList.length === 0) { setError('At least one concept tag is required.'); return; }
      if (form.allowed_languages.length === 0) { setError('Select at least one allowed language.'); return; }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    } else if (currentStep === 4) {
      submit();
    }
  };

  const handlePrevStep = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Calculate Rubric Sum
  const rubricSum = form.rubric_test_cases + form.rubric_lab_report + form.rubric_code_quality + form.rubric_viva + form.rubric_quiz;

  const submit = async () => {
    setError(null);
    if (!form.subject_id) { setError('Please select a subject.'); return; }
    if (!form.title.trim()) { setError('Experiment title is required.'); return; }
    if (tagsList.length === 0) { setError('At least one concept tag is required.'); return; }
    if (form.allowed_languages.length === 0) { setError('Select at least one allowed language.'); return; }
    if (rubricSum !== 100) { setError(`Rubric weight percentages must sum to 100% (Current sum: ${rubricSum}%).`); return; }

    setSaving(true);
    try {
      const exp = await experimentService.create({
        subject_id: form.subject_id,
        exp_number: form.exp_number,
        title: form.title,
        aim: form.aim || undefined,
        difficulty_level: form.difficulty_level,
        concept_tags: tagsList,
        allowed_languages: form.allowed_languages,
        experiment_type: form.experiment_type,
        enable_viva: form.enable_viva,
        enable_lockdown: form.enable_lockdown,
        allow_ai_hints: form.allow_ai_hints,
        proctor_defaults: form.proctor_defaults,
        weightage: form.weightage,
        grade_scale: form.grade_scale,
        rubric_test_cases: form.rubric_test_cases,
        rubric_lab_report: form.rubric_lab_report,
        rubric_code_quality: form.rubric_code_quality,
        rubric_viva: form.rubric_viva,
        rubric_quiz: form.rubric_quiz,
        delivery_mode: form.delivery_mode,
        available_from: form.delivery_mode === 'exam' && form.available_from ? form.available_from : undefined,
        due_at: form.delivery_mode === 'exam' && form.due_at ? form.due_at : undefined,
        time_limit_sec: form.delivery_mode === 'exam' ? form.duration_minutes * 60 : form.time_limit_sec,
        max_attempts: form.delivery_mode === 'exam' ? form.max_attempts : undefined,
        pass_threshold: form.delivery_mode === 'exam' ? form.pass_threshold : undefined,
        shuffle_questions: form.delivery_mode === 'exam' ? form.shuffle_questions : undefined,
      }) as { id?: string };

      router.push(exp?.id ? `/instructor/experiments/${exp.id}/edit?tab=content` : '/instructor/experiments');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to create experiment.');
      setSaving(false);
    }
  };

  const getDifficultyLabel = (lvl: number) => {
    if (lvl === 1) return 'Introductory';
    if (lvl === 3) return 'Advanced';
    return 'Intermediate';
  };

  const activeSubjectName = subjects.find((s: SectionSubject) => s.subject_id === form.subject_id)?.subject_name || 'Data Structures';

  return (
    <InstructorShell activePage="Experiments">
      <div className={styles.container}>
        {/* 1. Breadcrumb Bar */}
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbItem} onClick={() => router.push('/instructor/experiments')}>Instructor</span>
          <ChevronRight size={14} color="#94a3b8" />
          <span className={styles.breadcrumbItem} onClick={() => router.push('/instructor/experiments')}>Experiments</span>
          <ChevronRight size={14} color="#94a3b8" />
          <span className={styles.breadcrumbActive}>Create Experiment</span>
        </div>

        {/* 2. Top Header & Action Buttons */}
        <div className={styles.topHeader}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>Create New Experiment</h1>
            <p className={styles.pageSubtitle}>
              Step {currentStep} of 4 — {
                currentStep === 1 ? 'Enter Basic Details' :
                currentStep === 2 ? 'Set Classification & Rules' :
                currentStep === 3 ? 'Configure Options' :
                'Set Grading & Rubric Allocation'
              }
            </p>
          </div>

          <div className={styles.topActions}>
            <button className={styles.draftBtn} onClick={() => router.push('/instructor/experiments')}>
              <Save size={15} /> Save Draft
            </button>
            <button className={styles.nextTopBtn} disabled={saving} onClick={handleNextStep}>
              {currentStep < 4 ? 'Next Step' : saving ? 'Creating...' : 'Save & Open Studio'} <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* 3. Interactive Stepper Bar matching our 4 Steps */}
        <div className={styles.stepperCard}>
          <div className={styles.stepItem} onClick={() => setCurrentStep(1)}>
            <div className={`${styles.stepCircle} ${currentStep === 1 ? styles.stepActiveCircle : currentStep > 1 ? styles.stepDoneCircle : ''}`}>
              {currentStep > 1 ? <Check size={16} /> : 1}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>1. Basics</span>
              <span className={styles.stepDesc}>Subject, Exp #, Title, Aim</span>
            </div>
          </div>

          <ChevronRight size={16} color="#cbd5e1" />

          <div className={styles.stepItem} onClick={() => setCurrentStep(2)}>
            <div className={`${styles.stepCircle} ${currentStep === 2 ? styles.stepActiveCircle : currentStep > 2 ? styles.stepDoneCircle : ''}`}>
              {currentStep > 2 ? <Check size={16} /> : 2}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>2. Classification & Rules</span>
              <span className={styles.stepDesc}>Difficulty, Tags, Languages</span>
            </div>
          </div>

          <ChevronRight size={16} color="#cbd5e1" />

          <div className={styles.stepItem} onClick={() => setCurrentStep(3)}>
            <div className={`${styles.stepCircle} ${currentStep === 3 ? styles.stepActiveCircle : currentStep > 3 ? styles.stepDoneCircle : ''}`}>
              {currentStep > 3 ? <Check size={16} /> : 3}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>3. Options</span>
              <span className={styles.stepDesc}>Viva, Lockdown, AI Hints</span>
            </div>
          </div>

          <ChevronRight size={16} color="#cbd5e1" />

          <div className={styles.stepItem} onClick={() => setCurrentStep(4)}>
            <div className={`${styles.stepCircle} ${currentStep === 4 ? styles.stepActiveCircle : ''}`}>
              4
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>4. Grading & Rubrics</span>
              <span className={styles.stepDesc}>Rubric weights & scale</span>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '12px 18px', borderRadius: 14, fontSize: 13.5, fontWeight: 700 }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {/* 4. Main 2-Column Layout */}
        <div className={styles.formLayout}>
          {/* LEFT FORM COLUMN - Step-by-Step active view */}
          <div className={styles.mainFormCol}>
            <div className={styles.formCard}>

              {/* ── STEP 1: BASICS ── */}
              {currentStep === 1 && (
                <>
                  <div className={styles.formHeader}>
                    <div className={styles.formIconBox}>
                      <BookOpen size={24} />
                    </div>
                    <div className={styles.formTitleGroup}>
                      <h2 className={styles.formCardTitle}>1. Basic Details</h2>
                      <p className={styles.formCardSubtitle}>Provide essential identification info for this experiment.</p>
                    </div>
                  </div>

                  <div className={styles.gridTwo}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Subject <span className={styles.reqStar}>*</span>
                      </label>
                      <div className={styles.inputWrapper}>
                        <BookOpen size={16} className={styles.inputIconPrefix} />
                        <select
                          className={`${styles.formSelect} ${styles.formSelectWithIcon}`}
                          value={form.subject_id}
                          onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
                        >
                          <option value="">Select subject...</option>
                          {subjects.map(s => (
                            <option key={s.subject_id} value={s.subject_id}>
                              {s.subject_name} ({s.subject_code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className={styles.gridTwo}>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                          Exp # <span className={styles.reqStar}>*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          className={styles.formInput}
                          value={form.exp_number}
                          onChange={e => setForm(f => ({ ...f, exp_number: parseInt(e.target.value) || 1 }))}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                          Weightage (Marks) <span className={styles.reqStar}>*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          className={styles.formInput}
                          value={form.weightage}
                          onChange={e => setForm(f => ({ ...f, weightage: parseInt(e.target.value) || 100 }))}
                        />
                        <p className={styles.inputHelpText} style={{ color: '#7c3aed', fontWeight: 600 }}>
                          Rolls up into subject grade: (score / grade_scale) × weightage
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Mode Selector */}
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Delivery Mode <span className={styles.reqStar}>*</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, delivery_mode: 'lab' }))}
                        style={{
                          padding: '14px 16px',
                          borderRadius: 12,
                          border: form.delivery_mode === 'lab' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                          background: form.delivery_mode === 'lab' ? '#f5f3ff' : '#ffffff',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 14, color: form.delivery_mode === 'lab' ? '#6d28d9' : '#1e293b' }}>
                          🧪 Lab Experiment
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          Standard continuous lab with modules, code runner, and viva.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, delivery_mode: 'exam' }))}
                        style={{
                          padding: '14px 16px',
                          borderRadius: 12,
                          border: form.delivery_mode === 'exam' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                          background: form.delivery_mode === 'exam' ? '#f5f3ff' : '#ffffff',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 14, color: form.delivery_mode === 'exam' ? '#6d28d9' : '#1e293b' }}>
                          ⏱️ Timed Exam
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          Scheduled time window, attempt limit, rolls up to subject grade.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, delivery_mode: 'practice' }))}
                        style={{
                          padding: '14px 16px',
                          borderRadius: 12,
                          border: form.delivery_mode === 'practice' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                          background: form.delivery_mode === 'practice' ? '#f5f3ff' : '#ffffff',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 14, color: form.delivery_mode === 'practice' ? '#6d28d9' : '#1e293b' }}>
                          ✨ Practice Mode
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          Self-paced playground without exam or grading pressure.
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Conditional Timed Exam Settings */}
                  {form.delivery_mode === 'exam' && (
                    <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>⏱️</span>
                        <strong style={{ fontSize: 14, color: '#6b21a8' }}>Exam Window & Delivery Settings</strong>
                      </div>

                      <div className={styles.gridTwo}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Available From</label>
                          <input
                            type="datetime-local"
                            className={styles.formInput}
                            value={form.available_from}
                            onChange={e => setForm(f => ({ ...f, available_from: e.target.value }))}
                          />
                          <p className={styles.inputHelpText}>Optional: earliest date/time students can start.</p>
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Due Date / Window Closes</label>
                          <input
                            type="datetime-local"
                            className={styles.formInput}
                            value={form.due_at}
                            onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                          />
                          <p className={styles.inputHelpText}>Optional: deadline after which no new attempts are allowed.</p>
                        </div>
                      </div>

                      <div className={styles.gridTwo}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Duration (Minutes)</label>
                          <input
                            type="number"
                            min={5}
                            max={300}
                            className={styles.formInput}
                            value={form.duration_minutes}
                            onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
                          />
                          <p className={styles.inputHelpText}>Timer duration once an attempt starts.</p>
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Max Attempts</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className={styles.formInput}
                            value={form.max_attempts}
                            onChange={e => setForm(f => ({ ...f, max_attempts: parseInt(e.target.value) || 1 }))}
                          />
                          <p className={styles.inputHelpText}>Number of attempts allowed per student.</p>
                        </div>
                      </div>

                      <div className={styles.gridTwo}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Pass Threshold (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className={styles.formInput}
                            value={form.pass_threshold}
                            onChange={e => setForm(f => ({ ...f, pass_threshold: parseInt(e.target.value) || 40 }))}
                          />
                        </div>

                        <div className={styles.formGroup} style={{ justifyContent: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 24, fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
                            <input
                              type="checkbox"
                              checked={form.shuffle_questions}
                              onChange={e => setForm(f => ({ ...f, shuffle_questions: e.target.checked }))}
                              style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
                            />
                            Shuffle Question Order for Students
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Experiment Title <span className={styles.reqStar}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Stack Implementation using Arrays"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Short Description / Aim <span className={styles.reqStar}>*</span></span>
                      <span className={styles.charCount}>{form.aim.length}/200</span>
                    </label>
                    <textarea
                      className={styles.formTextarea}
                      rows={4}
                      maxLength={200}
                      placeholder="e.g. Implement a fixed-size stack (push/pop/peek) using arrays and analyze time complexity."
                      value={form.aim}
                      onChange={e => setForm(f => ({ ...f, aim: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {/* ── STEP 2: CLASSIFICATION & RULES ── */}
              {currentStep === 2 && (
                <>
                  <div className={styles.formHeader}>
                    <div className={styles.formIconBox}>
                      <Code size={24} />
                    </div>
                    <div className={styles.formTitleGroup}>
                      <h2 className={styles.formCardTitle}>2. Classification & Rules</h2>
                      <p className={styles.formCardSubtitle}>Set difficulty, execution limits, languages, and concept tags.</p>
                    </div>
                  </div>

                  <div className={styles.gridTwo}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Difficulty Level <span className={styles.reqStar}>*</span>
                      </label>
                      <select
                        className={styles.formSelect}
                        value={form.difficulty_level}
                        onChange={e => setForm(f => ({ ...f, difficulty_level: parseInt(e.target.value) }))}
                      >
                        <option value={1}>Level 1 — Introductory</option>
                        <option value={2}>Level 2 — Intermediate</option>
                        <option value={3}>Level 3 — Advanced</option>
                      </select>
                      <p className={styles.inputHelpText}>Helps students understand the expected challenge level.</p>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Default Execution Time Limit <span className={styles.reqStar}>*</span>
                      </label>
                      <select
                        className={styles.formSelect}
                        value={form.time_limit_sec}
                        onChange={e => setForm(f => ({ ...f, time_limit_sec: parseInt(e.target.value) }))}
                      >
                        <option value={15}>15 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={60}>60 minutes</option>
                        <option value={90}>90 minutes</option>
                        <option value={120}>120 minutes</option>
                      </select>
                      <p className={styles.inputHelpText}>Approximate session time limit for student completion.</p>
                    </div>
                  </div>

                  <div className={styles.gridTwo}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Grade Scale</label>
                      <select
                        className={styles.formSelect}
                        value={form.grade_scale}
                        onChange={e => setForm(f => ({ ...f, grade_scale: parseInt(e.target.value) }))}
                      >
                        <option value={100}>100-point scale (0 - 100%)</option>
                        <option value={10}>10-point scale</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Experiment Type</label>
                      <select
                        className={styles.formSelect}
                        value={form.experiment_type}
                        onChange={e => setForm(f => ({ ...f, experiment_type: e.target.value }))}
                      >
                        <option value="coding">Coding Lab</option>
                        <option value="quiz_only">Quiz Only</option>
                        <option value="mixed">Mixed (Theory + Code + Quiz)</option>
                        <option value="reading">Reading & Conceptual</option>
                      </select>
                    </div>
                  </div>

                  {/* Interactive Concept Tags Input */}
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Concept Tags (press Enter or comma to add)</label>
                    <div className={styles.tagsBox}>
                      {tagsList.map(tag => (
                        <span key={tag} className={styles.tagPill}>
                          {tag}
                          <button type="button" className={styles.tagRemoveBtn} onClick={() => handleRemoveTag(tag)}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        className={styles.tagInput}
                        placeholder={tagsList.length === 0 ? "Add tags e.g. stacks, arrays..." : "Add tag..."}
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddTag(tagInput);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Allowed Programming Languages */}
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Allowed Programming Languages</label>
                    <div className={styles.langGrid}>
                      {langOptions.map(lang => {
                        const selected = form.allowed_languages.includes(lang.id);
                        return (
                          <div
                            key={lang.id}
                            className={`${styles.langPill} ${selected ? styles.langPillSelected : ''}`}
                            onClick={() => toggleLanguage(lang.id)}
                          >
                            <Code size={14} />
                            <span>{lang.label}</span>
                            {selected && <Check size={14} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Prerequisites (Optional)</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Basic knowledge of arrays, functions"
                      value={form.prerequisites}
                      onChange={e => setForm(f => ({ ...f, prerequisites: e.target.value }))}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Learning Outcomes (Optional)</label>
                    <textarea
                      className={styles.formTextarea}
                      rows={3}
                      placeholder="• Implement stack operations using arrays&#10;• Understand LIFO principle&#10;• Analyze time complexity"
                      value={form.learning_outcomes}
                      onChange={e => setForm(f => ({ ...f, learning_outcomes: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {/* ── STEP 3: OPTIONS ── */}
              {currentStep === 3 && (
                <>
                  <div className={styles.formHeader}>
                    <div className={styles.formIconBox}>
                      <Lock size={24} />
                    </div>
                    <div className={styles.formTitleGroup}>
                      <h2 className={styles.formCardTitle}>3. Experiment Options</h2>
                      <p className={styles.formCardSubtitle}>Toggle proctoring, Viva Voice, and AI hints assistance.</p>
                    </div>
                  </div>

                  <div className={styles.optionsCard}>
                    <div className={styles.optionRow}>
                      <div className={styles.optionLabelGroup}>
                        <span className={styles.optionTitle}>
                          <MessageSquare size={16} color="#7c3aed" /> Enable Viva Voice Evaluation
                        </span>
                        <span className={styles.optionSub}>AI interactive viva voice questions after lab completion.</span>
                      </div>
                      <input
                        type="checkbox"
                        className={styles.toggleCheckbox}
                        checked={form.enable_viva}
                        onChange={e => setForm(f => ({ ...f, enable_viva: e.target.checked }))}
                      />
                    </div>

                    <div className={styles.optionRow}>
                      <div className={styles.optionLabelGroup}>
                        <span className={styles.optionTitle}>
                          <Lock size={16} color="#7c3aed" /> Enable Browser Lockdown
                        </span>
                        <span className={styles.optionSub}>Restrict tab switching, copy-paste, and external dev tools.</span>
                      </div>
                      <input
                        type="checkbox"
                        className={styles.toggleCheckbox}
                        checked={form.enable_lockdown}
                        onChange={e => setForm(f => ({ ...f, enable_lockdown: e.target.checked }))}
                      />
                    </div>

                    <div className={styles.optionRow}>
                      <div className={styles.optionLabelGroup}>
                        <span className={styles.optionTitle}>
                          <Sparkles size={16} color="#7c3aed" /> Allow AI Hints & Assistance
                        </span>
                        <span className={styles.optionSub}>Give students step-by-step guidance when compiler errors occur.</span>
                      </div>
                      <input
                        type="checkbox"
                        className={styles.toggleCheckbox}
                        checked={form.allow_ai_hints}
                        onChange={e => setForm(f => ({ ...f, allow_ai_hints: e.target.checked }))}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 4: GRADING & RUBRICS ── */}
              {currentStep === 4 && (
                <>
                  <div className={styles.formHeader}>
                    <div className={styles.formIconBox}>
                      <Sparkles size={24} />
                    </div>
                    <div className={styles.formTitleGroup}>
                      <h2 className={styles.formCardTitle}>4. Grading & Rubric Weights</h2>
                      <p className={styles.formCardSubtitle}>Distribute weight percentages across assessment criteria (Must sum to 100%).</p>
                    </div>
                  </div>

                  <div className={styles.rubricCard}>
                    <div className={styles.rubricHeaderRow}>
                      <span className={styles.rubricTitle}>Assessment Breakdown Weights</span>
                      <span className={`${styles.rubricSumBadge} ${rubricSum === 100 ? styles.rubricValid : styles.rubricInvalid}`}>
                        Sum: {rubricSum}% {rubricSum === 100 ? '✓ Valid' : '⚠️ Must sum to 100%'}
                      </span>
                    </div>

                    <div className={styles.gridThree}>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Test Cases (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={styles.formInput}
                          value={form.rubric_test_cases}
                          onChange={e => setForm(f => ({ ...f, rubric_test_cases: parseInt(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Lab Report (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={styles.formInput}
                          value={form.rubric_lab_report}
                          onChange={e => setForm(f => ({ ...f, rubric_lab_report: parseInt(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Code Quality (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={styles.formInput}
                          value={form.rubric_code_quality}
                          onChange={e => setForm(f => ({ ...f, rubric_code_quality: parseInt(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Viva Voice (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={styles.formInput}
                          value={form.rubric_viva}
                          onChange={e => setForm(f => ({ ...f, rubric_viva: parseInt(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Quiz Block (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={styles.formInput}
                          value={form.rubric_quiz}
                          onChange={e => setForm(f => ({ ...f, rubric_quiz: parseInt(e.target.value) || 0 }))}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Bottom Wizard Actions Row */}
              <div className={styles.formActionsRow}>
                {currentStep > 1 ? (
                  <button type="button" className={styles.cancelBtn} onClick={handlePrevStep}>
                    <ArrowLeft size={14} /> Back
                  </button>
                ) : (
                  <button type="button" className={styles.cancelBtn} onClick={() => router.push('/instructor/experiments')}>
                    Cancel
                  </button>
                )}

                <button type="button" className={styles.nextStepBtn} disabled={saving} onClick={handleNextStep}>
                  {currentStep < 4 ? 'Next Step' : saving ? 'Creating...' : 'Save & Open Studio'} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR COLUMN */}
          <div className={styles.sidebarCol}>
            {/* Widget: Quick Tips */}
            <div className={styles.sidebarCard}>
              <h3 className={styles.sidebarTitle}>
                <Sparkles size={18} color="#d97706" /> Quick Tips
              </h3>
              <div className={styles.tipsList}>
                <div className={styles.tipItem}>
                  <CheckCircle2 size={16} className={styles.tipCheck} />
                  <span>Use a clear and descriptive title</span>
                </div>
                <div className={styles.tipItem}>
                  <CheckCircle2 size={16} className={styles.tipCheck} />
                  <span>Write a concise and engaging description</span>
                </div>
                <div className={styles.tipItem}>
                  <CheckCircle2 size={16} className={styles.tipCheck} />
                  <span>Set the appropriate difficulty level</span>
                </div>
                <div className={styles.tipItem}>
                  <CheckCircle2 size={16} className={styles.tipCheck} />
                  <span>Add relevant tags for better discoverability</span>
                </div>
                <div className={styles.tipItem}>
                  <CheckCircle2 size={16} className={styles.tipCheck} />
                  <span>Define clear learning outcomes</span>
                </div>
              </div>
            </div>

            {/* Widget 3: Need Help? */}
            <div className={styles.sidebarCard} style={{ background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HelpCircle size={18} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Need Help?</h3>
              </div>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                Check our experiment creation guide or use a template to get started quickly.
              </p>

              <div className={styles.sideBtnGrid}>
                <button className={styles.sideOutlineBtn} onClick={() => router.push('/instructor/experiments')}>
                  <BookOpen size={13} /> View Guide
                </button>
                <button className={styles.sideOutlineBtn} onClick={() => router.push('/instructor/experiments')}>
                  <FileCode size={13} /> Use Template
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </InstructorShell>
  );
}

export default function NewExperimentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading Experiment Creator...</div>}>
      <NewExperimentForm />
    </Suspense>
  );
}
