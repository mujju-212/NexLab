'use client';

/**
 * Student Compiler Playground — modern 3-column SaaS IDE.
 * Connected to live Docker sandbox execution, multi-file cloud sessions,
 * step-through code visualization, and interactive AI coding assistant.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Play, Loader2, Copy, Check, Download, RotateCcw, Terminal, Sparkles,
  Lightbulb, Bug, ClipboardCheck, AlertTriangle, CheckCircle2, Clock,
  Cpu, Send, Info, Eraser, ChevronDown, Globe, Eye,
  FolderOpen, Save, FileCode2, Home, ChevronRight, Code2, Plus, Search,
  MoreVertical, MoreHorizontal, Maximize2, Minimize2, Trash2, BarChart3,
  Bot, X, ArrowRight, Layers, HelpCircle, Activity, Square, Gauge, ChevronLeft, Share2,
  Box, Keyboard, Zap,
} from 'lucide-react';
import IndividualShell from '@/components/layout/IndividualShell';
import CodeEditor from '@/components/editor/code-editor';
import CodeVisualizer from '@/components/student/CodeVisualizer';
import { executionService, type CompilerLanguage, type PlaygroundResult } from '@/services/execution.service';
import { practiceExtraService, type PlaygroundSessionRow } from '@/services/practice-extra.service';
import { aiService, type CodeAssistMode, type CodeAssistResponse } from '@/services/ai.service';
import styles from './playground.module.css';

const LANG_KEY = 'nexlab.compiler.lang';
const draftKey = (id: string) => `nexlab.compiler.draft.${id}`;
const stdinKey = (id: string) => `nexlab.compiler.stdin.${id}`;

function errMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { error?: string } | undefined)?.error;
    if (detail) return detail;
    if (e.code === 'ECONNABORTED') return 'Timed out waiting for the runner. Try again.';
    if (!e.response) return 'Cannot reach the server. Is the backend running?';
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function safeFileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'program';
  return base.toLowerCase().endsWith(ext.toLowerCase()) ? base : `${base}${ext}`;
}

function extOf(filename?: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(filename || '');
  return m ? m[0] : '';
}

function getLangIcon(langId: string): React.ReactNode {
  return <Code2 size={13} color="#6366f1" />;
}

function getLangBadgeColor(langId: string): { bg: string; color: string } {
  const colors: Record<string, { bg: string; color: string }> = {
    python: { bg: '#eff6ff', color: '#2563eb' },
    javascript: { bg: '#fefce8', color: '#ca8a04' },
    typescript: { bg: '#eff6ff', color: '#1d4ed8' },
    cpp: { bg: '#f1f5f9', color: '#475569' },
    c: { bg: '#f8fafc', color: '#334155' },
    java: { bg: '#fff7ed', color: '#ea580c' },
    kotlin: { bg: '#faf5ff', color: '#9333ea' },
    csharp: { bg: '#f0fdf4', color: '#16a34a' },
    html: { bg: '#fef2f2', color: '#dc2626' },
  };
  return colors[langId] ?? { bg: '#f5f3ff', color: '#7c3aed' };
}

export default function PlaygroundPage() {
  // ── Languages & Catalog ────────────────────────────────────────────────
  const [languages, setLanguages] = useState<CompilerLanguage[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [langId, setLangId] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // ── Buffer & Stdin ─────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [stdin, setStdin] = useState('');

  // ── Execution Result ───────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [runError, setRunError] = useState('');
  const [typedLines, setTypedLines] = useState<string[]>([]);
  const [typingDone, setTypingDone] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'compiling' | 'running' | 'done' | 'failed'>('idle');
  const typeTimerRef = useRef<number | null>(null);
  const termBodyRef = useRef<HTMLDivElement | null>(null);

  // ── Live Browser Preview (HTML/CSS) ────────────────────────────────────
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  // ── My Files (Cloud Persistence) ───────────────────────────────────────
  const [files, setFiles] = useState<PlaygroundSessionRow[]>([]);
  const [filesSearch, setFilesSearch] = useState('');
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [fileTitle, setFileTitle] = useState<string | null>('main.py');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newFilePrompt, setNewFilePrompt] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileMenuOpenId, setFileMenuOpenId] = useState<string | null>(null);

  // ── Left Files Panel: Resizing & Collapse ──────────────────────────────
  const [filesWidth, setFilesWidth] = useState<number>(250);
  const [filesCollapsed, setFilesCollapsed] = useState<boolean>(false);
  const [isDraggingFilesResizer, setIsDraggingFilesResizer] = useState<boolean>(false);
  const startFilesDragX = useRef<number>(0);
  const startFilesWidth = useRef<number>(250);

  const handleMouseDownFilesResizer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingFilesResizer(true);
    startFilesDragX.current = e.clientX;
    startFilesWidth.current = filesWidth;
  }, [filesWidth]);

  useEffect(() => {
    if (!isDraggingFilesResizer) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startFilesDragX.current;
      const nextWidth = Math.max(180, Math.min(480, startFilesWidth.current + delta));
      setFilesWidth(nextWidth);
    };
    const onMouseUp = () => {
      setIsDraggingFilesResizer(false);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingFilesResizer]);

  // ── Right Inspector Panel: Tabs & Features ─────────────────────────────
  const [activeRightTab, setActiveRightTab] = useState<'visualization' | 'input' | 'performance'>('visualization');
  const [vizOpen, setVizOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState<number>(390);
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(false);
  const [isDraggingResizer, setIsDraggingResizer] = useState<boolean>(false);
  const startDragX = useRef<number>(0);
  const startWidth = useRef<number>(390);

  const handleMouseDownResizer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingResizer(true);
    startDragX.current = e.clientX;
    startWidth.current = inspectorWidth;
  }, [inspectorWidth]);

  useEffect(() => {
    if (!isDraggingResizer) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = startDragX.current - e.clientX;
      const nextWidth = Math.max(280, Math.min(720, startWidth.current + delta));
      setInspectorWidth(nextWidth);
    };
    const onMouseUp = () => {
      setIsDraggingResizer(false);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingResizer]);

  // ── AI Assistant (Inline & Popup Drawer) ────────────────────────────────
  const [aiPopupOpen, setAiPopupOpen] = useState(false);
  const [assist, setAssist] = useState<CodeAssistResponse | null>(null);
  const [assistBusy, setAssistBusy] = useState<CodeAssistMode | null>(null);
  const [assistError, setAssistError] = useState('');
  const [question, setQuestion] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; time: string }>>([
    {
      role: 'assistant',
      text: 'Hello! I am your NexLab coding assistant. Ask me to explain code, diagnose errors, or suggest optimizations.',
      time: 'Just now',
    },
  ]);

  // ── UI Helpers ─────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const suppressDirty = useRef(true);

  const lang = useMemo(
    () => languages.find((l) => l.id === langId) ?? null,
    [languages, langId],
  );
  const isBrowserLang = lang?.engine === 'browser';

  const codeRef = useRef(code);
  codeRef.current = code;
  const stdinRef = useRef(stdin);
  stdinRef.current = stdin;

  const flash = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), err ? 4000 : 2500);
  }, []);

  // ── Load Catalog & Initial File ────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    executionService.listLanguages()
      .then(({ languages: list, groups: order }) => {
        if (!alive) return;
        setLanguages(list);
        setGroups(order);
        const saved = readLocal(LANG_KEY);
        const initial = list.find((l) => l.id === saved) ?? list.find((l) => l.id === 'python') ?? list[0];
        if (!initial) return;
        setLangId(initial.id);
        setCode(readLocal(draftKey(initial.id)) ?? initial.starter);
        setStdin(readLocal(stdinKey(initial.id)) ?? '');
      })
      .catch((e) => {
        if (alive) setCatalogError(errMsg(e, 'Could not load languages.'));
      })
      .finally(() => {
        if (alive) setLoadingCatalog(false);
      });
    return () => { alive = false; };
  }, []);

  // ── Load Cloud Files ───────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    try {
      const r = await practiceExtraService.playgroundSessions();
      setFiles(r.sessions ?? []);
    } catch {
      /* ignore file loading error on mount */
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Persist Draft Locally ──────────────────────────────────────────────
  useEffect(() => {
    if (!langId) return;
    const t = window.setTimeout(() => {
      writeLocal(draftKey(langId), code);
      writeLocal(stdinKey(langId), stdin);
    }, 800);
    return () => window.clearTimeout(t);
  }, [code, stdin, langId]);

  // ── Live Browser Preview (HTML/CSS) ────────────────────────────────────
  useEffect(() => {
    if (!isBrowserLang) { setPreviewSrc(null); return; }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      if (langId === 'css') {
        setPreviewSrc(`<!DOCTYPE html><html><head><style>${code}</style></head><body><h1>NexLab Preview</h1><p>Sample styled text with dynamic CSS.</p><button>Action Button</button></body></html>`);
      } else {
        setPreviewSrc(code);
      }
    }, 300);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [code, isBrowserLang, langId]);

  // ── Switch Language ────────────────────────────────────────────────────
  const switchLanguage = useCallback((nextId: string) => {
    if (nextId === langId) return;
    if (langId) {
      writeLocal(draftKey(langId), codeRef.current);
      writeLocal(stdinKey(langId), stdinRef.current);
    }
    const next = languages.find((l) => l.id === nextId);
    if (!next) return;
    setLangId(next.id);
    writeLocal(LANG_KEY, next.id);
    setCode(readLocal(draftKey(next.id)) ?? next.starter);
    setStdin(readLocal(stdinKey(next.id)) ?? '');
    setResult(null);
    setRunError('');
    setAssist(null);
  }, [langId, languages]);

  // ── Diagnostics string for AI ──────────────────────────────────────────
  const diagnostics = useMemo(() => {
    if (!result) return '';
    return [result.compile_output, result.stderr, result.message]
      .filter((s) => s && s.trim())
      .join('\n')
      .trim();
  }, [result]);

  // ── Algorithmic Optimization & Performance Analysis ────────────────────
  const optimizationData = useMemo(() => {
    if (!code) return null;
    const lines = code.split('\n');
    let loopCount = 0;
    let nestedLoops = false;
    const indentStack: number[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
      const isLoop = /^(for\b|while\b)/.test(trimmed);
      const indent = line.search(/\S/);

      if (isLoop) {
        loopCount++;
        if (indentStack.length > 0 && indent > indentStack[indentStack.length - 1]) {
          nestedLoops = true;
        }
        indentStack.push(indent);
      } else {
        while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
          indentStack.pop();
        }
      }
    });

    const hasRecursion = /def\s+(\w+)/.test(code) && Boolean(code.match(/def\s+(\w+)[\s\S]*?\b\1\s*\(/));

    let estimatedTime = 'O(1) Constant';
    if (nestedLoops) estimatedTime = 'O(n²) Quadratic';
    else if (loopCount > 0) estimatedTime = 'O(n) Linear';
    else if (hasRecursion) estimatedTime = 'O(log n) / O(2ⁿ) Recursive';

    const estimatedSpace = hasRecursion ? 'O(n) Stack Frames' : 'O(1) Auxiliary';

    const timeMs = result?.time_ms ?? null;
    const memKb = result?.memory_kb ?? null;

    let status: 'optimized' | 'moderate' | 'suboptimal' = 'optimized';
    let verdictTitle = 'Highly Optimized';
    let verdictDesc = 'No redundant overhead detected. Clean algorithmic execution with constant space overhead.';

    if (nestedLoops) {
      status = 'moderate';
      verdictTitle = 'Moderate Complexity — Nested Loop';
      verdictDesc = 'Nested loop detected. If processing larger inputs, consider hash mapping or direct indexing to achieve O(n).';
    } else if (timeMs && timeMs > 1500) {
      status = 'suboptimal';
      verdictTitle = 'High Execution Latency';
      verdictDesc = 'Execution time is near the 2.0s sandbox limit. Check loop bounds or potential redundant calculations.';
    } else if (memKb && memKb > 100 * 1024) {
      status = 'moderate';
      verdictTitle = 'Higher Memory Footprint';
      verdictDesc = 'Memory allocation is over 100 MB. Ensure unused structures are dereferenced.';
    }

    return {
      estimatedTime,
      estimatedSpace,
      hasRecursion,
      nestedLoops,
      loopCount,
      status,
      verdictTitle,
      verdictDesc,
      timeMs,
      memKb,
    };
  }, [code, result]);

  // ── Typewriter Animation on Execution Result ───────────────────────────
  useEffect(() => {
    if (!result) {
      setTypedLines([]);
      setTypingDone(false);
      setPhase('idle');
      return;
    }
    const allLines: string[] = [];
    if (result.compile_output?.trim()) {
      allLines.push(...result.compile_output.trimEnd().split('\n').map(l => `\x01${l}`));
    }
    if (result.stdout?.trim()) {
      allLines.push(...result.stdout.trimEnd().split('\n'));
    }
    if (result.stderr?.trim()) {
      allLines.push(...result.stderr.trimEnd().split('\n').map(l => `\x02${l}`));
    }
    if (result.message?.trim() && !result.stdout?.trim() && !result.stderr?.trim()) {
      allLines.push(`\x03${result.message.trim()}`);
    }
    if (allLines.length === 0) allLines.push('\x04');

    const safeLines = allLines.map(l => (typeof l === 'string' ? l.replace(/\r/g, '') : ''));
    setTypedLines([]);
    setTypingDone(false);
    setPhase(result.success ? 'done' : 'failed');

    let i = 0;
    function tick() {
      if (i >= safeLines.length) { setTypingDone(true); return; }
      setTypedLines(prev => [...prev, safeLines[i]]);
      i++;
      window.setTimeout(() => {
        if (termBodyRef.current) termBodyRef.current.scrollTop = termBodyRef.current.scrollHeight;
      }, 20);
      typeTimerRef.current = window.setTimeout(tick, i === 1 ? 50 : 20);
    }
    typeTimerRef.current = window.setTimeout(tick, 60);
    return () => { if (typeTimerRef.current) clearTimeout(typeTimerRef.current); };
  }, [result]);

  // ── Run Code ───────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    if (!lang || running) return;
    if (isBrowserLang) return;
    if (!code.trim()) {
      setRunError('Write some code before running.');
      setResult(null);
      return;
    }
    setRunning(true);
    setRunError('');
    try {
      const res = await executionService.runPlayground({
        code, language: lang.id, stdin: stdin || undefined,
      });
      setResult(res);
    } catch (e) {
      setResult(null);
      setRunError(errMsg(e, 'Execution failed.'));
    } finally {
      setRunning(false);
    }
  }, [code, isBrowserLang, lang, running, stdin]);

  // ── File Management ────────────────────────────────────────────────────
  const openFile = useCallback(async (id: string) => {
    try {
      const s = await practiceExtraService.getPlaygroundSession(id);
      const target = languages.find((l) => l.id === s.language);
      if (target) {
        writeLocal(draftKey(target.id), s.code ?? '');
        if (s.stdin_data != null) {
          writeLocal(stdinKey(target.id), s.stdin_data);
        }
        writeLocal(LANG_KEY, target.id);
        if (target.id !== langId) {
          setLangId(target.id);
        }
      }
      setCode(s.code ?? '');
      setStdin(s.stdin_data ?? '');
      setCurrentFileId(s.id);
      setFileTitle(s.title || 'Untitled');
      setDirty(false);
      flash(`Opened “${s.title || 'Untitled'}”`);
    } catch (e) {
      flash(errMsg(e, 'Could not open file.'), true);
    }
  }, [flash, langId, languages]);

  const shareFile = useCallback(async (fileId?: string) => {
    const targetId = fileId || currentFileId;
    if (!targetId) {
      if (!lang || !code.trim()) {
        flash('Write some code before sharing.', true);
        return;
      }
      try {
        setSaving(true);
        const title = fileTitle || 'main.py';
        const s = await practiceExtraService.savePlaygroundSession({
          title,
          language: lang.id,
          code,
          stdin_data: stdin || undefined,
        });
        setCurrentFileId(s.id);
        setFileTitle(s.title || title);
        setFiles((prev) => [s, ...prev.filter((f) => f.id !== s.id)]);
        const shareUrl = await practiceExtraService.sharePlaygroundSession(s.id, true);
        if (shareUrl) {
          const fullUrl = `${window.location.origin}${shareUrl}`;
          await navigator.clipboard.writeText(fullUrl);
          flash('Share link copied to clipboard!');
        }
      } catch (e) {
        flash(errMsg(e, 'Failed to share session.'), true);
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const shareUrl = await practiceExtraService.sharePlaygroundSession(targetId, true);
      if (shareUrl) {
        const fullUrl = `${window.location.origin}${shareUrl}`;
        await navigator.clipboard.writeText(fullUrl);
        flash('Share link copied to clipboard!');
      }
    } catch (e) {
      flash(errMsg(e, 'Failed to share session.'), true);
    }
  }, [code, currentFileId, fileTitle, flash, lang, stdin]);

  const saveFile = useCallback(async (opts?: { asNew?: boolean; name?: string }) => {
    if (!lang || !code.trim()) {
      flash('Editor is empty.', true);
      return;
    }
    setSaving(true);
    try {
      const title = opts?.name || fileTitle || 'main.py';
      const s = await practiceExtraService.savePlaygroundSession({
        id: opts?.asNew ? undefined : (currentFileId ?? undefined),
        title,
        language: lang.id,
        code,
        stdin_data: stdin || undefined,
      });
      setCurrentFileId(s.id);
      setFileTitle(s.title || title);
      setDirty(false);
      setFiles((prev) => [s, ...prev.filter((f) => f.id !== s.id)]);
      flash(`Saved “${s.title || title}”`);
    } catch (e) {
      flash(errMsg(e, 'Failed to save file.'), true);
    } finally {
      setSaving(false);
    }
  }, [code, currentFileId, fileTitle, flash, lang, stdin]);

  const handleCreateNewFile = async () => {
    if (!newFileName.trim()) return;
    const title = newFileName.trim();
    setNewFilePrompt(false);
    setNewFileName('');
    await saveFile({ asNew: true, name: title });
  };

  const deleteFile = useCallback(async (id: string) => {
    try {
      await practiceExtraService.deletePlaygroundSession(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (id === currentFileId) {
        setCurrentFileId(null);
        setFileTitle('main.py');
      }
      flash('File deleted');
    } catch (e) {
      flash(errMsg(e, 'Failed to delete file.'), true);
    }
  }, [currentFileId, flash]);

  const downloadCode = useCallback(() => {
    if (!lang) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileTitle ? safeFileName(fileTitle, extOf(lang.filename)) : lang.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, fileTitle, lang]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      flash('Code copied to clipboard!');
    } catch {
      flash('Clipboard access was blocked.', true);
    }
  }, [code, flash]);

  // ── Keyboard Shortcuts (Ctrl+Enter, Ctrl+S) ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, saveFile]);

  // ── AI Coding Assistant ────────────────────────────────────────────────
  const askAssist = useCallback(async (mode: CodeAssistMode, customQuestion?: string) => {
    if (!lang || assistBusy) return;
    setAssistBusy(mode);
    setAssistError('');
    const promptText = customQuestion || question;
    if (mode === 'ask' && promptText.trim()) {
      setAiMessages(prev => [
        ...prev,
        { role: 'user', text: promptText.trim(), time: 'Just now' },
      ]);
    }
    try {
      const res = await aiService.codeAssist({
        mode,
        code,
        language: lang.id,
        error: diagnostics || undefined,
        stdout: result?.stdout || undefined,
        question: mode === 'ask' ? promptText.trim() : undefined,
      });
      setAssist(res);
      setAiMessages(prev => [
        ...prev,
        { role: 'assistant', text: res.answer, time: 'Just now' },
      ]);
      if (mode === 'ask') setQuestion('');
    } catch (e) {
      setAssistError(errMsg(e, 'Assistant is currently unavailable.'));
    } finally {
      setAssistBusy(null);
    }
  }, [assistBusy, code, diagnostics, lang, question, result]);

  // Filtered files for search
  const filteredFiles = useMemo(() => {
    const q = filesSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f => (f.title || '').toLowerCase().includes(q) || (f.language || '').toLowerCase().includes(q));
  }, [files, filesSearch]);

  const totalBytes = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.code?.length || 0), code.length);
  }, [code.length, files]);

  return (
    <IndividualShell activePage="Playground">
      {/* ═══════════════════════════════════════════════════════════════════
          1. HEADER ROW WITH BREADCRUMB & INSPIRATIONAL QUOTE
          ═══════════════════════════════════════════════════════════════════ */}
      <div className={styles.heroRow}>
        <div className={styles.heroLeft}>
          <div className={styles.breadcrumbBar}>
            <Home size={14} className={styles.breadHome} />
            <ChevronRight size={12} className={styles.breadSep} />
            <span>Practice</span>
            <ChevronRight size={12} className={styles.breadSep} />
            <span className={styles.breadActive}>Playground</span>
          </div>
          <h1 className={styles.playgroundTitle}>Compiler Playground</h1>
          <p className={styles.playgroundSubtitle}>
            Write, run and debug your code in 18+ languages — nothing here is graded, so experiment freely.
          </p>
        </div>

        <div className={styles.quoteCard}>
          <div className={styles.quoteContent}>
            <p className={styles.quoteText}>&ldquo;Code. Experiment. Learn.<br />No Limits.&rdquo;</p>
          </div>
          <div className={styles.quoteIconBadge}>
            <Code2 size={24} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          2. TOP ACTION TOOLBAR
          ═══════════════════════════════════════════════════════════════════ */}
      <div className={styles.topToolbar}>
        <div className={styles.toolbarLeft}>
          {/* Language Selector */}
          <div className={styles.langSelectorWrap}>
            <div className={styles.langIconBox}>
              <span className={styles.langEmoji}>{getLangIcon(langId)}</span>
            </div>
            <select
              className={styles.langDropdown}
              value={langId}
              onChange={(e) => switchLanguage(e.target.value)}
              disabled={loadingCatalog || languages.length === 0}
            >
              {loadingCatalog && <option value="">Loading languages…</option>}
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {languages.filter(l => l.group === g).map(l => (
                    <option key={l.id} value={l.id}>{l.label} — {l.version}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={14} className={styles.chevronIcon} />
          </div>

          {/* Primary Run Button */}
          <button
            id="runCodeBtn"
            className={styles.primaryRunBtn}
            onClick={isBrowserLang ? () => {
              setPreviewSrc(langId === 'css'
                ? `<!DOCTYPE html><html><head><style>${code}</style></head><body><h1>NexLab Preview</h1><p>Sample styled text with dynamic CSS.</p><button>Action Button</button></body></html>`
                : code);
            } : run}
            disabled={running || !lang}
          >
            {running ? (
              <Loader2 size={15} className={styles.spin} />
            ) : isBrowserLang ? (
              <Globe size={15} />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            <span>{running ? 'Running…' : isBrowserLang ? 'Live Preview' : 'Run'}</span>
            {!isBrowserLang && <span className={styles.ctrlKbd}>Ctrl ↵</span>}
          </button>

          {/* Visualize Button */}
          <button
            className={`${styles.secondaryToolBtn} ${activeRightTab === 'visualization' ? styles.toolActive : ''}`}
            onClick={() => {
              setActiveRightTab('visualization');
              if (inspectorCollapsed) setInspectorCollapsed(false);
            }}
            title="Step-through execution visualizer"
          >
            <Eye size={15} />
            <span>Visualize</span>
          </button>

          {/* Stop Button */}
          <button
            className={styles.stopBtn}
            onClick={() => {
              setRunning(false);
              setResult(null);
            }}
            disabled={!running}
            title="Stop process"
          >
            <Square size={13} fill="currentColor" />
            <span>Stop</span>
          </button>
        </div>

        <div className={styles.toolbarRight}>
          <button
            className={styles.toolActionBtn}
            onClick={() => shareFile()}
            disabled={saving}
            title="Share session — copies read-only public link"
          >
            <Share2 size={14} />
            <span>Share</span>
          </button>

          <button
            className={styles.toolActionBtn}
            onClick={() => saveFile()}
            disabled={saving}
            title="Save to My Files (Ctrl+S)"
          >
            {saving ? <Loader2 size={14} className={styles.spin} /> : <Save size={14} />}
            <span>{saving ? 'Saving…' : 'Save'}</span>
            <ChevronDown size={12} />
          </button>

          <button
            className={styles.toolActionBtn}
            onClick={downloadCode}
            disabled={!lang}
            title="Download code"
          >
            <Download size={14} />
            <span>Download</span>
            <ChevronDown size={12} />
          </button>

          <button
            className={styles.moreOptionsBtn}
            onClick={() => setMoreMenuOpen(v => !v)}
            title="More actions"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          3. MAIN 3-COLUMN WORKSPACE
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className={styles.workspaceLayout}
        style={{
          gridTemplateColumns: [
            filesCollapsed ? '48px' : `${filesWidth}px`,
            !filesCollapsed ? '10px' : null,
            'minmax(0, 1fr)',
            !inspectorCollapsed ? '10px' : null,
            inspectorCollapsed ? '48px' : `${inspectorWidth}px`,
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >

        {/* ── LEFT COLUMN: COLLAPSED DOCK OR RESIZABLE MY FILES ── */}
        {filesCollapsed ? (
          <div
            className={styles.collapsedDock}
            onClick={() => setFilesCollapsed(false)}
            title="Click to expand My Files panel"
          >
            <button className={styles.dockExpandBtn} title="Expand My Files">
              <ChevronRight size={16} />
            </button>
            <div className={styles.dockLabel}>
              <span>MY FILES</span>
            </div>
            <div className={styles.dockIcons}>
              <FolderOpen size={16} />
              <FileCode2 size={16} />
            </div>
          </div>
        ) : (
          <aside className={styles.filesSidebar} style={{ width: filesWidth }}>
            <div className={styles.filesHeader}>
              <div className={styles.filesTitleGroup}>
                <FolderOpen size={16} color="#7c3aed" />
                <span>My Files</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className={styles.filesAddBtn}
                  onClick={() => setNewFilePrompt(true)}
                  title="Create new file"
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
                <button
                  className={styles.collapseToggleBtn}
                  onClick={() => setFilesCollapsed(true)}
                  title="Minimize My Files panel"
                >
                  <ChevronLeft size={15} />
                </button>
              </div>
            </div>

            {/* Inline Create File Prompt */}
            {newFilePrompt && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  type="text"
                  className={styles.fileSearchInput}
                  placeholder="filename.py"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateNewFile();
                    if (e.key === 'Escape') setNewFilePrompt(false);
                  }}
                />
                <button
                  onClick={handleCreateNewFile}
                  className={styles.filesAddBtn}
                  style={{ borderRadius: 8, padding: '0 8px' }}
                  title="Confirm"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setNewFilePrompt(false)}
                  className={styles.filesAddBtn}
                  style={{ background: '#e2e8f0', color: '#64748b', borderRadius: 8, padding: '0 8px' }}
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Search files */}
            <div className={styles.fileSearchWrap}>
              <Search size={14} className={styles.fileSearchIcon} />
              <input
                type="text"
                className={styles.fileSearchInput}
                placeholder="Search files..."
                value={filesSearch}
                onChange={e => setFilesSearch(e.target.value)}
              />
            </div>

            {/* Files List */}
            <div className={styles.filesList}>
              {/* Active Workspace Buffer Item if not yet saved */}
              <div
                className={`${styles.fileItemRow} ${!currentFileId ? styles.fileItemActive : ''}`}
                onClick={() => {
                  setCurrentFileId(null);
                  setFileTitle('main.py');
                }}
              >
                <div className={styles.fileItemLeft}>
                  <div className={styles.fileExtIcon} style={getLangBadgeColor(langId)}>
                    {getLangIcon(langId)}
                  </div>
                  <span className={styles.fileNameText}>{fileTitle || 'main.py'}</span>
                </div>
                <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>Active</span>
              </div>

              {/* Saved Files from Cloud */}
              {filteredFiles.map((file) => {
                const isActive = currentFileId === file.id;
                const badge = getLangBadgeColor(file.language || 'python');
                return (
                  <div
                    key={file.id}
                    className={`${styles.fileItemRow} ${isActive ? styles.fileItemActive : ''}`}
                    onClick={() => openFile(file.id)}
                  >
                    <div className={styles.fileItemLeft}>
                      <div className={styles.fileExtIcon} style={badge}>
                        {getLangIcon(file.language || 'python')}
                      </div>
                      <span className={styles.fileNameText}>{file.title || 'Untitled'}</span>
                    </div>

                    <button
                      className={styles.fileItemMenuBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFileMenuOpenId(fileMenuOpenId === file.id ? null : file.id);
                      }}
                      title="File actions"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {fileMenuOpenId === file.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 20,
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          zIndex: 20,
                          padding: '4px',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          style={{ display: 'block', width: '100%', padding: '6px 10px', fontSize: 11, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#7c3aed', fontWeight: 600 }}
                          onClick={() => {
                            setFileMenuOpenId(null);
                            shareFile(file.id);
                          }}
                        >
                          Share Link
                        </button>
                        <button
                          style={{ display: 'block', width: '100%', padding: '6px 10px', fontSize: 11, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}
                          onClick={() => deleteFile(file.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          <button className={styles.newFileButtonRow} onClick={() => setNewFilePrompt(true)}>
            <Plus size={14} />
            <span>New File</span>
          </button>

          {/* Storage Quota & Status */}
          <div className={styles.storageSection}>
            <div className={styles.storageTextRow}>
              <span>{files.length + 1} files</span>
              <span>{(totalBytes / 1024).toFixed(1)} KB used</span>
            </div>
            <div className={styles.storageBarTrack}>
              <div
                className={styles.storageBarFill}
                style={{ width: `${Math.min(100, Math.max(10, (totalBytes / (500 * 1024)) * 100))}%` }}
              />
            </div>
            <div className={styles.autoSaveStatus}>
              <span className={styles.autoSaveDot} />
              <span>Auto-saved just now</span>
            </div>
          </div>

          {/* Pro Tip Card */}
          <div className={styles.proTipCard}>
            <div className={styles.proTipIconBox}>
              <Lightbulb size={16} />
            </div>
            <div>
              <h4 className={styles.proTipTitle}>Pro Tip</h4>
              <p className={styles.proTipText}>Save multiple files to organize your code and test cases better!</p>
            </div>
          </div>
        </aside>
      )}

      {/* ── DRAGGABLE LEFT RESIZER HANDLE ── */}
      {!filesCollapsed && (
        <div
          className={`${styles.resizerGrip} ${isDraggingFilesResizer ? styles.resizerGripActive : ''}`}
          onMouseDown={handleMouseDownFilesResizer}
          title="Drag horizontally to resize My Files width"
        >
          <div className={styles.resizerBar} />
        </div>
      )}

      {/* ── CENTER COLUMN: CODE EDITOR & OUTPUT TERMINAL ── */}
        <section className={styles.editorCenterCol}>
          {/* Editor Card */}
          <div className={styles.editorCard}>
            {/* Top Tab Bar */}
            <div className={styles.editorTabBar}>
              <div className={styles.editorTabsLeft}>
                <div className={`${styles.fileTab} ${styles.fileTabActive}`}>
                  <input
                    type="text"
                    value={fileTitle || ''}
                    onChange={(e) => {
                      setFileTitle(e.target.value);
                      setDirty(true);
                    }}
                    placeholder={lang?.filename || 'main.py'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      width: `${Math.max(8, (fileTitle || lang?.filename || 'main.py').length + 1)}ch`,
                      cursor: 'text',
                    }}
                    title="Click to rename session"
                  />
                  <button className={styles.tabCloseBtn} onClick={copyCode} title="Copy code">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
                <button
                  className={styles.addTabBtn}
                  onClick={() => setNewFilePrompt(true)}
                  title="New Tab"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className={styles.editorTabsRight}>
                <div className={styles.autoSavedBadge}>
                  <Check size={11} strokeWidth={3} />
                  <span>Auto-saved</span>
                </div>
                <button className={styles.tabIconAction} title="Reset starter" onClick={() => setCode(lang?.starter || '')}>
                  <RotateCcw size={14} />
                </button>
                <button className={styles.tabIconAction} title="Download file" onClick={downloadCode}>
                  <Download size={14} />
                </button>
              </div>
            </div>

            {/* Editor Body */}
            <div className={styles.editorWrapper}>
              <CodeEditor
                value={code}
                onChange={setCode}
                mode={lang?.editor_mode ?? 'plain'}
                lineComment={lang?.line_comment ?? '//'}
                onRun={run}
                ariaLabel="Main Code Editor"
              />
            </div>

            {/* Bottom Status Bar */}
            <div className={styles.editorStatusBar}>
              <div className={styles.editorStatusLeft}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>{getLangIcon(langId)}</span>
                  <span>{lang?.label ?? 'Python'}</span>
                </span>
                <span>Ln {code.split('\n').length}, Col {code.length > 0 ? (code.split('\n').pop()?.length ?? 1) + 1 : 1}</span>
                <span>Spaces: 4</span>
                <span>UTF-8</span>
              </div>
              <div className={styles.editorStatusRight}>
                <span title="Docker Sandbox Runner" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Box size={12} /> Sandbox
                </span>
                <span title="Keyboard Shortcuts" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Keyboard size={12} /> Shortcuts
                </span>
              </div>
            </div>
          </div>

          {/* Output Terminal Card */}
          <div className={styles.outputTerminalCard}>
            <div className={styles.terminalHeader}>
              <div className={styles.terminalTitleGroup}>
                <Terminal size={15} color="#a855f7" />
                <span>Output</span>
              </div>
              <button
                className={styles.terminalClearBtn}
                onClick={() => {
                  setResult(null);
                  setRunError('');
                  setTypedLines([]);
                }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            </div>

            <div className={styles.terminalBody} ref={termBodyRef}>
              {/* Live browser preview for HTML/CSS */}
              {isBrowserLang && previewSrc && (
                <iframe
                  title="Live Preview"
                  srcDoc={previewSrc}
                  sandbox="allow-scripts"
                  style={{ width: '100%', height: 320, border: '1px solid #27272a', borderRadius: 8, background: '#fff' }}
                />
              )}
              {isBrowserLang && !previewSrc && (
                <div style={{ color: '#64748b', fontStyle: 'italic', padding: '12px 0' }}>
                  Start typing HTML/CSS — a live preview renders here.
                </div>
              )}
              {!isBrowserLang && (
              <>
              {/* Idle state */}
              {!result && !runError && !running && (
                <div style={{ color: '#64748b', fontStyle: 'italic', padding: '12px 0' }}>
                  ▶ Press <strong style={{ color: '#c084fc' }}>Run (Ctrl ↵)</strong> to execute code — output streams here.
                </div>
              )}

              {/* Running indicator */}
              {running && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c084fc', padding: '10px 0' }}>
                  <Loader2 size={16} className={styles.spin} />
                  <span>Executing on secure container runner…</span>
                </div>
              )}

              {/* Error banner */}
              {runError && !running && (
                <div style={{ color: '#f87171', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} />
                  <span>{runError}</span>
                </div>
              )}

              {/* Command Echo */}
              {result && !running && (
                <div className={styles.termCommandEcho}>
                  ▶ Running {fileTitle || lang?.filename || 'main.py'} …
                </div>
              )}

              {/* Typewriter Output Lines */}
              {typedLines.map((line, i) => {
                if (typeof line !== 'string') return null;
                const isErr = line.startsWith('\x02');
                const isComp = line.startsWith('\x01');
                const text = isErr || isComp ? line.slice(1) : line;
                return (
                  <div
                    key={i}
                    className={`${styles.termOutputLine} ${isErr ? styles.termLineError : ''}`}
                  >
                    {text || '\u00a0'}
                  </div>
                );
              })}

              {/* Verdict & Metrics */}
              {result && typingDone && (
                <div className={styles.processVerdictRow}>
                  <span>
                    [[Process completed{result.time_ms != null ? ` in ${(result.time_ms / 1000).toFixed(2)}s` : ''}]]
                  </span>
                  <span>
                    {result.memory_kb ? `${(result.memory_kb / 1024).toFixed(1)} MB · ` : ''}exit {result.exit_code ?? 0}
                  </span>
                </div>
              )}
              </>
              )}
            </div>
          </div>
        </section>

        {/* ── DRAGGABLE RESIZER HANDLE ── */}
        {!inspectorCollapsed && (
          <div
            className={`${styles.resizerGrip} ${isDraggingResizer ? styles.resizerGripActive : ''}`}
            onMouseDown={handleMouseDownResizer}
            title="Drag horizontally to resize inspector width"
          >
            <div className={styles.resizerBar} />
          </div>
        )}

        {/* ── RIGHT COLUMN: COLLAPSED DOCK OR RESIZABLE INSPECTOR ── */}
        {inspectorCollapsed ? (
          <div
            className={styles.collapsedDock}
            onClick={() => setInspectorCollapsed(false)}
            title="Click to expand Inspector panel"
          >
            <button className={styles.dockExpandBtn} title="Expand Inspector">
              <ChevronLeft size={16} />
            </button>
            <div className={styles.dockLabel}>
              <span>INSPECTOR</span>
            </div>
            <div className={styles.dockIcons}>
              <Eye size={15} />
              <Layers size={15} />
              <Gauge size={15} />
            </div>
          </div>
        ) : (
          <aside className={styles.inspectorRightCol} style={{ width: inspectorWidth }}>
            {/* Multi-Tool Inspector Card */}
            <div className={styles.inspectorCard}>
              <div className={styles.inspectorCardHeader}>
                <div
                  className={styles.inspectorTabsBar}
                  onWheel={(e) => {
                    if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
                  }}
                >
                  <button
                    className={`${styles.inspectorTabBtn} ${activeRightTab === 'visualization' ? styles.inspectorTabActive : ''}`}
                    onClick={() => setActiveRightTab('visualization')}
                  >
                    <Eye size={14} />
                    <span>Visualization</span>
                  </button>
                  <button
                    className={`${styles.inspectorTabBtn} ${activeRightTab === 'input' ? styles.inspectorTabActive : ''}`}
                    onClick={() => setActiveRightTab('input')}
                  >
                    <Layers size={14} />
                    <span>Input</span>
                  </button>
                  <button
                    className={`${styles.inspectorTabBtn} ${activeRightTab === 'performance' ? styles.inspectorTabActive : ''}`}
                    onClick={() => setActiveRightTab('performance')}
                  >
                    <Gauge size={14} />
                    <span>Performance</span>
                  </button>
                </div>

                <div className={styles.inspectorHeaderActions}>
                  <button
                    className={styles.collapseToggleBtn}
                    onClick={() => setInspectorCollapsed(true)}
                    title="Minimize inspector to sidebar dock"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              <div className={styles.inspectorTabBody}>
                {/* TAB 1: REAL WORKING STEP-THROUGH VISUALIZATION */}
                {activeRightTab === 'visualization' && (
                  <div>
                    {lang?.id === 'python' ? (
                      <CodeVisualizer
                        code={code}
                        stdin={stdin}
                        embedded={true}
                        onExpand={() => setVizOpen(true)}
                      />
                    ) : (
                      <div className={styles.nonPythonVizBox}>
                        <Eye size={28} color="#7c3aed" />
                        <h4>Step-Through Execution Visualizer</h4>
                        <p>
                          Interactive line execution, variable tracking, and call stack tracing runs on <strong>Python 3</strong>.
                        </p>
                        <button
                          className={styles.generateVizBtn}
                          onClick={() => switchLanguage('python')}
                          style={{ marginTop: 8 }}
                        >
                          <span>Switch to Python &amp; Visualize</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: INPUT (STDIN) */}
                {activeRightTab === 'input' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Standard Input (stdin)</span>
                      <button
                        onClick={() => setStdin('')}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                      >
                        Clear
                      </button>
                    </div>
                    <textarea
                      rows={10}
                      value={stdin}
                      onChange={e => setStdin(e.target.value)}
                      placeholder="Enter input parameters here (one per line) for input() or cin..."
                      style={{
                        width: '100%',
                        padding: 10,
                        borderRadius: 10,
                        border: '1.5px solid #e2e8f0',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                      Values typed here will be supplied sequentially to stdin during execution.
                    </p>
                  </div>
                )}

                {/* TAB 3: REAL PERFORMANCE & OPTIMIZATION DIAGNOSTICS */}
                {activeRightTab === 'performance' && (
                  <div>
                    <div className={styles.perfHeaderGroup}>
                      <div className={styles.perfIconBox}>
                        <Gauge size={18} />
                      </div>
                      <div>
                        <h4 className={styles.perfTitle}>Performance &amp; Optimization</h4>
                        <p className={styles.perfSubtitle}>
                          Measured execution latency, memory overhead, and automated complexity diagnostics.
                        </p>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className={styles.perfMetricsGrid}>
                      <div className={styles.perfMetricCard}>
                        <div className={styles.perfMetricLabel}>
                          <Clock size={12} color="#7c3aed" />
                          <span>Execution Time</span>
                        </div>
                        <div className={styles.perfMetricValue}>
                          {result?.time_ms != null ? `${result.time_ms} ms` : '—'}
                        </div>
                        {result?.time_ms != null && (
                          <div className={result.time_ms < 200 ? styles.perfBadgeSuccess : styles.perfBadgeWarning} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Zap size={10} />
                            {result.time_ms < 150 ? 'Ultra Fast' : result.time_ms < 1000 ? 'Optimal' : 'Slow Latency'}
                          </div>
                        )}
                      </div>

                      <div className={styles.perfMetricCard}>
                        <div className={styles.perfMetricLabel}>
                          <Cpu size={12} color="#10b981" />
                          <span>Memory Overhead</span>
                        </div>
                        <div className={styles.perfMetricValue}>
                          {result?.memory_kb != null
                            ? `${(result.memory_kb / 1024).toFixed(1)} MB`
                            : '—'}
                        </div>
                        {result?.memory_kb != null && (
                          <div className={result.memory_kb < 30 * 1024 ? styles.perfBadgeSuccess : styles.perfBadgeWarning} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: result.memory_kb < 30 * 1024 ? '#16a34a' : '#ca8a04' }} />
                            {result.memory_kb < 30 * 1024 ? 'Low RAM (<30MB)' : 'Standard RAM'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Optimization Diagnostic Card */}
                    <div className={styles.perfOptCard}>
                      <div className={styles.perfOptHeader}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8' }}>Optimization Status</span>
                        {optimizationData && (
                          <span
                            className={`${styles.perfVerdictPill} ${
                              optimizationData.status === 'optimized'
                                ? styles.perfVerdictOptimized
                                : optimizationData.status === 'moderate'
                                ? styles.perfVerdictModerate
                                : styles.perfVerdictSuboptimal
                            }`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          >
                            <span style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: optimizationData.status === 'optimized' ? '#16a34a' : optimizationData.status === 'moderate' ? '#ca8a04' : '#dc2626'
                            }} />
                            {optimizationData.status === 'optimized'
                              ? 'Well Optimized'
                              : optimizationData.status === 'moderate'
                              ? 'Moderately Optimized'
                              : 'Needs Optimization'}
                          </span>
                        )}
                      </div>

                      <h5 className={styles.perfOptTitle}>{optimizationData?.verdictTitle ?? 'Analysis Ready'}</h5>
                      <p className={styles.perfOptDesc}>{optimizationData?.verdictDesc ?? 'Run your code to evaluate algorithmic complexity.'}</p>

                      <div className={styles.complexityRows}>
                        <div className={styles.complexityRow}>
                          <span className={styles.complexityLabel}>Time Complexity:</span>
                          <span className={styles.complexityVal}>{optimizationData?.estimatedTime ?? 'O(1)'}</span>
                        </div>
                        <div className={styles.complexityRow}>
                          <span className={styles.complexityLabel}>Space Overhead:</span>
                          <span className={styles.complexityVal}>{optimizationData?.estimatedSpace ?? 'O(1)'}</span>
                        </div>
                        <div className={styles.complexityRow}>
                          <span className={styles.complexityLabel}>Loop Construct:</span>
                          <span className={styles.complexityVal}>
                            {optimizationData?.nestedLoops
                              ? 'Nested Iteration (O(n²))'
                              : (optimizationData?.loopCount ?? 0) > 0
                              ? `${optimizationData?.loopCount} Single Loop(s)`
                              : 'None (Constant O(1))'}
                          </span>
                        </div>
                        <div className={styles.complexityRow}>
                          <span className={styles.complexityLabel}>Recursion:</span>
                          <span className={styles.complexityVal}>{optimizationData?.hasRecursion ? 'Detected' : 'None'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Sandbox Resource Limits */}
                    <div className={styles.sandboxConstraintsCard}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Sandbox Time Limit:</span>
                        <strong style={{ color: '#0f172a' }}>2.00s max</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Memory Ceiling:</span>
                        <strong style={{ color: '#0f172a' }}>256 MB max</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Exit Status:</span>
                        <strong style={{ color: result?.success ? '#10b981' : '#f87171' }}>
                          {result ? (result.success ? '0 (Clean Exit)' : `${result.exit_code ?? 'Error'}`) : 'Ready to run'}
                        </strong>
                      </div>
                    </div>

                    {!result && (
                      <button
                        className={styles.generateVizBtn}
                        onClick={run}
                        disabled={running}
                        style={{ marginTop: 12, marginBottom: 0 }}
                      >
                        {running ? <Loader2 size={14} className={styles.spin} /> : <Play size={14} fill="currentColor" />}
                        <span>Run Code to Measure Metrics</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          4. FLOATING AI ASSISTANT POPUP TRIGGER & DRAWER MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      <button
        id="floatingAiBtn"
        className={styles.floatingAiTrigger}
        onClick={() => setAiPopupOpen(true)}
        title="Open AI Coding Companion"
      >
        <Sparkles size={16} />
        <span>AI Assistant</span>
      </button>

      {/* Full AI Assistant Drawer Modal */}
      {aiPopupOpen && (
        <div className={styles.aiModalBackdrop} onClick={() => setAiPopupOpen(false)}>
          <div className={styles.aiDrawerPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.aiDrawerHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.quoteIconBadge} style={{ width: 34, height: 34 }}>
                  <Bot size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#0f172a' }}>NexLab AI Companion</h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Powered by Gemini Intelligent Tutor</span>
                </div>
              </div>
              <button className={styles.aiDrawerClose} onClick={() => setAiPopupOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.aiDrawerBody}>
              {aiMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: 14,
                      background: msg.role === 'user' ? '#7c3aed' : '#f8fafc',
                      color: msg.role === 'user' ? '#fff' : '#1e293b',
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    }}
                  >
                    {msg.text}
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{msg.time}</span>
                </div>
              ))}

              {assistBusy && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#7c3aed', fontSize: 12 }}>
                  <Loader2 size={14} className={styles.spin} />
                  <span>AI is thinking…</span>
                </div>
              )}
            </div>

            <div className={styles.aiDrawerFoot}>
              <form
                className={styles.aiChatInputRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim()) askAssist('ask');
                }}
              >
                <input
                  className={styles.aiChatInput}
                  placeholder="Ask a question about your code or algorithms…"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                />
                <button
                  type="submit"
                  className={styles.aiSendBtn}
                  disabled={Boolean(assistBusy) || !question.trim()}
                >
                  <Send size={13} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          5. STEP-THROUGH VISUALIZER (PYTHON)
          ═══════════════════════════════════════════════════════════════════ */}
      {vizOpen && lang?.id === 'python' && !isBrowserLang && (
        <CodeVisualizer code={code} stdin={stdin} onExit={() => setVizOpen(false)} />
      )}

      {/* Toast notifications */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: 28,
            zIndex: 1000,
            background: toast.err ? '#fef2f2' : '#ecfdf5',
            border: `1.5px solid ${toast.err ? '#fca5a5' : '#a7f3d0'}`,
            color: toast.err ? '#b91c1c' : '#059669',
            padding: '10px 16px',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {toast.err ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}
    </IndividualShell>
  );
}
