'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Video, FileText, Code, HelpCircle, Database, Plus, Search,
  Download, Eye, Trash2, X, Upload
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface ContentItem {
  id: string;
  type: 'Video' | 'PDF' | 'Starter Code' | 'Quiz' | 'Dataset';
  title: string;
  subject: string;
  sizeOrDuration: string;
  attachedTo: string;
  updatedAt: string;
}

const INITIAL_CONTENT: ContentItem[] = [
  { id: 'c1', type: 'Video', title: 'Stack Concept & Push/Pop Walkthrough', subject: 'CS301 Data Structures', sizeOrDuration: '14 mins MP4', attachedTo: 'Stack Implementation', updatedAt: 'Jul 22, 2026' },
  { id: 'c2', type: 'PDF', title: 'Titration Lab Manual & Safety Guidelines', subject: 'CH101 Chemistry', sizeOrDuration: '2.4 MB PDF', attachedTo: 'Acid-Base Titration', updatedAt: 'Jul 18, 2026' },
  { id: 'c3', type: 'Starter Code', title: 'Python Stack Class Boilerplate template', subject: 'CS301 Data Structures', sizeOrDuration: '4.2 KB PY', attachedTo: 'Stack Implementation', updatedAt: 'Jul 24, 2026' },
  { id: 'c4', type: 'Quiz', title: 'CPU Scheduling Algorithms Pre-Lab Quiz', subject: 'CS302 OS', sizeOrDuration: '5 Questions', attachedTo: 'CPU Process Scheduling', updatedAt: 'Jul 25, 2026' },
  { id: 'c5', type: 'Dataset', title: 'Relational Database Schema & Sample Rows', subject: 'CS303 DBMS', sizeOrDuration: '1.8 MB SQL', attachedTo: 'Relational Joins', updatedAt: 'Jul 15, 2026' },
];

export default function ContentLibraryPage() {
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>(INITIAL_CONTENT);
  const [activeTab, setActiveTab] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'Video' | 'PDF' | 'Starter Code' | 'Quiz' | 'Dataset'>('Video');
  const [newSubject, setNewSubject] = useState('CS301 Data Structures');

  const filtered = items.filter((item) => {
    if (activeTab === 'All') return true;
    return item.type === activeTab;
  });

  const handleAddContent = () => {
    if (!newTitle) return;
    const newItem: ContentItem = {
      id: `content-${Date.now()}`,
      type: newType,
      title: newTitle,
      subject: newSubject,
      sizeOrDuration: newType === 'Video' ? '10 mins MP4' : newType === 'PDF' ? '1.5 MB PDF' : 'Ready',
      attachedTo: 'General Library',
      updatedAt: 'Today',
    };
    setItems([newItem, ...items]);
    setShowAddModal(false);
    setNewTitle('');
  };

  return (
    <InstructorShell
      activePage="Content Library"
      title="Content & Resource Library"
      subtitle="Manage video walkthroughs, lab manual PDFs, starter code templates, pre-lab quiz banks, and datasets"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => setShowAddModal(true)}>
          <Plus size={16} strokeWidth={2} /> Upload Content Asset
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/experiments')}>
          <BookOpen size={16} strokeWidth={1.9} /> Experiment Authoring
        </button>
      </div>

      {/* Filter Tabs */}
      <div className={styles.tabRow}>
        {['All', 'Video', 'PDF', 'Starter Code', 'Quiz', 'Dataset'].map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tabChip} ${activeTab === t ? styles.tabChipActive : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t} Assets ({t === 'All' ? items.length : items.filter(i => i.type === t).length})
          </button>
        ))}
      </div>

      {/* Content List */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Library Resources</h2>
            <p className={styles.sectionSub}>Cloudinary storage & PostgreSQL metadata linked assets.</p>
          </div>
        </div>

        <div className={styles.list}>
          {filtered.map((item) => (
            <div key={item.id} className={styles.listRow}>
              <div className={styles.rowIcon}>
                {item.type === 'Video' ? <Video size={20} /> : item.type === 'PDF' ? <FileText size={20} /> : item.type === 'Starter Code' ? <Code size={20} /> : item.type === 'Quiz' ? <HelpCircle size={20} /> : <Database size={20} />}
              </div>

              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className={styles.rowTitle}>{item.title}</p>
                  <span className={styles.pillBlue}>{item.type}</span>
                </div>
                <p className={styles.rowMeta}>{item.subject} · Attached to: {item.attachedTo}</p>
                <p className={styles.rowSub}>📦 Size/Meta: {item.sizeOrDuration} | Updated: {item.updatedAt}</p>
              </div>

              <div className={styles.rowSide}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" className={styles.ghostBtn} style={{ minHeight: '32px', padding: '0 10px', fontSize: '11.5px' }}>
                    <Eye size={12} /> Preview
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    style={{ minHeight: '32px', padding: '0 10px', fontSize: '11.5px', color: '#b91c1c' }}
                    onClick={() => setItems(items.filter(i => i.id !== item.id))}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ADD CONTENT MODAL */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Upload Content Asset</h3>
                <p className={styles.sectionSub}>Attach video, PDF manual, code starter, or quiz to subject library</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Asset Title</label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. Queue Data Structure PDF Manual"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Asset Type</label>
                <select className={styles.select} value={newType} onChange={(e) => setNewType(e.target.value as any)}>
                  <option value="Video">Video Walkthrough</option>
                  <option value="PDF">PDF Lab Manual</option>
                  <option value="Starter Code">Starter Code Template</option>
                  <option value="Quiz">Pre-Lab Quiz</option>
                  <option value="Dataset">Dataset File</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Subject</label>
                <select className={styles.select} value={newSubject} onChange={(e) => setNewSubject(e.target.value)}>
                  <option>CS301 Data Structures</option>
                  <option>CS302 OS</option>
                  <option>CS303 DBMS</option>
                  <option>CH101 Chemistry</option>
                </select>
              </div>
            </div>

            <div style={{ border: '2px dashed #cbd5e1', padding: '24px', borderRadius: '12px', textAlign: 'center', margin: '12px 0', background: '#f8fafc' }}>
              <Upload size={24} style={{ color: '#0f62fe', marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>Drag and drop file here or click to select</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>Supports MP4, PDF, PY, CPP, SQL files (Max 100MB)</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} onClick={handleAddContent}>
                Upload Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
