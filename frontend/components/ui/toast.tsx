'use client';

/**
 * App-wide toast system — replaces the ~8 hand-rolled per-page toast states.
 *
 * Usage (no provider wiring needed — the emitter is module-level):
 *   import { toast } from '@/components/ui/toast';
 *   toast.success('Plan updated');
 *   toast.error('Could not save');
 *
 * Mount <AppToaster /> once per role shell (InstitutionShell, InstructorShell, …)
 * and every page inherits consistent, stacked, auto-dismissing toasts.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  for (const l of listeners) l([...items]);
}

function push(kind: ToastKind, message: string, duration = 3500) {
  const item: ToastItem = { id: nextId++, kind, message };
  items = [...items, item].slice(-4); // keep at most 4 on screen
  emit();
  setTimeout(() => {
    items = items.filter(t => t.id !== item.id);
    emit();
  }, duration);
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 4500),
  info: (message: string) => push('info', message),
};

const KIND_STYLE: Record<ToastKind, { bg: string; border: string; color: string; Icon: typeof Info }> = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', Icon: CheckCircle2 },
  error: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', Icon: XCircle },
  info: { bg: '#f5f3ff', border: '#ddd6fe', color: '#5b21b6', Icon: Info },
};

export function AppToaster() {
  const [stack, setStack] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = next => setStack(next);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  if (stack.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 'min(360px, calc(100vw - 32px))',
      }}
    >
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      {stack.map(t => {
        const s = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: s.color,
              padding: '11px 14px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 10px 30px -8px rgba(30,20,60,.25)',
              animation: 'toastIn .18s ease',
            }}
          >
            <s.Icon size={16} style={{ flexShrink: 0 }} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
