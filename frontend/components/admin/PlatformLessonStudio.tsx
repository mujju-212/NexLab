'use client';

import DOMPurify from 'dompurify';
import { ArrowDown, ArrowUp, Code2, FileCode2, FileText, Globe, Image as ImageIcon, Link2, Plus, Trash2, Video, FileCheck2 } from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';
import type { PlatformContentBlock, PlatformContentBlockType } from '@/types/platform-content';

type Props = {
  blocks: PlatformContentBlock[];
  onChange: (blocks: PlatformContentBlock[]) => void;
  languages: string[];
};

const blockOptions: { type: PlatformContentBlockType; label: string; icon: typeof FileText }[] = [
  { type: 'markdown', label: 'Markdown notes', icon: FileCode2 },
  { type: 'text', label: 'Rich text / HTML', icon: FileText },
  { type: 'code', label: 'Code example', icon: Code2 },
  { type: 'html', label: 'Interactive HTML', icon: Globe },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'pdf', label: 'PDF', icon: FileCheck2 },
  { type: 'link', label: 'Link', icon: Link2 },
];

const defaults: Record<PlatformContentBlockType, { title: string; data: Record<string, unknown> }> = {
  markdown: { title: 'Notes', data: { md: '' } },
  text: { title: 'Theory', data: { html: '' } },
  code: { title: 'Code example', data: { language: 'python', code: '' } },
  html: { title: 'Interactive HTML', data: { html: '' } },
  image: { title: 'Image', data: { url: '', alt: '', caption: '' } },
  video: { title: 'Video', data: { url: '', caption: '' } },
  pdf: { title: 'Reading', data: { url: '' } },
  link: { title: 'Reference', data: { url: '', label: '', description: '' } },
};

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #d7d3e0', borderRadius: 8, padding: '9px 10px',
  fontSize: 13, color: '#201b2e', background: '#fff', boxSizing: 'border-box',
};
const codeStyle: React.CSSProperties = { ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: 150, resize: 'vertical' };
const previewStyle: React.CSSProperties = {
  minHeight: 90, maxHeight: 360, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8,
  background: '#fff', padding: 12, color: '#334155', fontSize: 13,
};
const readString = (value: unknown) => typeof value === 'string' ? value : '';

