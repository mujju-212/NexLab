'use client';

import Link from 'next/link';
import { BookOpen, Building2, ShieldCheck } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';

export default function AcademicScopePage() {
  return (
    <AdminShell activePage="Academic Setup" title="Academic Setup" subtitle="Tenant-scoped academic structure">
      <section style={{ maxWidth: 760, margin: '36px auto', background: 'rgba(255,255,255,.76)', border: '1px solid #ece9f2', borderRadius: 18, padding: 28 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#5b3cc4', background: '#eee9ff' }}><ShieldCheck size={22} /></div>
        <h1 style={{ margin: '16px 0 8px', color: '#241e35', fontSize: 22 }}>Academic structure belongs to each institution</h1>
        <p style={{ color: '#625b70', fontSize: 14, lineHeight: 1.65, margin: '0 0 18px' }}>
          Platform admins can inspect institution-level information, but departments, batches, sections, and subjects are created and maintained in the institution’s own portal. This page does not expose a cross-tenant editor, so a central action cannot accidentally alter the wrong tenant.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/admin/institutions" style={linkStyle}><Building2 size={15} /> Browse institutions</Link>
          <Link href="/admin/analytics" style={secondaryLink}><BookOpen size={15} /> View cross-institution analytics</Link>
        </div>
      </section>
    </AdminShell>
  );
}

const linkStyle: React.CSSProperties = { display: 'inline-flex', gap: 7, alignItems: 'center', textDecoration: 'none', background: '#5b3cc4', color: '#fff', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700 };
const secondaryLink: React.CSSProperties = { display: 'inline-flex', gap: 7, alignItems: 'center', textDecoration: 'none', background: '#fff', color: '#473d60', border: '1px solid #ddd8e8', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700 };
