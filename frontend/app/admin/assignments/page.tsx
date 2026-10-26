'use client';

import Link from 'next/link';
import { ArrowRight, Building2, ClipboardList, ShieldCheck } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';

export default function AssignmentScopePage() {
  return (
    <AdminShell activePage="Assignments" title="Assignments" subtitle="Instructor allocation is managed within each tenant">
      <section style={{ maxWidth: 760, margin: '36px auto', background: 'rgba(255,255,255,.76)', border: '1px solid #ece9f2', borderRadius: 18, padding: 28 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#5b3cc4', background: '#eee9ff' }}><ShieldCheck size={22} /></div>
        <h1 style={{ margin: '16px 0 8px', color: '#241e35', fontSize: 22 }}>Assignments are institution-scoped</h1>
        <p style={{ color: '#625b70', fontSize: 14, lineHeight: 1.65, margin: '0 0 18px' }}>
          Assigning subjects to sections and instructors changes tenant-owned academic data. Platform admins do not receive a global assignment editor here; use the institution’s own portal and authorization context instead.
        </p>
        <Link href="/admin/institutions" style={linkStyle}><Building2 size={15} /> Select an institution <ArrowRight size={14} /></Link>
        <p style={{ color: '#817a90', fontSize: 12, marginTop: 14 }}><ClipboardList size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />Existing institutional records remain untouched by this page.</p>
      </section>
    </AdminShell>
  );
}

const linkStyle: React.CSSProperties = { display: 'inline-flex', gap: 7, alignItems: 'center', textDecoration: 'none', background: '#5b3cc4', color: '#fff', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700 };