export default function PlatformLessonStudio({ blocks, onChange, languages }: Props) {
  const updateBlock = (id: string, update: Partial<PlatformContentBlock>) => {
    onChange(blocks.map(block => block.id === id ? { ...block, ...update } : block));
  };
  const updateData = (block: PlatformContentBlock, patch: Record<string, unknown>) => {
    updateBlock(block.id, { content_data: { ...block.content_data, ...patch } });
  };
  const addBlock = (type: PlatformContentBlockType) => {
    const fallbackId = `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallbackId;
    onChange([...blocks, { id, module_type: type, title: defaults[type].title, content_data: { ...defaults[type].data } }]);
  };
  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section style={{ marginTop: 18, border: '1px solid #e5e2eb', borderRadius: 14, padding: 16, background: '#faf9fc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, color: '#201b2e', fontSize: 15, fontWeight: 800 }}>Lesson content studio</h3>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 12 }}>Add and arrange real lesson blocks. HTML previews run in a sandboxed frame.</p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#ede9fe', borderRadius: 999, padding: '5px 9px' }}>{blocks.length} block{blocks.length === 1 ? '' : 's'}</span>
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '13px 0 15px' }}>
        {blockOptions.map(option => {
          const Icon = option.icon;
          return <button key={option.type} type="button" onClick={() => addBlock(option.type)} disabled={blocks.length >= 40}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #ddd6fe', borderRadius: 8, background: '#fff', color: '#5b21b6', padding: '7px 9px', fontSize: 11.5, fontWeight: 700, cursor: blocks.length >= 40 ? 'not-allowed' : 'pointer', opacity: blocks.length >= 40 ? .5 : 1 }}>
            <Plus size={12} /><Icon size={13} /> {option.label}
          </button>;
        })}
      </div>

      {blocks.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12.5 }}>No lesson blocks yet. Add notes, code examples, media, or an interactive HTML simulation above.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {blocks.map((block, index) => {
            const meta = blockOptions.find(option => option.type === block.module_type);
            const Icon = meta?.icon || FileText;
            const data = block.content_data || {};
            const html = readString(data.html);
            const md = readString(data.md);
            const code = readString(data.code);
            const cleanHtml = typeof window === 'undefined' ? html : DOMPurify.sanitize(html);
            const renderedMarkdown = typeof window === 'undefined' ? '' : DOMPurify.sanitize(renderMarkdown(md));
            return (
              <article key={block.id} style={{ border: '1px solid #e5e2eb', borderRadius: 11, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <Icon size={15} color="#7c3aed" />
                  <input aria-label={`${meta?.label || 'Lesson'} block title`} style={{ ...inputStyle, maxWidth: 360, fontWeight: 700 }} value={block.title} onChange={event => updateBlock(block.id, { title: event.target.value })} />
                  <span style={{ color: '#94a3b8', fontSize: 11, flex: 1 }}>{meta?.label || block.module_type}</span>
                  <button type="button" title="Move block up" aria-label="Move block up" disabled={index === 0} onClick={() => moveBlock(index, -1)} style={{ border: 0, background: 'transparent', color: '#64748b', cursor: index === 0 ? 'not-allowed' : 'pointer' }}><ArrowUp size={14} /></button>
                  <button type="button" title="Move block down" aria-label="Move block down" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} style={{ border: 0, background: 'transparent', color: '#64748b', cursor: index === blocks.length - 1 ? 'not-allowed' : 'pointer' }}><ArrowDown size={14} /></button>
                  <button type="button" title="Remove block" aria-label="Remove lesson block" onClick={() => onChange(blocks.filter(item => item.id !== block.id))} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}><Trash2 size={14} /></button>
                </div>

                {block.module_type === 'markdown' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Markdown<textarea aria-label="Markdown content" style={{ ...codeStyle, fontFamily: 'inherit' }} value={md} placeholder="# Topic\n\nExplain the concept…" onChange={e => updateData(block, { md: e.target.value })} /></label>
                  <div><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Live preview</span><div style={previewStyle} dangerouslySetInnerHTML={{ __html: renderedMarkdown }} /></div>
                </div>}

                {block.module_type === 'text' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Rich text HTML<textarea aria-label="Rich text HTML" style={{ ...codeStyle, fontFamily: 'inherit' }} value={html} placeholder="<h2>Concept</h2><p>Write lesson text…</p>" onChange={e => updateData(block, { html: e.target.value })} /></label>
                  <div><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Sanitized preview</span><div style={previewStyle} dangerouslySetInnerHTML={{ __html: cleanHtml }} /></div>
                </div>}

                {block.module_type === 'code' && <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Language<select aria-label="Code example language" style={{ ...inputStyle, width: 190, display: 'block', marginTop: 4 }} value={readString(data.language) || 'python'} onChange={e => updateData(block, { language: e.target.value })}>{Array.from(new Set(['python', 'javascript', 'c', 'cpp', 'java', ...languages])).map(language => <option key={language}>{language}</option>)}</select></label>
                  <textarea aria-label="Code example source" style={codeStyle} spellCheck={false} value={code} placeholder="# Add the example code" onChange={e => updateData(block, { code: e.target.value })} />
                  <pre style={{ ...previewStyle, background: '#0f172a', color: '#e2e8f0', fontFamily: 'ui-monospace,monospace', whiteSpace: 'pre-wrap' }}>{code || '# Code preview'}</pre>
                </div>}

                {block.module_type === 'html' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Interactive HTML source<textarea aria-label="Interactive HTML source" style={codeStyle} spellCheck={false} value={html} placeholder="<!doctype html>…" onChange={e => updateData(block, { html: e.target.value })} /></label>
                  <div><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Sandboxed preview</span>{html ? <iframe title={`${block.title} preview`} sandbox="allow-scripts" srcDoc={html} style={{ ...previewStyle, width: '100%', height: 280, padding: 0, boxSizing: 'border-box' }} /> : <div style={previewStyle}>HTML preview will appear here.</div>}</div>
                </div>}

                {['image', 'video', 'pdf', 'link'].includes(block.module_type) && <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>URL<input aria-label={`${meta?.label || 'Media'} URL`} style={inputStyle} value={readString(data.url)} placeholder="https://… or /simulations/…" onChange={e => updateData(block, { url: e.target.value })} /></label>
                  {block.module_type === 'image' && <><input aria-label="Image alt text" style={inputStyle} value={readString(data.alt)} placeholder="Alt text" onChange={e => updateData(block, { alt: e.target.value })} /><input aria-label="Image caption" style={inputStyle} value={readString(data.caption)} placeholder="Caption (optional)" onChange={e => updateData(block, { caption: e.target.value })} />{data.url ? <img src={readString(data.url)} alt={readString(data.alt)} style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8 }} /> : null}</>}
                  {block.module_type === 'video' && <>{data.url ? <video controls src={readString(data.url)} style={{ maxWidth: '100%', maxHeight: 280 }} /> : null}<input aria-label="Video caption" style={inputStyle} value={readString(data.caption)} placeholder="Caption (optional)" onChange={e => updateData(block, { caption: e.target.value })} /></>}
                  {block.module_type === 'pdf' && data.url ? <iframe title={`${block.title} PDF preview`} src={readString(data.url)} style={{ width: '100%', height: 260, border: '1px solid #e5e7eb', borderRadius: 8 }} /> : null}
                  {block.module_type === 'link' && <><input aria-label="Link label" style={inputStyle} value={readString(data.label)} placeholder="Link label" onChange={e => updateData(block, { label: e.target.value })} /><input aria-label="Link description" style={inputStyle} value={readString(data.description)} placeholder="Description (optional)" onChange={e => updateData(block, { description: e.target.value })} />{data.url ? <a href={readString(data.url)} target="_blank" rel="noreferrer" style={{ color: '#5b21b6', fontWeight: 700, fontSize: 12 }}>{readString(data.label) || readString(data.url)}</a> : null}</>}
                </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
