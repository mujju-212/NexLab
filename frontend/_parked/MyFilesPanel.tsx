'use client';

/**
 * MyFilesPanel — the student's cloud-saved program browser.
 *
 * Presentational only: the Compiler page owns fetching and mutations and passes
 * them down, so this stays testable and free of API coupling. Rows support
 * open (click), download, inline rename and a two-step delete confirm.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, Search, RefreshCw, X, Download, Pencil, Trash2, Check,
  FileCode2, Loader2, AlertTriangle,
} from 'lucide-react';
import type { PlaygroundSessionRow } from '@/services/practice-extra.service';
import styles from './MyFilesPanel.module.css';

export interface MyFilesPanelProps {
  files: PlaygroundSessionRow[];
  loading: boolean;
  error: string;
  currentFileId: string | null;
  /** id of the row with an in-flight action, so its spinner shows in place */
  busyId: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

/** "just now" / "12m ago" / "3h ago" / "yesterday" / "12 Mar" */
function relTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function MyFilesPanel({
  files, loading, error, currentFileId, busyId,
  onOpen, onRename, onDelete, onDownload, onRefresh, onClose,
}: MyFilesPanelProps) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) =>
      (f.title || '').toLowerCase().includes(q) ||
      (f.language || '').toLowerCase().includes(q),
    );
  }, [files, query]);

  const startRename = (f: PlaygroundSessionRow) => {
    setConfirmId(null);
    setRenamingId(f.id);
    setRenameVal(f.title || '');
  };

  const commitRename = (id: string) => {
    const title = renameVal.trim();
    setRenamingId(null);
    if (!title) return;
    const current = files.find((f) => f.id === id);
    if (current && current.title === title) return;
    onRename(id, title);
  };

  return (
    <section className={styles.card} aria-label="My saved files">
      {/* ── Header ── */}
      <div className={styles.head}>
        <span className={styles.title}><FolderOpen size={15} /> My Files</span>
        <span className={styles.meta}>
          {files.length === 0 ? 'nothing saved yet'
            : `${files.length} file${files.length === 1 ? '' : 's'} · saved to your account`}
        </span>
        <button className={styles.iconBtn} onClick={onClose} title="Close My Files" aria-label="Close My Files">
          <X size={15} />
        </button>
      </div>

      {/* ── Search + refresh ── */}
      <div className={styles.tools}>
        <div className={styles.searchWrap}>
          <Search size={14} />
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or language…"
            aria-label="Search saved files"
          />
        </div>
        <button className={styles.iconBtn} onClick={onRefresh} disabled={loading}
          title="Refresh list" aria-label="Refresh list">
          {loading ? <Loader2 size={14} className={styles.spin} /> : <RefreshCw size={14} />}
        </button>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <AlertTriangle size={14} /> <span>{error}</span>
        </div>
      )}

      {/* ── Body ── */}
      {loading && files.length === 0 ? (
        <div className={styles.loading}>
          <Loader2 size={17} className={styles.spin} /> Loading your files…
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <FileCode2 size={30} />
          {files.length === 0 ? (
            <>
              <span className={styles.emptyTitle}>No saved files yet</span>
              <p className={styles.emptyHint}>
                Write something in the editor, then hit <strong>Save</strong> to name it.
                It lands here — and from then on your edits auto-save.
              </p>
            </>
          ) : (
            <>
              <span className={styles.emptyTitle}>No matches</span>
              <p className={styles.emptyHint}>
                Nothing matches “{query}”. Try a different name or language.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className={styles.body}>
          {filtered.map((f) => {
            const active = f.id === currentFileId;
            const busy = busyId === f.id;
            const renaming = renamingId === f.id;
            const confirming = confirmId === f.id;
            return (
              <div
                key={f.id}
                className={`${styles.row} ${active ? styles.rowActive : ''}`}
                role="button"
                tabIndex={0}
                aria-current={active}
                title={active ? 'Currently open in the editor' : `Open ${f.title}`}
                onClick={() => { if (!renaming && !confirming) onOpen(f.id); }}
                onKeyDown={(e) => {
                  if (renaming || confirming) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(f.id); }
                }}
              >
                <span className={styles.glyph}><FileCode2 size={17} /></span>

                {renaming ? (
                  <span className={styles.renameRow} onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={renameRef}
                      className={styles.renameInput}
                      value={renameVal}
                      maxLength={200}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename(f.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      aria-label={`New name for ${f.title}`}
                    />
                    <button className={styles.iconBtn} title="Save name" aria-label="Save name"
                      onClick={(e) => { e.stopPropagation(); commitRename(f.id); }}
                      disabled={busy || !renameVal.trim()}>
                      {busy ? <Loader2 size={14} className={styles.spin} /> : <Check size={14} />}
                    </button>
                    <button className={styles.iconBtn} title="Cancel" aria-label="Cancel rename"
                      onClick={(e) => { e.stopPropagation(); setRenamingId(null); }}>
                      <X size={14} />
                    </button>
                  </span>
                ) : confirming ? (
                  <span className={styles.renameRow} onClick={(e) => e.stopPropagation()}>
                    <span className={styles.name} style={{ color: '#b91c1c', flex: '1 1 auto' }}>
                      Delete “{f.title}”?
                    </span>
                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Confirm delete"
                      aria-label="Confirm delete" disabled={busy}
                      onClick={(e) => { e.stopPropagation(); setConfirmId(null); onDelete(f.id); }}>
                      {busy ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />}
                    </button>
                    <button className={styles.iconBtn} title="Keep file" aria-label="Keep file"
                      onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}>
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className={styles.text}>
                      <span className={styles.name}>{f.title || 'Untitled'}</span>
                      <span className={styles.metaRow}>
                        <span className={styles.langPill}>{(f.language || '?').toUpperCase()}</span>
                        {f.is_shared && <span className={styles.sharedPill}>shared</span>}
                        {active && <span className={styles.meta}>· open</span>}
                        <span className={styles.meta}>{relTime(f.updated_at)}</span>
                      </span>
                    </span>

                    <span className={styles.actions} onClick={(e) => e.stopPropagation()}>
                      <button className={styles.iconBtn} title="Download this file"
                        aria-label={`Download ${f.title}`} disabled={busy}
                        onClick={() => onDownload(f.id)}>
                        <Download size={14} />
                      </button>
                      <button className={styles.iconBtn} title="Rename"
                        aria-label={`Rename ${f.title}`} disabled={busy}
                        onClick={() => startRename(f)}>
                        <Pencil size={14} />
                      </button>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete"
                        aria-label={`Delete ${f.title}`} disabled={busy}
                        onClick={() => { setRenamingId(null); setConfirmId(f.id); }}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
