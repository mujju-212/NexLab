'use client';

/**
 * AiAssistModal.tsx — Instructor-only AI productivity panel.
 *
 * Source tabs:
 *   1. Paste text — raw textarea
 *   2. Upload file — PDF / Markdown / TXT; calls POST ai/extract-text (multipart)
 *   3. From URL / link — Google Docs, GitHub raw, arXiv, etc.
 *   4. From experiment content — AI reads all existing blocks
 *
 * Generates: study notes (markdown), code snippets, MCQ quiz, viva Q&A.
 * Calls: POST /api/instructor/experiments/<expId>/ai/generate
 */

import { useRef, useState } from 'react';
import { X, Sparkles, Loader2, Plus, Check, ChevronRight, Upload, Link2 } from 'lucide-react';
import { instructorService } from '@/services/instructor.service';
import s from './studio.module.css';
import shared from '@/app/instructor/shared.module.css';

type GenerateKey = 'notes' | 'code' | 'quiz' | 'viva';
type SourceTab    = 'text' | 'file' | 'url' | 'experiment';

interface Props {
  experimentId: string;
  onClose: () => void;
  /** Called after blocks are added so ContentStudio can refresh its list. */
  onBlocksAdded: () => void;
  onToast?: (msg: string) => void;
}

type GenerateResult = Awaited<ReturnType<typeof instructorService.generateAiContent>>;

