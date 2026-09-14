'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Bot,
  Send,
  X,
  Maximize2,
  Minimize2,
  History,
  FileText,
  Globe,
  Upload,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Calendar,
  UserPlus,
  Users,
  Building2,
  BookOpen,
  ArrowRight,
  Plus,
  ExternalLink,
  Pin,
  PinOff,
  Pencil,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import {
  institutionService,
  type CopilotChatSession,
  type CopilotChatMessage,
  type CopilotDocument,
  type CopilotSource,
} from '@/services/institution.service';
import styles from './copilot.module.css';

/* ── Rich Action Configuration Map ── */
interface ActionMeta {
  label: string;
  badge: string;
  icon: React.ReactNode;
}

const ACTION_CONFIG: Record<string, ActionMeta> = {
  assign_subject_to_section: {
    label: 'Assign Subject to Section',
    badge: 'Curriculum',
    icon: <BookOpen size={15} color="#7c3aed" />,
  },
  update_user_token_quota: {
    label: 'Update User AI Token Quota',
    badge: 'AI Limits',
    icon: <Sparkles size={15} color="#059669" />,
  },
  update_ai_governance: {
    label: 'Update AI Governance Policy',
    badge: 'Governance',
    icon: <ShieldCheck size={15} color="#d97706" />,
  },
  reschedule_or_cancel_session: {
    label: 'Reschedule / Cancel Lab Session',
    badge: 'Timetable',
    icon: <Clock size={15} color="#ea580c" />,
  },
  schedule_lab_session: {
    label: 'Book Lab Session',
    badge: 'Timetable',
    icon: <Calendar size={15} color="#7c3aed" />,
  },
  create_user: {
    label: 'Create User Account',
    badge: 'Identity',
    icon: <UserPlus size={15} color="#2563eb" />,
  },
  update_user_status: {
    label: 'Update User Status / Role',
    badge: 'Identity',
    icon: <Users size={15} color="#4f46e5" />,
  },
  create_academic_department: {
    label: 'Create Academic Department',
    badge: 'Structure',
    icon: <Building2 size={15} color="#0891b2" />,
  },
  create_academic_section: {
    label: 'Create Academic Section',
    badge: 'Structure',
    icon: <Building2 size={15} color="#0891b2" />,
  },
  broadcast_announcement: {
    label: 'Broadcast Announcement',
    badge: 'Broadcast',
    icon: <Sparkles size={15} color="#9333ea" />,
  },
  draft_announcement: {
    label: 'Broadcast Announcement',
    badge: 'Broadcast',
    icon: <Sparkles size={15} color="#9333ea" />,
  },
};

const CHAT_SUGGESTIONS = [
  { icon: <Calendar size={13} />, text: 'What lab sessions are scheduled today?' },
  { icon: <Users size={13} />, text: 'Which students are at risk or have low attendance?' },
  { icon: <Sparkles size={13} />, text: 'Who consumed the most AI tokens this week?' },
  { icon: <BookOpen size={13} />, text: 'List departments, sections, and active instructors' },
];

const AGENT_SUGGESTIONS = [
  { icon: <Calendar size={13} />, text: 'Schedule a Python Lab for Section A tomorrow at 10 AM (duration 90 mins)' },
  { icon: <UserPlus size={13} />, text: 'Create a new student named Rahul Sharma with email rahul@campus.edu' },
  { icon: <Building2 size={13} />, text: 'Create a new section B for CSE 2nd Year batch' },
  { icon: <Sparkles size={13} />, text: 'Draft an announcement reminding students about upcoming lab exams' },
];

