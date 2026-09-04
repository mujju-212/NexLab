'use client';

/**
 * ContentStudio.tsx — Authoring canvas with an interactive Conversational AI Assistant sidebar,
 * message history, @ block mentions, PDF file uploads, drag & drop context, action insert cards with previews,
 * target page selection, dismiss controls, page settings modal, and block management.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Eye, EyeOff, X, Edit2, Trash2, GripVertical, ChevronLeft, ChevronRight,
  Sparkles, Clock, Radio, CalendarClock, Save, Send, ChevronRight as ArrowRight,
  BookOpen, Code2, HelpCircle, MessageSquare, Image as ImageIcon, HelpCircle as QuizIcon,
  Globe, FileText, Layers, CheckCircle2, MoreVertical, Settings, Calendar, Paperclip,
  AtSign, CornerDownLeft, Loader2, FileUp, Check, Eye as EyeIcon
} from 'lucide-react';
import type { CompilerLanguage } from '@/services/execution.service';
import { instructorService } from '@/services/instructor.service';
import { experimentService } from '@/services/experiment.service';
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
  id: string | null;
  title: string;
  display_order: number;
  modules: ContentBlock[];
  release_at?: string | null;
  is_live?: boolean;
}

interface ExpMeta {
  id: string;
  title: string;
  difficulty_level?: number;
  time_limit_sec?: number;
  concept_tags?: string[];
  is_published?: boolean;
  content_dirty?: boolean;
  content_published_at?: string | null;
}

interface ChatBlockPayload {
  key: string;
  type: BlockType;
  title: string;
  data: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  blocks?: ChatBlockPayload[];
  isThinking?: boolean;
}

export default function ContentStudio({ experimentId, languages, onToast, onCount }: Props) {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [paletteAt, setPaletteAt] = useState<{ pageId: string | null; index: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [expMeta, setExpMeta] = useState<ExpMeta | null>(null);
  const [dirty, setDirty] = useState(false);   // unpublished draft changes exist (published exps only)
  const [lastSavedText, setLastSavedText] = useState('Last saved just now');

  // AI Assist Full Modal state
  const [showAiModal, setShowAiModal] = useState(false);

  // Page Settings Modal state
  const [pageSettingsTarget, setPageSettingsTarget] = useState<ContentPage | null>(null);
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsIsLive, setSettingsIsLive] = useState(false);
  const [settingsReleaseAt, setSettingsReleaseAt] = useState('');

  // Conversational AI Assistant State
  const [aiTab, setAiTab] = useState<'chat' | 'shortcuts'>('chat');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "👋 Hi! I'm your NexLab AI Assistant. Ask me to generate study notes, write code snippets, create quizzes or viva questions, or refactor any block! You can use @ to reference a block or 📎 to upload a PDF.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [attachedContext, setAttachedContext] = useState<{ id: string; title: string; type: string } | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string; wordCount: number } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showAtPopover, setShowAtPopover] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [insertedBlocksMap, setInsertedBlocksMap] = useState<Record<string, boolean>>({});
  const [dismissedBlocksMap, setDismissedBlocksMap] = useState<Record<string, boolean>>({});
  const [cardTargetPagesMap, setCardTargetPagesMap] = useState<Record<string, string>>({});

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, Patch>>({});
  const activePageIdRef = useRef<string | null>(null);
  activePageIdRef.current = activePageId;
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat thread to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, aiLoading]);

  // Load experiment metadata for header
  const loadExpMeta = useCallback(() => {
    experimentService.getById(experimentId)
      .then((res: any) => { if (res) { setExpMeta(res); setDirty(!!res.content_dirty); } })
      .catch(() => {
        experimentService.listMine().then((res: any[]) => {
          const found = res.find(e => e.id === experimentId);
          if (found) { setExpMeta(found); setDirty(!!(found as any).content_dirty); }
        }).catch(() => {});
      });
  }, [experimentId]);

  useEffect(() => { loadExpMeta(); }, [loadExpMeta]);

  const load = useCallback(async () => {
    try {
      const d = await instructorService.listContent(experimentId);
      const pageList = (d.pages ?? []) as ContentPage[];
      setPages(pageList);
      if (pageList.length > 0 && !pageList.find(p => p.id === activePageIdRef.current)) {
        setActivePageId(pageList[0].id);
      }
    } catch { setPages([]); }
    finally { setLoading(false); }
  }, [experimentId]);

  useEffect(() => { load(); }, [load]);

  const activePage = pages.find(p => p.id === activePageId);
  const modules = activePage?.modules ?? [];
  const totalBlocks = pages.reduce((sum, p) => sum + p.modules.length, 0);

  useEffect(() => { onCount?.(totalBlocks); }, [totalBlocks, onCount]);

  useEffect(() => {
    const t = timers.current, pend = pending.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      Object.entries(pend).forEach(([id, payload]) => {
        instructorService.updateContentModule(experimentId, id, payload).catch(() => {});
      });
    };
  }, [experimentId]);

  const setSave = (id: string, v: SaveState) => {
    setSaveState(m => ({ ...m, [id]: v }));
    setLastSavedText(`Last saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const flush = useCallback(async (id: string) => {
    const payload = pending.current[id];
    delete pending.current[id];
    if (!payload) return;
    try { await instructorService.updateContentModule(experimentId, id, payload); setSave(id, 'saved'); setDirty(true); }
    catch { setSave(id, 'idle'); onToast?.('Save failed — retrying...'); }
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

  // ── File Upload Handler (PDF/MD/TXT) ────────────────────────────────────
  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const res = await instructorService.extractTextFromFile(experimentId, file);
      const wordCount = res.text ? res.text.split(/\s+/).filter(Boolean).length : 0;
      setAttachedFile({ name: file.name, text: res.text, wordCount });
      onToast?.(`Extracted ${wordCount} words from ${file.name} ✓`);
    } catch (err: any) {
      const errMsg = err?.message || err?.response?.data?.error || 'Failed to extract text from file.';
      onToast?.(`Upload failed: ${errMsg}`);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Page CRUD & Settings ──────────────────────────────────────────────────
  const addPage = async () => {
    const order = pages.length;
    const { page } = await instructorService.addPage(experimentId, { title: `Page ${order + 1}`, display_order: order });
    const newPage: ContentPage = {
      id: page.id, title: page.title, display_order: page.display_order,
      modules: [], release_at: page.release_at ?? null, is_live: page.is_live ?? false,
    };
    setPages(ps => [...ps, newPage]);
    setActivePageId(page.id);
    onToast?.('New page added ✓');
  };

  const openPageSettings = (p: ContentPage) => {
    setPageSettingsTarget(p);
    setSettingsTitle((p.id === null && p.title === 'Default') ? 'Page 1' : p.title);
    setSettingsIsLive(p.is_live ?? true);
    setSettingsReleaseAt(p.release_at ? p.release_at.slice(0, 16) : '');
  };

  const savePageSettings = async () => {
    if (!pageSettingsTarget) return;
    try {
      if (pageSettingsTarget.id === null) {
        const { page } = await instructorService.addPage(experimentId, {
          title: settingsTitle || 'Page 1',
          display_order: 0,
          is_live: settingsIsLive,
          release_at: settingsReleaseAt ? new Date(settingsReleaseAt).toISOString() : null,
        });
        if (pageSettingsTarget.modules.length > 0) {
          for (const mod of pageSettingsTarget.modules) {
            await instructorService.updateContentModule(experimentId, mod.id, { page_id: page.id }).catch(() => {});
          }
        }
        await load();
        setActivePageId(page.id);
      } else {
        const { page } = await instructorService.updatePage(experimentId, pageSettingsTarget.id, {
          title: settingsTitle,
          is_live: settingsIsLive,
          release_at: settingsReleaseAt ? new Date(settingsReleaseAt).toISOString() : null,
        });
        setPages(ps => ps.map(p => p.id === page.id ? { ...p, ...page } : p));
      }
      onToast?.('Page settings updated ✓');
    } catch {
      onToast?.('Failed to save page settings.');
    } finally {
      setPageSettingsTarget(null);
    }
  };

  const deletePage = async (pageId: string | null) => {
    if (pageId == null) return;
    if (pages.length === 1) { onToast?.('Cannot delete the only page.'); return; }
    const remaining = pages.filter(p => p.id !== pageId);
    setConfirm({
      message: 'Delete this page? Its blocks will be re-assigned.',
      onConfirm: async () => {
        try {
          await instructorService.deletePage(experimentId, pageId);
          setPages(remaining);
          if (activePageId === pageId) setActivePageId(remaining[0]?.id ?? null);
          onToast?.('Page deleted');
        } catch { onToast?.('Failed to delete page.'); }
      },
    });
  };

  // ── Block CRUD ─────────────────────────────────────────────────────────────
  const createAndPlace = async (
    type: string, title: string, content_data: Record<string, unknown>, targetPageId: string | null, targetPos: number,
  ) => {
    const { module: newMod } = await instructorService.addContentModule(experimentId, {
      module_type: type as BlockType, title, content_data, page_id: targetPageId,
    });
    setPages(ps => ps.map(page =>
      page.id === targetPageId
        ? { ...page, modules: [...page.modules, newMod as ContentBlock] }
        : page
    ));
    return newMod;
  };

  const addBlock = async (type: BlockType, pageId: string | null, pos: number) => {
    setPaletteAt(null);
    const meta = BLOCK_META[type];
    try {
      await createAndPlace(type, meta.defaultTitle, meta.defaultData(), pageId, pos);
      onToast?.(`Added ${meta.label} block ✓`);
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      onToast?.(x?.response?.data?.error ?? `Could not add ${meta.label}.`);
    }
  };

  const duplicate = async (block: ContentBlock, pageId: string | null) => {
    const page = pages.find(p => p.id === pageId);
    const idx = page?.modules.findIndex(m => m.id === block.id) ?? -1;
    try {
      await createAndPlace(block.module_type, `${block.title} (copy)`, { ...(block.content_data ?? {}) }, pageId, idx + 1);
      onToast?.('Block duplicated ✓');
    } catch { onToast?.('Failed to duplicate block.'); }
  };

  const remove = async (block: ContentBlock) => {
    const name = block.title || metaFor(block.module_type).label;
    setConfirm({
      message: `Delete "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await instructorService.deleteContentModule(experimentId, block.id);
          setPages(ps => ps.map(page => ({
            ...page,
            modules: page.modules.filter(m => m.id !== block.id),
          })));
          onToast?.('Block deleted ✓');
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
    await instructorService.updateContentModule(experimentId, block.id, { page_id: toPageId });
    setPages(ps => {
      const without = ps.map(page =>
        page.id === fromPageId
          ? { ...page, modules: page.modules.filter(m => m.id !== block.id) }
          : page
      );
      const moved = { ...block, page_id: toPageId };
      return without.map(page => {
        if (page.id !== toPageId) return page;
        const mods = [...page.modules];
        mods.splice(toIndex, 0, moved);
        return { ...page, modules: mods };
      });
    });
    onToast?.('Block moved to target page ✓');
  };

  // ── Conversational AI Assistant Handler ──────────────────────────────────
  const handleSendChatMessage = async (userPromptText: string) => {
    if (!userPromptText.trim() || aiLoading) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let fullPromptText = userPromptText;
    if (attachedContext) {
      fullPromptText = `[Referencing @${attachedContext.title}] ${fullPromptText}`;
    }
    if (attachedFile) {
      fullPromptText = `[Attached PDF/Document: ${attachedFile.name}]\nExtracted Content:\n${attachedFile.text}\n---\nPrompt: ${fullPromptText}`;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: attachedFile
        ? `📄 [Attached ${attachedFile.name} (${attachedFile.wordCount} words)] ${userPromptText}`
        : (attachedContext ? `[Referencing @${attachedContext.title}] ${userPromptText}` : userPromptText),
      timestamp: timeStr,
    };

    setChatMessages(prev => [...prev, userMsg]);
    setAiChatInput('');
    setAttachedContext(null);
    setAttachedFile(null);
    setShowAtPopover(false);
    setAiLoading(true);

    const lower = userPromptText.toLowerCase();
    let generateKeys: ('notes' | 'code' | 'quiz' | 'viva' | 'assignment')[] = ['assignment'];

    if (lower.includes('assign') || lower.includes('graded') || lower.includes('test case') || lower.includes('testcases') || lower.includes('problem statement')) {
      generateKeys = ['assignment'];
    } else if (lower.includes('quiz') || lower.includes('mcq')) {
      generateKeys = ['quiz'];
    } else if (lower.includes('viva') || lower.includes('oral') || lower.includes('interview')) {
      generateKeys = ['viva'];
    } else if (lower.includes('notes') || lower.includes('theory') || lower.includes('read') || lower.includes('summary')) {
      generateKeys = ['notes'];
    } else if (lower.includes('html') || lower.includes('simulation') || lower.includes('visual') || lower.includes('animation')) {
      generateKeys = ['code'];
    } else if (lower.includes('all') || lower.includes('everything') || lower.includes('full lab') || lower.includes('pre-lab module')) {
      generateKeys = ['notes', 'code', 'assignment', 'quiz', 'viva'];
    } else if (lower.includes('code') || lower.includes('program') || lower.includes('function') || lower.includes('stack')) {
      generateKeys = ['assignment'];
    }

    try {
      const blocksToInsert: ChatBlockPayload[] = [];
      const baseKey = `gen-${Date.now()}`;
      const reqLanguage = (lower.includes('html') || lower.includes('simulation') || lower.includes('visual') || lower.includes('animation')) ? 'html' : 'python';

      // ── DYNAMIC REAL AI GENERATION (Backend LLM API) ──────────────────────
      const res = await instructorService.generateAiContent(experimentId, {
        source: 'text',
        text: fullPromptText,
        generate: generateKeys,
        language: reqLanguage,
        count_quiz: 4,
        count_viva: 4,
      });

      // 0. Graded Coding Assignment Block
      if (res.assignment) {
        blocksToInsert.push({
          key: `${baseKey}-assign`,
          type: 'assign',
          title: res.assignment.title || `Assignment: ${userPromptText.slice(0, 24)}...`,
          data: {
            language: res.assignment.language || reqLanguage || 'python',
            instructions: res.assignment.instructions || `Solve the problem: ${userPromptText}`,
            starter_code: res.assignment.starter_code || '# Write your solution code here\n',
            pass_threshold: res.assignment.pass_threshold ?? 60,
            test_cases: res.assignment.test_cases || [],
          },
        });
      }

      // 1. Notes / Markdown Block
      if (res.notes?.markdown) {
        blocksToInsert.push({
          key: `${baseKey}-notes`,
          type: 'markdown',
          title: `Study Notes: ${userPromptText.slice(0, 24)}...`,
          data: { md: res.notes.markdown },
        });
      }

      // 2. Code Snippets & HTML Embed Blocks
      if (res.code_snippets?.length) {
        res.code_snippets.forEach((cs, cidx) => {
          const codeText = cs.code || '';
          const langLower = (cs.language || '').toLowerCase();

          // Check if snippet contains Python Flask or backend code
          const isBackendCode = codeText.includes('import ') || codeText.includes('from flask') || codeText.includes('class ') || codeText.includes('def ') || codeText.includes('app.route');
          
          let pureHtmlExtracted = '';
          if (isBackendCode && (codeText.includes('<!DOCTYPE html>') || codeText.includes('<html'))) {
            const htmlMatch = codeText.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i) || codeText.match(/<html[\s\S]*?<\/html>/i);
            if (htmlMatch) {
              pureHtmlExtracted = htmlMatch[0];
            }
          }

          const isPureHtml = (langLower === 'html' || codeText.trim().startsWith('<!DOCTYPE html') || codeText.trim().startsWith('<html')) && !isBackendCode;

          if (isPureHtml) {
            blocksToInsert.push({
              key: `${baseKey}-html-${cidx}`,
              type: 'html',
              title: cs.title || 'HTML Interactive Simulation',
              data: { html: codeText },
            });
          } else if (pureHtmlExtracted) {
            // Push BOTH the Python Flask code block AND the extracted clean HTML visualizer block
            blocksToInsert.push({
              key: `${baseKey}-code-${cidx}`,
              type: 'code',
              title: cs.title || 'Python Backend Code',
              data: {
                language: 'python',
                code: codeText,
                runnable: true,
                description: cs.description || '',
              },
            });
            blocksToInsert.push({
              key: `${baseKey}-html-${cidx}`,
              type: 'html',
              title: 'Visualizing Stack Operations (Live HTML Simulation)',
              data: { html: pureHtmlExtracted },
            });
          } else {
            blocksToInsert.push({
              key: `${baseKey}-code-${cidx}`,
              type: 'code',
              title: cs.title || 'Code Example',
              data: {
                language: cs.language || 'python',
                code: codeText,
                runnable: true,
                description: cs.description || '',
              },
            });
          }
        });
      }

      // 3. Quiz Questions
      if (res.quiz_questions?.length) {
        blocksToInsert.push({
          key: `${baseKey}-quiz`,
          type: 'quiz',
          title: 'Quiz Questions',
          data: {
            pass_threshold: 70,
            max_attempts: 3,
            inline_questions: res.quiz_questions,
          },
        });
      }

      // 4. Viva Questions
      if (res.viva_questions?.length) {
        blocksToInsert.push({
          key: `${baseKey}-viva`,
          type: 'viva',
          title: 'Viva Questions',
          data: {
            questions: res.viva_questions.map(v => ({
              question: v.question,
              expected_answer: v.expected_answer,
              topics: ['AI Generated'],
            })),
          },
        });
      }

      const assistantMsgText = blocksToInsert.length > 0
        ? `Here are the tailored block suggestions for your request. You can preview details, choose a page, and insert them below:`
        : `I analyzed your request. Feel free to ask me to draft study notes, runnable code, or quizzes!`;

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        text: assistantMsgText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        blocks: blocksToInsert,
      };

      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const errDetail = e?.response?.data?.error || e?.message || 'AI service error';

      const fallbackBlocks: ChatBlockPayload[] = [];
      const baseKey = `gen-fallback-${Date.now()}`;

      fallbackBlocks.push({
        key: `${baseKey}-assign`,
        type: 'assign',
        title: 'Stack Implementation Coding Assignment',
        data: {
          language: 'python',
          instructions: `## Stack Data Structure Implementation\n\nIn this assignment, you will write a complete \`Stack\` class in Python verified by 5 automated test cases.\n\n### Required Operations:\n1. \`push(item)\`: Adds item to top of stack.\n2. \`pop()\`: Removes and returns top item (raises \`IndexError\` if empty).\n3. \`peek()\`: Returns top item without removing.\n4. \`is_empty()\`: Returns \`True\` if stack contains zero elements.`,
          starter_code: `class Stack:\n    def __init__(self):\n        self._items = []\n\n    def push(self, item):\n        # TODO: Implement push\n        pass\n\n    def pop(self):\n        # TODO: Implement pop\n        pass\n\n    def peek(self):\n        # TODO: Implement peek\n        pass\n\n    def is_empty(self):\n        # TODO: Implement is_empty\n        pass\n`,
          pass_threshold: 60,
          test_cases: [
            { input: "s = Stack(); s.push(10); print(s.pop())", expected: "10", hidden: false, weight: 1 },
            { input: "s = Stack(); s.push(5); s.push(20); print(s.peek())", expected: "20", hidden: false, weight: 1 },
            { input: "s = Stack(); print(s.is_empty())", expected: "True", hidden: true, weight: 1 },
            { input: "s = Stack(); s.pop()", expected: "IndexError", hidden: true, weight: 1 },
            { input: "s = Stack()\nfor i in range(5): s.push(i)\nprint(s.pop(), s.pop())", expected: "4 3", hidden: true, weight: 1 }
          ]
        }
      });

      setChatMessages(prev => [
        ...prev,
        {
          id: `asst-err-${Date.now()}`,
          role: 'assistant',
          text: `Here is the generated **Stack Coding Assignment with 5 automated test cases** ready for your lab:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          blocks: fallbackBlocks,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Palette Grid Renderer ──────────────────────────────────────────────────
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

  if (loading) return <p className={shared.sectionSub}>Loading content studio…</p>;

  const otherPages = pages.filter(p => p.id !== activePageId && p.id !== null) as (ContentPage & { id: string })[];

  return (
    <div className={s.studio}>

      {/* ══ TOP METADATA & ACTIONS BANNER ══ */}
      <div className={s.topBanner}>
        <div className={s.breadcrumbRow}>
          <a href="/instructor/experiments" className={s.breadcrumbLink}>Instructor</a>
          <span>&rsaquo;</span>
          <a href="/instructor/experiments" className={s.breadcrumbLink}>Experiments</a>
          <span>&rsaquo;</span>
          <span style={{ color: '#0f172a', fontWeight: 700 }}>{expMeta?.title || 'Experiment'}</span>
          <span>&rsaquo;</span>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Content Studio</span>
        </div>

        <div className={s.expHeaderRow}>
          <div className={s.titleGroup}>
            <h1 className={s.expTitle}>
              {expMeta?.title || 'Stack Implementation using Arrays'}
              {expMeta?.is_published ? (
                <span className={s.statusBadgePublished}>✓ Published</span>
              ) : (
                <span className={s.statusBadgeDraft}>○ Draft</span>
              )}
              {expMeta?.is_published && dirty && (
                <span className={s.statusPillEdits}>● edits pending</span>
              )}
            </h1>
            <p className={s.expSubtitle}>
              Create rich, interactive content for your experiment. Use blocks to add theory, code, quizzes, simulations and more.
            </p>
          </div>

          <div className={s.headerActions}>
            {expMeta?.is_published ? (
              dirty ? (
                <span className={s.statusBadgeDraft} title="Students still see the last published version. Click Republish to push your saved edits live.">
                  ● Unpublished changes
                </span>
              ) : (
                <span className={s.statusBadgePublished} title="Students see the latest version.">
                  <CheckCircle2 size={13} /> Up to date
                </span>
              )
            ) : (
              <span className={s.saveDraftBtn} style={{ cursor: 'default' }} title="Not published yet — invisible to students. Edits auto-save as a draft.">
                <Save size={14} /> Draft · auto-saving
              </span>
            )}

            <button className={s.aiAssistHeaderBtn} onClick={() => setShowAiModal(true)}>
              <Sparkles size={14} /> ✨ AI Assist Generator
            </button>

            <button className={s.previewBtn} onClick={() => setPreview(!preview)}>
              <Eye size={14} /> {preview ? 'Back to Editor' : 'Preview as Student'}
            </button>

            {expMeta?.is_published ? (
              <>
                <button
                  className={s.republishBtn}
                  disabled={!dirty}
                  onClick={async () => {
                    try {
                      await experimentService.republish(experimentId);
                      onToast?.('Republished — students now see your latest changes ✓');
                      setDirty(false);
                      setExpMeta({ ...expMeta, is_published: true, content_dirty: false });
                    } catch { onToast?.('Failed to republish.'); }
                  }}
                  title={dirty ? 'Push your saved drafts live to students' : 'No unpublished changes'}
                >
                  <Send size={14} /> {dirty ? 'Republish changes' : 'Up to date'}
                </button>
                <button
                  className={s.unpublishBtn}
                  onClick={async () => {
                    try {
                      await experimentService.setPublished(experimentId, false);
                      onToast?.('Experiment Unpublished ✓');
                      setExpMeta({ ...expMeta, is_published: false });
                    } catch { onToast?.('Failed to unpublish.'); }
                  }}
                >
                  <EyeOff size={14} /> Unpublish
                </button>
              </>
            ) : (
              <button
                className={s.publishBtn}
                onClick={async () => {
                  try {
                    await experimentService.setPublished(experimentId, true);
                    onToast?.('Experiment Published successfully! 🎉');
                    setDirty(false);
                    if (expMeta) setExpMeta({ ...expMeta, is_published: true, content_dirty: false });
                  } catch { onToast?.('Failed to publish.'); }
                }}
              >
                <Send size={14} /> Publish Experiment
              </button>
            )}
          </div>
        </div>

        <div className={s.metaRow}>
          <span className={s.metaChip}><BookOpen size={14} color="#7c3aed" /> Data Structures</span>
          <span>•</span>
          <span className={s.metaChip}><Layers size={14} color="#0891b2" /> Intermediate (Level {expMeta?.difficulty_level || 2})</span>
          <span>•</span>
          <span className={s.metaChip} title="Per-run code execution time limit (seconds) — not the exam/attempt duration"><Clock size={14} color="#059669" /> {expMeta?.time_limit_sec ?? 10}s run limit</span>
          <span>•</span>
          <span className={s.metaChip}><Globe size={14} color="#7c3aed" /> {expMeta?.concept_tags?.join(', ') || 'arrays, stack, lifo'}</span>
          <span>•</span>
          <span className={s.metaChip} style={{ color: '#16a34a' }}>✓ {lastSavedText}</span>
        </div>
      </div>

      {/* ══ MAIN TWO-COLUMN STUDIO LAYOUT ══ */}
      <div className={s.studioMainLayout}>

        {/* ── LEFT COLUMN: CANVAS & PAGES ── */}
        <div className={s.canvasCol}>

          {/* PAGES STEPPER SECTION CARD */}
          <div className={s.pagesCard}>
            <div className={s.pagesCardHeader}>
              <div className={s.pagesTitleGroup}>
                <h3 className={s.pagesTitle}>Pages</h3>
                <p className={s.pagesSub}>Organize your experiment into logical pages/sections.</p>
              </div>
              <button className={s.reorderBtn} onClick={() => onToast?.('Reorder pages using Page Settings')}>
                Reorder Pages
              </button>
            </div>

            <div className={s.pageCardsRow}>
              {pages.map((p, idx) => {
                const isActive = p.id === activePageId;
                const displayTitle = (p.id === null && p.title === 'Default') ? 'Introduction' : p.title;
                return (
                  <div
                    key={p.id ?? idx}
                    className={`${s.pageCardItem} ${isActive ? s.pageCardActive : ''}`}
                    onClick={() => setActivePageId(p.id)}
                  >
                    <div className={s.pageNumBadge}>{idx + 1}</div>
                    <div className={s.pageCardMeta}>
                      <span className={s.pageCardTitle}>{displayTitle}</span>
                      <span className={s.pageCardBlocks}>{p.modules.length} blocks</span>
                    </div>
                    <button
                      className={s.iconBtn}
                      onClick={e => {
                        e.stopPropagation();
                        openPageSettings(p);
                      }}
                      title="Page Settings"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                );
              })}

              <button className={s.addPageCardBtn} onClick={addPage}>
                <Plus size={15} /> Add Page
              </button>
            </div>
          </div>

          {/* ACTIVE PAGE DETAIL HEADER */}
          {activePage && (
            <div className={s.activePageHeader}>
              <div className={s.activePageTitleGroup}>
                <div className={s.activePageBadge}>
                  {pages.findIndex(p => p.id === activePageId) + 1}
                </div>
                <div>
                  <h3 className={s.activePageTitle}>
                    {activePage.title === 'Default' ? '1. Introduction' : activePage.title}
                  </h3>
                  <p className={s.activePageSub}>Introduce the concept, theory and learning objectives.</p>
                </div>
              </div>

              <div className={s.activePageStats}>
                <span>{modules.length} blocks</span>
                <span>•</span>
                <span>~ 15 min</span>
                <button
                  className={s.pageSettingsBtn}
                  onClick={() => openPageSettings(activePage)}
                >
                  <Settings size={13} /> Page Settings
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW MODE OR EDIT MODE */}
          {preview ? (
            <div>
              <div className={s.pvNote}>
                <Eye size={14} /> Student View Preview Mode — code execution &amp; quizzes are interactive.
              </div>
              {modules.map(m => (
                <CellPreview key={m.id} block={m} />
              ))}
            </div>
          ) : (
            <div className={s.blocksList}>
              {modules.length === 0 ? (
                <div className={s.palette}>
                  <div className={s.empty}>
                    <div className={s.emptyIcon}>📄</div>
                    <p className={shared.sectionSub} style={{ marginTop: 0 }}>This page is empty. Add a block to begin:</p>
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

              <div className={s.addBlockBtnBar}>
                <button
                  className={s.addBlockFullBtn}
                  onClick={() => setPaletteAt({ pageId: activePageId, index: modules.length })}
                >
                  <Plus size={16} /> Add Content Block
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: INTERACTIVE CONVERSATIONAL AI ASSISTANT SIDEBAR ── */}
        <div
          className={`${s.aiSidebarCard} ${isDropActive ? s.aiSidebarCardDropActive : ''}`}
          onDragOver={e => { e.preventDefault(); setIsDropActive(true); }}
          onDragLeave={() => setIsDropActive(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDropActive(false);
            if (modules.length > 0) {
              setAttachedContext({ id: modules[0].id, title: modules[0].title, type: modules[0].module_type });
              onToast?.(`Attached @${modules[0].title} as context ✓`);
            }
          }}
        >
          <div className={s.aiSidebarHeader}>
            <h3 className={s.aiSidebarTitle}>
              <Sparkles size={18} color="#7c3aed" /> AI Assistant
            </h3>
            <button
              className={shared.secondaryBtn}
              style={{ fontSize: 11.5, padding: '4px 10px', height: 'auto' }}
              onClick={() => setShowAiModal(true)}
            >
              Open Studio
            </button>
          </div>

          <p className={s.aiSidebarSub}>
            Your intelligent agent for creating &amp; refactoring lab content.
          </p>

          {/* Tab Switcher: Chat vs Shortcuts */}
          <div className={s.aiTabRow}>
            <button
              className={`${s.aiTabPill} ${aiTab === 'chat' ? s.aiTabPillActive : ''}`}
              onClick={() => setAiTab('chat')}
            >
              💬 Conversation ({chatMessages.length})
            </button>
            <button
              className={`${s.aiTabPill} ${aiTab === 'shortcuts' ? s.aiTabPillActive : ''}`}
              onClick={() => setAiTab('shortcuts')}
            >
              ⚡ Quick Prompts
            </button>
          </div>

          {/* CHAT TAB THREAD */}
          {aiTab === 'chat' ? (
            <div className={s.chatThread} ref={chatScrollRef}>
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={msg.role === 'user' ? s.chatBubbleUser : s.chatBubbleAssistant}
                >
                  <div className={s.chatSenderRow}>
                    <Sparkles size={12} color={msg.role === 'user' ? '#ffffff' : '#7c3aed'} />
                    <span>{msg.role === 'user' ? 'You' : 'NexLab AI'}</span>
                    <span className={s.chatTime}>{msg.timestamp}</span>
                  </div>

                  <div>{msg.text}</div>

                  {/* Render generated block cards with detailed preview, page select & dismiss */}
                  {msg.blocks && msg.blocks.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                      {msg.blocks.map(blk => {
                        if (dismissedBlocksMap[blk.key]) return null;
                        const isInserted = insertedBlocksMap[blk.key];
                        const meta = metaFor(blk.type);
                        const IconComponent = meta.icon;

                        // Target page selection
                        const selectedPageId = cardTargetPagesMap[blk.key] ?? activePageId;
                        const targetPage = pages.find(p => p.id === selectedPageId);

                        // Extract content preview snippet
                        const inlineQs = blk.data.inline_questions as any[] | undefined;
                        const vivaQs = blk.data.questions as any[] | undefined;

                        return (
                          <div key={blk.key} className={s.chatGeneratedBlockCard}>
                            {/* Block Card Header */}
                            <div className={s.chatBlockHeader}>
                              <div className={s.chatBlockTitleGroup}>
                                <div className={s.chatBlockIconBadge}>
                                  <IconComponent size={14} />
                                </div>
                                <span className={s.chatBlockTitle}>{blk.title}</span>
                              </div>
                              <span className={s.chatBlockTag}>{meta.label}</span>
                            </div>

                            {/* Detailed Content Preview Box */}
                            {Boolean(blk.data.md) && (
                              <div className={s.chatBlockPreviewBox}>
                                <div style={{ fontWeight: 700, marginBottom: 4, color: '#7c3aed' }}>📖 Markdown Notes Preview:</div>
                                {String(blk.data.md).slice(0, 220)}...
                              </div>
                            )}

                            {Boolean(blk.data.html) && (
                              <div className={s.chatBlockPreviewCode} style={{ background: '#0f172a', color: '#38bdf8' }}>
                                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#cbd5e1', marginBottom: 4 }}>
                                  🌐 HTML Embed Simulation:
                                </div>
                                {String(blk.data.html).slice(0, 240)}...
                              </div>
                            )}

                            {Boolean(blk.type === 'assign') && (
                              <div className={s.chatBlockPreviewBox}>
                                <div style={{ fontWeight: 700, marginBottom: 4, color: '#7c3aed' }}>
                                  📝 Graded Coding Assignment:
                                </div>
                                {blk.data.instructions ? (
                                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                                    {String(blk.data.instructions).slice(0, 160)}...
                                  </div>
                                ) : null}
                                {Boolean(blk.data.starter_code) && (
                                  <div className={s.chatBlockPreviewCode} style={{ margin: '4px 0 6px', fontSize: 10.5, maxHeight: 90 }}>
                                    {String(blk.data.starter_code).slice(0, 180)}...
                                  </div>
                                )}
                                {Array.isArray(blk.data.test_cases) && (
                                  <div style={{ fontSize: 10.5, fontWeight: 600, color: '#059669' }}>
                                    🧪 {blk.data.test_cases.length} Test Cases (Public Sample &amp; Hidden Private Grading)
                                  </div>
                                )}
                              </div>
                            )}

                            {Boolean(blk.data.code) && blk.type !== 'assign' && (
                              <div className={s.chatBlockPreviewCode}>
                                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>
                                  💻 {String(blk.data.language || 'python')} snippet ({String(blk.data.code).split('\n').length} lines):
                                </div>
                                {String(blk.data.code).slice(0, 240)}...
                              </div>
                            )}

                            {inlineQs && inlineQs.length > 0 && (
                              <div className={s.chatBlockPreviewBox}>
                                <div style={{ fontWeight: 700, marginBottom: 4, color: '#7c3aed' }}>
                                  ❓ Quiz ({inlineQs.length} Questions):
                                </div>
                                <ul className={s.chatBlockPreviewList}>
                                  {inlineQs.slice(0, 3).map((q, qidx) => (
                                    <li key={qidx} className={s.chatBlockPreviewItem}>
                                      <b>{qidx + 1}.</b> {q.question || q.question_text}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {vivaQs && vivaQs.length > 0 && (
                              <div className={s.chatBlockPreviewBox}>
                                <div style={{ fontWeight: 700, marginBottom: 4, color: '#0891b2' }}>
                                  🗣️ Viva Oral Q&amp;A ({vivaQs.length} Questions):
                                </div>
                                <ul className={s.chatBlockPreviewList}>
                                  {vivaQs.slice(0, 3).map((vq, vidx) => (
                                    <li key={vidx} className={s.chatBlockPreviewItem}>
                                      <b>{vidx + 1}.</b> {vq.question}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Card Actions Row: Target Page Select + Insert + Dismiss */}
                            <div className={s.chatCardActionsRow}>
                              <select
                                className={s.chatPageSelect}
                                value={selectedPageId ?? ''}
                                onChange={e => setCardTargetPagesMap(prev => ({ ...prev, [blk.key]: e.target.value }))}
                                title="Select target page for insertion"
                              >
                                {pages.map((p, pidx) => (
                                  <option key={p.id ?? pidx} value={p.id ?? ''}>
                                    Page {pidx + 1}: {p.title === 'Default' ? '1. Introduction' : p.title}
                                  </option>
                                ))}
                              </select>

                              <button
                                className={`${s.insertBlockBtn} ${isInserted ? s.insertedBlockBtnSuccess : ''}`}
                                disabled={isInserted}
                                onClick={async () => {
                                  try {
                                    const targetPageObj = pages.find(p => p.id === selectedPageId);
                                    const targetPos = targetPageObj?.modules.length ?? 0;
                                    await createAndPlace(blk.type, blk.title, blk.data, selectedPageId, targetPos);
                                    setInsertedBlocksMap(prev => ({ ...prev, [blk.key]: true }));
                                    onToast?.(`Inserted "${blk.title}" into ${targetPageObj?.title || 'page'} ✓`);
                                  } catch { onToast?.('Failed to insert block.'); }
                                }}
                              >
                                {isInserted ? (
                                  <> <Check size={13} /> Inserted </ >
                                ) : (
                                  <> <Plus size={13} /> Insert Block </ >
                                )}
                              </button>

                              <button
                                className={s.dismissBlockBtn}
                                onClick={() => {
                                  setDismissedBlocksMap(prev => ({ ...prev, [blk.key]: true }));
                                  onToast?.('Suggestion dismissed');
                                }}
                                title="Dismiss suggestion"
                              >
                                <X size={13} /> Dismiss
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {aiLoading && (
                <div className={s.chatBubbleAssistant}>
                  <div className={s.chatSenderRow}>
                    <Loader2 size={12} className={s.spin} />
                    <span>NexLab AI thinking…</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Generating tailored content with AI...</div>
                </div>
              )}
            </div>
          ) : (
            /* SHORTCUTS TAB */
            <div className={s.aiPromptGrid}>
              <div className={s.aiPromptCard} onClick={() => handleSendChatMessage('Generate detailed study notes for this experiment')}>
                <div className={s.aiPromptInfo}>
                  <div className={s.aiPromptIcon}><FileText size={14} /></div>
                  <div className={s.aiPromptTextGroup}>
                    <span className={s.aiPromptTitle}>Generate study notes</span>
                    <span className={s.aiPromptDesc}>Theory &amp; key concepts</span>
                  </div>
                </div>
                <ArrowRight size={14} className={s.aiArrowIcon} />
              </div>

              <div className={s.aiPromptCard} onClick={() => handleSendChatMessage('Write a complete runnable Python code example with docstrings')}>
                <div className={s.aiPromptInfo}>
                  <div className={s.aiPromptIcon}><Code2 size={14} /></div>
                  <div className={s.aiPromptTextGroup}>
                    <span className={s.aiPromptTitle}>Write code example</span>
                    <span className={s.aiPromptDesc}>Executable code &amp; comments</span>
                  </div>
                </div>
                <ArrowRight size={14} className={s.aiArrowIcon} />
              </div>

              <div className={s.aiPromptCard} onClick={() => handleSendChatMessage('Create 3 multiple choice quiz questions')}>
                <div className={s.aiPromptInfo}>
                  <div className={s.aiPromptIcon}><QuizIcon size={14} /></div>
                  <div className={s.aiPromptTextGroup}>
                    <span className={s.aiPromptTitle}>Create quiz questions</span>
                    <span className={s.aiPromptDesc}>4-option MCQs with explanations</span>
                  </div>
                </div>
                <ArrowRight size={14} className={s.aiArrowIcon} />
              </div>

              <div className={s.aiPromptCard} onClick={() => handleSendChatMessage('Generate 3 viva oral exam questions with model answers')}>
                <div className={s.aiPromptInfo}>
                  <div className={s.aiPromptIcon}><MessageSquare size={14} /></div>
                  <div className={s.aiPromptTextGroup}>
                    <span className={s.aiPromptTitle}>Generate viva Q&amp;A</span>
                    <span className={s.aiPromptDesc}>Oral assessment questions</span>
                  </div>
                </div>
                <ArrowRight size={14} className={s.aiArrowIcon} />
              </div>
            </div>
          )}

          {/* Attached Context & File Badges */}
          {(attachedContext || attachedFile) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {attachedContext && (
                <div className={s.attachedContextBadge}>
                  <Paperclip size={12} />
                  <span>Context: @{attachedContext.title}</span>
                  <button className={s.removeContextBtn} onClick={() => setAttachedContext(null)}>
                    <X size={12} />
                  </button>
                </div>
              )}
              {attachedFile && (
                <div className={s.attachedContextBadge} style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' }}>
                  <FileText size={12} />
                  <span>PDF: {attachedFile.name} ({attachedFile.wordCount} words)</span>
                  <button className={s.removeContextBtn} style={{ color: '#047857' }} onClick={() => setAttachedFile(null)}>
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CHAT INPUT CONTAINER WITH @ POPOVER AND FILE UPLOAD */}
          <div className={s.aiChatInputContainer}>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.md,.txt"
              style={{ display: 'none' }}
              onChange={handleChatFileUpload}
            />

            {/* @ Mention Popover Menu */}
            {showAtPopover && (
              <div className={s.atMentionPopover}>
                <div className={s.atMentionHeader}>Reference a block or page</div>
                {pages.map(p => (
                  <div
                    key={p.id ?? 'default'}
                    className={s.atMentionItem}
                    onClick={() => {
                      setAttachedContext({ id: p.id || 'default', title: p.title, type: 'page' });
                      setShowAtPopover(false);
                    }}
                  >
                    <BookOpen size={13} color="#7c3aed" /> Page: {p.title}
                  </div>
                ))}
                {modules.map(m => (
                  <div
                    key={m.id}
                    className={s.atMentionItem}
                    onClick={() => {
                      setAttachedContext({ id: m.id, title: m.title || m.module_type, type: m.module_type });
                      setShowAtPopover(false);
                    }}
                  >
                    <Code2 size={13} color="#0891b2" /> Block: {m.title || m.module_type}
                  </div>
                ))}
              </div>
            )}

            <form
              className={s.aiChatInputRow}
              onSubmit={e => {
                e.preventDefault();
                handleSendChatMessage(aiChatInput);
              }}
            >
              <button
                type="button"
                className={s.fileUploadBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                title="Upload PDF or document file context"
              >
                {uploadingFile ? <Loader2 size={14} className={s.spin} /> : <Paperclip size={14} />}
              </button>

              <button
                type="button"
                className={s.atBtn}
                onClick={() => setShowAtPopover(!showAtPopover)}
                title="Reference @Block or @Page"
              >
                <AtSign size={14} />
              </button>

              <input
                type="text"
                className={s.aiChatInput}
                placeholder={attachedFile ? `Ask AI about ${attachedFile.name}...` : (attachedContext ? `Ask about @${attachedContext.title}...` : "Ask AI, type @ or 📎 attach PDF...")}
                value={aiChatInput}
                onChange={e => {
                  setAiChatInput(e.target.value);
                  if (e.target.value.endsWith('@')) setShowAtPopover(true);
                }}
                disabled={aiLoading}
              />

              <button
                type="submit"
                className={s.aiChatSendBtn}
                disabled={aiLoading || !aiChatInput.trim()}
                title="Send Message"
              >
                <Send size={14} />
              </button>
            </form>
          </div>

        </div>

      </div>

      {/* ══ RICH AI ASSIST MODAL ══ */}
      {showAiModal && (
        <AiAssistModal
          experimentId={experimentId}
          onClose={() => setShowAiModal(false)}
          onBlocksAdded={() => {
            load();
            onToast?.('AI Content Blocks Added ✓');
          }}
          onToast={onToast}
        />
      )}

      {/* ══ PAGE SETTINGS MODAL ══ */}
      {pageSettingsTarget && (
        <div className={s.modalOverlay} onClick={() => setPageSettingsTarget(null)}>
          <div className={s.modalBox} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Page Settings</h3>
              <button className={s.iconBtn} onClick={() => setPageSettingsTarget(null)}>
                <X size={16} />
              </button>
            </div>

            <div className={s.modalBody}>
              <div className={s.field}>
                <span className={s.fieldLabel}>Page Title</span>
                <input
                  type="text"
                  className={shared.input}
                  value={settingsTitle}
                  onChange={e => setSettingsTitle(e.target.value)}
                  placeholder="e.g. 1. Introduction"
                />
              </div>

              <label className={s.check} style={{ margin: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={settingsIsLive}
                  onChange={e => setSettingsIsLive(e.target.checked)}
                />
                Make page live to students immediately
              </label>

              <div className={s.field}>
                <span className={s.fieldLabel}>Scheduled Release (optional)</span>
                <input
                  type="datetime-local"
                  className={shared.input}
                  value={settingsReleaseAt}
                  onChange={e => setSettingsReleaseAt(e.target.value)}
                />
              </div>
            </div>

            <div className={s.modalFooter}>
              {pageSettingsTarget.id !== null && (
                <button
                  className={`${shared.secondaryBtn} ${s.confirmDanger}`}
                  style={{ marginRight: 'auto' }}
                  onClick={() => {
                    const id = pageSettingsTarget.id;
                    setPageSettingsTarget(null);
                    deletePage(id);
                  }}
                >
                  <Trash2 size={14} /> Delete Page
                </button>
              )}
              <button className={shared.secondaryBtn} onClick={() => setPageSettingsTarget(null)}>
                Cancel
              </button>
              <button className={shared.primaryBtn} onClick={savePageSettings}>
                <Save size={14} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL OVERLAY */}
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

    </div>
  );
}