export default function AiAssistModal({ experimentId, onClose, onBlocksAdded, onToast }: Props) {
  // ── Source tab ──
  const [sourceTab, setSourceTab]       = useState<SourceTab>('text');
  const [pastedText, setPastedText]     = useState('');

  // File upload state
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extracting, setExtracting]     = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [extractInfo, setExtractInfo]   = useState<{ chars: number; source: string } | null>(null);
  const [extractError, setExtractError] = useState('');

  // URL input state
  const [urlInput, setUrlInput]         = useState('');

  // ── Output choices ──
  const [wantNotes, setWantNotes]   = useState(true);
  const [wantCode, setWantCode]     = useState(false);
  const [wantQuiz, setWantQuiz]     = useState(true);
  const [wantViva, setWantViva]     = useState(true);
  const [language, setLanguage]     = useState('python');
  const [countQuiz, setCountQuiz]   = useState(5);
  const [countViva, setCountViva]   = useState(5);

  // ── Generate state ──
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState<GenerateResult | null>(null);

  // Added-items tracking per generated item key
  const [added, setAdded]       = useState<Record<string, boolean>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);

  // Which result section is expanded
  const [openSection, setOpenSection] = useState<string | null>(null);

  // ── Text resolution helper ───────────────────────────────────────────────
  /** Returns { source, text } ready for generateAiContent, or null if invalid */
  const resolveSource = (): { source: 'text' | 'experiment'; text?: string } | null => {
    if (sourceTab === 'experiment') return { source: 'experiment' };

    // For file / url tabs, use the already-extracted text
    const resolved = sourceTab === 'text' ? pastedText.trim() : extractedText.trim();
    if (!resolved) return null;
    return { source: 'text', text: resolved };
  };

  // ── File extraction ──────────────────────────────────────────────────────
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    setExtractedText('');
    setExtractInfo(null);
    setExtractError('');
  };

  const extractFromFile = async () => {
    if (!selectedFile) return;
    setExtracting(true);
    setExtractError('');
    setExtractedText('');
    setExtractInfo(null);
    try {
      const result = await instructorService.extractTextFromFile(experimentId, selectedFile);
      setExtractedText(result.text);
      setExtractInfo({ chars: result.chars, source: result.source });
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setExtractError(x?.response?.data?.error ?? 'Failed to extract text from file.');
    } finally {
      setExtracting(false);
    }
  };

  // ── URL extraction ───────────────────────────────────────────────────────
  const extractFromUrl = async () => {
    const u = urlInput.trim();
    if (!u) return;
    setExtracting(true);
    setExtractError('');
    setExtractedText('');
    setExtractInfo(null);
    try {
      const result = await instructorService.extractTextFromUrl(experimentId, u);
      setExtractedText(result.text);
      setExtractInfo({ chars: result.chars, source: result.source });
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setExtractError(x?.response?.data?.error ?? 'Failed to fetch text from URL.');
    } finally {
      setExtracting(false);
    }
  };

  // ── Generate ─────────────────────────────────────────────────────────────
  const generate = async () => {
    const wantList: GenerateKey[] = [
      ...(wantNotes ? ['notes' as const] : []),
      ...(wantCode  ? ['code'  as const] : []),
      ...(wantQuiz  ? ['quiz'  as const] : []),
      ...(wantViva  ? ['viva'  as const] : []),
    ];
    if (wantList.length === 0) {
      setError('Select at least one type of content to generate.');
      return;
    }

    const src = resolveSource();
    if (!src) {
      if (sourceTab === 'text') setError('Paste some text first.');
      else if (sourceTab === 'file') setError('Extract text from a file first (click "Extract text").');
      else if (sourceTab === 'url') setError('Fetch text from a URL first (click "Fetch text").');
      return;
    }

    setError('');
    setLoading(true);
    setResult(null);
    setAdded({});
    setOpenSection(null);
    try {
      const res = await instructorService.generateAiContent(experimentId, {
        ...src,
        generate: wantList,
        language,
        count_quiz: countQuiz,
        count_viva: countViva,
      });
      setResult(res);
      if (res.notes)                 setOpenSection('notes');
      else if (res.code_snippets?.length)  setOpenSection('code');
      else if (res.quiz_questions?.length) setOpenSection('quiz');
      else if (res.viva_questions?.length) setOpenSection('viva');
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setError(x?.response?.data?.error ?? 'AI generation failed — please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Add-to-experiment helpers ────────────────────────────────────────────
  const addNote = async () => {
    if (!result?.notes) return;
    const key = 'notes';
    setAddingKey(key);
    try {
      await instructorService.addContentModule(experimentId, {
        module_type: 'markdown',
        title: 'AI-generated notes',
        content_data: { md: result.notes.markdown },
        page_id: null,
      });
      setAdded(a => ({ ...a, [key]: true }));
      onBlocksAdded();
      onToast?.('Notes block added ✓');
    } catch { onToast?.('Failed to add notes block.'); }
    finally { setAddingKey(null); }
  };

  const detectPackagesFromCode = (c: string): string => {
    const pkgs: string[] = [];
    if (/\bmatplotlib\b/.test(c)) pkgs.push('matplotlib');
    if (/\bpandas\b/.test(c)) pkgs.push('pandas');
    if (/\bnumpy\b/.test(c)) pkgs.push('numpy');
    if (/\bscipy\b/.test(c)) pkgs.push('scipy');
    if (/\bseaborn\b/.test(c)) pkgs.push('seaborn');
    if (/\brequests\b/.test(c)) pkgs.push('requests');
    if (/\bsklearn\b/.test(c)) pkgs.push('scikit-learn');
    if (/\bsympy\b/.test(c)) pkgs.push('sympy');
    return pkgs.join(', ');
  };

  const addCodeSnippet = async (idx: number) => {
    const snippets = result?.code_snippets;
    if (!snippets) return;
    const snippet = snippets[idx];
    const key = `code-${idx}`;
    setAddingKey(key);
    try {
      await instructorService.addContentModule(experimentId, {
        module_type: 'code',
        title: snippet.title || 'AI-generated code',
        content_data: {
          language: snippet.language,
          code: snippet.code,
          runnable: true,
          stdin: '',
          packages: detectPackagesFromCode(snippet.code || ''),
          description: snippet.description || '',
        },
        page_id: null,
      });
      setAdded(a => ({ ...a, [key]: true }));
      onBlocksAdded();
      onToast?.('Code block added ✓');
    } catch { onToast?.('Failed to add code block.'); }
    finally { setAddingKey(null); }
  };

  const addAssignTask = async (idx: number) => {
    const snippets = result?.code_snippets;
    if (!snippets) return;
    const snippet = snippets[idx];
    const key = `assign-${idx}`;
    setAddingKey(key);
    try {
      await instructorService.addContentModule(experimentId, {
        module_type: 'assign',
        title: snippet.title ? `Task: ${snippet.title}` : 'Graded Coding Task',
        content_data: {
          language: snippet.language || language || 'python',
          instructions: snippet.description || `Implement the solution according to the requirements for ${snippet.title || 'this task'}.`,
          starter_code: snippet.code || `# Write your ${snippet.language || 'python'} solution here\n`,
          packages: detectPackagesFromCode(snippet.code || ''),
          pass_threshold: 60,
          time_limit_sec: 5,
          test_cases: [
            { input: '', expected: 'Hello, World!', hidden: false, weight: 1 },
          ],
        },
        page_id: null,
      });
      setAdded(a => ({ ...a, [key]: true }));
      onBlocksAdded();
      onToast?.('Graded task block added ✓');
    } catch { onToast?.('Failed to add graded task block.'); }
    finally { setAddingKey(null); }
  };

  const addQuizQuestion = async (idx: number) => {
    const qs = result?.quiz_questions;
    if (!qs) return;
    const q = qs[idx];
    const key = `quiz-${idx}`;
    setAddingKey(key);
    try {
      const res = await instructorService.addContentModule(experimentId, {
        module_type: 'quiz',
        title: `Quiz — AI Q${idx + 1}`,
        content_data: { pass_threshold: 70, max_attempts: 3, cooldown_minutes: 0, shuffle: true, inline_questions: [q] },
        page_id: null,
      });
      const modId = res?.module?.id;
      if (modId) {
        const letters = ['A', 'B', 'C', 'D'];
        const corr = letters[q.correct_index] || 'A';
        try {
          await instructorService.addQuestions(modId, {
            question_text: q.question,
            options: q.options,
            correct_answer: corr,
            points: 1,
            explanation: q.explanation || '',
          });
        } catch {}
      }
      setAdded(a => ({ ...a, [key]: true }));
      onBlocksAdded();
      onToast?.('Quiz block added ✓');
    } catch { onToast?.('Failed to add quiz block.'); }
    finally { setAddingKey(null); }
  };

  const addAllQuiz = async () => {
    const qs = result?.quiz_questions;
    if (!qs?.length) return;
    const key = 'quiz-all';
    setAddingKey(key);
    try {
      const res = await instructorService.addContentModule(experimentId, {
        module_type: 'quiz',
        title: 'AI-generated quiz',
        content_data: { pass_threshold: 70, max_attempts: 3, cooldown_minutes: 0, shuffle: true, inline_questions: qs },
        page_id: null,
      });
      const modId = res?.module?.id;
      if (modId) {
        const letters = ['A', 'B', 'C', 'D'];
        const questionsToAdd = qs.map(q => ({
          question_text: q.question,
          options: q.options,
          correct_answer: letters[q.correct_index] || 'A',
          points: 1,
          explanation: q.explanation || '',
        }));
        try {
          await instructorService.addQuestions(modId, questionsToAdd);
        } catch {}
      }
      const newAdded: Record<string, boolean> = {};
      qs.forEach((_, i) => { newAdded[`quiz-${i}`] = true; });
      newAdded['quiz-all'] = true;
      setAdded(a => ({ ...a, ...newAdded }));
      onBlocksAdded();
      onToast?.('All quiz questions added as one block ✓');
    } catch { onToast?.('Failed to add quiz block.'); }
    finally { setAddingKey(null); }
  };

  const addVivaQuestion = async (idx: number) => {
    const qs = result?.viva_questions;
    if (!qs) return;
    const q = qs[idx];
    const key = `viva-${idx}`;
    setAddingKey(key);
    try {
      await instructorService.addContentModule(experimentId, {
        module_type: 'viva',
        title: `Viva — AI Q${idx + 1}`,
        content_data: {
          mode: 'topics', topics: [], count: 1,
          questions: [{ question: q.question, expected_answer: q.expected_answer, topics: [], difficulty: null }],
        },
        page_id: null,
      });
      setAdded(a => ({ ...a, [key]: true }));
      onBlocksAdded();
      onToast?.('Viva block added ✓');
    } catch { onToast?.('Failed to add viva block.'); }
    finally { setAddingKey(null); }
  };

  const addAllViva = async () => {
    const qs = result?.viva_questions;
    if (!qs?.length) return;
    const key = 'viva-all';
    setAddingKey(key);
    try {
      await instructorService.addContentModule(experimentId, {
        module_type: 'viva',
        title: 'AI-generated viva',
        content_data: {
          mode: 'topics', topics: [], count: qs.length,
          questions: qs.map(v => ({ question: v.question, expected_answer: v.expected_answer, topics: [], difficulty: null })),
        },
        page_id: null,
      });
      const newAdded: Record<string, boolean> = {};
      qs.forEach((_, i) => { newAdded[`viva-${i}`] = true; });
      newAdded['viva-all'] = true;
      setAdded(a => ({ ...a, ...newAdded }));
      onBlocksAdded();
      onToast?.('All viva questions added as one block ✓');
    } catch { onToast?.('Failed to add viva block.'); }
    finally { setAddingKey(null); }
  };

  // ── Small UI helpers ──────────────────────────────────────────────────────
  const SectionHeader = ({
    id, label, count, badge,
  }: { id: string; label: string; count?: number; badge?: string }) => (
    <button
      className={s.aiSectionHeader}
      onClick={() => setOpenSection(p => p === id ? null : id)}
    >
      <ChevronRight size={14} className={openSection === id ? s.aiChevronOpen : undefined} />
      <span className={s.aiSectionLabel}>{label}</span>
      {count !== undefined && <span className={s.aiCount}>{count}</span>}
      {badge && <span className={s.aiBadge}>{badge}</span>}
    </button>
  );

  const AddBtn = ({ loading: l, done, onClick, small, label }: {
    loading: boolean; done: boolean; onClick: () => void; small?: boolean; label?: string;
  }) => (
    <button
      className={small ? s.aiAddBtnSm : s.aiAddBtn}
      onClick={onClick}
      disabled={l || done}
    >
      {done
        ? <><Check size={12} /> Added</>
        : l
          ? <><Loader2 size={12} className={s.spin} /> Adding…</>
          : <><Plus size={12} /> {label || 'Add block'}</>}
    </button>
  );

  // Whether the current source tab has text ready to generate
  const hasSourceText =
    sourceTab === 'experiment' ||
    (sourceTab === 'text' && pastedText.trim().length > 0) ||
    ((sourceTab === 'file' || sourceTab === 'url') && extractedText.trim().length > 0);

  return (
    <div className={s.aiOverlay} onClick={onClose}>
      <div className={s.aiPanel} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={s.aiHeader}>
          <span className={s.aiHeaderIcon}><Sparkles size={16} /></span>
          <h3 className={s.aiHeaderTitle}>AI Assist — Generate Content</h3>
          <button className={s.iconBtn} onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <div className={s.aiBody}>
          {/* ── Left pane: config ── */}
          <div className={s.aiLeft}>

            {/* ── Source tabs ── */}
            <div className={s.aiSection}>
              <p className={s.aiLabel}>Source</p>

              {/* Tab strip */}
              <div className={s.aiSourceTabs}>
                {([
                  { key: 'text',       label: 'Paste text' },
                  { key: 'file',       label: 'Upload file' },
                  { key: 'url',        label: 'From URL' },
                  { key: 'experiment', label: 'Experiment' },
                ] as { key: SourceTab; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    className={`${s.aiSourceTab} ${sourceTab === key ? s.aiSourceTabActive : ''}`}
                    onClick={() => {
                      setSourceTab(key);
                      setExtractError('');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Paste text ── */}
              {sourceTab === 'text' && (
                <textarea
                  className={s.aiTextarea}
                  rows={9}
                  placeholder={"Paste any text here — notes, PDF content, textbook extract…\nThe AI will use this to generate learning material."}
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                />
              )}

              {/* ── Tab: Upload file ── */}
              {sourceTab === 'file' && (
                <div className={s.aiFileZone}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.md,.txt"
                    style={{ display: 'none' }}
                    onChange={onFileChange}
                  />
                  <button
                    className={s.aiFilePickBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    {selectedFile ? selectedFile.name : 'Choose PDF, Markdown, or TXT file'}
                  </button>
                  {selectedFile && !extractedText && (
                    <button
                      className={`${shared.primaryBtn} ${s.aiExtractBtn}`}
                      onClick={extractFromFile}
                      disabled={extracting}
                    >
                      {extracting
                        ? <><Loader2 size={13} className={s.spin} /> Extracting…</>
                        : 'Extract text'}
                    </button>
                  )}
                  {extractError && <p className={s.aiError}>{extractError}</p>}
                  {extractedText && extractInfo && (
                    <div className={s.aiExtractResult}>
                      <p className={s.aiExtractMeta}>
                        ✓ Extracted {extractInfo.chars.toLocaleString()} chars from {extractInfo.source}
                      </p>
                      <pre className={`${s.aiPre} ${s.aiExtractPreview}`}>
                        {extractedText.slice(0, 400)}{extractedText.length > 400 ? '\n…' : ''}
                      </pre>
                      <button
                        className={s.aiClearBtn}
                        onClick={() => { setExtractedText(''); setExtractInfo(null); setSelectedFile(null); }}
                      >
                        Clear &amp; pick another file
                      </button>
                    </div>
                  )}
                  {!selectedFile && (
                    <p className={s.aiHint}>Supports PDF, Markdown (.md), and plain text (.txt) — up to 10 MB.</p>
                  )}
                </div>
              )}

              {/* ── Tab: From URL ── */}
              {sourceTab === 'url' && (
                <div className={s.aiUrlZone}>
                  <div className={s.aiUrlRow}>
                    <span className={s.aiUrlIcon}><Link2 size={14} /></span>
                    <input
                      className={s.aiUrlInput}
                      type="url"
                      placeholder="https://docs.google.com/document/d/… or any public URL"
                      value={urlInput}
                      onChange={e => { setUrlInput(e.target.value); setExtractedText(''); setExtractInfo(null); setExtractError(''); }}
                    />
                  </div>
                  {urlInput.trim() && !extractedText && (
                    <button
                      className={`${shared.primaryBtn} ${s.aiExtractBtn}`}
                      onClick={extractFromUrl}
                      disabled={extracting}
                    >
                      {extracting
                        ? <><Loader2 size={13} className={s.spin} /> Fetching…</>
                        : 'Fetch text'}
                    </button>
                  )}
                  {extractError && <p className={s.aiError}>{extractError}</p>}
                  {extractedText && extractInfo && (
                    <div className={s.aiExtractResult}>
                      <p className={s.aiExtractMeta}>
                        ✓ Fetched {extractInfo.chars.toLocaleString()} chars — {extractInfo.source}
                      </p>
                      <pre className={`${s.aiPre} ${s.aiExtractPreview}`}>
                        {extractedText.slice(0, 400)}{extractedText.length > 400 ? '\n…' : ''}
                      </pre>
                      <button
                        className={s.aiClearBtn}
                        onClick={() => { setExtractedText(''); setExtractInfo(null); setUrlInput(''); }}
                      >
                        Clear &amp; try another URL
                      </button>
                    </div>
                  )}
                  {!urlInput.trim() && (
                    <p className={s.aiHint}>
                      Works with Google Docs shared links, GitHub raw files, arXiv HTML pages,
                      plain-text / Markdown URLs, and any HTTP page.
                    </p>
                  )}
                </div>
              )}

              {/* ── Tab: From experiment ── */}
              {sourceTab === 'experiment' && (
                <p className={s.aiHint}>
                  AI will read this experiment&apos;s aim, theory, and all existing text blocks
                  to generate relevant content.
                </p>
              )}
            </div>

            {/* ── What to generate ── */}
            <div className={s.aiSection}>
              <p className={s.aiLabel}>Generate</p>
              <div className={s.aiCheckGroup}>
                <label className={s.aiCheck}><input type="checkbox" checked={wantNotes} onChange={e => setWantNotes(e.target.checked)} /> Study notes (markdown)</label>
                <label className={s.aiCheck}><input type="checkbox" checked={wantCode}  onChange={e => setWantCode(e.target.checked)}  /> Code snippet</label>
                <label className={s.aiCheck}><input type="checkbox" checked={wantQuiz}  onChange={e => setWantQuiz(e.target.checked)}  /> Quiz questions (MCQ)</label>
                <label className={s.aiCheck}><input type="checkbox" checked={wantViva}  onChange={e => setWantViva(e.target.checked)}  /> Viva questions</label>
              </div>
            </div>

            {/* ── Options ── */}
            <div className={s.aiSection}>
              <p className={s.aiLabel}>Options</p>
              <div className={s.aiOptionsGrid}>
                {wantCode && (
                  <div className={s.aiField}>
                    <label className={s.aiFieldLabel}>Language</label>
                    <select className={s.aiSelect} value={language} onChange={e => setLanguage(e.target.value)}>
                      {['python', 'javascript', 'c', 'cpp', 'java', 'typescript', 'bash', 'sql'].map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {wantQuiz && (
                  <div className={s.aiField}>
                    <label className={s.aiFieldLabel}>Quiz Qs</label>
                    <input className={s.aiNumInput} type="number" min={1} max={10} value={countQuiz} onChange={e => setCountQuiz(Number(e.target.value))} />
                  </div>
                )}
                {wantViva && (
                  <div className={s.aiField}>
                    <label className={s.aiFieldLabel}>Viva Qs</label>
                    <input className={s.aiNumInput} type="number" min={1} max={10} value={countViva} onChange={e => setCountViva(Number(e.target.value))} />
                  </div>
                )}
              </div>
            </div>

            {error && <p className={s.aiError}>{error}</p>}

            <button
              className={shared.primaryBtn}
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={generate}
              disabled={loading || !hasSourceText}
              title={!hasSourceText ? 'Provide a source first' : undefined}
            >
              {loading
                ? <><Loader2 size={14} className={s.spin} /> Generating…</>
                : <><Sparkles size={14} /> Generate</>}
            </button>

            {result?._meta && (
              <p className={s.aiMeta}>
                Model: {result._meta.model}{result._meta.is_fallback ? ' (fallback)' : ''}
              </p>
            )}
          </div>

          {/* ── Right pane: results ── */}
          <div className={s.aiRight}>
            {!result && !loading && (
              <div className={s.aiEmpty}>
                <Sparkles size={28} className={s.aiEmptyIcon} />
                <p>Configure options and click <strong>Generate</strong>.</p>
                <p style={{ fontSize: 12 }}>Generated content will appear here for review before you add it as blocks.</p>
              </div>
            )}

            {loading && (
              <div className={s.aiEmpty}>
                <Loader2 size={28} className={`${s.aiEmptyIcon} ${s.spin}`} />
                <p>AI is generating content…</p>
              </div>
            )}

            {result && !loading && (
              <div className={s.aiResults}>

                {/* Notes */}
                {result.notes && (
                  <div className={s.aiResultSection}>
                    <SectionHeader id="notes" label="Study Notes" badge="markdown" />
                    {openSection === 'notes' && (
                      <div className={s.aiResultBody}>
                        <pre className={s.aiPre}>{result.notes.markdown}</pre>
                        <AddBtn
                          loading={addingKey === 'notes'}
                          done={!!added['notes']}
                          onClick={addNote}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Code snippets */}
                {result.code_snippets && result.code_snippets.length > 0 && (
                  <div className={s.aiResultSection}>
                    <SectionHeader id="code" label="Code Snippets" count={result.code_snippets.length} />
                    {openSection === 'code' && (
                      <div className={s.aiResultBody}>
                        {result.code_snippets.map((snippet, i) => (
                          <div key={i} className={s.aiResultItem}>
                            <div className={s.aiResultItemHead}>
                              <span className={s.aiResultItemTitle}>{snippet.title}</span>
                              <span className={s.aiLangTag}>{snippet.language}</span>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <AddBtn
                                  small
                                  loading={addingKey === `code-${i}`}
                                  done={!!added[`code-${i}`]}
                                  onClick={() => addCodeSnippet(i)}
                                  label="Add Code"
                                />
                                <AddBtn
                                  small
                                  loading={addingKey === `assign-${i}`}
                                  done={!!added[`assign-${i}`]}
                                  onClick={() => addAssignTask(i)}
                                  label="Add Graded Task"
                                />
                              </div>
                            </div>
                            {snippet.description && <p className={s.aiResultItemDesc}>{snippet.description}</p>}
                            <pre className={`${s.aiPre} ${s.aiPreCode}`}>{snippet.code}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Quiz questions */}
                {result.quiz_questions && result.quiz_questions.length > 0 && (
                  <div className={s.aiResultSection}>
                    <SectionHeader id="quiz" label="Quiz Questions" count={result.quiz_questions.length} badge="MCQ" />
                    {openSection === 'quiz' && (
                      <div className={s.aiResultBody}>
                        <AddBtn
                          loading={addingKey === 'quiz-all'}
                          done={!!added['quiz-all']}
                          onClick={addAllQuiz}
                        />
                        {result.quiz_questions.map((q, i) => (
                          <div key={i} className={s.aiResultItem}>
                            <div className={s.aiResultItemHead}>
                              <span className={s.aiResultItemTitle}>Q{i + 1}. {q.question}</span>
                              <AddBtn
                                small
                                loading={addingKey === `quiz-${i}`}
                                done={!!added[`quiz-${i}`] || !!added['quiz-all']}
                                onClick={() => addQuizQuestion(i)}
                              />
                            </div>
                            <ul className={s.aiOptList}>
                              {q.options.map((opt, oi) => (
                                <li key={oi} className={`${s.aiOpt} ${oi === q.correct_index ? s.aiOptCorrect : ''}`}>
                                  {oi === q.correct_index ? '✓ ' : ''}{opt}
                                </li>
                              ))}
                            </ul>
                            {q.explanation && <p className={s.aiExplanation}><strong>Explanation:</strong> {q.explanation}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Viva questions */}
                {result.viva_questions && result.viva_questions.length > 0 && (
                  <div className={s.aiResultSection}>
                    <SectionHeader id="viva" label="Viva Questions" count={result.viva_questions.length} badge="Q&A" />
                    {openSection === 'viva' && (
                      <div className={s.aiResultBody}>
                        <AddBtn
                          loading={addingKey === 'viva-all'}
                          done={!!added['viva-all']}
                          onClick={addAllViva}
                        />
                        {result.viva_questions.map((q, i) => (
                          <div key={i} className={s.aiResultItem}>
                            <div className={s.aiResultItemHead}>
                              <span className={s.aiResultItemTitle}>Q{i + 1}. {q.question}</span>
                              <AddBtn
                                small
                                loading={addingKey === `viva-${i}`}
                                done={!!added[`viva-${i}`] || !!added['viva-all']}
                                onClick={() => addVivaQuestion(i)}
                              />
                            </div>
                            <p className={s.aiAnswer}><strong>Expected:</strong> {q.expected_answer}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
