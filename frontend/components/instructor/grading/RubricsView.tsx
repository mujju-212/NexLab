'use client';

import React from 'react';
import { SlidersHorizontal, BookOpen } from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

interface RubricsViewProps {
  editingRubric: {
    test_cases: number;
    lab_report: number;
    code_quality: number;
    viva: number;
    quiz: number;
  };
  setEditingRubric: React.Dispatch<React.SetStateAction<{
    test_cases: number;
    lab_report: number;
    code_quality: number;
    viva: number;
    quiz: number;
  }>>;
  selectedComponent: 'test_cases' | 'lab_report' | 'code_quality' | 'viva' | 'quiz';
  setSelectedComponent: (comp: 'test_cases' | 'lab_report' | 'code_quality' | 'viva' | 'quiz') => void;
  publicTestWeight: number;
  setPublicTestWeight: (w: number) => void;
  hiddenTestWeight: number;
  setHiddenTestWeight: (w: number) => void;
  passFailCriteria: string;
  setPassFailCriteria: (c: string) => void;
  applyTimeLimits: boolean;
  setApplyTimeLimits: (b: boolean) => void;
  onSaveRubric: () => void;
  saving: boolean;
  onCopyDefaults: () => void;
}

export default function RubricsView({
  editingRubric,
  setEditingRubric,
  selectedComponent,
  setSelectedComponent,
  publicTestWeight,
  setPublicTestWeight,
  hiddenTestWeight,
  setHiddenTestWeight,
  passFailCriteria,
  setPassFailCriteria,
  applyTimeLimits,
  setApplyTimeLimits,
  onSaveRubric,
  saving,
  onCopyDefaults,
}: RubricsViewProps) {
  const totalWeight = editingRubric.test_cases + editingRubric.lab_report + editingRubric.code_quality + editingRubric.viva + editingRubric.quiz;

  return (
    <div className={hub.viewContainer}>
      {/* Header Banner */}
      <div className={hub.rubricHeaderCard}>
        <div className={hub.rubricHeaderLeft}>
          <div className={hub.rubricIconBox}>
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 750, color: '#0f172a' }}>
              Rubric Configuration
            </div>
            <div style={{ fontSize: 12.5, color: '#64748b' }}>
              Configure assessment components, weights, and grading rules.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className={hub.iconBtn}
            onClick={onCopyDefaults}
          >
            Copy from Existing
          </button>
          <button
            type="button"
            className={hub.primaryBtn}
            disabled={saving}
            onClick={onSaveRubric}
          >
            {saving ? 'Saving…' : 'Save Rubric'}
          </button>
        </div>
      </div>

      {/* Split Two-Column Layout */}
      <div className={hub.rubricSplitLayout}>
        {/* Left Column: Rubric Components (Total: 100%) */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeaderRow}>
            <div className={hub.cardHeading}>
              Rubric Components (Total: 100%)
            </div>
            <button
              type="button"
              className={hub.cardLinkBtn}
              onClick={() => {}}
            >
              Preview Rubric
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'test_cases', name: 'Test Cases', sub: 'Auto-evaluated' },
              { key: 'lab_report', name: 'Lab Report', sub: 'Manual review' },
              { key: 'code_quality', name: 'Code Quality', sub: 'Static analysis' },
              { key: 'viva', name: 'Oral Viva', sub: 'AI/Live viva' },
              { key: 'quiz', name: 'Pre/Post Quiz', sub: 'Quiz score' },
            ].map(comp => {
              const isSelected = selectedComponent === comp.key;
              const weightVal = editingRubric[comp.key as keyof typeof editingRubric];

              return (
                <div
                  key={comp.key}
                  className={`${hub.rubricComponentRow} ${isSelected ? hub.rubricComponentRowSelected : ''}`}
                  onClick={() => setSelectedComponent(comp.key as any)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className={`${hub.kpiCardIconBox} ${hub.kpiIconBlue}`} style={{ width: 32, height: 32 }}>
                      <BookOpen size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{comp.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{comp.sub}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Toggle switch */}
                    <div
                      className={`${hub.toggleSwitch} ${hub.toggleSwitchActive}`}
                      onClick={e => { e.stopPropagation(); }}
                    >
                      <div className={hub.toggleSwitchKnob} />
                    </div>

                    {/* Weight input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className={hub.weightInput}
                        value={weightVal}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setEditingRubric(prev => ({ ...prev, [comp.key]: val }));
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>%</span>
                    </div>

                    <button
                      type="button"
                      className={hub.tableActionBtn}
                      style={{ height: 26, fontSize: 11 }}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedComponent(comp.key as any);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Total Weightage</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: totalWeight === 100 ? '#16a34a' : '#ea580c' }}>
              {totalWeight}%
            </span>
          </div>
        </div>

        {/* Right Column: Component Settings */}
        <div className={hub.whiteCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={`${hub.kpiCardIconBox} ${hub.kpiIconBlue}`}>
                <BookOpen size={16} />
              </div>
              <div>
                <div className={hub.cardHeading} style={{ textTransform: 'capitalize' }}>
                  {selectedComponent.replace('_', ' ')}
                </div>
                <div className={hub.cardSubheading}>
                  Automated evaluation using public and hidden test cases executed in isolated environment.
                </div>
              </div>
            </div>
            <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGreen}`} style={{ fontSize: 12 }}>
              {editingRubric[selectedComponent]}%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 650, color: '#334155' }}>
                  Public test cases weight
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    className={hub.filterSelect}
                    style={{ width: '100%' }}
                    value={publicTestWeight}
                    onChange={e => setPublicTestWeight(Number(e.target.value) || 0)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>%</span>
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Weight of visible sample test cases</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 650, color: '#334155' }}>
                  Hidden test cases weight
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    className={hub.filterSelect}
                    style={{ width: '100%' }}
                    value={hiddenTestWeight}
                    onChange={e => setHiddenTestWeight(Number(e.target.value) || 0)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>%</span>
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Weight of hidden evaluation test cases</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 650, color: '#334155' }}>
                Pass/Fail criteria (optional)
              </label>
              <select
                className={hub.filterSelect}
                style={{ width: '100%' }}
                value={passFailCriteria}
                onChange={e => setPassFailCriteria(e.target.value)}
              >
                <option value="none">No minimum required</option>
                <option value="50pct">Minimum 50% test cases passed</option>
                <option value="all_public">Must pass all public test cases</option>
                <option value="100pct">Must pass 100% of test cases</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <input
                type="checkbox"
                id="applyTimeLimits"
                checked={applyTimeLimits}
                onChange={e => setApplyTimeLimits(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
              />
              <label htmlFor="applyTimeLimits" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                Apply execution time limits <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Consider runtime for scoring)</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
