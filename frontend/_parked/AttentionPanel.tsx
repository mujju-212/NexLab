'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Zap } from 'lucide-react';
import { experienceService } from '@/services/experience.service';

interface AttentionItem {
  signal: string;
  title: string;
  detail: string;
  severity: number;  // 1..3
  link: string;
}

interface QuickAction { action: string; link: string; }

const SEV_COLORS: Record<number, { bg: string; border: string; color: string; label: string }> = {
  1: { bg: 'rgba(255,251,235,.9)', border: 'rgba(245,158,11,.25)', color: '#b45309', label: 'Low' },
  2: { bg: 'rgba(254,242,242,.9)', border: 'rgba(239,68,68,.22)',  color: '#b91c1c', label: 'Med' },
  3: { bg: 'rgba(254,226,226,.95)', border: 'rgba(220,38,38,.35)', color: '#991b1b', label: 'High' },
};

export default function AttentionPanel() {
  const router = useRouter();
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [hasActive, setHasActive] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await experienceService.dashboardAttention();
      setAttention(data.attention);
      setQuickActions(data.quick_actions);
      setHasActive(data.has_active_session);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Targeted refresh of Zone B every 30s when a session is active (DB5)
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  if (loading) return <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto', display: 'block' }} />;

  return (
    <div style={{
      background: '#fff', borderRadius: 18, border: '1px solid #fff',
      boxShadow: '0 2px 12px rgba(124,58,237,.07)', padding: '18px 20px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <AlertTriangle size={16} color={attention.length ? '#f59e0b' : '#9ca3af'} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827', flex: 1 }}>Attention Needed</h3>
        {attention.length === 0 && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>All clear ✓</span>}
      </div>

      {attention.length === 0 && !loading ? (
        <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
          Nothing needs your attention right now.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {attention.map(a => {
            const s = SEV_COLORS[a.severity] || SEV_COLORS[1];
            return (
              <button key={a.signal} onClick={() => router.push(a.link)}
                style={{
                  textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '12px 14px',
                  border: `1px solid ${s.border}`, background: s.bg,
                  transition: 'transform .15s, box-shadow .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color,
                    background: '#fff', borderRadius: 999, padding: '1px 8px' }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111827' }}>{a.title}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{a.detail}</div>
              </button>
            );
          })}
        </div>
      )}

      {quickActions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
          <Zap size={14} style={{ color: '#7c3aed', alignSelf: 'center' }} />
          {quickActions.map(qa => (
            <button key={qa.action} onClick={() => router.push(qa.link)}
              style={{
                padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(147,51,234,.2)',
                background: 'rgba(245,243,255,.8)', color: '#6d28d9', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Geist',sans-serif", transition: 'all .15s',
              }}>
              {qa.action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