export default function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<'chat' | 'agent'>('chat');

  // Conversation Threads & Messages
  const [sessions, setSessions] = useState<CopilotChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Composer State
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState(0);

  // Cycle reasoning phases smoothly while busy
  useEffect(() => {
    if (!busy) {
      setThinkingPhase(0);
      return;
    }
    const timer = setInterval(() => {
      setThinkingPhase(p => (p + 1) % 3);
    }, 2800);
    return () => clearInterval(timer);
  }, [busy]);

  // Documents & RAG
  const [documents, setDocuments] = useState<CopilotDocument[]>([]);
  const [attachedDoc, setAttachedDoc] = useState<CopilotDocument | null>(null);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Actions Execution
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  // Auto-scroll on messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // ── Keyboard shortcut: Ctrl+K or Ctrl+/ to toggle copilot ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === '/')) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load sessions and documents when opened
  useEffect(() => {
    if (open) {
      loadSessions(true);
      loadDocuments();
    }
  }, [open]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const loadSessions = async (autoSelectFirst = false) => {
    try {
      const list = await institutionService.listCopilotSessions();
      setSessions(list);
      if (autoSelectFirst && list.length > 0 && !activeSessionIdRef.current) {
        selectSession(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load copilot sessions', err);
    }
  };

  const loadDocuments = async () => {
    try {
      const docs = await institutionService.listCopilotDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load copilot documents', err);
    }
  };

  const selectSession = async (sessionId: string) => {
    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const data = await institutionService.getCopilotSession(sessionId);
      setMessages(data.messages || []);
      if (data.session?.mode) {
        setMode(data.session.mode);
      }
    } catch (err) {
      console.error('Failed to load session messages', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const startNewConversation = () => {
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setMessages([]);
    setShowHistorySidebar(false);
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await institutionService.deleteCopilotSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionIdRef.current === sessionId) {
        startNewConversation();
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  // ── Pin / Unpin ──
  const togglePin = async (e: React.MouseEvent, session: CopilotChatSession) => {
    e.stopPropagation();
    try {
      const updated = await institutionService.updateCopilotSession(session.id, { is_pinned: !session.is_pinned });
      setSessions(prev =>
        prev.map(s => (s.id === session.id ? { ...s, is_pinned: updated.is_pinned } : s))
          .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      );
    } catch (err) {
      console.error('Failed to toggle pin', err);
    }
  };

  // ── Rename thread ──
  const startRename = (e: React.MouseEvent, session: CopilotChatSession) => {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameText(session.title);
  };

  const commitRename = async (sessionId: string) => {
    const trimmed = renameText.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      const updated = await institutionService.updateCopilotSession(sessionId, { title: trimmed });
      setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: updated.title } : s)));
    } catch (err) {
      console.error('Failed to rename session', err);
    } finally {
      setRenamingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF document.');
      return;
    }

    setUploadingDoc(true);
    try {
      const res = await institutionService.uploadCopilotDocument(file);
      setDocuments(prev => [res.document, ...prev]);
      setAttachedDoc(res.document);
      setShowDocsModal(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to upload and index PDF document.');
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await institutionService.deleteCopilotDocument(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (attachedDoc?.id === docId) {
        setAttachedDoc(null);
      }
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  };

  const sendMessage = useCallback(async (customPrompt?: string) => {
    const text = (customPrompt ?? input).trim();
    if (!text || busy) return;

    setInput('');
    const tempUserMsg: CopilotChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: activeSessionId || 'pending',
      role: 'user',
      content: text,
      mode,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setBusy(true);

    try {
      const res = await institutionService.sendCopilotMessage({
        prompt: text,
        mode,
        session_id: activeSessionId || undefined,
        doc_id: attachedDoc?.id,
        web_search: webSearch,
      });

      // Update active session id and session list
      const targetSessionId = res.session_id || activeSessionIdRef.current;
      if (targetSessionId) {
        activeSessionIdRef.current = targetSessionId;
        setActiveSessionId(targetSessionId);
        if (res.session_title) {
          setSessions(prev =>
            prev.map(s =>
              s.id === targetSessionId ? { ...s, title: res.session_title, updated_at: new Date().toISOString() } : s
            )
          );
        }
        loadSessions(false);
      }

      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
        return [...withoutTemp, res.user_message, res.assistant_message];
      });
    } catch (err: any) {
      const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.toLowerCase().includes('timeout');
      const errorMsg =
        err?.response?.status === 403
          ? 'AI Copilot is disabled in institution governance settings.'
          : err?.response?.status === 429
          ? 'Daily AI token limit reached. Adjust quota in Settings → AI Governance.'
          : isTimeout
          ? 'The AI assistant took longer than expected to process your request. If the backend is still completing the response, click this thread or refresh in a moment to view it.'
          : err?.response?.data?.error || 'Could not communicate with the AI assistant.';

      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          session_id: activeSessionId || '',
          role: 'system',
          content: `⚠️ ${errorMsg}`,
          mode,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, activeSessionId, mode, attachedDoc, webSearch]);

  const confirmAction = async (msg: CopilotChatMessage) => {
    if (!msg.pending_action) return;
    setExecutingActionId(msg.id);

    try {
      const res = await institutionService.executeCopilotAction({
        action_payload: msg.pending_action,
        message_id: msg.id,
      });

      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? {
                ...m,
                applied: true,
                pending_action: null,
                content: `${m.content}\n\n**✓ Action Executed:** ${res.result?.message || 'Done.'}`,
              }
            : m
        )
      );
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Action execution failed.');
    } finally {
      setExecutingActionId(null);
    }
  };

  const cancelAction = (msgId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? {
              ...m,
              pending_action: null,
              content: `${m.content}\n\n*(Action proposal cancelled by admin)*`,
            }
          : m
      )
    );
  };

  // Sort sessions: pinned first, then by updated_at
  const sortedSessions = [...sessions].sort(
    (a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)
              || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <div className={styles.copilotContainer}>
      {/* ── Floating Launcher ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={styles.launcherBtn}
          aria-label="Open AI Copilot"
          title="Press Ctrl+K or Ctrl+/ to toggle"
        >
          <span className={styles.pulseDot} />
          <Sparkles size={16} strokeWidth={2.2} />
          <span>Ask AI Copilot</span>
          <span className={styles.shortcutBadge}>Ctrl+K</span>
        </button>
      )}

      {/* ── Main Copilot Window ── */}
      {open && (
        <div className={`${styles.panelWindow} ${isExpanded ? styles.expandedWindow : styles.compactWindow}`}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTop}>
              <div className={styles.brandIcon}>
                <Bot size={19} strokeWidth={2.2} />
              </div>
              <div className={styles.titleArea}>
                <div className={styles.title}>
                  <span>NexLab AI Copilot</span>
                  <span className={styles.badgeEnterprise}>v2.0 Admin</span>
                </div>
                <div className={styles.subtitle}>
                  {mode === 'chat' ? 'System insights · RAG PDF search · Web' : 'Autonomous task execution & scheduling'}
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10, fontFamily: 'monospace' }}>Ctrl+K / Ctrl+/</span>
                </div>
              </div>

              <div className={styles.headerActions}>
                <button
                  onClick={() => setShowHistorySidebar(!showHistorySidebar)}
                  className={`${styles.iconBtn} ${showHistorySidebar ? styles.activeIconBtn : ''}`}
                  title="Conversation History"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={() => setShowDocsModal(true)}
                  className={`${styles.iconBtn} ${attachedDoc ? styles.activeIconBtn : ''}`}
                  title="PDF Document Library & RAG"
                >
                  <FileText size={16} />
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={styles.iconBtn}
                  title={isExpanded ? 'Compact View' : 'Expand Studio'}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => setOpen(false)} className={styles.iconBtn} title="Close">
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className={styles.modeSwitcher}>
              <button
                onClick={() => setMode('chat')}
                className={`${styles.modeTab} ${mode === 'chat' ? styles.activeModeTab : ''}`}
              >
                <Bot size={14} />
                <span>Knowledge &amp; RAG Mode</span>
              </button>
              <button
                onClick={() => setMode('agent')}
                className={`${styles.modeTab} ${mode === 'agent' ? styles.activeModeTab : ''}`}
              >
                <Sparkles size={14} />
                <span>Agent &amp; Action Mode</span>
              </button>
            </div>
          </div>

          {/* Body Container */}
          <div className={styles.bodyContainer}>
            {/* History Sidebar */}
            {showHistorySidebar && (
              <div className={styles.historySidebar}>
                <div className={styles.sidebarHeader}>
                  <span className={styles.sidebarTitle}>Past Chats</span>
                  <button onClick={() => setShowHistorySidebar(false)} className={styles.iconBtn}>
                    <X size={14} />
                  </button>
                </div>
                <button onClick={startNewConversation} className={styles.newChatBtn}>
                  <Plus size={14} /> New Conversation
                </button>
                <div className={styles.sessionList}>
                  {sortedSessions.length === 0 && (
                    <div style={{ padding: '16px 12px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                      No previous sessions recorded.
                    </div>
                  )}
                  {sortedSessions.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        selectSession(s.id);
                        if (!isExpanded) setShowHistorySidebar(false);
                      }}
                      className={`${styles.sessionItem} ${activeSessionId === s.id ? styles.activeSessionItem : ''}`}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {renamingId === s.id ? (
                          <input
                            ref={renameInputRef}
                            className={styles.renameInput}
                            value={renameText}
                            onChange={e => setRenameText(e.target.value)}
                            onBlur={() => commitRename(s.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename(s.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            placeholder="Thread title..."
                            autoFocus
                          />
                        ) : (
                          <>
                            <div className={styles.sessionTitle}>
                              {s.is_pinned && (
                                <span className={styles.pinnedBadge}>
                                  <Pin size={9} /> Pinned
                                </span>
                              )}
                              <span>{s.title}</span>
                            </div>
                            <div className={styles.sessionMeta}>
                              {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                              {s.mode.toUpperCase()}
                            </div>
                          </>
                        )}
                      </div>
                      <div className={styles.sessionActions}>
                        <button
                          onClick={e => togglePin(e, s)}
                          className={`${styles.sessionActionBtn} ${s.is_pinned ? styles.activePinned : ''}`}
                          title={s.is_pinned ? 'Unpin thread' : 'Pin thread to top'}
                        >
                          {s.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                          onClick={e => startRename(e, s)}
                          className={styles.sessionActionBtn}
                          title="Rename thread"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={e => deleteSession(e, s.id)}
                          className={`${styles.sessionActionBtn} ${styles.dangerBtn}`}
                          title="Delete thread"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document Management Modal / Drawer */}
            {showDocsModal && (
              <div className={styles.docDrawer}>
                <div className={styles.docDrawerHeader}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
                      PDF Documents &amp; RAG Index
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                      Upload university guidelines, syllabi, or lab manuals for semantic question answering.
                    </p>
                  </div>
                  <button onClick={() => setShowDocsModal(false)} className={styles.iconBtn}>
                    <X size={16} />
                  </button>
                </div>

                {/* Upload Button */}
                <div style={{ marginBottom: 14 }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="application/pdf"
                    style={{ display: 'none' }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDoc}
                    className={styles.confirmBtn}
                    style={{ background: '#7c3aed' }}
                  >
                    {uploadingDoc ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Indexing PDF...
                      </>
                    ) : (
                      <>
                        <Upload size={14} /> Upload &amp; Index New PDF
                      </>
                    )}
                  </button>
                </div>

                {/* Documents List */}
                <div className={styles.docGrid}>
                  {documents.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9ca3af' }}>
                      <FileText size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>No documents uploaded yet</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                        Upload a syllabus, lab manual, or institution circular to enable RAG.
                      </p>
                    </div>
                  )}

                  {documents.map(doc => (
                    <div key={doc.id} className={styles.docCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={20} color="#7c3aed" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{doc.filename}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {doc.page_count} pages · {doc.chunk_count} indexed chunks ·{' '}
                            {Math.round(doc.file_size / 1024)} KB
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => {
                            setAttachedDoc(attachedDoc?.id === doc.id ? null : doc);
                            setShowDocsModal(false);
                          }}
                          className={styles.pillToggle}
                          style={
                            attachedDoc?.id === doc.id
                              ? { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }
                              : {}
                          }
                        >
                          {attachedDoc?.id === doc.id ? '✓ Attached' : 'Attach for RAG'}
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className={styles.iconBtn}
                          title="Delete document"
                        >
                          <Trash2 size={14} color="#ef4444" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Canvas */}
            <div className={styles.chatCanvas}>
              <div ref={scrollRef} className={styles.messageStream}>
                {loadingMessages && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30, color: '#7c3aed' }}>
                    <Loader2 size={18} className="animate-spin" /> Loading session...
                  </div>
                )}

                {/* Empty State / Suggestions */}
                {!loadingMessages && messages.length === 0 && (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIconArea}>
                      {mode === 'chat' ? <Bot size={28} /> : <Sparkles size={28} />}
                    </div>
                    <h3 className={styles.emptyTitle}>
                      {mode === 'chat' ? 'Ask Anything Across Your Institution' : 'Autonomous Action Execution'}
                    </h3>
                    <p className={styles.emptySubtitle}>
                      {mode === 'chat'
                        ? 'Instant answers on sessions, instructor timetables, student at-risk health, AI token metrics, or uploaded PDF documents.'
                        : 'Schedule lab sessions, create students/instructors, update token quotas, configure departments, and broadcast announcements.'}
                    </p>

                    <div className={styles.suggestionGrid}>
                      {(mode === 'chat' ? CHAT_SUGGESTIONS : AGENT_SUGGESTIONS).map((s, idx) => (
                        <button key={idx} onClick={() => sendMessage(s.text)} className={styles.suggestionChip}>
                          {s.icon}
                          <span>{s.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages Feed */}
                {messages.map((m, i) => (
                  <div
                    key={m.id || i}
                    className={`${styles.messageRow} ${
                      m.role === 'user'
                        ? styles.userMessageRow
                        : m.role === 'system'
                        ? styles.systemMessageRow
                        : styles.assistantMessageRow
                    }`}
                  >
                    {/* Tool Badges */}
                    {m.tool_calls && m.tool_calls.length > 0 && (
                      <div className={styles.toolBadgesContainer}>
                        {m.tool_calls.map((tc, tcIdx) => (
                          <div key={tcIdx} className={styles.toolBadge}>
                            <span>⚡</span>
                            <span>{tc.tool}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bubble Content — markdown for assistant, plain for user/system */}
                    <div
                      className={
                        m.role === 'user'
                          ? styles.userBubble
                          : m.role === 'system'
                          ? styles.systemBubble
                          : styles.assistantBubble
                      }
                    >
                      {m.role === 'assistant' ? (
                        <div className={styles.markdownBody}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      )}

                      {/* Action Preview Card (Mode 2) */}
                      {m.pending_action && !m.applied && (() => {
                        const payload = m.pending_action;
                        if (!payload) return null;
                        const actionMeta = ACTION_CONFIG[payload.action] || {
                          label: 'Proposed Action Confirmation',
                          badge: 'Action',
                          icon: <AlertCircle size={15} color="#9333ea" />,
                        };

                        const entries = Object.entries(payload).filter(([k]) => {
                          if (['action', 'requires_confirmation', 'draft'].includes(k)) return false;
                          if (k.endsWith('_id') && payload[k.replace('_id', '_name')]) return false;
                          if (k === 'user_id' && payload.full_name) return false;
                          return true;
                        });

                        return (
                          <div className={styles.actionCard}>
                            <div className={styles.actionCardHeader}>
                              <div className={styles.actionHeaderTitle}>
                                {actionMeta.icon}
                                <span>{actionMeta.label}</span>
                              </div>
                              <span className={styles.actionBadgeType}>{actionMeta.badge}</span>
                            </div>

                            <div className={styles.actionCardBody}>
                              {entries.map(([k, v]) => {
                                let displayVal = String(v ?? 'None');
                                if (typeof v === 'boolean') {
                                  displayVal = v ? 'Enabled' : 'Disabled';
                                }
                                return (
                                  <div key={k} className={styles.actionKeyVal}>
                                    <span className={styles.actionKey}>{k.replace(/_/g, ' ')}:</span>
                                    <span className={styles.actionVal}>{displayVal}</span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className={styles.actionFooter}>
                              <button onClick={() => cancelAction(m.id)} className={styles.cancelBtn}>
                                <X size={13} /> Dismiss
                              </button>
                              <button
                                onClick={() => confirmAction(m)}
                                disabled={executingActionId === m.id}
                                className={styles.confirmBtn}
                              >
                                {executingActionId === m.id ? (
                                  <>
                                    <Loader2 size={13} className="animate-spin" /> Executing...
                                  </>
                                ) : (
                                  <>
                                    <Check size={13} /> Confirm &amp; Apply
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Applied Status Badge */}
                      {m.applied && (
                        <div style={{ marginTop: 8 }}>
                          <span className={styles.appliedBadge}>
                            <CheckCircle2 size={13} /> Executed &amp; Recorded in Audit Log
                          </span>
                        </div>
                      )}

                      {/* Sources / Citations Drawer */}
                      {m.sources && m.sources.length > 0 && (
                        <div className={styles.sourcesContainer}>
                          <div className={styles.sourcesTitle}>
                            <FileText size={12} />
                            <span>Sources &amp; References ({m.sources.length})</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {m.sources.map((src, sIdx) => (
                              <React.Fragment key={sIdx}>
                                {src.type === 'document' ? (
                                  <div className={styles.sourcePill} title={src.text}>
                                    <FileText size={11} color="#7c3aed" />
                                    <span>
                                      {src.filename} (p. {src.page})
                                    </span>
                                  </div>
                                ) : (
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.sourcePill}
                                    title={src.snippet}
                                  >
                                    <Globe size={11} color="#2563eb" />
                                    <span>{src.title || src.url}</span>
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking / Busy Indicator */}
                {busy && (
                  <div className={`${styles.messageRow} ${styles.assistantMessageRow}`}>
                    <div className={styles.thinkingCard}>
                      <div className={styles.thinkingMainRow}>
                        <div className={styles.aiOrb}>
                          <Sparkles size={16} />
                        </div>
                        <div className={styles.thinkingContent}>
                          <div className={styles.thinkingTitleRow}>
                            <span className={styles.thinkingText}>NexLab AI Thinking</span>
                            <div className={styles.thinkingWave}>
                              <span className={styles.waveDot} />
                              <span className={styles.waveDot} />
                              <span className={styles.waveDot} />
                            </div>
                          </div>
                          <span className={styles.thinkingSub}>
                            {mode === 'chat'
                              ? thinkingPhase === 0
                                ? 'Analyzing query & institutional context...'
                                : thinkingPhase === 1
                                ? 'Querying database & directory statistics...'
                                : 'Synthesizing response & formatting...'
                              : thinkingPhase === 0
                              ? 'Analyzing action intent & parameters...'
                              : thinkingPhase === 1
                              ? 'Validating permissions & database schema...'
                              : 'Generating structured proposal card...'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.thinkingProgressBar} />
                    </div>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className={styles.composerArea}>
                <div className={styles.composerTopBar}>
                  <div className={styles.pillToggleGroup}>
                    {/* Web Search Toggle */}
                    <button
                      onClick={() => setWebSearch(!webSearch)}
                      className={`${styles.pillToggle} ${webSearch ? styles.pillToggleActive : ''}`}
                      title="Toggle live Web Search"
                    >
                      <Globe size={12} />
                      <span>{webSearch ? 'Web: Active' : 'Web Search'}</span>
                    </button>

                    {/* PDF Attachment Indicator */}
                    {attachedDoc ? (
                      <div className={styles.pdfChip}>
                        <FileText size={11} />
                        <span>{attachedDoc.filename}</span>
                        <button
                          onClick={() => setAttachedDoc(null)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDocsModal(true)}
                        className={styles.pillToggle}
                        title="Attach PDF for RAG"
                      >
                        <FileText size={12} />
                        <span>Attach PDF</span>
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    Press <strong>Enter</strong> to send
                  </div>
                </div>

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className={styles.composerForm}
                >
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={
                      mode === 'chat'
                        ? "Ask about today’s sessions, instructors, at-risk students, AI tokens, or attached PDF..."
                        : 'Instruct: e.g. "Schedule Python Lab for Section A tomorrow 10am" or "Create student..."'
                    }
                    disabled={busy}
                    rows={1}
                    className={styles.composerTextarea}
                  />

                  <button type="submit" disabled={busy || !input.trim()} className={styles.sendBtn} aria-label="Send">
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
