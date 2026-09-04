'use client';

/**
 * StudioCell.tsx — one notebook cell: header (inline title, move, duplicate,
 * delete, collapse, save state) + a type-specific body editor. Fully controlled
 * by the parent ContentStudio; all mutations bubble up via callbacks.
 */
import { useEffect, useState } from 'react';
import {
  GripVertical, ChevronUp, ChevronDown, ChevronRight, Copy, Trash2, Loader2, Check,
  ArrowRightLeft,
} from 'lucide-react';
import type { CompilerLanguage } from '@/services/execution.service';
import { metaFor, type ContentBlock } from './blocks';
import {
  MarkdownEditor, TextEditor, CodeEditor, ImageEditor, VideoEditor, PdfEditor,
  HtmlEditor, LinkEditor, FileEditor, QuizEditor, AssignEditor, VivaEditor, type EditorProps,
} from './editors';
import s from './studio.module.css';

export type SaveState = 'idle' | 'saving' | 'saved';

interface OtherPage { id: string; title: string; }

interface Props {
  block: ContentBlock;
  index: number;
  total: number;
  save: SaveState;
  languages: CompilerLanguage[];
  onChangeTitle: (id: string, title: string) => void;
  onChangeData: (id: string, data: Record<string, unknown>) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onDuplicate: (block: ContentBlock) => void;
  onDelete: (block: ContentBlock) => void;
  // Cross-page move (optional; shown when >1 page exists)
  canMoveToPage?: boolean;
  otherPages?: OtherPage[];
  onMoveToPage?: (toPageId: string) => void;
  // Required for viva generation (POST /experiments/<exp_id>/viva/generate)
  experimentId: string;
}

function CellBody({ block, languages, onData, experimentId }: {
  block: ContentBlock; languages: CompilerLanguage[]; onData: (d: Record<string, unknown>) => void; experimentId: string;
}) {
  const common: EditorProps = { data: block.content_data ?? {}, onData, languages, moduleId: block.id, experimentId };
  switch (block.module_type) {
    case 'markdown': return <MarkdownEditor {...common} />;
    case 'text': return <TextEditor {...common} />;
    case 'code': return <CodeEditor {...common} />;
    case 'image': return <ImageEditor {...common} />;
    case 'video': return <VideoEditor {...common} />;
    case 'pdf': return <PdfEditor {...common} />;
    case 'html': return <HtmlEditor {...common} />;
    case 'link': return <LinkEditor {...common} />;
    case 'file': return <FileEditor {...common} />;
    case 'quiz': return <QuizEditor {...common} />;
    case 'assign': return <AssignEditor {...common} />;
    case 'viva': return <VivaEditor {...common} />;
    default: return <TextEditor {...common} />;
  }
}

export default function StudioCell(p: Props) {
  const { block, index, total, save, languages } = p;
  const meta = metaFor(block.module_type);
  const Icon = meta.icon;
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const hKey = `studio-h-${block.id}`;
  useEffect(() => {
    try { const v = localStorage.getItem(hKey); if (v) setHeight(Number(v)); } catch { /* ignore */ }
  }, [hKey]);
  const persistHeight = (el: HTMLDivElement) => {
    const h = el.clientHeight;
    if (h && h !== height) { setHeight(h); try { localStorage.setItem(hKey, String(h)); } catch { /* ignore */ } }
  };

  return (
    <div className={s.cell}>
      <div className={s.cellHead}>
        <span className={s.grip} title="Drag handle"><GripVertical size={15} /></span>
        <button className={s.iconBtn} onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <span className={s.cellIcon}><Icon size={15} /></span>
        <input
          className={s.titleInput} value={block.title}
          placeholder={meta.defaultTitle}
          onChange={e => p.onChangeTitle(block.id, e.target.value)}
        />
        <span className={s.typeTag}>{meta.label}</span>

        {save === 'saving' && <span className={s.saveDot}><Loader2 size={12} className={s.spin} /> Saving…</span>}
        {save === 'saved' && <span className={`${s.saveDot} ${s.saveDotOn}`}><Check size={12} /> Saved</span>}

        <div className={s.cellActions}>
          <button className={s.iconBtn} disabled={index === 0} onClick={() => p.onMove(index, -1)} title="Move up"><ChevronUp size={15} /></button>
          <button className={s.iconBtn} disabled={index === total - 1} onClick={() => p.onMove(index, +1)} title="Move down"><ChevronDown size={15} /></button>
          <button className={s.iconBtn} onClick={() => p.onDuplicate(block)} title="Duplicate"><Copy size={14} /></button>

          {p.canMoveToPage && p.otherPages && p.otherPages.length > 0 && p.onMoveToPage && (
            <div className={s.moveToPageWrap}>
              <select
                className={s.moveToPageSelect}
                defaultValue=""
                onChange={e => {
                  if (e.target.value) p.onMoveToPage!(e.target.value);
                  e.target.value = '';
                }}
                title="Move to another page"
              >
                <option value="" disabled>Move to page…</option>
                {p.otherPages.map(op => (
                  <option key={op.id} value={op.id}>{op.title}</option>
                ))}
              </select>
            </div>
          )}

          <button className={`${s.iconBtn} ${s.iconBtnDanger}`} onClick={() => p.onDelete(block)} title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>

      {!collapsed && (
        <div
          className={`${s.cellBody} ${s.cellBodyResizable}`}
          style={height ? { height } : undefined}
          onMouseUp={e => persistHeight(e.currentTarget)}
        >
          <CellBody block={block} languages={languages} onData={d => p.onChangeData(block.id, d)} experimentId={p.experimentId} />
        </div>
      )}
    </div>
  );
}
