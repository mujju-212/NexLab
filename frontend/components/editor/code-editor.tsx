'use client';

/**
 * Zero-dependency code editor: a transparent <textarea> layered over a
 * highlighted <pre> backdrop, with a scroll-synced line-number gutter.
 *
 * All programmatic edits go through document.execCommand('insertText'), which
 * keeps the browser's native undo stack intact — the thing hand-rolled editors
 * usually break. A manual fallback covers engines that refuse the command.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { highlight, resolveMode } from './highlight';
import styles from './code-editor.module.css';

const PAIRS: Record<string, string> = {
  '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`',
};
const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);
/** A line ending in one of these opens a block, so the next line indents. */
const OPENS_BLOCK = /[([{:]\s*$/;

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** `editor_mode` from the language catalog. */
  mode: string;
  /** `line_comment` from the language catalog, used by Ctrl+/. */
  lineComment?: string;
  /** Ctrl/Cmd+Enter. */
  onRun?: () => void;
  tabSize?: number;
  readOnly?: boolean;
  ariaLabel?: string;
}

export function CodeEditor({
  value,
  onChange,
  mode,
  lineComment = '//',
  onRun,
  tabSize = 4,
  readOnly = false,
  ariaLabel = 'Code editor',
}: CodeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);

  const INDENT = ' '.repeat(tabSize);
  const html = useMemo(() => highlight(value, resolveMode(mode)), [value, mode]);
  const lineCount = useMemo(() => value.split('\n').length, [value]);
  // One text node beats N spans: the gutter re-renders on every keystroke.
  const gutter = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'),
    [lineCount],
  );

  // ── Scroll sync ────────────────────────────────────────────────────────────
  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }, []);

  // Re-sync after a value change too: switching language resets scrollTop to 0
  // on the textarea, and the backdrop must follow or the layers drift apart.
  useLayoutEffect(syncScroll, [value, syncScroll]);

  /**
   * Replace [start, end) with `text` and leave the caret at [selStart, selEnd].
   * Prefers execCommand so Ctrl+Z keeps working.
   */
  const replaceRange = useCallback((
    start: number, end: number, text: string, selStart: number, selEnd = selStart,
  ) => {
    const ta = taRef.current;
    if (!ta) return;

    ta.focus();
    ta.setSelectionRange(start, end);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }

    if (inserted) {
      ta.setSelectionRange(selStart, selEnd);
      return;
    }

    // Fallback: drive React state directly and restore the caret next frame.
    const next = ta.value.slice(0, start) + text + ta.value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) el.setSelectionRange(selStart, selEnd);
    });
  }, [onChange]);

  // ── Key handling ───────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const text = ta.value;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const mod = e.ctrlKey || e.metaKey;

    // Run
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }

    if (readOnly) return;

    const lineStartOf = (pos: number) => text.lastIndexOf('\n', pos - 1) + 1;
    const lineEndOf = (pos: number) => {
      const at = text.indexOf('\n', pos);
      return at === -1 ? text.length : at;
    };

    // Ctrl+/ — toggle line comments across every touched line
    if (mod && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault();
      const from = lineStartOf(selStart);
      const to = lineEndOf(selEnd);
      const lines = text.slice(from, to).split('\n');
      const filled = lines.filter((l) => l.trim().length > 0);
      if (filled.length === 0) return;

      const marker = lineComment;
      const allCommented = filled.every((l) => l.trimStart().startsWith(marker));

      let next: string[];
      if (allCommented) {
        const strip = new RegExp(`^(\\s*)${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ?`);
        next = lines.map((l) => (l.trim() ? l.replace(strip, '$1') : l));
      } else {
        const pad = Math.min(...filled.map((l) => (/^\s*/.exec(l) ?? [''])[0].length));
        next = lines.map((l) => (l.trim() ? `${l.slice(0, pad)}${marker} ${l.slice(pad)}` : l));
      }
      const block = next.join('\n');
      replaceRange(from, to, block, from, from + block.length);
      return;
    }

    // Tab / Shift+Tab — block indent when the selection spans lines,
    // otherwise advance to the next tab stop.
    if (e.key === 'Tab') {
      e.preventDefault();
      const from = lineStartOf(selStart);
      const to = lineEndOf(selEnd);
      const spansLines = text.slice(selStart, selEnd).includes('\n');

      if (spansLines || e.shiftKey) {
        const lines = text.slice(from, to).split('\n');
        const next = e.shiftKey
          ? lines.map((l) => l.replace(new RegExp(`^(\\t| {1,${tabSize}})`), ''))
          : lines.map((l) => (l.trim() ? INDENT + l : l));
        const block = next.join('\n');
        if (block === text.slice(from, to)) return;
        replaceRange(from, to, block, from, from + block.length);
      } else {
        const column = selStart - from;
        const width = tabSize - (column % tabSize) || tabSize;
        replaceRange(selStart, selEnd, ' '.repeat(width), selStart + width);
      }
      return;
    }

    // Enter — carry the current indent, open a block, expand a brace pair
    if (e.key === 'Enter' && !e.shiftKey) {
      const from = lineStartOf(selStart);
      const linePrefix = text.slice(from, selStart);
      const indent = (/^[ \t]*/.exec(linePrefix) ?? [''])[0];
      const before = text[selStart - 1] ?? '';
      const after = text[selStart] ?? '';

      e.preventDefault();
      if (before && PAIRS[before] === after) {
        const body = `\n${indent}${INDENT}\n${indent}`;
        replaceRange(selStart, selEnd, body, selStart + 1 + indent.length + INDENT.length);
      } else {
        const body = `\n${indent}${OPENS_BLOCK.test(linePrefix) ? INDENT : ''}`;
        replaceRange(selStart, selEnd, body, selStart + body.length);
      }
      return;
    }

    // Backspace inside an empty pair removes both halves
    if (e.key === 'Backspace' && selStart === selEnd && selStart > 0) {
      const before = text[selStart - 1];
      if (PAIRS[before] && PAIRS[before] === text[selStart]) {
        e.preventDefault();
        replaceRange(selStart - 1, selStart + 1, '', selStart - 1);
      }
      return;
    }

    if (mod || e.altKey || e.key.length !== 1) return;

    const closer = PAIRS[e.key];

    // Wrap a selection in the pair the student just typed
    if (closer && selStart !== selEnd) {
      e.preventDefault();
      const inner = text.slice(selStart, selEnd);
      replaceRange(selStart, selEnd, `${e.key}${inner}${closer}`, selStart + 1, selEnd + 1);
      return;
    }

    // Auto-close, but only where a closer would not be in the way, and never
    // mid-word for quotes (so don't > don"t).
    if (closer) {
      const after = text[selStart] ?? '';
      const before = text[selStart - 1] ?? '';
      const isQuote = e.key === '"' || e.key === "'" || e.key === '`';
      const roomAfter = after === '' || /[\s)\]},;:]/.test(after);
      const midWord = isQuote && /[\w"'`\\]/.test(before);
      if (roomAfter && !midWord) {
        e.preventDefault();
        replaceRange(selStart, selEnd, e.key + closer, selStart + 1);
      }
      return;
    }

    // Typing the closer that is already sitting under the caret steps over it
    if (CLOSERS.has(e.key) && selStart === selEnd && text[selStart] === e.key) {
      e.preventDefault();
      ta.setSelectionRange(selStart + 1, selStart + 1);
    }
  }, [INDENT, lineComment, onRun, readOnly, replaceRange, tabSize]);

  return (
    <div className={styles.wrap}>
      <pre className={styles.gutter} ref={gutterRef} aria-hidden="true">{gutter}</pre>

      <div className={styles.surface}>
        {/*
          Safe by construction: highlight() HTML-escapes every character of
          `value` and only ever adds its own <span class="tok-*"> wrappers,
          so no user input can reach the DOM as markup.
        */}
        <pre className={styles.backdrop} ref={preRef} aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
        </pre>

        <textarea
          ref={taRef}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          aria-label={ariaLabel}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
        />
      </div>
    </div>
  );
}

export default CodeEditor;
