'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService } from '@/services/admin.service';
import {
  RefreshCw, Cpu, Building2, Search, TrendingUp,
} from 'lucide-react';
import styles from '../dashboard/page.module.css';

interface InstUsage {
  institution_id: string;
  name: string;
  plan: string;
  calls: number;
  tokens: number;
  cost_usd: number;
  by_feature: Record<string, number>;
}

const FEATURE_LABELS: Record<string, string> = {
  hint: 'Hints',
  chat: 'Chat',
  code_assist: 'Code Assist',
  viva_generate: 'Viva Gen',
  viva_evaluate: 'Viva Eval',
  agent: 'Agent',
};

export default function AdminAiUsagePage() {
  const [rows, setRows] = useState<InstUsage[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await adminService.getAiUsageCrossInstitution(d);
      setRows(res.institutions ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const totalTokens = rows.reduce((a, r) => a + r.tokens, 0);
  const totalCalls = rows.reduce((a, r) => a + r.calls, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost_usd, 0);
  const maxTokens = Math.max(...rows.map(r => r.tokens), 1);
  const filtered = rows.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminShell activePage="Monitoring">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>
            AI Usage — Cross-Institution
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9891a6' }}>
            Token consumption, calls and estimated cost per institution (C6 roll-up)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd6ee', fontSize: 13, background: '#fff' }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => load(days)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid #ddd6ee', background: '#fff', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Tokens', value: totalTokens.toLocaleString(), Icon: Cpu, color: '#0ea5e9' },
          { label: 'Total AI Calls', value: totalCalls.toLocaleString(), Icon: TrendingUp, color: '#9333ea' },
          { label: 'Est. Total Cost', value: `$${totalCost.toFixed(2)}`, Icon: Building2, color: '#16a34a' },
          { label: 'Institutions', value: String(rows.length), Icon: Building2, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.9)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <s.Icon size={15} style={{ color: s.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#201b2e' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, maxWidth: 380 }}>
        <Search size={14} style={{ color: '#9891a6' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter institutions…"
          style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #ddd6ee', fontSize: 13, outline: 'none' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.9)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#faf9ff', textAlign: 'left' }}>
              {['Institution', 'Plan', 'Calls', 'Tokens', 'Cost', 'Share', 'Top Features'].map(h => (
                <th key={h} style={{ padding: '11px 14px', fontSize: 11.5, fontWeight: 700, color: '#726a85', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#9891a6' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#9891a6' }}>No AI activity in this window.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.institution_id} style={{ borderTop: '1px solid #f1ecfb' }}>
                <td style={{ padding: '12px 14px', fontWeight: 700, color: '#201b2e' }}>{r.name}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: 'rgba(147,51,234,0.08)', padding: '2px 9px', borderRadius: 20, textTransform: 'capitalize' }}>{r.plan}</span>
                </td>
                <td style={{ padding: '12px 14px', color: '#726a85' }}>{r.calls.toLocaleString()}</td>
                <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0ea5e9' }}>{r.tokens.toLocaleString()}</td>
                <td style={{ padding: '12px 14px', color: '#16a34a' }}>${r.cost_usd.toFixed(4)}</td>
                <td style={{ padding: '12px 14px', minWidth: 140 }}>
                  <div style={{ height: 7, borderRadius: 6, background: 'rgba(14,165,233,0.1)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 6,
                      width: `${Math.max((r.tokens / maxTokens) * 100, r.tokens > 0 ? 3 : 0)}%`,
                      background: 'linear-gradient(90deg,#0ea5e9,#38bdf8)',
                    }} />
                  </div>
                </td>
                <td style={{ padding: '12px 14px', color: '#726a85', fontSize: 12 }}>
                  {Object.entries(r.by_feature)
                    .sort((a, b) => b[1] - a[1]).slice(0, 3)
                    .map(([f, c]) => `${FEATURE_LABELS[f] ?? f}: ${c}`).join(' · ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
