'use client';

/**
 * ContentStudio.tsx — the notebook-style authoring canvas that replaces the
 * old Content tab. Renders each ContentModule as an editable cell, with an
 * insert palette between cells and an inline student Preview.
 *
 * Wiring (all existing endpoints):
 *   load     → instructorService.listContent
 *   add      → addContentModule            (then listContent to get the new id)
 *   EDIT     → updateContentModule (PATCH)  ← debounced autosave, the new piece
 *   delete   → deleteContentModule
 *   reorder  → reorderContent
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Eye, PenLine, X, Edit2, Trash2, GripVertical, ChevronLeft, ChevronRight, Sparkles, Clock, Radio, CalendarClock } from 'lucide-react';
import type { CompilerLanguage } from '@/services/execution.service';
import { instructorService } from '@/services/instructor.service';
import {
  PALETTE, BLOCK_META, metaFor, type BlockType, type ContentBlock,
} from './blocks';
import StudioCell, { type SaveState } from './StudioCell';
import CellPreview from './CellPreview';
import AiAssistModal from './AiAssistModal';
import s from './studio.module.css';
import shared from '@/app/instructor/shared.module.css';

interface Props {
  experimentId: string;
  languages: CompilerLanguage[];
  onToast?: (msg: string) => void;
  onCount?: (n: number) => void;
}

type Patch = { title?: string; content_data?: Record<string, unknown>; page_id?: string | null };

interface ContentPage {
  id: string | null;   // null = synthetic "Default" page for legacy NULL-page_id modules
  title: string;
  display_order: number;
  modules: ContentBlock[];
  release_at?: string | null;   // UTC ISO datetime; null = no schedule
  is_live?: boolean;            // instant go-live toggle (overrides release_at)
}

interface ListContentResponse {
  pages: ContentPage[];
  flat: ContentBlock[];
  count: number;
}

export default function ContentStudio({ experimentId, languages, onToast, onCount }: Props) {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [paletteAt, setPaletteAt] = useState<{ pageId: string | null; index: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [pageRenameId, setPageRenameId] = useState<string | null>(null);
  const [pageRenameTitle, setPageRenameTitle] = useState('');

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // AI Assist panel
  const [aiAssist, setAiAssist] = useState(false);

  // Scheduling popover — which page tab has the scheduling panel open
  const [schedulePageId, setSchedulePageId] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, Patch>>({});
  // Stable ref so load() doesn't need activePageId in its dep array
  const activePageIdRef = useRef<string | null>(null);
  activePageIdRef.current = activePageId;

  const load = useCallback(async () => {
    try {
      const d = await instructorService.listContent(experimentId);
      const pageList = (d.pages ?? []) as ContentPage[];
      setPages(pageList);
      // Only reset active page when the current one no longer exists
      if (pageList.length > 0 && !pageList.find(p => p.id === activePageIdRef.current)) {
        setActivePageId(pageList[0].id);
      }
    } catch { setPages([]); }
    finally { setLoading(false); }
  }, [experimentId]); // ← removed activePageId — stable now

  useEffect(() => { load(); }, [load]);

  const activePage = pages.find(p => p.id === activePageId);
  const modules = activePage?.modules ?? [];
  const totalBlocks = pages.reduce((sum, p) => sum + p.modules.length, 0);

  // Report block count up to the page (drives the tab label).
  useEffect(() => { onCount?.(totalBlocks); }, [totalBlocks, onCount]);

  // Flush any pending edits when the studio unmounts (tab switch / navigate)
  // so the last <700ms of typing isn't lost.
  useEffect(() => {
    const t = timers.current, pend = pending.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      Object.entries(pend).forEach(([id, payload]) => {
        instructorService.updateContentModule(experimentId, id, payload).catch(() => {});
      });
    };
  }, [experimentId]);

  const setSave = (id: string, v: SaveState) => setSaveState(m => ({ ...m, [id]: v }));

  const flush = useCallback(async (id: string) => {
    const payload = pending.current[id];
    delete pending.current[id];
    if (!payload) return;
    try { await instructorService.updateContentModule(experimentId, id, payload); setSave(id, 'saved'); }
    catch { setSave(id, 'idle'); onToast?.('Save failed — it will retry on your next edit.'); }
  }, [experimentId, onToast]);

  const patch = useCallback((id: string, p: Patch) => {
    setPages(ps => ps.map(page => ({
      ...page,
      modules: page.modules.map(m => m.id === id ? { ...m, ...p } : m),
    })));
    pending.current[id] = { ...(pending.current[id] ?? {}), ...p };
    setSave(id, 'saving');
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => flush(id), 700);
  }, [flush]);

  const onChangeTitle = (id: string, title: string) => patch(id, { title });
  const onChangeData = (id: string, content_data: Record<string, unknown>) => patch(id, { content_data });

  // ── page CRUD ───────────────────────────────────────────────────────────────
  const addPage = async () => {
    const order = pages.length;
    const { page } = await instructorService.addPage(experimentId, { title: `Page ${order + 1}`, display_order: order });
    const newPage: ContentPage = {
      id: page.id, title: page.title, display_order: page.display_order,
      modules: [], release_at: page.release_at ?? null, is_live: page.is_live ?? false,
    };
    setPages(ps => [...ps, newPage]);
    setActivePageId(page.id);
  };

  /** Generalised page update — handles title, is_live, release_at in one patch. */
  const patchPage = async (
    pageId: string | null,
    updates: { title?: string; is_live?: boolean; release_at?: string | null },
  ) => {
    if (pageId == null) return;
    const { page } = await instructorService.updatePage(experimentId, pageId, updates);
    setPages(ps => ps.map(p => p.id === pageId ? { ...p, ...page } : p));
    if ('title' in updates) setPageRenameId(null);
  };

  const renamePage = (pageId: string | null, title: string) => patchPage(pageId, { title });

  const deletePage = async (pageId: string | null) => {
    if (pageId == null) return;
    if (pages.length === 1) { onToast?.('Cannot delete the only page.'); return; }
    const remaining = pages.filter(p => p.id !== pageId);
    setConfirm({
      message: 'Delete this page? Its blocks will move to the default page.',
      onConfirm: async () => {
        try {
          await instructorService.deletePage(experimentId, pageId);
          setPages(remaining);
          if (activePageId === pageId) setActivePageId(remaining[0]?.id ?? null);
        } catch { onToast?.('Failed to delete page.'); }
      },
    });
  };

  const reorderPages = async (newOrder: ContentPage[]) => {
    setPages(newOrder);
    await Promise.all(newOrder.map((p, i) =>
      p.id != null && instructorService.updatePage(experimentId, p.id, { display_order: i }).catch(() => {})
    ));
  };

  // ── module CRUD (page-aware) ────────────────────────────────────────────────
  const createAndPlace = async (
    type: string, title: string, content_data: Record<string, unknown>, targetPageId: string | null, targetPos: number,
  ) => {
    const { module: newMod } = await instructorService.addContentModule(experimentId, {
      module_type: type as BlockType, title, content_data, page_id: targetPageId,
    });
    // Optimistic: append into the right page without a full round-trip
    setPages(ps => ps.map(page =>
      page.id === targetPageId
        ? { ...page, modules: [...page.modules, newMod as ContentBlock] }
        : page
    ));
  };

  const addBlock = async (type: BlockType, pageId: string | null, pos: number) => {
    setPaletteAt(null);
    const meta = BLOCK_META[type];
    try { await createAndPlace(type, meta.defaultTitle, meta.defaultData(), pageId, pos); }
    catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      onToast?.(x?.response?.data?.error ?? `Could not add ${meta.label} — the backend may need a restart to allow this block type.`);
    }
  };

  const duplicate = async (block: ContentBlock, pageId: string | null) => {
    const page = pages.find(p => p.id === pageId);
    const idx = page?.modules.findIndex(m => m.id === block.id) ?? -1;
    try {
      await createAndPlace(block.module_type, `${block.title} (copy)`, { ...(block.content_data ?? {}) }, pageId, idx + 1);
      if (block.module_type === 'quiz') onToast?.('Quiz copied — its questions are not duplicated.');
    } catch { onToast?.('Failed to duplicate block.'); }
  };

  const remove = async (block: ContentBlock) => {
    const name = block.title || metaFor(block.module_type).label;
    setConfirm({
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await instructorService.deleteContentModule(experimentId, block.id);
          setPages(ps => ps.map(page => ({
            ...page,
            modules: page.modules.filter(m => m.id !== block.id),
          })));
        } catch { onToast?.('Failed to delete block.'); }
      },
    });
  };

  const move = async (pageId: string | null, index: number, dir: -1 | 1) => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    const j = index + dir;
    if (j < 0 || j >= page.modules.length) return;
    const next = [...page.modules];
    [next[index], next[j]] = [next[j], next[index]];
    setPages(ps => ps.map(p => p.id === pageId ? { ...p, modules: next } : p));
    try { await instructorService.reorderContent(experimentId, next.map(m => m.id)); }
    catch { onToast?.('Reorder failed.'); load(); }
  };

  const moveToPage = async (block: ContentBlock, fromPageId: string | null, toPageId: string | null, toIndex: number) => {
    // Move block across pages: PATCH page_id, then optimistically shift it in local state
    await instructorService.updateContentModule(experimentId, block.id, { page_id: toPageId });
    setPages(ps => {
      // Remove from source page
      const without = ps.map(page =>
        page.id === fromPageId
          ? { ...page, modules: page.modules.filter(m => m.id !== block.id) }
          : page
      );
      // Insert into target page at toIndex (or append)
      const moved = { ...block, page_id: toPageId };
      return without.map(page => {
        if (page.id !== toPageId) return page;
        const mods = [...page.modules];
        mods.splice(toIndex, 0, moved);
        return { ...page, modules: mods };
      });
    });
  };

  // ── insert bar + palette ─────────────────────────────────────────────────
  const PaletteGrid = ({ onPick }: { onPick: (t: BlockType) => void }) => (
    <>
      {PALETTE.map(group => (
        <div key={group.group} className={s.paletteGroup}>
          <p className={s.paletteGroupLabel}>{group.group}</p>
          <div className={s.paletteGrid}>
            {group.types.map(type => {
              const meta = BLOCK_META[type];
              const Icon = meta.icon;
              return (
                <button key={type} className={s.paletteBtn} onClick={() => onPick(type)}>
                  <span className={s.paletteIcon}><Icon size={16} /></span>
                  <span>
                    <p className={s.paletteName}>{meta.label}</p>
                    <p className={s.paletteHint}>{meta.hint}</p>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  const InsertBar = ({ pos }: { pos: number }) => {
    if (paletteAt && paletteAt.pageId === activePageId && paletteAt.index === pos) {
      return (
        <div className={s.palette}>
          <div className={shared.sectionHeader} style={{ marginBottom: 8 }}>
            <span className={shared.sectionTitle} style={{ fontSize: 13 }}>Insert a block</span>
            <button className={s.iconBtn} onClick={() => setPaletteAt(null)} title="Close"><X size={15} /></button>
          </div>
          <PaletteGrid onPick={type => addBlock(type, activePageId, pos)} />
        </div>
      );
    }
    return (
      <div className={s.insert}>
        <button className={s.insertLine} onClick={() => setPaletteAt({ pageId: activePageId, index: pos })}>
          <Plus size={13} /> Insert block
        </button>
      </div>
    );
  };

  if (loading) return <p className={shared.sectionSub}>Loading content…</p>;

  // Page tab bar — always visible in edit mode; lets the author add / rename /
  // reorder / delete pages and switch between them.
  const otherPages = pages.filter(p => p.id !== activePageId && p.id !== null) as (ContentPage & { id: string })[];

  /** Derive a human-readable schedule badge label for a page. */
  const schedBadge = (p: ContentPage): 'live' | 'scheduled' | 'hidden' | null => {
    if (p.id == null) return null;
    if (p.is_live) return 'live';
    if (p.release_at) return 'scheduled';
    return 'hidden';
  };

  const PageTabs = () => (
    <div className={s.pageTabs}>
      {pages.map((p, i) => {
        const badge = schedBadge(p);
        const isSchedOpen = schedulePageId === p.id;
        return (
          <div key={p.id ?? '__default__'} className={`${s.pageTab} ${p.id === activePageId ? s.pageTabActive : ''}`}>
            {pageRenameId === p.id ? (
              <input
                className={s.pageTabInput}
                value={pageRenameTitle} autoFocus
                onChange={e => setPageRenameTitle(e.target.value)}
                onBlur={() => renamePage(p.id, pageRenameTitle.trim() || p.title)}
                onKeyDown={e => { if (e.key === 'Enter') renamePage(p.id, pageRenameTitle.trim() || p.title); if (e.key === 'Escape') setPageRenameId(null); }}
              />
            ) : (
              <>
                <button className={s.pageTabBtn} onClick={() => setActivePageId(p.id)} title={p.title}>
                  {/* Schedule status dot */}
                  {badge && (
                    <span className={`${s.schedDot} ${badge === 'live' ? s.schedDotLive : badge === 'scheduled' ? s.schedDotSched : s.schedDotHidden}`} />
                  )}
                  {p.title} <span className={s.pageTabCount}>{p.modules.length}</span>
                </button>
                {p.id === activePageId && p.id !== null && (
                  <span className={s.pageTabTools}>
                    <button className={s.pageTabIcon} disabled={i === 0}
                      onClick={() => reorderPages(swap(pages, i, i - 1))} title="Move page left"><ChevronLeft size={13} /></button>
                    <button className={s.pageTabIcon} disabled={i === pages.length - 1}
                      onClick={() => reorderPages(swap(pages, i, i + 1))} title="Move page right"><ChevronRight size={13} /></button>
                    <button className={s.pageTabIcon} onClick={() => { setPageRenameId(p.id); setPageRenameTitle(p.title); }} title="Rename page"><Edit2 size={12} /></button>
                    {/* Scheduling chip */}
                    <div className={s.schedPopoverWrap}>
                      <button
                        className={`${s.pageTabIcon} ${isSchedOpen ? s.pageTabIconActive : ''}`}
                        onClick={() => setSchedulePageId(isSchedOpen ? null : (p.id as string))}
                        title="Schedule page release"
                      >
                        <CalendarClock size={12} />
                      </button>
                      {isSchedOpen && (
                        <div className={s.schedPopover} onClick={e => e.stopPropagation()}>
                          <div className={s.schedPopoverHeader}>
                            <span className={s.schedPopoverTitle}><Clock size={12} /> Release settings</span>
                            <button className={s.iconBtn} onClick={() => setSchedulePageId(null)} title="Close"><X size={13} /></button>
                          </div>

                          {/* Go-live toggle */}
                          <label className={s.schedToggleRow}>
                            <span className={s.schedToggleLabel}>
                              <Radio size={12} />
                              <span>Publish now</span>
                            </span>
                            <input
                              type="checkbox"
                              className={s.schedToggle}
                              checked={!!p.is_live}
                              onChange={e => {
                                const live = e.target.checked;
                                patchPage(p.id, { is_live: live, release_at: live ? null : p.release_at });
                              }}
                            />
                          </label>

                          {/* Scheduled datetime — only when not instant-live */}
                          {!p.is_live && (
                            <label className={s.schedDateRow}>
                              <span className={s.schedDateLabel}><CalendarClock size={12} /> Go live at</span>
                              <input
                                type="datetime-local"
                                className={s.schedDateInput}
                                value={p.release_at
                                  ? new Date(p.release_at).toISOString().slice(0, 16)
                                  : ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  patchPage(p.id, { release_at: val ? new Date(val).toISOString() : null });
                                }}
                              />
                            </label>
                          )}

                          {/* Status summary */}
                          <p className={s.schedStatus}>
                            {p.is_live
                              ? <><span className={s.badgeLive}>● Live</span> — visible to students now</>
                              : p.release_at
                                ? <><span className={s.badgeSched}>◷ Scheduled</span> — releases {new Date(p.release_at).toLocaleString()}</>
                                : <><span className={s.badgeHidden}>○ Hidden</span> — not visible to students</>
                            }
                          </p>
                        </div>
                      )}
                    </div>
                    <button className={`${s.pageTabIcon} ${s.iconBtnDanger}`} onClick={() => deletePage(p.id)} title="Delete page"><Trash2 size={12} /></button>
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
      <button className={s.pageAdd} onClick={addPage} title="Add page"><Plus size={14} /> Page</button>
    </div>
  );

  return (
    <div className={s.studio}>
      <div className={s.bar}>
        <h3 className={s.barTitle}>Content studio</h3>
        <p className={s.barHint}>{totalBlocks} block{totalBlocks === 1 ? '' : 's'} · {pages.length} page{pages.length === 1 ? '' : 's'} · edits autosave</p>
        <span className={s.barSpacer} />
        {!preview && (
          <button className={s.aiToolbarBtn} onClick={() => setAiAssist(true)}>
            <Sparkles size={13} /> AI Assist
          </button>
        )}
        <button className={preview ? shared.primaryBtn : shared.secondaryBtn} onClick={() => setPreview(p => !p)}>
          {preview ? <><PenLine size={13} /> Back to editing</> : <><Eye size={13} /> Preview as student</>}
        </button>
      </div>

      {preview ? (
        <div>
          <div className={s.pvNote}><Eye size={14} /> This is how students see the pre-lab content. Runnable code &amp; quizzes are interactive in their view.</div>
          {totalBlocks === 0
            ? <p className={shared.sectionSub}>Nothing to preview yet.</p>
            : pages.map(p => (
                <div key={p.id ?? '__default__'} className={s.pvPage}>
                  {pages.length > 1 && <h4 className={s.pvPageTitle}>{p.title}</h4>}
                  {p.modules.map(m => <CellPreview key={m.id} block={m} />)}
                </div>
              ))}
        </div>
      ) : (
        <>
          {pages.length > 0 && <PageTabs />}

          {totalBlocks === 0 && pages.length === 0 ? (
            <div className={s.palette}>
              <div className={s.empty}>
                <div className={s.emptyIcon}>📓</div>
                <p className={shared.sectionSub} style={{ marginTop: 0 }}>Build the experiment like a notebook. Pick the first block:</p>
              </div>
              <PaletteGrid onPick={type => addBlock(type, null, 0)} />
            </div>
          ) : modules.length === 0 ? (
            <div className={s.palette}>
              <div className={s.empty}>
                <div className={s.emptyIcon}>📄</div>
                <p className={shared.sectionSub} style={{ marginTop: 0 }}>This page is empty. Add a block:</p>
              </div>
              <PaletteGrid onPick={type => addBlock(type, activePageId, 0)} />
            </div>
          ) : (
            <>
              {modules.map((m, i) => (
                <Fragment key={m.id}>
                  <InsertBar pos={i} />
                  <StudioCell
                    block={m} index={i} total={modules.length}
                    save={saveState[m.id] ?? 'idle'} languages={languages}
                    experimentId={experimentId}
                    onChangeTitle={onChangeTitle} onChangeData={onChangeData}
                    onMove={(idx, dir) => move(activePageId, idx, dir)}
                    onDuplicate={b => duplicate(b, activePageId)} onDelete={remove}
                    canMoveToPage={otherPages.length > 0}
                    otherPages={otherPages.map(p => ({ id: p.id, title: p.title }))}
                    onMoveToPage={toPageId => moveToPage(m, activePageId, toPageId, 0)}
                  />
                </Fragment>
              ))}
              <InsertBar pos={modules.length} />
            </>
          )}
        </>
      )}

      {confirm && (
        <div className={s.confirmOverlay} onClick={() => setConfirm(null)}>
          <div className={s.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={s.confirmMsg}>{confirm.message}</p>
            <div className={s.confirmActions}>
              <button className={shared.secondaryBtn} onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={`${shared.primaryBtn} ${s.confirmDanger}`}
                onClick={() => { const fn = confirm.onConfirm; setConfirm(null); fn(); }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {aiAssist && (
        <AiAssistModal
          experimentId={experimentId}
          onClose={() => setAiAssist(false)}
          onBlocksAdded={load}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// Swap two items in an array, returning a new array (page reorder helper).
function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
