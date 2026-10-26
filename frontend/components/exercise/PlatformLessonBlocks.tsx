'use client';

import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/lib/markdown';
import type { PlatformContentBlock } from '@/types/platform-content';

const str = (value: unknown) => typeof value === 'string' ? value : '';
const safeUrl = (value: string) => {
  const url = value.trim();
  if (url.startsWith('/') && !url.startsWith('//') && !url.split('/').includes('..')) return url;
  return /^https?:\/\//i.test(url) ? url : '';
};

export default function PlatformLessonBlocks({ blocks }: { blocks: PlatformContentBlock[] }) {
  if (!blocks?.length) return null;
  return <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
    {blocks.map((block, index) => {
      const data = block.content_data || {};
      const title = block.title || `Lesson block ${index + 1}`;
      const html = str(data.html);
      const md = str(data.md);
      const cleanHtml = typeof window === 'undefined' ? '' : DOMPurify.sanitize(html);
      const cleanMarkdown = typeof window === 'undefined' ? '' : DOMPurify.sanitize(renderMarkdown(md));
      const url = safeUrl(str(data.url));
      return <section key={block.id || `${block.module_type}-${index}`} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 10px', color: '#1f2937', fontSize: 15, fontWeight: 750 }}>{title}</h3>
        {block.module_type === 'markdown' && <div style={{ lineHeight: 1.7, color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanMarkdown }} />}
        {block.module_type === 'text' && <div style={{ lineHeight: 1.7, color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanHtml }} />}
        {block.module_type === 'code' && <div>
          <span style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{str(data.language) || 'text'}</span>
          <pre style={{ margin: '7px 0 0', padding: 14, overflowX: 'auto', borderRadius: 9, background: '#0f172a', color: '#e2e8f0', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}><code>{str(data.code)}</code></pre>
        </div>}
        {block.module_type === 'html' && <iframe title={title} sandbox="allow-scripts" srcDoc={html} style={{ width: '100%', minHeight: 420, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }} />}
        {block.module_type === 'image' && (url ? <figure style={{ margin: 0 }}><img src={url} alt={str(data.alt)} style={{ display: 'block', maxWidth: '100%', maxHeight: 620, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }} />{data.caption ? <figcaption style={{ marginTop: 8, textAlign: 'center', color: '#64748b', fontSize: 12 }}>{str(data.caption)}</figcaption> : null}</figure> : <p>Image URL is unavailable.</p>)}
        {block.module_type === 'video' && (url ? <div><video controls src={url} style={{ width: '100%', maxHeight: 520, background: '#0f172a', borderRadius: 8 }} />{data.caption ? <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12 }}>{str(data.caption)}</p> : null}</div> : <p>Video URL is unavailable.</p>)}
        {block.module_type === 'pdf' && (url ? <iframe title={title} src={url} style={{ width: '100%', height: 620, border: '1px solid #e5e7eb', borderRadius: 8 }} /> : <p>PDF URL is unavailable.</p>)}
        {block.module_type === 'link' && (url ? <div><p style={{ margin: '0 0 9px', color: '#64748b', fontSize: 13 }}>{str(data.description)}</p><a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#5b21b6', fontWeight: 700 }}>{str(data.label) || url}</a></div> : <p>Link URL is unavailable.</p>)}
      </section>;
    })}
  </div>;
}
