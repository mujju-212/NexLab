'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Sparkles, Check, Loader2 } from 'lucide-react';
import { institutionService, type AgentRun } from '@/services/institution.service';

/**
 * Floating agentic-AI assistant for institution admins (WS-D).
 * - Launcher pill bottom-right; expands into a chat panel.
 * - Sends prompts to POST /ai/agent/query, renders the answer.
 * - When a run comes back `pending_confirm` (e.g. a drafted announcement),
 *   shows an "Apply & send" button wired to POST /ai/agent/runs/<id>/apply.
 */

interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  text: string;
  run?: AgentRun;          // present on assistant messages backed by a run
  applied?: boolean;       // pending action already applied
}

const SUGGESTIONS = [
  'Which sections are most at risk this month?',
  'Summarize AI usage over the last 30 days',
  'Draft an announcement reminding students about upcoming labs',
];

export default function AgentChatPanel() {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<ChatMsg[]>([]);
  const [input, setInput]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  const send = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const run = await institutionService.agentQuery(text);
      const answer = run.answer ?? run.result ?? '(no answer)';
      setMsgs(m => [...m, { role: 'assistant', text: answer, run }]);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        status === 403 ? 'The agentic assistant is disabled for your institution. Enable it in Settings → AI & Usage.'
        : status === 429 ? 'AI token quota reached. Try again later or raise the quota in Settings.'
        : e?.response?.data?.error || 'Something went wrong reaching the assistant.';
      setMsgs(m => [...m, { role: 'system', text: msg }]);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (run: AgentRun) => {
    setApplyingId(run.id);
    try {
      const res = await institutionService.agentApply(run.id);
      setMsgs(m => m.map(msg =>
        msg.run?.id === run.id ? { ...msg, applied: true } : msg,
      ).concat({ role: 'system', text: `✓ Sent to ${res.sent_to} recipient${res.sent_to === 1 ? '' : 's'}.` }));
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Could not apply the action.';
      setMsgs(m => [...m, { role: 'system', text: msg }]);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          style={{
            position: 'fixed', bottom: 26, right: 26, zIndex: 200,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
            color: '#fff', fontWeight: 700, fontSize: 13.5, fontFamily: "'Manrope', sans-serif",
            boxShadow: '0 12px 32px -8px rgba(124,58,237,.55)',
          }}
        >
          <Sparkles size={17} strokeWidth={2} /> Ask AI
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 26, right: 26, zIndex: 200,
            width: 'min(400px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 60px))',
            display: 'flex', flexDirection: 'column',
            background: '#fff', borderRadius: 20, overflow: 'hidden',
            border: '1px solid #ede9fe', fontFamily: "'Manrope', sans-serif",
            boxShadow: '0 24px 70px -18px rgba(30,20,60,.35)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
            background: 'linear-gradient(135deg, #7c3aed, #9333ea)', color: '#fff',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={17} strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>AI Assistant</p>
              <p style={{ margin: 0, fontSize: 11, opacity: .85 }}>Analytics · users · announcements</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: .9, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, background: '#faf5ff' }}>
            {msgs.length === 0 && (
              <div style={{ margin: 'auto 0', textAlign: 'center', color: '#9891a6' }}>
                <Sparkles size={26} style={{ color: '#c084fc', marginBottom: 8 }} />
                <p style={{ margin: '0 0 14px', fontSize: 13 }}>Ask about your institution&apos;s data, or draft an announcement.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      style={{
                        textAlign: 'left', fontSize: 12.5, color: '#5b21b6', cursor: 'pointer',
                        background: '#fff', border: '1px solid #ede9fe', borderRadius: 10, padding: '8px 12px',
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <div style={{
                  padding: '9px 13px', borderRadius: 13, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  ...(m.role === 'user'
                    ? { background: 'linear-gradient(135deg, #7c3aed, #9333ea)', color: '#fff', borderBottomRightRadius: 4 }
                    : m.role === 'system'
                    ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
                    : { background: '#fff', color: '#201b2e', border: '1px solid #ede9fe', borderBottomLeftRadius: 4 }),
                }}>
                  {m.text}
                </div>

                {/* Pending action → Apply button */}
                {m.run?.status === 'pending_confirm' && m.run.pending_action && !m.applied && (
                  <button
                    onClick={() => apply(m.run!)}
                    disabled={applyingId === m.run.id}
                    style={{
                      marginTop: 8, display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: '#22c55e', color: '#fff', fontSize: 12.5, fontWeight: 700,
                      opacity: applyingId === m.run.id ? .6 : 1,
                    }}>
                    {applyingId === m.run.id
                      ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                      : <><Check size={13} /> Apply &amp; send</>}
                  </button>
                )}
                {m.applied && (
                  <span style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                    <Check size={13} /> Applied
                  </span>
                )}
              </div>
            ))}

            {busy && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: '#9891a6', fontSize: 12.5 }}>
                <Loader2 size={14} className="animate-spin" /> Thinking…
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={e => { e.preventDefault(); send(input); }}
            style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #f1f5f9', background: '#fff' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={busy}
              style={{
                flex: 1, border: '1px solid #e9d5ff', borderRadius: 10, padding: '10px 13px',
                fontSize: 13, color: '#201b2e', outline: 'none', fontFamily: "'Manrope', sans-serif",
              }}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              style={{
                width: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: busy || !input.trim() ? .5 : 1,
              }}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
