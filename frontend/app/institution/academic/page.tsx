'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type AcademicYear,
  type Batch,
  type Section,
  type Subject,
  type InstitutionUser,
  type Department,
  type SectionSubjectDetail
} from '@/services/institution.service';
import {
  Calendar, Layers, Users, BookOpen, GraduationCap, Building2,
  Plus, Search, ChevronRight, ChevronDown, Edit3, Trash2, X,
  Check, Download, ArrowRight, ArrowLeft, Send, Sparkles,
  Award, Shield, FileText, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import styles from './academic.module.css';

type AcademicTab = 'years' | 'departments' | 'sections' | 'subjects' | 'enroll';

export default function AcademicPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading Academic Suite…</div>}>
      <AcademicPageContent />
    </Suspense>
  );
}

function AcademicPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Normalize initial tab from query param
  const initialTabParam = searchParams.get('tab');
  const getNormalizedTab = (raw: string | null): AcademicTab => {
    if (raw === 'departments') return 'departments';
    if (raw === 'sections') return 'sections';
    if (raw === 'subjects') return 'subjects';
    if (raw === 'enroll') return 'enroll';
    return 'years'; // 'years' or 'structure' defaults to 'years'
  };

  const [tab, setTab] = useState<AcademicTab>(getNormalizedTab(initialTabParam));

  // Sync tab state when URL changes
  useEffect(() => {
    const nextTab = getNormalizedTab(searchParams.get('tab'));
    if (nextTab !== tab) setTab(nextTab);
  }, [searchParams]);

  const switchTab = (newTab: AcademicTab) => {
    setTab(newTab);
    router.push(`/institution/academic?tab=${newTab}`);
  };

  // ── Master Live Data State ───────────────────────────────────────────────────
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [students, setStudents] = useState<InstitutionUser[]>([]);
  const [instructors, setInstructors] = useState<InstitutionUser[]>([]);
  const [allAssignments, setAllAssignments] = useState<SectionSubjectDetail[]>([]);
  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load everything in 1 consolidated round-trip, through the shared
  // react-query cache: navigating back to this page renders from cache
  // instead of refetching (same key the sessions page uses).
  const loadAll = useCallback(async (forceFresh = true) => {
    if (forceFresh) {
      queryClient.removeQueries({ queryKey: ['institution', 'academic-structure'] });
    }
    setLoading(true);
    try {
      const struct = await queryClient.fetchQuery({
        queryKey: ['institution', 'academic-structure'],
        queryFn: () => institutionService.getAcademicStructure(true),
        staleTime: 30 * 1000,
      });
      setYears(struct.years || []);
      setBatches(struct.batches || []);
      setSections(struct.sections || []);
      setSubjects(struct.subjects || []);
      setDepartments(struct.departments || []);
      setInstructors(struct.instructors || []);
      setAllAssignments(struct.assignments || []);
      setTotalStudentsCount(struct.stats?.total_students || 0);
    } catch {
      showToast('Failed to load academic data. Please check connection.', 'error');
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  // Lazy-load students list only when needed for enrollment
  const loadStudents = useCallback(async () => {
    if (students.length > 0 || studentsLoading) return;
    setStudentsLoading(true);
    try {
      const studs = await queryClient.fetchQuery({
        queryKey: ['institution', 'users', 'all-students'],
        queryFn: () => institutionService.listUsers({ role: 'student' }),
        staleTime: 60 * 1000,
      });
      setStudents(studs);
    } catch {
      // silent
    } finally {
      setStudentsLoading(false);
    }
  }, [students.length, studentsLoading, queryClient]);

  useEffect(() => {
    // Mount uses the cache (30s window); every mutation handler calls
    // loadAll(true), which drops the cached entry and refetches.
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    if (tab === 'enroll') {
      loadStudents();
    }
  }, [tab, loadStudents]);

  // Overall counts
  const totalStudentsEnrolled = useMemo(() => {
    if (totalStudentsCount) return totalStudentsCount;
    return students.filter(s => s.is_active).length;
  }, [totalStudentsCount, students]);

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 1: ACADEMIC YEARS & BATCHES STATE
  // ══════════════════════════════════════════════════════════════════════════════
  const [yearSubTab, setYearSubTab] = useState<'years' | 'batches'>('years');
  const [yearSearch, setYearSearch] = useState('');
  const [yearStatusFilter, setYearStatusFilter] = useState('all');
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});

  const toggleYearExpand = (id: string) => {
    setExpandedYears(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Drawer Create Year Wizard
  const [showYearDrawer, setShowYearDrawer] = useState(false);
  const [yearStep, setYearStep] = useState<1 | 2 | 3>(1);
  const [yearForm, setYearForm] = useState({
    startYear: '2026',
    endYear: '2027',
    status: 'active' as 'active' | 'upcoming' | 'completed',
    createFirstBatch: false,
    batchName: '',
    program: 'B.Tech - Computer Science',
    totalSections: 2,
    maxStudents: 60,
  });

  const handleCreateAcademicYear = async () => {
    const label = `${yearForm.startYear} - ${yearForm.endYear}`;
    try {
      await institutionService.createAcademicYear({
        year_label: label,
        is_active: yearForm.status === 'active',
        create_batch: yearForm.createFirstBatch,
        batch_name: yearForm.batchName,
        program: yearForm.program,
        total_sections: yearForm.totalSections,
        max_students: yearForm.maxStudents,
      });
      showToast('Academic Year created successfully!');
      setShowYearDrawer(false);
      setYearStep(1);
      setYearForm({
        startYear: '2026', endYear: '2027', status: 'active',
        createFirstBatch: false, batchName: '', program: 'B.Tech - Computer Science',
        totalSections: 2, maxStudents: 60,
      });
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to create academic year.', 'error');
    }
  };

  // Edit Academic Year State & Handlers
  const [showEditYearModal, setShowEditYearModal] = useState(false);
  const [editYearForm, setEditYearForm] = useState({
    id: '',
    year_label: '',
    is_active: true,
  });

  const openEditYear = (yr: AcademicYear) => {
    setEditYearForm({
      id: yr.id,
      year_label: yr.year_label,
      is_active: yr.is_active !== false,
    });
    setShowEditYearModal(true);
  };

  const handleUpdateAcademicYear = async () => {
    if (!editYearForm.year_label.trim()) {
      showToast('Academic year label is required', 'error');
      return;
    }
    try {
      await institutionService.updateAcademicYear(editYearForm.id, {
        year_label: editYearForm.year_label.trim(),
        is_active: editYearForm.is_active,
      });
      showToast('Academic Year updated successfully!');
      setShowEditYearModal(false);
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to update academic year.', 'error');
    }
  };

  // Quick Add Batch Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchModalForm, setBatchModalForm] = useState({
    year_id: '',
    name: '',
    program: 'B.Tech - Computer Science',
    total_sections: 2,
  });

  const handleCreateBatch = async () => {
    if (!batchModalForm.year_id || !batchModalForm.name.trim()) {
      showToast('Academic Year and Batch Name are required', 'error');
      return;
    }
    try {
      await institutionService.createBatch({
        year_id: batchModalForm.year_id,
        name: batchModalForm.name.trim(),
        program: batchModalForm.program,
        total_sections: batchModalForm.total_sections,
      });
      showToast('Batch created successfully!');
      setShowBatchModal(false);
      setBatchModalForm({ year_id: '', name: '', program: 'B.Tech - Computer Science', total_sections: 2 });
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to create batch.', 'error');
    }
  };

  // Edit Batch State & Handlers
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [editBatchForm, setEditBatchForm] = useState({
    id: '',
    year_id: '',
    name: '',
    program: '',
  });

  const openEditBatch = (b: Batch) => {
    setEditBatchForm({
      id: b.id,
      year_id: b.year_id || '',
      name: b.name,
      program: b.program || '',
    });
    setShowEditBatchModal(true);
  };

  const handleUpdateBatch = async () => {
    if (!editBatchForm.name.trim()) {
      showToast('Batch name is required', 'error');
      return;
    }
    try {
      await institutionService.updateBatch(editBatchForm.id, {
        name: editBatchForm.name.trim(),
        program: editBatchForm.program.trim(),
        year_id: editBatchForm.year_id || undefined,
      });
      showToast('Batch updated successfully!');
      setShowEditBatchModal(false);
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to update batch.', 'error');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 2: DEPARTMENTS STATE
  // ══════════════════════════════════════════════════════════════════════════════
  const [deptTab, setDeptTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [deptSearch, setDeptSearch] = useState('');
  const [showDeptDrawer, setShowDeptDrawer] = useState(false);
  const [deptStep, setDeptStep] = useState<1 | 2 | 3>(1);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    description: '',
    is_active: true,
    color: '#7c3aed',
  });

  const DEPT_COLORS = ['#7c3aed', '#2563eb', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#6366f1', '#64748b'];

  const openAddDept = () => {
    setEditingDeptId(null);
    setDeptForm({ name: '', code: '', description: '', is_active: true, color: '#7c3aed' });
    setDeptStep(1);
    setShowDeptDrawer(true);
  };

  const openEditDept = (d: Department) => {
    setEditingDeptId(d.id);
    setDeptForm({
      name: d.name,
      code: d.code || '',
      description: d.description || '',
      is_active: d.is_active !== false,
      color: d.color || '#7c3aed',
    });
    setDeptStep(1);
    setShowDeptDrawer(true);
  };

  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) {
      showToast('Department name is required', 'error');
      return;
    }
    try {
      if (editingDeptId) {
        await institutionService.updateDepartment(editingDeptId, deptForm);
        showToast('Department updated successfully!');
      } else {
        await institutionService.createDepartment(deptForm);
        showToast('Department created successfully!');
      }
      setShowDeptDrawer(false);
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to save department.', 'error');
    }
  };

  const handleDeleteDept = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete department "${name}"?`)) return;
    try {
      await institutionService.deleteDepartment(id);
      showToast('Department deleted successfully.');
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Cannot delete department with assigned users/subjects.', 'error');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 3: SECTIONS STATE
  // ══════════════════════════════════════════════════════════════════════════════
  const [sectionDeptFilter, setSectionDeptFilter] = useState('all');
  const [sectionBatchFilter, setSectionBatchFilter] = useState('all');
  const [sectionYearFilter, setSectionYearFilter] = useState('all');
  const [sectionStatusFilter, setSectionStatusFilter] = useState('all');
  const [sectionSearch, setSectionSearch] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [sectionPage, setSectionPage] = useState(1);
  const SECTIONS_PER_PAGE = 8;

  const [showSectionDrawer, setShowSectionDrawer] = useState(false);
  const [sectionStep, setSectionStep] = useState<1 | 2 | 3>(1);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState({
    batch_id: '',
    name: 'Section A',
    section_code: 'A',
    academic_year_id: '',
    max_students: 60,
    is_active: true,
  });

  const openAddSection = (prefillBatchId?: string) => {
    setEditingSectionId(null);
    setSectionForm({
      batch_id: prefillBatchId || (batches[0]?.id ?? ''),
      name: 'Section A',
      section_code: 'A',
      academic_year_id: years[0]?.id ?? '',
      max_students: 60,
      is_active: true,
    });
    setSectionStep(1);
    setShowSectionDrawer(true);
  };

  const openEditSection = (s: Section) => {
    setEditingSectionId(s.id);
    setSectionForm({
      batch_id: s.batch_id,
      name: s.name,
      section_code: s.section_code || s.name,
      academic_year_id: s.year_id || '',
      max_students: s.max_students || 60,
      is_active: s.is_active !== false,
    });
    setSectionStep(1);
    setShowSectionDrawer(true);
  };

  const handleSaveSection = async () => {
    if (!sectionForm.batch_id || !sectionForm.name.trim()) {
      showToast('Batch and Section Name are required', 'error');
      return;
    }
    try {
      if (editingSectionId) {
        await institutionService.updateSection(editingSectionId, {
          batch_id: sectionForm.batch_id,
          name: sectionForm.name.trim(),
          section_code: sectionForm.section_code,
          max_students: sectionForm.max_students,
          is_active: sectionForm.is_active,
        });
        showToast('Section updated successfully!');
      } else {
        await institutionService.createSection({
          batch_id: sectionForm.batch_id,
          name: sectionForm.name.trim(),
          section_code: sectionForm.section_code,
          max_students: sectionForm.max_students,
          is_active: sectionForm.is_active,
        });
        showToast('Section created successfully!');
      }
      setShowSectionDrawer(false);
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to save section.', 'error');
    }
  };

  const handleDeleteSection = async (id: string, name: string) => {
    if (!confirm(`Delete section "${name}"?`)) return;
    try {
      await institutionService.deleteSection(id);
      showToast('Section deleted successfully.');
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Cannot delete section with enrolled students or subjects.', 'error');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 4: SUBJECTS STATE
  // ══════════════════════════════════════════════════════════════════════════════
  const [subjectTab, setSubjectTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [subjectDeptFilter, setSubjectDeptFilter] = useState('all');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState('all');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectPage, setSubjectPage] = useState(1);
  const SUBJECTS_PER_PAGE = 8;

  const [showSubjectDrawer, setShowSubjectDrawer] = useState(false);
  const [subjectStep, setSubjectStep] = useState<1 | 2 | 3>(1);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subjectForm, setSubjectForm] = useState({
    name: '',
    code: '',
    department_id: '',
    description: '',
    total_marks: 100,
    subject_type: 'Theory',
    is_active: true,
    icon: 'datastruct',
    color: '#7c3aed',
  });

  const openAddSubject = () => {
    setEditingSubjectId(null);
    setSubjectForm({
      name: '',
      code: '',
      department_id: departments[0]?.id || '',
      description: '',
      total_marks: 100,
      subject_type: 'Theory',
      is_active: true,
      icon: 'datastruct',
      color: '#7c3aed',
    });
    setSubjectStep(1);
    setShowSubjectDrawer(true);
  };

  const openEditSubject = (sub: Subject) => {
    setEditingSubjectId(sub.id);
    setSubjectForm({
      name: sub.name,
      code: sub.code || '',
      department_id: sub.department_id || '',
      description: sub.description || '',
      total_marks: sub.total_marks || 100,
      subject_type: sub.subject_type || 'Theory',
      is_active: sub.is_active !== false,
      icon: sub.icon || 'datastruct',
      color: sub.color || '#7c3aed',
    });
    setSubjectStep(1);
    setShowSubjectDrawer(true);
  };

  const handleSaveSubject = async () => {
    if (!subjectForm.name.trim() || !subjectForm.code.trim()) {
      showToast('Subject name and code are required', 'error');
      return;
    }
    try {
      if (editingSubjectId) {
        await institutionService.updateSubject(editingSubjectId, subjectForm);
        showToast('Subject updated successfully!');
      } else {
        await institutionService.createSubject(subjectForm);
        showToast('Subject created successfully!');
      }
      setShowSubjectDrawer(false);
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to save subject.', 'error');
    }
  };

  const handleDeleteSubject = async (id: string, name: string) => {
    if (!confirm(`Delete subject "${name}"?`)) return;
    try {
      await institutionService.deleteSubject(id);
      showToast('Subject deleted.');
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Cannot delete subject with active assignments or labs.', 'error');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TAB 5: ENROLL & ASSIGN STATE
  // ══════════════════════════════════════════════════════════════════════════════
  const [enrollYearId, setEnrollYearId] = useState('');
  const [enrollDeptId, setEnrollDeptId] = useState('');
  const [enrollBatchId, setEnrollBatchId] = useState('');
  const [enrollSectionId, setEnrollSectionId] = useState('');
  const [activeContextDropdown, setActiveContextDropdown] = useState<'year' | 'dept' | 'batch' | 'section' | null>(null);

  // Close context dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.contextCard}`)) {
        setActiveContextDropdown(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Filter batches by selected Academic Year
  const availableBatches = useMemo(() => {
    if (!enrollYearId) return batches;
    const filtered = batches.filter(b => b.year_id === enrollYearId);
    return filtered.length > 0 ? filtered : batches;
  }, [batches, enrollYearId]);

  // Filter sections by selected Batch
  const availableSections = useMemo(() => {
    if (!enrollBatchId) return sections;
    const filtered = sections.filter(s => s.batch_id === enrollBatchId);
    return filtered.length > 0 ? filtered : sections;
  }, [sections, enrollBatchId]);

  // Initial selection
  useEffect(() => {
    if (years.length > 0 && !enrollYearId) {
      setEnrollYearId(years[0].id);
    }
    if (departments.length > 0 && !enrollDeptId) {
      setEnrollDeptId(departments[0].id);
    }
  }, [years, departments, enrollYearId, enrollDeptId]);

  // Cascading sync: when availableBatches changes or enrollYearId changes, ensure valid batch is selected
  useEffect(() => {
    if (availableBatches.length > 0) {
      const isSelectedBatchValid = availableBatches.some(b => b.id === enrollBatchId);
      if (!isSelectedBatchValid) {
        setEnrollBatchId(availableBatches[0].id);
      }
    } else if (batches.length > 0 && !enrollBatchId) {
      setEnrollBatchId(batches[0].id);
    }
  }, [availableBatches, batches, enrollBatchId]);

  // Cascading sync: when availableSections changes or enrollBatchId changes, ensure valid section is selected
  useEffect(() => {
    if (availableSections.length > 0) {
      const isSelectedSectionValid = availableSections.some(s => s.id === enrollSectionId);
      if (!isSelectedSectionValid) {
        setEnrollSectionId(availableSections[0].id);
      }
    } else if (sections.length > 0 && !enrollSectionId) {
      setEnrollSectionId(sections[0].id);
    }
  }, [availableSections, sections, enrollSectionId]);

  // When selected section changes in enroll & assign, load its specific enrolled students and assigned subjects
  const [enrolledStudentsMap, setEnrolledStudentsMap] = useState<Record<string, boolean>>({});
  const [selectedForEnrollment, setSelectedForEnrollment] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentEnrollFilter, setStudentEnrollFilter] = useState<'all' | 'enrolled' | 'not_enrolled'>('all');
  const [studentPage, setStudentPage] = useState(1);

  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assignInstructorId, setAssignInstructorId] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [assigningLoading, setAssigningLoading] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState('');

  const loadSectionEnrollments = useCallback(async (secId: string) => {
    if (!secId) return;
    try {
      const studs = await institutionService.getSectionStudents(secId);
      const map: Record<string, boolean> = {};
      studs.forEach(s => { map[s.id] = true; });
      setEnrolledStudentsMap(map);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (enrollSectionId) {
      loadSectionEnrollments(enrollSectionId);
      setSelectedForEnrollment([]);
    }
  }, [enrollSectionId, loadSectionEnrollments]);

  // Perform student enrollment into the selected section
  const handleEnrollStudents = async () => {
    if (!enrollSectionId) {
      showToast('Please select a section first.', 'error');
      return;
    }
    if (selectedForEnrollment.length === 0) {
      showToast('Please select at least one student from the table.', 'error');
      return;
    }
    try {
      const res = await institutionService.enrollStudents(enrollSectionId, selectedForEnrollment);
      showToast(`Successfully enrolled ${res.enrolled} student(s)!`);
      setSelectedForEnrollment([]);
      loadSectionEnrollments(enrollSectionId);
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Failed to enroll students.', 'error');
    }
  };

  // Perform subject & instructor assignment
  const handleAssignSubjectAndInstructor = async () => {
    if (!enrollSectionId) {
      showToast('Please pick a section.', 'error');
      return;
    }
    if (!assignSubjectId || !assignInstructorId) {
      showToast('Please select both a Subject and an Instructor.', 'error');
      return;
    }
    setAssigningLoading(true);
    try {
      await institutionService.assignSubjectToSection({
        section_id: enrollSectionId,
        subject_id: assignSubjectId,
        instructor_id: assignInstructorId,
      });
      showToast('Assigned subject and instructor successfully!');
      setAssignSubjectId('');
      setAssignInstructorId('');
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Assignment failed or already exists.', 'error');
    } finally {
      setAssigningLoading(false);
    }
  };

  const handleUnassignSubject = async (assignmentId: string) => {
    if (!confirm('Remove this subject assignment from this section?')) return;
    try {
      await institutionService.deleteSectionSubject(assignmentId);
      showToast('Assignment removed.');
      loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? 'Cannot remove active session assignment.', 'error');
    }
  };

  // Active subpage label for breadcrumb
  const activeSubPageLabel = useMemo(() => {
    switch (tab) {
      case 'years': return 'Years & Batches';
      case 'departments': return 'Departments';
      case 'sections': return 'Sections';
      case 'subjects': return 'Subjects';
      case 'enroll': return 'Enroll & Assign';
      default: return 'Years & Batches';
    }
  }, [tab]);

  // Export tables as CSV
  const exportCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <InstitutionShell activePage="Academic" activeSubPage={tab} activeSubPageLabel={activeSubPageLabel}>
      <div className={styles.container}>

        {/* Global Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 24, right: 24, zIndex: 9999,
            background: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff', padding: '12px 20px', borderRadius: 12,
            boxShadow: '0 6px 20px rgba(0,0,0,0.15)', display: 'flex',
            alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 700,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{toast.msg}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 1: ACADEMIC YEARS & BATCHES
        ═══════════════════════════════════════════════════════════════════════ */}
        {tab === 'years' && (
          <>
            {/* Header */}
            <div className={styles.headerRow}>
              <div className={styles.headerInfo}>
                <h1 className={styles.pageTitle}>Academic Years & Batches</h1>
                <p className={styles.pageSubtitle}>Create and manage academic years with their batches.</p>
              </div>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Calendar size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{years.length}</div>
                  <div className={styles.kpiLabel}>Academic Years</div>
                  <div className={styles.kpiTrend}>&uarr; 2 this year</div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#10b981' }}>
                  <Layers size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{batches.length}</div>
                  <div className={styles.kpiLabel}>Total Batches</div>
                  <div className={styles.kpiTrend}>&uarr; 12%</div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#fffbeb', color: '#f59e0b' }}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{totalStudentsEnrolled}</div>
                  <div className={styles.kpiLabel}>Enrolled Students</div>
                  <div className={styles.kpiTrend}>&uarr; 18%</div>
                </div>
              </div>
            </div>

            {/* Tabs & Filter Bar */}
            <div className={styles.toolbar}>
              <div className={styles.tabsBar}>
                <button
                  className={`${styles.tabBtn} ${yearSubTab === 'years' ? styles.tabBtnActive : ''}`}
                  onClick={() => setYearSubTab('years')}
                >
                  <Calendar size={14} /> Academic Years
                </button>
                <button
                  className={`${styles.tabBtn} ${yearSubTab === 'batches' ? styles.tabBtnActive : ''}`}
                  onClick={() => setYearSubTab('batches')}
                >
                  <Layers size={14} /> All Batches
                </button>
              </div>

              <div className={styles.filterRow}>
                <div className={styles.searchBox}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search years or batches..."
                    value={yearSearch}
                    onChange={e => setYearSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <select
                  value={yearStatusFilter}
                  onChange={e => setYearStatusFilter(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>

                <button className={styles.btnPrimary} onClick={() => { setYearStep(1); setShowYearDrawer(true); }}>
                  <Plus size={15} /> Create Academic Year
                </button>
              </div>
            </div>

            {/* Years Accordion List */}
            {yearSubTab === 'years' ? (
              <div>
                {years.length === 0 ? (
                  <div className={styles.tableCard} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <Calendar size={36} style={{ color: '#cbd5e1', marginBottom: 10 }} />
                    <p style={{ fontWeight: 600 }}>No academic years found.</p>
                    <button className={styles.btnPrimary} style={{ marginTop: 10 }} onClick={() => setShowYearDrawer(true)}>
                      <Plus size={14} /> Create Academic Year
                    </button>
                  </div>
                ) : (
                  years
                    .filter(y => {
                      if (yearSearch && !y.year_label.toLowerCase().includes(yearSearch.toLowerCase())) return false;
                      if (yearStatusFilter === 'active' && !y.is_active) return false;
                      if (yearStatusFilter === 'completed' && y.is_active) return false;
                      return true;
                    })
                    .map(yr => {
                      const yrBatches = batches.filter(b => b.year_id === yr.id);
                      const yrSections = sections.filter(s => yrBatches.some(b => b.id === s.batch_id));
                      const isExpanded = !!expandedYears[yr.id];

                      return (
                        <div key={yr.id} className={styles.accordionCard}>
                          <div className={styles.accordionHeader} onClick={() => toggleYearExpand(yr.id)}>
                            <div className={styles.btnIcon} style={{ width: 28, height: 28 }}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                            <span className={styles.accordionTitle}>{yr.year_label}</span>
                            <span className={yr.is_active ? styles.statusActive : styles.statusInactive}>
                              <span className={yr.is_active ? styles.dotGreen : styles.dotGray} />
                              {yr.is_active ? 'Active' : 'Completed'}
                            </span>
                            <span className={styles.accordionMeta}>
                              {yrBatches.length} batches &bull; {yrSections.reduce((acc, s) => acc + (s.students_count || 0), 0)} students
                            </span>

                            <div className={styles.accordionActions} onClick={e => e.stopPropagation()}>
                              <button
                                className={styles.btnSecondary}
                                style={{ padding: '6px 12px', fontSize: 12 }}
                                onClick={() => {
                                  setBatchModalForm({ year_id: yr.id, name: '', program: 'B.Tech - Computer Science', total_sections: 2 });
                                  setShowBatchModal(true);
                                }}
                              >
                                <Plus size={13} /> Add Batch
                              </button>
                              <button
                                className={styles.btnIcon}
                                title="Edit Academic Year"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditYear(yr);
                                }}
                              >
                                <Edit3 size={13} style={{ color: '#6366f1' }} />
                              </button>
                              <button
                                className={styles.btnIcon}
                                title="Delete Year"
                                onClick={() => {
                                  if (confirm(`Delete academic year ${yr.year_label}?`)) {
                                    institutionService.deleteAcademicYear(yr.id)
                                      .then(() => { showToast('Academic year deleted'); loadAll(); })
                                      .catch(e => showToast(e?.response?.data?.error ?? 'Cannot delete', 'error'));
                                  }
                                }}
                              >
                                <Trash2 size={13} style={{ color: '#ef4444' }} />
                              </button>
                            </div>
                          </div>

                          {/* Nested Batches Table */}
                          {isExpanded && (
                            <div className={styles.nestedTableWrap}>
                              {yrBatches.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0' }}>
                                  No batches yet under this year.{' '}
                                  <span
                                    style={{ color: '#7c3aed', fontWeight: 700, cursor: 'pointer' }}
                                    onClick={() => {
                                      setBatchModalForm({ year_id: yr.id, name: '', program: 'B.Tech - Computer Science', total_sections: 2 });
                                      setShowBatchModal(true);
                                    }}
                                  >
                                    Add one now
                                  </span>
                                </p>
                              ) : (
                                <table className={styles.table}>
                                  <thead>
                                    <tr>
                                      <th>Batch Name</th>
                                      <th>Program</th>
                                      <th>Sections</th>
                                      <th>Students</th>
                                      <th>Status</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {yrBatches.map(b => {
                                      const bSections = sections.filter(s => s.batch_id === b.id);
                                      const bStudentsCount = bSections.reduce((acc, s) => acc + (s.students_count || 0), 0);
                                      return (
                                        <tr key={b.id}>
                                          <td style={{ fontWeight: 700, color: '#1e1b4b' }}>{b.name}</td>
                                          <td>{b.program || 'B.Tech'}</td>
                                          <td>{bSections.length}</td>
                                          <td>{bStudentsCount}</td>
                                          <td>
                                            <span className={styles.statusActive}>
                                              <span className={styles.dotGreen} /> Active
                                            </span>
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                              <button
                                                className={styles.btnSecondary}
                                                style={{ padding: '4px 10px', fontSize: 11 }}
                                                onClick={() => openAddSection(b.id)}
                                              >
                                                <Plus size={11} /> Section
                                              </button>
                                              <button
                                                className={styles.btnIcon}
                                                title="Edit Batch"
                                                onClick={() => openEditBatch(b)}
                                              >
                                                <Edit3 size={12} style={{ color: '#6366f1' }} />
                                              </button>
                                              <button
                                                className={styles.btnIcon}
                                                title="Delete Batch"
                                                onClick={() => {
                                                  if (confirm(`Delete batch ${b.name}?`)) {
                                                    institutionService.deleteBatch(b.id)
                                                      .then(() => { showToast('Batch deleted'); loadAll(); })
                                                      .catch(e => showToast(e?.response?.data?.error ?? 'Cannot delete', 'error'));
                                                  }
                                                }}
                                              >
                                                <Trash2 size={12} style={{ color: '#ef4444' }} />
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            ) : (
              /* All Batches Flat Table */
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Batch Name</th>
                      <th>Academic Year</th>
                      <th>Program</th>
                      <th>Sections</th>
                      <th>Students</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No batches found.</td></tr>
                    ) : (
                      batches.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 700, color: '#1e1b4b' }}>{b.name}</td>
                          <td>{b.year_label || '—'}</td>
                          <td>{b.program || 'B.Tech'}</td>
                          <td>{b.sections_count ?? 0}</td>
                          <td>{b.students_count ?? 0}</td>
                          <td>
                            <span className={styles.statusActive}>
                              <span className={styles.dotGreen} /> Active
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className={styles.btnSecondary}
                                style={{ padding: '4px 10px', fontSize: 11 }}
                                onClick={() => openAddSection(b.id)}
                              >
                                <Plus size={11} /> Section
                              </button>
                              <button
                                className={styles.btnIcon}
                                title="Edit Batch"
                                onClick={() => openEditBatch(b)}
                              >
                                <Edit3 size={12} style={{ color: '#6366f1' }} />
                              </button>
                              <button
                                className={styles.btnIcon}
                                title="Delete Batch"
                                onClick={() => {
                                  if (confirm(`Delete batch ${b.name}?`)) {
                                    institutionService.deleteBatch(b.id)
                                      .then(() => { showToast('Batch deleted'); loadAll(); })
                                      .catch(e => showToast(e?.response?.data?.error ?? 'Cannot delete', 'error'));
                                  }
                                }}
                              >
                                <Trash2 size={12} style={{ color: '#ef4444' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 2: ACADEMIC DEPARTMENTS
        ═══════════════════════════════════════════════════════════════════════ */}
        {tab === 'departments' && (
          <>
            {/* Header with Illustration Banner */}
            <div className={styles.headerRow}>
              <div className={styles.headerInfo}>
                <h1 className={styles.pageTitle}>Academic Departments</h1>
                <p className={styles.pageSubtitle}>Organize your institution by creating and managing departments.</p>
              </div>

              <div className={styles.headerBanner}>
                <div className={styles.bannerIcon}>
                  <Building2 size={24} />
                </div>
                <div>
                  <h4 className={styles.bannerTitle}>Better organization, brighter learning</h4>
                  <p className={styles.bannerText}>Create departments to structure your academic programs.</p>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Building2 size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{departments.length}</div>
                  <div className={styles.kpiLabel}>Total Departments</div>
                  <div className={styles.kpiTrend}>&uarr; 25% <span className={styles.kpiSubtext}>+1 this month</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#10b981' }}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{totalStudentsEnrolled}</div>
                  <div className={styles.kpiLabel}>Students Enrolled</div>
                  <div className={styles.kpiTrend}>&uarr; 18% <span className={styles.kpiSubtext}>+190 this month</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#fffbeb', color: '#f59e0b' }}>
                  <BookOpen size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{subjects.length}</div>
                  <div className={styles.kpiLabel}>Total Subjects</div>
                  <div className={styles.kpiTrend}>&uarr; 33% <span className={styles.kpiSubtext}>+6 this month</span></div>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
              <div className={styles.tabsBar}>
                <button
                  className={`${styles.tabBtn} ${deptTab === 'all' ? styles.tabBtnActive : ''}`}
                  onClick={() => setDeptTab('all')}
                >
                  All Departments ({departments.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${deptTab === 'active' ? styles.tabBtnActive : ''}`}
                  onClick={() => setDeptTab('active')}
                >
                  Active ({departments.filter(d => d.is_active !== false).length})
                </button>
                <button
                  className={`${styles.tabBtn} ${deptTab === 'inactive' ? styles.tabBtnActive : ''}`}
                  onClick={() => setDeptTab('inactive')}
                >
                  Inactive ({departments.filter(d => d.is_active === false).length})
                </button>
              </div>

              <div className={styles.filterRow}>
                <div className={styles.searchBox}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search departments..."
                    value={deptSearch}
                    onChange={e => setDeptSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <button
                  className={styles.btnSecondary}
                  onClick={() => exportCsv(
                    'departments.csv',
                    ['#', 'Name', 'Code', 'Students', 'Subjects', 'Status'],
                    departments.map((d, i) => [i + 1, d.name, d.code || '', d.students_count || 0, d.subjects_count || 0, d.is_active ? 'Active' : 'Inactive'])
                  )}
                >
                  <Download size={14} /> Export
                </button>

                <button className={styles.btnPrimary} onClick={openAddDept}>
                  <Plus size={15} /> Add Department
                </button>
              </div>
            </div>

            {/* Departments Table */}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Department Name</th>
                    <th>Code</th>
                    <th>Students</th>
                    <th>Subjects</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments
                    .filter(d => {
                      if (deptTab === 'active' && d.is_active === false) return false;
                      if (deptTab === 'inactive' && d.is_active !== false) return false;
                      if (deptSearch && !d.name.toLowerCase().includes(deptSearch.toLowerCase()) && !d.code?.toLowerCase().includes(deptSearch.toLowerCase())) return false;
                      return true;
                    })
                    .map((d, idx) => (
                      <tr key={d.id}>
                        <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 34, height: 34, borderRadius: 9,
                                background: d.color ? `${d.color}18` : '#ede9fe',
                                color: d.color || '#7c3aed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              <Building2 size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1e1b4b' }}>{d.name}</div>
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                {d.description || 'Core engineering and academic programs'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={styles.codeBadge}>{d.code || '—'}</span>
                        </td>
                        <td>{d.students_count ?? 0}</td>
                        <td>{d.subjects_count ?? 0}</td>
                        <td>
                          <span className={d.is_active !== false ? styles.statusActive : styles.statusInactive}>
                            <span className={d.is_active !== false ? styles.dotGreen : styles.dotGray} />
                            {d.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className={styles.btnIcon} title="Edit Department" onClick={() => openEditDept(d)}>
                              <Edit3 size={13} style={{ color: '#7c3aed' }} />
                            </button>
                            <button className={styles.btnIcon} title="Delete Department" onClick={() => handleDeleteDept(d.id, d.name)}>
                              <Trash2 size={13} style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 3: SECTIONS
        ═══════════════════════════════════════════════════════════════════════ */}
        {tab === 'sections' && (
          <>
            {/* Header with Banner */}
            <div className={styles.headerRow}>
              <div className={styles.headerInfo}>
                <h1 className={styles.pageTitle}>Sections</h1>
                <p className={styles.pageSubtitle}>Create and manage sections within departments and batches.</p>
              </div>

              <div className={styles.headerBanner}>
                <div className={styles.bannerIcon}>
                  <Users size={24} />
                </div>
                <div>
                  <h4 className={styles.bannerTitle}>Organize students better</h4>
                  <p className={styles.bannerText}>Sections help you group students for seamless academic management.</p>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Layers size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{sections.length}</div>
                  <div className={styles.kpiLabel}>Total Sections</div>
                  <div className={styles.kpiTrend}>&uarr; 12% <span className={styles.kpiSubtext}>+5 this month</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#10b981' }}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{totalStudentsEnrolled}</div>
                  <div className={styles.kpiLabel}>Enrolled Students</div>
                  <div className={styles.kpiTrend}>&uarr; 18% <span className={styles.kpiSubtext}>+190 this month</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#fffbeb', color: '#f59e0b' }}>
                  <Building2 size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{departments.length}</div>
                  <div className={styles.kpiLabel}>Departments</div>
                  <div className={styles.kpiTrend}>0% <span className={styles.kpiSubtext}>No change</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <GraduationCap size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{batches.length}</div>
                  <div className={styles.kpiLabel}>Active Batches</div>
                  <div className={styles.kpiTrend}>&uarr; 20% <span className={styles.kpiSubtext}>+1 this month</span></div>
                </div>
              </div>
            </div>

            {/* Filter Row */}
            <div className={styles.toolbar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={sectionBatchFilter}
                  onChange={e => setSectionBatchFilter(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="all">All Batches</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                <select
                  value={sectionYearFilter}
                  onChange={e => setSectionYearFilter(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="all">All Years</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.year_label}</option>
                  ))}
                </select>

                <select
                  value={sectionStatusFilter}
                  onChange={e => setSectionStatusFilter(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className={styles.filterRow}>
                <div className={styles.searchBox}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search sections..."
                    value={sectionSearch}
                    onChange={e => setSectionSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <button className={styles.btnPrimary} onClick={() => openAddSection()}>
                  <Plus size={15} /> Add Section
                </button>
              </div>
            </div>

            {/* Sections Table */}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedSectionIds.length > 0 && selectedSectionIds.length === sections.length}
                        onChange={e => {
                          if (e.target.checked) setSelectedSectionIds(sections.map(s => s.id));
                          else setSelectedSectionIds([]);
                        }}
                      />
                    </th>
                    <th>Section Name</th>
                    <th>Department / Batch</th>
                    <th>Year</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sections
                    .filter(s => {
                      if (sectionBatchFilter !== 'all' && s.batch_id !== sectionBatchFilter) return false;
                      if (sectionYearFilter !== 'all' && s.year_id !== sectionYearFilter) return false;
                      if (sectionStatusFilter === 'active' && s.is_active === false) return false;
                      if (sectionStatusFilter === 'inactive' && s.is_active !== false) return false;
                      if (sectionSearch && !s.name.toLowerCase().includes(sectionSearch.toLowerCase()) && !s.batch_name?.toLowerCase().includes(sectionSearch.toLowerCase())) return false;
                      return true;
                    })
                    .slice((sectionPage - 1) * SECTIONS_PER_PAGE, sectionPage * SECTIONS_PER_PAGE)
                    .map(s => {
                      const circleColors = ['#ede9fe', '#dbeafe', '#fce7f3', '#dcfce7', '#fef3c7'];
                      const textColors = ['#7c3aed', '#2563eb', '#db2777', '#16a34a', '#d97706'];
                      const colorIndex = (s.name.charCodeAt(0) || 0) % circleColors.length;

                      return (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedSectionIds.includes(s.id)}
                              onChange={() => {
                                setSelectedSectionIds(prev =>
                                  prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                );
                              }}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  background: circleColors[colorIndex],
                                  color: textColors[colorIndex],
                                  fontWeight: 800, fontSize: 12,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                              >
                                {s.name.slice(0, 1).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 700, color: '#1e1b4b' }}>Section {s.name}</span>
                            </div>
                          </td>
                          <td>
                            <div>
                              <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.batch_name || 'CSE (B.Tech)'}</span>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.section_code || `SEC-${s.name}`}</div>
                            </div>
                          </td>
                          <td>{s.year_label || '2026-2027'}</td>
                          <td>{s.students_count ?? 0}</td>
                          <td>
                            <span className={s.is_active !== false ? styles.statusActive : styles.statusInactive}>
                              <span className={s.is_active !== false ? styles.dotGreen : styles.dotGray} />
                              {s.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className={styles.btnIcon} title="Edit Section" onClick={() => openEditSection(s)}>
                                <Edit3 size={13} style={{ color: '#7c3aed' }} />
                              </button>
                              <button
                                className={styles.btnSecondary}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => {
                                  setEnrollSectionId(s.id);
                                  switchTab('enroll');
                                }}
                              >
                                Manage
                              </button>
                              <button className={styles.btnIcon} title="Delete Section" onClick={() => handleDeleteSection(s.id, s.name)}>
                                <Trash2 size={13} style={{ color: '#ef4444' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              <div className={styles.tableFooter}>
                <span>Showing 1-8 of {sections.length} sections</span>
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    disabled={sectionPage <= 1}
                    onClick={() => setSectionPage(p => Math.max(1, p - 1))}
                  >
                    &lt;
                  </button>
                  {[...Array(Math.ceil(sections.length / SECTIONS_PER_PAGE) || 1)].map((_, i) => (
                    <button
                      key={i}
                      className={`${styles.pageBtn} ${sectionPage === i + 1 ? styles.pageBtnActive : ''}`}
                      onClick={() => setSectionPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    className={styles.pageBtn}
                    disabled={sectionPage >= Math.ceil(sections.length / SECTIONS_PER_PAGE)}
                    onClick={() => setSectionPage(p => p + 1)}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 4: SUBJECTS
        ═══════════════════════════════════════════════════════════════════════ */}
        {tab === 'subjects' && (
          <>
            {/* Header with Banner */}
            <div className={styles.headerRow}>
              <div className={styles.headerInfo}>
                <h1 className={styles.pageTitle}>Subjects</h1>
                <p className={styles.pageSubtitle}>Create and manage subjects for your academic programs.</p>
              </div>

              <div className={styles.headerBanner}>
                <div className={styles.bannerIcon}>
                  <BookOpen size={24} />
                </div>
                <div>
                  <h4 className={styles.bannerTitle}>Build a stronger curriculum</h4>
                  <p className={styles.bannerText}>Organize subjects, assign them to departments and track enrollment easily.</p>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <BookOpen size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{subjects.length}</div>
                  <div className={styles.kpiLabel}>Total Subjects</div>
                  <div className={styles.kpiTrend}>&uarr; 12% <span className={styles.kpiSubtext}>+3 this month</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#10b981' }}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{totalStudentsEnrolled}</div>
                  <div className={styles.kpiLabel}>Enrolled Students</div>
                  <div className={styles.kpiTrend}>&uarr; 18% <span className={styles.kpiSubtext}>+190 this month</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#fffbeb', color: '#f59e0b' }}>
                  <Building2 size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{departments.length}</div>
                  <div className={styles.kpiLabel}>Departments</div>
                  <div className={styles.kpiTrend}>0% <span className={styles.kpiSubtext}>No change</span></div>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <GraduationCap size={24} />
                </div>
                <div className={styles.kpiMeta}>
                  <div className={styles.kpiNumber}>{batches.length}</div>
                  <div className={styles.kpiLabel}>Active Batches</div>
                  <div className={styles.kpiTrend}>&uarr; 20% <span className={styles.kpiSubtext}>+1 this month</span></div>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
              <div className={styles.tabsBar}>
                <button
                  className={`${styles.tabBtn} ${subjectTab === 'all' ? styles.tabBtnActive : ''}`}
                  onClick={() => setSubjectTab('all')}
                >
                  All Subjects ({subjects.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${subjectTab === 'active' ? styles.tabBtnActive : ''}`}
                  onClick={() => setSubjectTab('active')}
                >
                  Active ({subjects.filter(s => s.is_active !== false).length})
                </button>
                <button
                  className={`${styles.tabBtn} ${subjectTab === 'inactive' ? styles.tabBtnActive : ''}`}
                  onClick={() => setSubjectTab('inactive')}
                >
                  Inactive ({subjects.filter(s => s.is_active === false).length})
                </button>
              </div>

              <div className={styles.filterRow}>
                <div className={styles.searchBox}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search subjects by name, code or department..."
                    value={subjectSearch}
                    onChange={e => setSubjectSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <select
                  value={subjectDeptFilter}
                  onChange={e => setSubjectDeptFilter(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="all">All Departments</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>

                <button
                  className={styles.btnSecondary}
                  onClick={() => exportCsv(
                    'subjects.csv',
                    ['#', 'Subject Name', 'Code', 'Department', 'Total Marks', 'Status'],
                    subjects.map((s, i) => [i + 1, s.name, s.code || '', s.department_name || '', s.total_marks || 100, s.is_active ? 'Active' : 'Inactive'])
                  )}
                >
                  <Download size={14} /> Export
                </button>

                <button className={styles.btnPrimary} onClick={openAddSubject}>
                  <Plus size={15} /> Add Subject
                </button>
              </div>
            </div>

            {/* Subjects Table */}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" />
                    </th>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Total Marks</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects
                    .filter(s => {
                      if (subjectTab === 'active' && s.is_active === false) return false;
                      if (subjectTab === 'inactive' && s.is_active !== false) return false;
                      if (subjectDeptFilter !== 'all' && s.department_id !== subjectDeptFilter) return false;
                      if (subjectSearch && !s.name.toLowerCase().includes(subjectSearch.toLowerCase()) && !s.code?.toLowerCase().includes(subjectSearch.toLowerCase())) return false;
                      return true;
                    })
                    .slice((subjectPage - 1) * SUBJECTS_PER_PAGE, subjectPage * SUBJECTS_PER_PAGE)
                    .map(sub => (
                      <tr key={sub.id}>
                        <td>
                          <input type="checkbox" />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: sub.color ? `${sub.color}18` : '#ede9fe',
                                color: sub.color || '#7c3aed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              <BookOpen size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1e1b4b' }}>{sub.name}</div>
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                {sub.description || 'Core curriculum subject modules'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={styles.codeBadge}>{sub.code || '—'}</span>
                        </td>
                        <td>{sub.department_name || 'Computer Science'}</td>
                        <td>{sub.total_marks ?? 100}</td>
                        <td>
                          <span className={sub.is_active !== false ? styles.statusActive : styles.statusInactive}>
                            <span className={sub.is_active !== false ? styles.dotGreen : styles.dotGray} />
                            {sub.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className={styles.btnIcon} title="Edit Subject" onClick={() => openEditSubject(sub)}>
                              <Edit3 size={13} style={{ color: '#7c3aed' }} />
                            </button>
                            <button className={styles.btnIcon} title="Delete Subject" onClick={() => handleDeleteSubject(sub.id, sub.name)}>
                              <Trash2 size={13} style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div className={styles.tableFooter}>
                <span>Showing 1-8 of {subjects.length} subjects</span>
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    disabled={subjectPage <= 1}
                    onClick={() => setSubjectPage(p => Math.max(1, p - 1))}
                  >
                    &lt;
                  </button>
                  {[...Array(Math.ceil(subjects.length / SUBJECTS_PER_PAGE) || 1)].map((_, i) => (
                    <button
                      key={i}
                      className={`${styles.pageBtn} ${subjectPage === i + 1 ? styles.pageBtnActive : ''}`}
                      onClick={() => setSubjectPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    className={styles.pageBtn}
                    disabled={subjectPage >= Math.ceil(subjects.length / SUBJECTS_PER_PAGE)}
                    onClick={() => setSubjectPage(p => p + 1)}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 5: ENROLL & ASSIGN
        ═══════════════════════════════════════════════════════════════════════ */}
        {tab === 'enroll' && (
          <>
            {/* Header with Banner & Action */}
            <div className={styles.headerRow}>
              <div className={styles.headerInfo}>
                <h1 className={styles.pageTitle}>Enroll & Assign</h1>
                <p className={styles.pageSubtitle}>Manage student enrollment and assign subjects with instructors for each section.</p>
              </div>

              <div className={styles.headerBanner}>
                <div className={styles.bannerIcon}>
                  <GraduationCap size={24} />
                </div>
                <div>
                  <h4 className={styles.bannerTitle}>Streamline Academic Management</h4>
                  <p className={styles.bannerText}>Assign the right subjects and instructors to the right students for a better learning experience.</p>
                </div>
                <button
                  className={styles.btnSecondary}
                  style={{ marginLeft: 'auto', background: '#fff', fontSize: 12 }}
                  onClick={() => switchTab('years')}
                >
                  View Structure
                </button>
              </div>
            </div>

            {/* 4-Card Context Selector Strip */}
            <div className={styles.contextStrip}>
              {/* Card 1: Academic Year */}
              <div className={`${styles.contextCard} ${activeContextDropdown === 'year' ? styles.contextCardActive : ''}`}>
                <div className={styles.contextIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Calendar size={18} />
                </div>
                <div className={styles.contextMeta}>
                  <span className={styles.contextStepLabel}>1. Academic Year</span>
                  <button
                    type="button"
                    className={styles.contextTrigger}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveContextDropdown(activeContextDropdown === 'year' ? null : 'year');
                    }}
                  >
                    <span className={styles.contextSelectedText}>
                      {years.find(y => y.id === enrollYearId)?.year_label || 'Select Year'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`${styles.contextChevron} ${activeContextDropdown === 'year' ? styles.chevronOpen : ''}`}
                    />
                  </button>
                </div>

                {activeContextDropdown === 'year' && (
                  <div className={styles.customPopover} onClick={e => e.stopPropagation()}>
                    <div className={styles.popoverHeader}>
                      <span>Select Academic Year</span>
                    </div>
                    <div className={styles.popoverList}>
                      {years.map(y => (
                        <button
                          type="button"
                          key={y.id}
                          className={`${styles.popoverItem} ${y.id === enrollYearId ? styles.popoverItemActive : ''}`}
                          onClick={() => {
                            setEnrollYearId(y.id);
                            setActiveContextDropdown(null);
                          }}
                        >
                          <div className={styles.popoverItemText}>
                            <span className={styles.popoverItemTitle}>{y.year_label}</span>
                            <span className={styles.popoverItemMeta}>{y.is_active ? 'Active' : 'Completed'}</span>
                          </div>
                          {y.id === enrollYearId && <Check size={14} className={styles.popoverCheck} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Department */}
              <div className={`${styles.contextCard} ${activeContextDropdown === 'dept' ? styles.contextCardActive : ''}`}>
                <div className={styles.contextIconWrap} style={{ background: '#ede9fe', color: '#6d28d9' }}>
                  <Building2 size={18} />
                </div>
                <div className={styles.contextMeta}>
                  <span className={styles.contextStepLabel}>2. Department</span>
                  <button
                    type="button"
                    className={styles.contextTrigger}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveContextDropdown(activeContextDropdown === 'dept' ? null : 'dept');
                    }}
                  >
                    <span
                      className={styles.contextSelectedText}
                      title={departments.find(d => d.id === enrollDeptId)?.name || 'Select Department'}
                    >
                      {departments.find(d => d.id === enrollDeptId)?.name || 'Select Department'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`${styles.contextChevron} ${activeContextDropdown === 'dept' ? styles.chevronOpen : ''}`}
                    />
                  </button>
                </div>

                {activeContextDropdown === 'dept' && (
                  <div className={styles.customPopover} onClick={e => e.stopPropagation()}>
                    <div className={styles.popoverHeader}>
                      <span>Select Department</span>
                    </div>
                    <div className={styles.popoverList}>
                      {departments.map(d => (
                        <button
                          type="button"
                          key={d.id}
                          className={`${styles.popoverItem} ${d.id === enrollDeptId ? styles.popoverItemActive : ''}`}
                          onClick={() => {
                            setEnrollDeptId(d.id);
                            setActiveContextDropdown(null);
                          }}
                        >
                          <div className={styles.popoverItemText}>
                            <span className={styles.popoverItemTitle}>{d.name}</span>
                            <span className={styles.popoverItemMeta}>{d.code ? `Code: ${d.code}` : 'Department'}</span>
                          </div>
                          {d.id === enrollDeptId && <Check size={14} className={styles.popoverCheck} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Batch (Filtered by selected Academic Year) */}
              <div className={`${styles.contextCard} ${activeContextDropdown === 'batch' ? styles.contextCardActive : ''}`}>
                <div className={styles.contextIconWrap} style={{ background: '#ecfdf5', color: '#10b981' }}>
                  <Layers size={18} />
                </div>
                <div className={styles.contextMeta}>
                  <span className={styles.contextStepLabel}>3. Batch</span>
                  <button
                    type="button"
                    className={styles.contextTrigger}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveContextDropdown(activeContextDropdown === 'batch' ? null : 'batch');
                    }}
                  >
                    <span
                      className={styles.contextSelectedText}
                      title={availableBatches.find(b => b.id === enrollBatchId)?.name || 'Select Batch'}
                    >
                      {availableBatches.find(b => b.id === enrollBatchId)?.name || 'Select Batch'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`${styles.contextChevron} ${activeContextDropdown === 'batch' ? styles.chevronOpen : ''}`}
                    />
                  </button>
                </div>

                {activeContextDropdown === 'batch' && (
                  <div className={styles.customPopover} onClick={e => e.stopPropagation()}>
                    <div className={styles.popoverHeader}>
                      <span>Select Batch</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'none' }}>
                        {availableBatches.length} batch{availableBatches.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <div className={styles.popoverList}>
                      {availableBatches.length === 0 ? (
                        <div style={{ padding: '12px 10px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                          No batches for selected year
                        </div>
                      ) : (
                        availableBatches.map(b => (
                          <button
                            type="button"
                            key={b.id}
                            className={`${styles.popoverItem} ${b.id === enrollBatchId ? styles.popoverItemActive : ''}`}
                            onClick={() => {
                              setEnrollBatchId(b.id);
                              setActiveContextDropdown(null);
                            }}
                          >
                            <div className={styles.popoverItemText}>
                              <span className={styles.popoverItemTitle}>{b.name}</span>
                              <span className={styles.popoverItemMeta}>
                                {b.program || 'Program'} &bull; {b.sections_count ?? 0} sec
                              </span>
                            </div>
                            {b.id === enrollBatchId && <Check size={14} className={styles.popoverCheck} />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 4: Section (Filtered by selected Batch) */}
              <div className={`${styles.contextCard} ${activeContextDropdown === 'section' ? styles.contextCardActive : ''}`}>
                <div className={styles.contextIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Users size={18} />
                </div>
                <div className={styles.contextMeta}>
                  <span className={styles.contextStepLabel}>4. Section</span>
                  <button
                    type="button"
                    className={styles.contextTrigger}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveContextDropdown(activeContextDropdown === 'section' ? null : 'section');
                    }}
                  >
                    <span className={styles.contextSelectedText}>
                      {(() => {
                        const sec = availableSections.find(s => s.id === enrollSectionId);
                        return sec ? `Section ${sec.name}` : 'Select Section';
                      })()}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`${styles.contextChevron} ${activeContextDropdown === 'section' ? styles.chevronOpen : ''}`}
                    />
                  </button>
                </div>

                {activeContextDropdown === 'section' && (
                  <div className={styles.customPopover} onClick={e => e.stopPropagation()}>
                    <div className={styles.popoverHeader}>
                      <span>Select Section</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'none' }}>
                        {availableSections.length} section{availableSections.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className={styles.popoverList}>
                      {availableSections.length === 0 ? (
                        <div style={{ padding: '12px 10px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                          No sections in selected batch
                        </div>
                      ) : (
                        availableSections.map(s => (
                          <button
                            type="button"
                            key={s.id}
                            className={`${styles.popoverItem} ${s.id === enrollSectionId ? styles.popoverItemActive : ''}`}
                            onClick={() => {
                              setEnrollSectionId(s.id);
                              setActiveContextDropdown(null);
                            }}
                          >
                            <div className={styles.popoverItemText}>
                              <span className={styles.popoverItemTitle}>Section {s.name}</span>
                              <span className={styles.popoverItemMeta}>
                                {s.students_count || 0} students &bull; Max {s.max_students || 60}
                              </span>
                            </div>
                            {s.id === enrollSectionId && <Check size={14} className={styles.popoverCheck} />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2-Column Interactive Workspace */}
            <div className={styles.workspaceGrid}>
              {/* Left Column: 1. Enroll Students */}
              <div className={styles.workspaceCard}>
                <div className={styles.cardHead}>
                  <div className={styles.cardIconCircle} style={{ background: '#ecfdf5', color: '#10b981' }}>
                    <Users size={18} />
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>1. Enroll Students</h3>
                    <p className={styles.cardSubtitle}>Select students from the list below to enroll in Section {sections.find(s => s.id === enrollSectionId)?.name || 'selected'}.</p>
                  </div>
                </div>

                <div className={styles.toolbar}>
                  <div className={styles.tabsBar}>
                    <button
                      className={`${styles.tabBtn} ${studentEnrollFilter === 'all' ? styles.tabBtnActive : ''}`}
                      onClick={() => setStudentEnrollFilter('all')}
                    >
                      All ({students.length})
                    </button>
                    <button
                      className={`${styles.tabBtn} ${studentEnrollFilter === 'enrolled' ? styles.tabBtnActive : ''}`}
                      onClick={() => setStudentEnrollFilter('enrolled')}
                    >
                      Enrolled ({Object.keys(enrolledStudentsMap).length})
                    </button>
                    <button
                      className={`${styles.tabBtn} ${studentEnrollFilter === 'not_enrolled' ? styles.tabBtnActive : ''}`}
                      onClick={() => setStudentEnrollFilter('not_enrolled')}
                    >
                      Not Enrolled ({students.length - Object.keys(enrolledStudentsMap).length})
                    </button>
                  </div>

                  <div className={styles.searchBox} style={{ minWidth: 200 }}>
                    <Search size={14} className={styles.searchIcon} />
                    <input
                      type="text"
                      placeholder="Search by name or roll no..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className={styles.searchInput}
                    />
                  </div>
                </div>

                {/* Students Table */}
                <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: 12 }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}>
                          <input
                            type="checkbox"
                            checked={selectedForEnrollment.length > 0}
                            onChange={e => {
                              if (e.target.checked) setSelectedForEnrollment(students.map(s => s.id));
                              else setSelectedForEnrollment([]);
                            }}
                          />
                        </th>
                        <th>#</th>
                        <th>Student</th>
                        <th>Roll No.</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students
                        .filter(s => {
                          const isEnrolled = !!enrolledStudentsMap[s.id];
                          if (studentEnrollFilter === 'enrolled' && !isEnrolled) return false;
                          if (studentEnrollFilter === 'not_enrolled' && isEnrolled) return false;
                          if (studentSearch) {
                            const q = studentSearch.toLowerCase();
                            return s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.roll_number?.toLowerCase().includes(q);
                          }
                          return true;
                        })
                        .slice((studentPage - 1) * 6, studentPage * 6)
                        .map((s, idx) => {
                          const isEnrolled = !!enrolledStudentsMap[s.id];
                          const initials = s.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
                          return (
                            <tr key={s.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedForEnrollment.includes(s.id)}
                                  onChange={() => {
                                    setSelectedForEnrollment(prev =>
                                      prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                    );
                                  }}
                                />
                              </td>
                              <td style={{ color: '#94a3b8' }}>{(studentPage - 1) * 6 + idx + 1}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div
                                    style={{
                                      width: 28, height: 28, borderRadius: '50%',
                                      background: '#8b5cf6', color: '#fff',
                                      fontWeight: 700, fontSize: 11,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                  >
                                    {initials}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1e1b4b' }}>{s.full_name}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ fontSize: 12, fontWeight: 600 }}>{s.roll_number || 'NDU2024012'}</td>
                              <td>
                                <span className={isEnrolled ? styles.statusActive : styles.statusInactive}>
                                  <span className={isEnrolled ? styles.dotGreen : styles.dotGray} />
                                  {isEnrolled ? 'Enrolled' : 'Not Enrolled'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    <strong>{selectedForEnrollment.length}</strong> students selected
                  </span>
                  <button
                    className={styles.btnPrimary}
                    disabled={selectedForEnrollment.length === 0}
                    onClick={handleEnrollStudents}
                    style={{ opacity: selectedForEnrollment.length === 0 ? 0.6 : 1 }}
                  >
                    <Plus size={14} /> Enroll Selected Students
                  </button>
                </div>
              </div>

              {/* Right Column: 2. Assign Subject & Instructor */}
              <div className={styles.workspaceCard}>
                <div className={styles.cardHead}>
                  <div className={styles.cardIconCircle} style={{ background: '#eff6ff', color: '#2563eb' }}>
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>2. Assign Subject & Instructor</h3>
                    <p className={styles.cardSubtitle}>Choose the subject and instructor for the selected section.</p>
                  </div>
                </div>

                {/* Subject Selector */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Subject *</label>
                  <select
                    value={assignSubjectId}
                    onChange={e => setAssignSubjectId(e.target.value)}
                    className={styles.fieldInput}
                  >
                    <option value="">Select subject...</option>
                    {subjects.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>
                    ))}
                  </select>
                </div>

                {/* Live Subject Preview */}
                {assignSubjectId && (() => {
                  const pickedSub = subjects.find(s => s.id === assignSubjectId);
                  if (!pickedSub) return null;
                  return (
                    <div className={styles.previewInfoCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <BookOpen size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e1b4b' }}>{pickedSub.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Code: {pickedSub.code}</div>
                        </div>
                      </div>
                      <div className={styles.previewDetails}>
                        <span>Max Marks: {pickedSub.total_marks || 100}</span>
                        <span>Credits: 4</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Instructor Selector */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Instructor *</label>
                  <select
                    value={assignInstructorId}
                    onChange={e => setAssignInstructorId(e.target.value)}
                    className={styles.fieldInput}
                  >
                    <option value="">Select instructor...</option>
                    {instructors.map(inst => (
                      <option key={inst.id} value={inst.id}>{inst.full_name} ({inst.email})</option>
                    ))}
                  </select>
                </div>

                {/* Live Instructor Preview */}
                {assignInstructorId && (() => {
                  const pickedInst = instructors.find(i => i.id === assignInstructorId);
                  if (!pickedInst) return null;
                  const instInitials = pickedInst.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'IN';
                  return (
                    <div className={styles.previewInfoCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {instInitials}
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e1b4b' }}>{pickedInst.full_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{pickedInst.email}</div>
                        </div>
                      </div>
                      <div className={styles.previewDetails}>
                        <span>Dept: Computer Science</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Assignment Options Checkboxes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sendNotification}
                      onChange={e => setSendNotification(e.target.checked)}
                    />
                    Send notification to students and instructor
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={e => setReplaceExisting(e.target.checked)}
                    />
                    Replace existing assignment (if any)
                  </label>
                </div>

                {/* Action Submit */}
                <button
                  className={styles.btnPrimary}
                  style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 8 }}
                  disabled={assigningLoading || !assignSubjectId || !assignInstructorId}
                  onClick={handleAssignSubjectAndInstructor}
                >
                  <Send size={15} />
                  {assigningLoading ? 'Assigning…' : 'Assign to Selected Section'}
                </button>
              </div>
            </div>

            {/* Bottom Card: Current Assignments for the Selected Section */}
            <div className={styles.tableCard} style={{ padding: 22 }}>
              <div className={styles.toolbar} style={{ marginBottom: 16 }}>
                <div>
                  <h3 className={styles.cardTitle}>
                    Current Assignments for Section {sections.find(s => s.id === enrollSectionId)?.name || 'B'}
                  </h3>
                  <p className={styles.cardSubtitle}>View and manage already assigned subjects and instructors. You can edit or remove assignments anytime.</p>
                </div>

                <div className={styles.filterRow}>
                  <div className={styles.searchBox} style={{ minWidth: 220 }}>
                    <Search size={14} className={styles.searchIcon} />
                    <input
                      type="text"
                      placeholder="Search subjects or instructors..."
                      value={assignmentSearch}
                      onChange={e => setAssignmentSearch(e.target.value)}
                      className={styles.searchInput}
                    />
                  </div>

                  <button
                    className={styles.btnSecondary}
                    onClick={() => exportCsv(
                      'section_assignments.csv',
                      ['#', 'Subject', 'Code', 'Instructor', 'Email'],
                      allAssignments
                        .filter(a => a.section_id === enrollSectionId)
                        .map((a, i) => [i + 1, a.subject_name || '', a.subject_code || '', a.instructor_name || '', a.instructor_email || ''])
                    )}
                  >
                    <Download size={14} /> Export
                  </button>
                </div>
              </div>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Instructor</th>
                    <th>Students Enrolled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allAssignments
                    .filter(a => {
                      if (enrollSectionId && a.section_id !== enrollSectionId) return false;
                      if (assignmentSearch) {
                        const q = assignmentSearch.toLowerCase();
                        return a.subject_name?.toLowerCase().includes(q) || a.instructor_name?.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((assign, i) => {
                      const instInitials = assign.instructor_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'IN';
                      return (
                        <tr key={assign.id || i}>
                          <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BookOpen size={16} />
                              </div>
                              <span style={{ fontWeight: 700, color: '#1e1b4b' }}>{assign.subject_name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={styles.codeBadge}>{assign.subject_code || 'CS102'}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {instInitials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1e1b4b' }}>{assign.instructor_name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{assign.instructor_email || 'instructor@nexlab.edu'}</div>
                              </div>
                            </div>
                          </td>
                          <td>{Object.keys(enrolledStudentsMap).length}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className={styles.btnIcon}
                                title="Remove Assignment"
                                onClick={() => handleUnassignSubject(assign.id)}
                              >
                                <Trash2 size={13} style={{ color: '#ef4444' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  {allAssignments.filter(a => a.section_id === enrollSectionId).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                        No subjects assigned to this section yet. Use panel above to assign.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            DRAWER 1: CREATE ACADEMIC YEAR (Matching Screenshot 1)
        ═══════════════════════════════════════════════════════════════════════ */}
        {showYearDrawer && (
          <div className={styles.drawerOverlay} onClick={() => setShowYearDrawer(false)}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h2 className={styles.drawerTitle}>Create Academic Year</h2>
                  <p className={styles.drawerSubtitle}>Set up a new academic year and optionally create your first batch.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowYearDrawer(false)}>
                  <X size={16} />
                </button>
              </div>

              {/* Stepper */}
              <div style={{ padding: '20px 26px 0' }}>
                <div className={styles.stepperWrap}>
                  <div className={styles.stepperLine} />
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${yearStep >= 1 ? styles.stepBubbleActive : ''}`}>1</div>
                    <span className={`${styles.stepText} ${yearStep === 1 ? styles.stepTextActive : ''}`}>Year Details</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${yearStep >= 2 ? styles.stepBubbleActive : ''}`}>2</div>
                    <span className={`${styles.stepText} ${yearStep === 2 ? styles.stepTextActive : ''}`}>Optional Batch</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${yearStep === 3 ? styles.stepBubbleActive : ''}`}>3</div>
                    <span className={`${styles.stepText} ${yearStep === 3 ? styles.stepTextActive : ''}`}>Review</span>
                  </div>
                </div>
              </div>

              {/* Drawer Body */}
              <div className={styles.drawerBody}>
                {yearStep === 1 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <Calendar size={16} style={{ color: '#7c3aed' }} />
                      <span>Academic Year Information</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Academic Year *</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="number"
                          className={styles.fieldInput}
                          value={yearForm.startYear}
                          onChange={e => setYearForm(f => ({ ...f, startYear: e.target.value }))}
                          style={{ flex: 1 }}
                        />
                        <span style={{ color: '#94a3b8', fontWeight: 700 }}>&mdash;</span>
                        <input
                          type="number"
                          className={styles.fieldInput}
                          value={yearForm.endYear}
                          onChange={e => setYearForm(f => ({ ...f, endYear: e.target.value }))}
                          style={{ flex: 1 }}
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Status</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div
                          className={`${styles.radioCard} ${yearForm.status === 'active' ? styles.radioCardSelected : ''}`}
                          onClick={() => setYearForm(f => ({ ...f, status: 'active' }))}
                        >
                          <div className={styles.dotGreen} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Active</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Visible for enrollment and academic activities</div>
                          </div>
                        </div>

                        <div
                          className={`${styles.radioCard} ${yearForm.status === 'upcoming' ? styles.radioCardSelected : ''}`}
                          onClick={() => setYearForm(f => ({ ...f, status: 'upcoming' }))}
                        >
                          <div className={styles.dotBlue} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Upcoming</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Prepare in advance (not visible to students yet)</div>
                          </div>
                        </div>

                        <div
                          className={`${styles.radioCard} ${yearForm.status === 'completed' ? styles.radioCardSelected : ''}`}
                          onClick={() => setYearForm(f => ({ ...f, status: 'completed' }))}
                        >
                          <div className={styles.dotGray} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Completed</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Year has ended and archived</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {yearStep === 2 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <div className={styles.sectionHeading} style={{ margin: 0 }}>
                        <Layers size={16} style={{ color: '#7c3aed' }} />
                        <span>Create First Batch (Optional)</span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={yearForm.createFirstBatch}
                          onChange={e => setYearForm(f => ({ ...f, createFirstBatch: e.target.checked }))}
                        />
                        Create a batch now
                      </label>
                    </div>

                    {yearForm.createFirstBatch ? (
                      <>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Batch Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. CSE-2026 or B.Tech CSE 2026"
                            className={styles.fieldInput}
                            value={yearForm.batchName}
                            onChange={e => setYearForm(f => ({ ...f, batchName: e.target.value }))}
                          />
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Program / Course *</label>
                          <select
                            className={styles.fieldInput}
                            value={yearForm.program}
                            onChange={e => setYearForm(f => ({ ...f, program: e.target.value }))}
                          >
                            <option value="B.Tech - Computer Science">B.Tech - Computer Science</option>
                            <option value="B.Tech - Electronics & Comm.">B.Tech - Electronics & Comm.</option>
                            <option value="B.Tech - Mechanical Eng.">B.Tech - Mechanical Eng.</option>
                            <option value="B.Tech - AI & Data Science">B.Tech - AI & Data Science</option>
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Total Sections</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
                              onClick={() => setYearForm(f => ({ ...f, totalSections: Math.max(1, f.totalSections - 1) }))}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              className={styles.fieldInput}
                              style={{ width: 60, textAlign: 'center' }}
                              value={yearForm.totalSections}
                              readOnly
                            />
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
                              onClick={() => setYearForm(f => ({ ...f, totalSections: Math.min(10, f.totalSections + 1) }))}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p style={{ fontSize: 13, color: '#64748b', margin: '20px 0' }}>
                        You can skip batch creation and add batches later from the academic years list.
                      </p>
                    )}
                  </>
                )}

                {yearStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className={styles.sectionHeading}>
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                      <span>Review & Confirm</span>
                    </div>

                    <div className={styles.previewInfoCard} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e1b4b' }}>
                        Academic Year: {yearForm.startYear} &ndash; {yearForm.endYear}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Status: {yearForm.status.toUpperCase()}</div>
                      {yearForm.createFirstBatch && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', width: '100%' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>Batch: {yearForm.batchName}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Program: {yearForm.program}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Creating {yearForm.totalSections} sections (Section A, B...)</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className={styles.drawerFooter}>
                {yearStep > 1 && (
                  <button className={styles.btnSecondary} onClick={() => setYearStep(s => (s - 1) as any)}>
                    Back
                  </button>
                )}
                <button className={styles.btnSecondary} onClick={() => setShowYearDrawer(false)}>
                  Cancel
                </button>
                {yearStep < 3 ? (
                  <button className={styles.btnPrimary} onClick={() => setYearStep(s => (s + 1) as any)}>
                    Next &rarr;
                  </button>
                ) : (
                  <button className={styles.btnPrimary} onClick={handleCreateAcademicYear}>
                    Confirm & Create Year
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            DRAWER 2: ADD / EDIT DEPARTMENT (Matching Screenshot 2)
        ═══════════════════════════════════════════════════════════════════════ */}
        {showDeptDrawer && (
          <div className={styles.drawerOverlay} onClick={() => setShowDeptDrawer(false)}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h2 className={styles.drawerTitle}>{editingDeptId ? 'Edit Department' : 'Add Department'}</h2>
                  <p className={styles.drawerSubtitle}>Create a new department to organize your academic structure.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowDeptDrawer(false)}>
                  <X size={16} />
                </button>
              </div>

              {/* Stepper */}
              <div style={{ padding: '20px 26px 0' }}>
                <div className={styles.stepperWrap}>
                  <div className={styles.stepperLine} />
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${deptStep >= 1 ? styles.stepBubbleActive : ''}`}>1</div>
                    <span className={`${styles.stepText} ${deptStep === 1 ? styles.stepTextActive : ''}`}>Department Details</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${deptStep >= 2 ? styles.stepBubbleActive : ''}`}>2</div>
                    <span className={`${styles.stepText} ${deptStep === 2 ? styles.stepTextActive : ''}`}>Additional Settings</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${deptStep >= 3 ? styles.stepBubbleActive : ''}`}>3</div>
                    <span className={`${styles.stepText} ${deptStep === 3 ? styles.stepTextActive : ''}`}>Review & Create</span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className={styles.drawerBody}>
                {deptStep === 1 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <Building2 size={16} style={{ color: '#7c3aed' }} />
                      <span>Department Details</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Department Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Computer Science & Engineering"
                        className={styles.fieldInput}
                        value={deptForm.name}
                        onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Short Code *</label>
                      <input
                        type="text"
                        placeholder="e.g. CSE"
                        className={styles.fieldInput}
                        value={deptForm.code}
                        onChange={e => setDeptForm(f => ({ ...f, code: e.target.value }))}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>A short code (2-10 characters) used for identification.</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Description</label>
                      <textarea
                        placeholder="Describe the department, its focus and programs..."
                        className={styles.fieldTextarea}
                        maxLength={250}
                        value={deptForm.description}
                        onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                        {deptForm.description.length}/250
                      </span>
                    </div>
                  </>
                )}

                {deptStep === 2 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <Sparkles size={16} style={{ color: '#7c3aed' }} />
                      <span>Department Settings</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Status</label>
                      <div className={styles.radioCardsGrid}>
                        <div
                          className={`${styles.radioCard} ${deptForm.is_active ? styles.radioCardSelected : ''}`}
                          onClick={() => setDeptForm(f => ({ ...f, is_active: true }))}
                        >
                          <div className={styles.dotGreen} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Active</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Available for use</div>
                          </div>
                        </div>

                        <div
                          className={`${styles.radioCard} ${!deptForm.is_active ? styles.radioCardSelected : ''}`}
                          onClick={() => setDeptForm(f => ({ ...f, is_active: false }))}
                        >
                          <div className={styles.dotGray} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Inactive</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Keep for future use</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Color Theme</label>
                      <div className={styles.colorSwatches}>
                        {DEPT_COLORS.map(c => (
                          <div
                            key={c}
                            className={`${styles.colorCircle} ${deptForm.color === c ? styles.colorCircleSelected : ''}`}
                            style={{ background: c }}
                            onClick={() => setDeptForm(f => ({ ...f, color: c }))}
                          >
                            {deptForm.color === c && <Check size={12} color="#fff" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {deptStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className={styles.sectionHeading}>
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                      <span>Review Department Details</span>
                    </div>

                    <div className={styles.previewInfoCard} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: deptForm.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Building2 size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e1b4b' }}>{deptForm.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Code: {deptForm.code || 'None'}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
                        {deptForm.description || 'No description provided.'}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: deptForm.is_active ? '#10b981' : '#64748b' }}>
                        Status: {deptForm.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={styles.drawerFooter}>
                {deptStep > 1 && (
                  <button className={styles.btnSecondary} onClick={() => setDeptStep(s => (s - 1) as any)}>
                    Back
                  </button>
                )}
                <button className={styles.btnSecondary} onClick={() => setShowDeptDrawer(false)}>
                  Cancel
                </button>
                {deptStep < 3 ? (
                  <button className={styles.btnPrimary} onClick={() => setDeptStep(s => (s + 1) as any)}>
                    Next &rarr;
                  </button>
                ) : (
                  <button className={styles.btnPrimary} onClick={handleSaveDept}>
                    {editingDeptId ? 'Save Changes' : 'Create Department'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            DRAWER 3: ADD / EDIT SECTION (Matching Screenshot 3)
        ═══════════════════════════════════════════════════════════════════════ */}
        {showSectionDrawer && (
          <div className={styles.drawerOverlay} onClick={() => setShowSectionDrawer(false)}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h2 className={styles.drawerTitle}>{editingSectionId ? 'Edit Section' : 'Add New Section'}</h2>
                  <p className={styles.drawerSubtitle}>Create a new section under a department and batch.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowSectionDrawer(false)}>
                  <X size={16} />
                </button>
              </div>

              {/* Stepper */}
              <div style={{ padding: '20px 26px 0' }}>
                <div className={styles.stepperWrap}>
                  <div className={styles.stepperLine} />
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${sectionStep >= 1 ? styles.stepBubbleActive : ''}`}>1</div>
                    <span className={`${styles.stepText} ${sectionStep === 1 ? styles.stepTextActive : ''}`}>Section Details</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${sectionStep >= 2 ? styles.stepBubbleActive : ''}`}>2</div>
                    <span className={`${styles.stepText} ${sectionStep === 2 ? styles.stepTextActive : ''}`}>Academic Details</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${sectionStep >= 3 ? styles.stepBubbleActive : ''}`}>3</div>
                    <span className={`${styles.stepText} ${sectionStep === 3 ? styles.stepTextActive : ''}`}>Review</span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className={styles.drawerBody}>
                {sectionStep === 1 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <FileText size={16} style={{ color: '#7c3aed' }} />
                      <span>Basic Information</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Department / Batch *</label>
                      <select
                        className={styles.fieldInput}
                        value={sectionForm.batch_id}
                        onChange={e => setSectionForm(f => ({ ...f, batch_id: e.target.value }))}
                      >
                        <option value="">Select department / batch</option>
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.program || 'Program'})</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Section Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Section A or A"
                        className={styles.fieldInput}
                        value={sectionForm.name}
                        onChange={e => setSectionForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Section Code (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. A, B, C"
                        className={styles.fieldInput}
                        value={sectionForm.section_code}
                        onChange={e => setSectionForm(f => ({ ...f, section_code: e.target.value }))}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>A short code for quick identification.</span>
                    </div>
                  </>
                )}

                {sectionStep === 2 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <GraduationCap size={16} style={{ color: '#7c3aed' }} />
                      <span>Academic Details</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Academic Year *</label>
                      <select
                        className={styles.fieldInput}
                        value={sectionForm.academic_year_id}
                        onChange={e => setSectionForm(f => ({ ...f, academic_year_id: e.target.value }))}
                      >
                        <option value="">Select academic year</option>
                        {years.map(y => (
                          <option key={y.id} value={y.id}>{y.year_label}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Max Students (optional)</label>
                      <input
                        type="number"
                        placeholder="60"
                        className={styles.fieldInput}
                        value={sectionForm.max_students}
                        onChange={e => setSectionForm(f => ({ ...f, max_students: parseInt(e.target.value, 10) || 60 }))}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Set maximum capacity for this section.</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Status</label>
                      <div className={styles.radioCardsGrid}>
                        <div
                          className={`${styles.radioCard} ${sectionForm.is_active ? styles.radioCardSelected : ''}`}
                          onClick={() => setSectionForm(f => ({ ...f, is_active: true }))}
                        >
                          <div className={styles.dotGreen} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Active</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Available for enrollment</div>
                          </div>
                        </div>

                        <div
                          className={`${styles.radioCard} ${!sectionForm.is_active ? styles.radioCardSelected : ''}`}
                          onClick={() => setSectionForm(f => ({ ...f, is_active: false }))}
                        >
                          <div className={styles.dotGray} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Inactive</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Keep for future use</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {sectionStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className={styles.sectionHeading}>
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                      <span>Review Section Information</span>
                    </div>

                    <div className={styles.previewInfoCard} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e1b4b' }}>
                        Section Name: {sectionForm.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Batch: {batches.find(b => b.id === sectionForm.batch_id)?.name || 'None selected'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Academic Year: {years.find(y => y.id === sectionForm.academic_year_id)?.year_label || 'Default'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Max Capacity: {sectionForm.max_students} students
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={styles.drawerFooter}>
                {sectionStep > 1 && (
                  <button className={styles.btnSecondary} onClick={() => setSectionStep(s => (s - 1) as any)}>
                    Back
                  </button>
                )}
                <button className={styles.btnSecondary} onClick={() => setShowSectionDrawer(false)}>
                  Cancel
                </button>
                {sectionStep < 3 ? (
                  <button className={styles.btnPrimary} onClick={() => setSectionStep(s => (s + 1) as any)}>
                    Next &rarr;
                  </button>
                ) : (
                  <button className={styles.btnPrimary} onClick={handleSaveSection}>
                    {editingSectionId ? 'Save Changes' : 'Create Section'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            DRAWER 4: ADD / EDIT SUBJECT (Matching Screenshot 4)
        ═══════════════════════════════════════════════════════════════════════ */}
        {showSubjectDrawer && (
          <div className={styles.drawerOverlay} onClick={() => setShowSubjectDrawer(false)}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h2 className={styles.drawerTitle}>{editingSubjectId ? 'Edit Subject' : 'Add New Subject'}</h2>
                  <p className={styles.drawerSubtitle}>Create a new subject and configure its details.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowSubjectDrawer(false)}>
                  <X size={16} />
                </button>
              </div>

              {/* Stepper */}
              <div style={{ padding: '20px 26px 0' }}>
                <div className={styles.stepperWrap}>
                  <div className={styles.stepperLine} />
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${subjectStep >= 1 ? styles.stepBubbleActive : ''}`}>1</div>
                    <span className={`${styles.stepText} ${subjectStep === 1 ? styles.stepTextActive : ''}`}>Subject Details</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${subjectStep >= 2 ? styles.stepBubbleActive : ''}`}>2</div>
                    <span className={`${styles.stepText} ${subjectStep === 2 ? styles.stepTextActive : ''}`}>Academic Settings</span>
                  </div>
                  <div className={styles.stepItem}>
                    <div className={`${styles.stepBubble} ${subjectStep >= 3 ? styles.stepBubbleActive : ''}`}>3</div>
                    <span className={`${styles.stepText} ${subjectStep === 3 ? styles.stepTextActive : ''}`}>Review & Create</span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className={styles.drawerBody}>
                {subjectStep === 1 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <BookOpen size={16} style={{ color: '#7c3aed' }} />
                      <span>Basic Information</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Subject Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Data Structures & Algorithms"
                        className={styles.fieldInput}
                        value={subjectForm.name}
                        onChange={e => setSubjectForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Subject Code *</label>
                        <input
                          type="text"
                          placeholder="e.g. CS101"
                          className={styles.fieldInput}
                          value={subjectForm.code}
                          onChange={e => setSubjectForm(f => ({ ...f, code: e.target.value }))}
                        />
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Department *</label>
                        <select
                          className={styles.fieldInput}
                          value={subjectForm.department_id}
                          onChange={e => setSubjectForm(f => ({ ...f, department_id: e.target.value }))}
                        >
                          <option value="">Select department</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Description</label>
                      <textarea
                        placeholder="Describe what this subject covers, its objectives, key topics..."
                        className={styles.fieldTextarea}
                        maxLength={300}
                        value={subjectForm.description}
                        onChange={e => setSubjectForm(f => ({ ...f, description: e.target.value }))}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                        {subjectForm.description.length}/300
                      </span>
                    </div>
                  </>
                )}

                {subjectStep === 2 && (
                  <>
                    <div className={styles.sectionHeading}>
                      <Award size={16} style={{ color: '#7c3aed' }} />
                      <span>Academic Settings</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Total Marks *</label>
                        <input
                          type="number"
                          placeholder="100"
                          className={styles.fieldInput}
                          value={subjectForm.total_marks}
                          onChange={e => setSubjectForm(f => ({ ...f, total_marks: parseInt(e.target.value, 10) || 100 }))}
                        />
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Subject Type</label>
                        <select
                          className={styles.fieldInput}
                          value={subjectForm.subject_type}
                          onChange={e => setSubjectForm(f => ({ ...f, subject_type: e.target.value }))}
                        >
                          <option value="Theory">Theory</option>
                          <option value="Practical">Practical / Lab</option>
                          <option value="Elective">Elective</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Status</label>
                      <div className={styles.radioCardsGrid}>
                        <div
                          className={`${styles.radioCard} ${subjectForm.is_active ? styles.radioCardSelected : ''}`}
                          onClick={() => setSubjectForm(f => ({ ...f, is_active: true }))}
                        >
                          <div className={styles.dotGreen} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Active</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Available for enrollment</div>
                          </div>
                        </div>

                        <div
                          className={`${styles.radioCard} ${!subjectForm.is_active ? styles.radioCardSelected : ''}`}
                          onClick={() => setSubjectForm(f => ({ ...f, is_active: false }))}
                        >
                          <div className={styles.dotGray} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Inactive</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Keep for future use</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Color Theme</label>
                      <div className={styles.colorSwatches}>
                        {DEPT_COLORS.map(c => (
                          <div
                            key={c}
                            className={`${styles.colorCircle} ${subjectForm.color === c ? styles.colorCircleSelected : ''}`}
                            style={{ background: c }}
                            onClick={() => setSubjectForm(f => ({ ...f, color: c }))}
                          >
                            {subjectForm.color === c && <Check size={12} color="#fff" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {subjectStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className={styles.sectionHeading}>
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                      <span>Review Subject Configuration</span>
                    </div>

                    <div className={styles.previewInfoCard} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: subjectForm.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <BookOpen size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e1b4b' }}>{subjectForm.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Code: {subjectForm.code}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                        Type: {subjectForm.subject_type} &bull; Marks: {subjectForm.total_marks}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Department: {departments.find(d => d.id === subjectForm.department_id)?.name || 'General'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={styles.drawerFooter}>
                {subjectStep > 1 && (
                  <button className={styles.btnSecondary} onClick={() => setSubjectStep(s => (s - 1) as any)}>
                    Back
                  </button>
                )}
                <button className={styles.btnSecondary} onClick={() => setShowSubjectDrawer(false)}>
                  Cancel
                </button>
                {subjectStep < 3 ? (
                  <button className={styles.btnPrimary} onClick={() => setSubjectStep(s => (s + 1) as any)}>
                    Next &rarr;
                  </button>
                ) : (
                  <button className={styles.btnPrimary} onClick={handleSaveSubject}>
                    {editingSubjectId ? 'Save Changes' : 'Create Subject'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            QUICK ADD BATCH MODAL
        ═══════════════════════════════════════════════════════════════════════ */}
        {showBatchModal && (
          <div className={styles.drawerOverlay} onClick={() => setShowBatchModal(false)}>
            <div className={styles.drawer} style={{ width: 440 }} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h3 className={styles.drawerTitle}>Add New Batch</h3>
                  <p className={styles.drawerSubtitle}>Create a batch under an academic year.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowBatchModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.drawerBody}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Academic Year *</label>
                  <select
                    className={styles.fieldInput}
                    value={batchModalForm.year_id}
                    onChange={e => setBatchModalForm(f => ({ ...f, year_id: e.target.value }))}
                  >
                    <option value="">Select year</option>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.year_label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Batch Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. CSE-2026"
                    className={styles.fieldInput}
                    value={batchModalForm.name}
                    onChange={e => setBatchModalForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Program / Course</label>
                  <input
                    type="text"
                    placeholder="e.g. B.Tech - Computer Science"
                    className={styles.fieldInput}
                    value={batchModalForm.program}
                    onChange={e => setBatchModalForm(f => ({ ...f, program: e.target.value }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Total Sections to Generate</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className={styles.fieldInput}
                    value={batchModalForm.total_sections}
                    onChange={e => setBatchModalForm(f => ({ ...f, total_sections: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
              </div>

              <div className={styles.drawerFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowBatchModal(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleCreateBatch}>Create Batch</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            EDIT ACADEMIC YEAR MODAL
        ═══════════════════════════════════════════════════════════════════════ */}
        {showEditYearModal && (
          <div className={styles.drawerOverlay} onClick={() => setShowEditYearModal(false)}>
            <div className={styles.drawer} style={{ width: 440 }} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h3 className={styles.drawerTitle}>Edit Academic Year</h3>
                  <p className={styles.drawerSubtitle}>Update label or active status for this academic year.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowEditYearModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.drawerBody}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Academic Year Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026 - 2027"
                    className={styles.fieldInput}
                    value={editYearForm.year_label}
                    onChange={e => setEditYearForm(f => ({ ...f, year_label: e.target.value }))}
                  />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Visible name across all academic selections.</span>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Status</label>
                  <div className={styles.radioCardsGrid}>
                    <div
                      className={`${styles.radioCard} ${editYearForm.is_active ? styles.radioCardSelected : ''}`}
                      onClick={() => setEditYearForm(f => ({ ...f, is_active: true }))}
                    >
                      <div className={styles.dotGreen} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Active</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Current academic cycle</div>
                      </div>
                    </div>

                    <div
                      className={`${styles.radioCard} ${!editYearForm.is_active ? styles.radioCardSelected : ''}`}
                      onClick={() => setEditYearForm(f => ({ ...f, is_active: false }))}
                    >
                      <div className={styles.dotGray} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>Completed</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Archived year</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.drawerFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowEditYearModal(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleUpdateAcademicYear}>Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            EDIT BATCH MODAL
        ═══════════════════════════════════════════════════════════════════════ */}
        {showEditBatchModal && (
          <div className={styles.drawerOverlay} onClick={() => setShowEditBatchModal(false)}>
            <div className={styles.drawer} style={{ width: 440 }} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h3 className={styles.drawerTitle}>Edit Batch</h3>
                  <p className={styles.drawerSubtitle}>Update batch details, program name, or assigned academic year.</p>
                </div>
                <button className={styles.btnIcon} onClick={() => setShowEditBatchModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.drawerBody}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Academic Year *</label>
                  <select
                    className={styles.fieldInput}
                    value={editBatchForm.year_id}
                    onChange={e => setEditBatchForm(f => ({ ...f, year_id: e.target.value }))}
                  >
                    <option value="">Select year</option>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.year_label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Batch Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. CSE-2026"
                    className={styles.fieldInput}
                    value={editBatchForm.name}
                    onChange={e => setEditBatchForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Program / Course</label>
                  <input
                    type="text"
                    placeholder="e.g. B.Tech - Computer Science"
                    className={styles.fieldInput}
                    value={editBatchForm.program}
                    onChange={e => setEditBatchForm(f => ({ ...f, program: e.target.value }))}
                  />
                </div>
              </div>

              <div className={styles.drawerFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowEditBatchModal(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleUpdateBatch}>Save Changes</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </InstitutionShell>
  );
}
