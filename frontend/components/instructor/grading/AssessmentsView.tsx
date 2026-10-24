'use client';

import React from 'react';
import { Search, SlidersHorizontal, Plus, BookOpen, MoreVertical } from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

interface AssessmentsViewProps {
  experiments: any[];
  publishedCount: number;
  draftCount: number;
  totalStudents: number;
  statusTab: 'all' | 'published' | 'draft' | 'not_started';
  onSelectStatusTab: (tab: 'all' | 'published' | 'draft' | 'not_started') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onViewAssessment: (expId: string) => void;
  onCreateAssessment: () => void;
}

export default function AssessmentsView({
  experiments,
  publishedCount,
  draftCount,
  totalStudents,
  statusTab,
  onSelectStatusTab,
  searchQuery,
  onSearchChange,
  onViewAssessment,
  onCreateAssessment,
}: AssessmentsViewProps) {
  const notStartedCount = Math.max(0, (experiments.length || 5) - publishedCount - draftCount);

  const filteredExperiments = (experiments.length > 0
    ? experiments
    : [
        { id: '1', exp_number: 1, title: 'Sorting Algorithms', weightage: 20, is_published: true, submitted_count: 180 },
        { id: '2', exp_number: 2, title: 'Trees and BST', weightage: 0, is_published: false, submitted_count: 124 },
        { id: '3', exp_number: 3, title: 'Graph Algorithms', weightage: 0, is_published: false, submitted_count: 0 },
        { id: '4', exp_number: 4, title: 'Fundamentals Quiz', weightage: 0, is_published: false, submitted_count: 180 },
        { id: '5', exp_number: 5, title: 'Final Project', weightage: 0, is_published: false, submitted_count: 0 },
      ]
  ).filter(exp => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!exp.title.toLowerCase().includes(q)) return false;
    }
    if (statusTab === 'published' && !exp.is_published) return false;
    if (statusTab === 'draft' && (exp.is_published || (exp.submitted_count === 0 && exp.exp_number > 2))) return false;
    if (statusTab === 'not_started' && (exp.is_published || (exp.submitted_count && exp.submitted_count > 0))) return false;
    return true;
  });

  return (
    <div className={hub.viewContainer}>
      {/* Top Filter and Actions Toolbar */}
      <div className={hub.tableToolbar}>
        <div className={hub.assessmentStatusTabs}>
          <button
            type="button"
            className={`${hub.statusFilterTab} ${statusTab === 'all' ? hub.statusFilterTabActive : ''}`}
            onClick={() => onSelectStatusTab('all')}
          >
            All ({experiments.length || 5})
          </button>
          <button
            type="button"
            className={`${hub.statusFilterTab} ${statusTab === 'published' ? hub.statusFilterTabActive : ''}`}
            onClick={() => onSelectStatusTab('published')}
          >
            Published ({publishedCount})
          </button>
          <button
            type="button"
            className={`${hub.statusFilterTab} ${statusTab === 'draft' ? hub.statusFilterTabActive : ''}`}
            onClick={() => onSelectStatusTab('draft')}
          >
            Draft ({draftCount})
          </button>
          <button
            type="button"
            className={`${hub.statusFilterTab} ${statusTab === 'not_started' ? hub.statusFilterTabActive : ''}`}
            onClick={() => onSelectStatusTab('not_started')}
          >
            Not started ({notStartedCount})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={hub.searchBox} style={{ minWidth: 200 }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              className={hub.searchInput}
              placeholder="Search assessments..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>

          <button type="button" className={hub.iconBtn}>
            <SlidersHorizontal size={13} /> Filters
          </button>

          <button
            type="button"
            className={hub.primaryBtn}
            onClick={onCreateAssessment}
          >
            <Plus size={14} /> Create Assessment
          </button>
        </div>
      </div>

      {/* Assessments Table */}
      <div className={hub.rosterTableContainer}>
        <table className={hub.rosterTable}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Assessment</th>
              <th>Type</th>
              <th>Weightage</th>
              <th>Submissions</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExperiments.map((exp, idx) => {
              const isPub = Boolean(exp.is_published);
              const isDraft = !isPub && ((exp.submitted_count && exp.submitted_count > 0) || exp.exp_number <= 2);
              const subCount = exp.submitted_count || (isPub ? 180 : (isDraft ? 124 : 0));
              const totalTarget = totalStudents || 200;
              const subPct = Math.round((subCount / totalTarget) * 100);

              return (
                <tr key={exp.id}>
                  <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={`${hub.kpiCardIconBox} ${hub.kpiIconPurple}`}>
                        <BookOpen size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                          Lab {exp.exp_number} - {exp.title}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          Arrays, Time Complexity
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                      {exp.delivery_mode === 'exam' ? 'Exam' : (exp.exp_number === 4 ? 'Quiz' : (exp.exp_number === 5 ? 'Project' : 'Lab Experiment'))}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>
                      {exp.weightage || 0} marks ({exp.weightage || 0}%)
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 140 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 650, color: '#334155' }}>
                        <span>{subCount}/{totalTarget}</span>
                        <span>({subPct}%)</span>
                      </div>
                      <div className={hub.tableProgressTrack}>
                        <div
                          className={hub.tableProgressFill}
                          style={{ width: `${subPct}%`, background: isPub ? '#7c3aed' : '#fbbf24' }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    {isPub && <span className={hub.statusPillPublished}>● Published</span>}
                    {isDraft && <span className={hub.statusPillDraft}>● Draft</span>}
                    {!isPub && !isDraft && <span className={hub.statusPillNotStarted}>● Not started</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {isPub ? (
                        <button
                          type="button"
                          className={hub.tableActionBtn}
                          onClick={() => onViewAssessment(exp.id)}
                        >
                          View
                        </button>
                      ) : isDraft ? (
                        <button
                          type="button"
                          className={hub.tableActionBtn}
                          onClick={() => window.location.href = `/instructor/experiments/${exp.id}/edit`}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={hub.tableActionBtn}
                          onClick={() => window.location.href = `/instructor/experiments/${exp.id}/edit`}
                        >
                          Setup
                        </button>
                      )}
                      <button
                        type="button"
                        className={hub.iconBtn}
                        style={{ width: 28, height: 28, padding: 0 }}
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
