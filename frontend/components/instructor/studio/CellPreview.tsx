'use client';

/**
 * CellPreview.tsx — read-only render of one block, mirroring how the student
 * pre-lab page (frontend/app/student/pre-lab/[experimentId]/page.tsx) shows it.
 * Used by the studio's Preview mode. Kept in lockstep with those render branches.
 */
import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/lib/markdown';
import { Download, ExternalLink } from 'lucide-react';
import { metaFor, asString, type ContentBlock } from './blocks';
import s from './studio.module.css';

export default function CellPreview({ block }: { block: ContentBlock }) {
  const meta = metaFor(block.module_type);
  const Icon = meta.icon;
  const d = block.content_data ?? {};

  return (
    <div className={s.pvCell}>
      <h4 className={s.pvTitle}><Icon size={15} color="#7c3aed" /> {block.title || meta.label}</h4>
      {renderBody(block.module_type, d)}
    </div>
  );
}

function renderBody(type: string, d: Record<string, unknown>) {
  switch (type) {
    case 'markdown':
      return <div className={s.preview} style={{ minHeight: 0, border: 'none', padding: 0 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(asString(d.md)) }} />;

    case 'text': {
      const html = asString(d.html);
      const clean = typeof window === 'undefined' ? html : DOMPurify.sanitize(html);
      return <div className={s.preview} style={{ minHeight: 0, border: 'none', padding: 0 }}
        dangerouslySetInnerHTML={{ __html: clean }} />;
    }

    case 'code':
      return (
        <>
          <pre className={s.runPre} style={{ borderRadius: 10 }}>{asString(d.code) || '(empty)'}</pre>
          <p className={s.qOpts} style={{ marginTop: 6 }}>
            {asString(d.language) || 'python'} · {d.runnable === false ? 'read-only' : 'students can run this'}
          </p>
        </>
      );

    case 'image': {
      const url = asString(d.url);
      if (!url) return <p className={s.qOpts}>No image URL set.</p>;
      return (
        <figure style={{ margin: 0 }}>
          <div className={s.mediaPreview} style={{ marginTop: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.mediaImg} src={url} alt={asString(d.alt)} />
          </div>
          {asString(d.caption) && <figcaption className={s.qOpts} style={{ textAlign: 'center', marginTop: 6 }}>{asString(d.caption)}</figcaption>}
        </figure>
      );
    }

    case 'video':
    case 'pdf': {
      const url = asString(d.url);
      if (!url) return <p className={s.qOpts}>No URL set.</p>;
      return <div className={s.mediaPreview} style={{ marginTop: 0 }}>
        <iframe className={s.embedFrame} src={url} title={type}
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="fullscreen" />
      </div>;
    }

    case 'html':
      return <div className={s.mediaPreview} style={{ marginTop: 0 }}>
        <iframe className={s.embedFrame} title="html-embed" srcDoc={asString(d.html)}
          sandbox="allow-scripts allow-popups allow-forms" />
      </div>;

    case 'link': {
      const url = asString(d.url);
      return (
        <div>
          <a className={s.pvLink} href={url || undefined} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> {asString(d.label) || url || 'Open link'}
          </a>
          {asString(d.description) && <p className={s.qOpts} style={{ marginTop: 8 }}>{asString(d.description)}</p>}
        </div>
      );
    }

    case 'file': {
      const url = asString(d.url);
      const name = asString(d.filename) || 'Download file';
      return (
        <a className={s.pvLink} href={url || undefined} target="_blank" rel="noreferrer">
          <Download size={14} /> {name} <span style={{ opacity: .6 }}>({asString(d.kind) || 'file'})</span>
        </a>
      );
    }

    case 'quiz':
      return (
        <p className={s.qOpts}>
          Auto-graded quiz · pass ≥ {typeof d.pass_threshold === 'number' ? d.pass_threshold : 70}% ·
          {' '}{typeof d.max_attempts === 'number' ? d.max_attempts : 3} attempts ·
          {' '}{d.shuffle === false ? 'fixed order' : 'shuffled'}. Questions are hidden in preview.
        </p>
      );

    case 'assign': {
      const tests = Array.isArray(d.test_cases) ? (d.test_cases as Array<{ hidden?: boolean }>) : [];
      const hidden = tests.filter(t => t?.hidden).length;
      const instr = asString(d.instructions);
      return (
        <>
          {instr
            ? <div className={s.preview} style={{ minHeight: 0, border: 'none', padding: 0 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(instr) }} />
            : <p className={s.qOpts}>No instructions yet.</p>}
          <p className={s.qOpts} style={{ marginTop: 8 }}>
            Graded coding task · {asString(d.language) || 'python'} · pass ≥{' '}
            {typeof d.pass_threshold === 'number' ? d.pass_threshold : 60}% ·{' '}
            {tests.length} test case{tests.length === 1 ? '' : 's'}
            {hidden > 0 ? ` (${hidden} hidden)` : ''}. Runs &amp; scores during the live session.
          </p>
        </>
      );
    }

    case 'viva': {
      const qCount = Array.isArray(d.questions) ? d.questions.length : 0;
      const pass = typeof d.pass_threshold === 'number' ? d.pass_threshold : 70;
      const mode = asString(d.mode);
      return (
        <div>
          <p className={s.qOpts} style={{ marginBottom: 8 }}>
            <b>AI Viva</b> · {qCount} question{qCount === 1 ? '' : 's'} · pass ≥ {pass}%
            &nbsp;|&nbsp; source: {mode === 'content' ? 'experiment content' : 'specified topics'}
          </p>
          <p className={s.qOpts} style={{ fontSize: 12.5 }}>
            Students answer each question in a text box. Answers are auto-evaluated against the
            expected answers stored in this block. Preview mode — begin from the live session.
          </p>
        </div>
      );
    }

    default:
      return <p className={s.qOpts}>Unsupported block type: {type}</p>;
  }
}