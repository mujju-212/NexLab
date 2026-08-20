/**
 * lib/markdown.ts -- zero-dependency Markdown -> sanitized HTML.
 *
 * Supports the common subset instructors need for pre-lab content:
 *   headings (# .. ######), bold, italic, inline code, fenced code blocks,
 *   unordered / ordered lists, blockquotes, horizontal rules, links, and
 *   paragraphs with soft line breaks.
 *
 * Source is HTML-escaped first, then transformed, then run through DOMPurify,
 * so raw HTML in the source is shown literally and can never inject script.
 * No external markdown/highlight package is used (project constraint).
 */
import DOMPurify from 'dompurify';

const SENT = String.fromCharCode(0); // sentinel wrapping inline-code placeholders

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Inline spans: code, links, bold, italic. Input MUST already be HTML-escaped. */
function inline(text: string, codes: string[]): string {
  text = text.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push('<code>' + c + '</code>');
    return SENT + (codes.length - 1) + SENT;
  });
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  return text;
}

const restore = (text: string, codes: string[]) =>
  text.replace(new RegExp(SENT + '(\\d+)' + SENT, 'g'), (_m, i) => codes[Number(i)]);

/** Convert Markdown to a sanitized HTML string ready for dangerouslySetInnerHTML. */
export function renderMarkdown(md: string): string {
  const codes: string[] = [];
  const lines = escapeHtml(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const closeList = () => { if (listType) { out.push('</' + listType + '>'); listType = null; } };
  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + inline(para.join('<br/>'), codes) + '</p>');
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block ```lang
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara(); closeList();
      const lang = fence[1] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      out.push('<pre data-lang="' + lang + '"><code>' + buf.join('\n') + '</code></pre>');
      continue;
    }

    // horizontal rule
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      flushPara(); closeList(); out.push('<hr/>'); i++; continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const level = h[1].length;
      out.push('<h' + level + '>' + inline(h[2].trim(), codes) + '</h' + level + '>');
      i++; continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      flushPara(); closeList();
      out.push('<blockquote>' + inline(line.replace(/^>\s?/, ''), codes) + '</blockquote>');
      i++; continue;
    }

    // unordered list item
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, ''), codes) + '</li>');
      i++; continue;
    }

    // ordered list item
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push('<li>' + inline(line.replace(/^\s*\d+\.\s+/, ''), codes) + '</li>');
      i++; continue;
    }

    // blank line -> paragraph break
    if (/^\s*$/.test(line)) { flushPara(); closeList(); i++; continue; }

    // plain text -> accumulate into paragraph
    para.push(line);
    i++;
  }
  flushPara(); closeList();

  const html = restore(out.join('\n'), codes);
  if (typeof window === 'undefined') return html; // SSR: sanitized again on client
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'data-lang'] });
}
