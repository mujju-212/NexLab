'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminService, type Institution, type CreateInstitutionDto } from '@/services/admin.service';
import AdminShell from '@/components/layout/AdminShell';
import {
  Plus, Search, Building2, RefreshCw, CheckCircle2, XCircle,
  ChevronRight, Shield, Zap, Crown, Eye, EyeOff, Copy, Check,
  MoreVertical, AlertTriangle, Users, FlaskConical
} from 'lucide-react';
import styles from './institutions.module.css';

const PLAN_META = {
  free:       { label: 'Free',       color: '#64748b', bg: 'rgba(100,116,139,0.15)', icon: Shield },
  pro:        { label: 'Pro',        color: '#9333ea', bg: 'rgba(147,51,234,0.15)', icon: Zap   },
  enterprise: { label: 'Enterprise', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: Crown },
};

// ── Create Institution Modal ──────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (result: { institution: Institution; admin_user: { email: string }; temp_password: string }) => void;
}) {
  const [form, setForm] = useState<CreateInstitutionDto>({
    name: '', code: '', contact_email: '',
    email_domain: '', address: '',
    plan: 'free', admin_password: '', admin_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = (k: keyof CreateInstitutionDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code || !form.contact_email) {
      setError('Name, Code, and Contact Email are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await adminService.createInstitution({
        ...form,
        code: form.code.toUpperCase(),
        // Only send optional fields if non-empty
        email_domain:    form.email_domain    || undefined,
        address:         form.address         || undefined,
        admin_password:  form.admin_password  || undefined,
        admin_name:      form.admin_name      || undefined,
      });
      onCreated(result);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Failed to create institution.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIcon}><Building2 size={20} color="#9333ea" /></div>
          <div>
            <h2 className={styles.modalTitle}>Register New Institution</h2>
            <p className={styles.modalSub}>Creates institution + institution admin account automatically</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit} className={styles.modalForm}>
          <div className={styles.fieldGrid}>
            {/* Required */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldSection}>Required Information</p>

              <div className={styles.field}>
                <label className={styles.label}>Institution Name *</label>
                <input className={styles.input} placeholder="e.g. Kumaraguru College of Technology"
                  value={form.name} onChange={handle('name')} required />
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Institution Code *</label>
                  <input className={styles.input} placeholder="e.g. KCT" maxLength={20}
                    value={form.code} onChange={handle('code')}
                    style={{ textTransform: 'uppercase' }} required />
                  <span className={styles.hint}>Short unique code. Auto-uppercased.</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Plan *</label>
                  <select className={styles.input} value={form.plan} onChange={handle('plan')}>
                    <option value="free">Free (100 students, 50 AI/day)</option>
                    <option value="pro">Pro (500 students, 200 AI/day)</option>
                    <option value="enterprise">Enterprise (Unlimited)</option>
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Admin Contact Email *</label>
                <input className={styles.input} type="email" placeholder="admin@institution.edu"
                  value={form.contact_email} onChange={handle('contact_email')} required />
                <span className={styles.hint}>This email becomes the institution admin login.</span>
              </div>
            </div>

            {/* Optional */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldSection}>Optional Details</p>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Email Domain</label>
                  <input className={styles.input} placeholder="institution.edu"
                    value={form.email_domain} onChange={handle('email_domain')} />
                  <span className={styles.hint}>For email verification</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Admin Name</label>
                  <input className={styles.input} placeholder="Institution Admin"
                    value={form.admin_name} onChange={handle('admin_name')} />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Address</label>
                <input className={styles.input} placeholder="City, State, Country"
                  value={form.address} onChange={handle('address')} />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Temp Admin Password</label>
                <input className={styles.input} type="text" placeholder="Leave blank → ChangeMe@123"
                  value={form.admin_password} onChange={handle('admin_password')} />
                <span className={styles.hint}>Institution admin must change on first login.</span>
              </div>
            </div>
          </div>

          {error && <div className={styles.errorBox}><AlertTriangle size={14} />{error}</div>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnCreate} disabled={loading}>
              {loading ? <><RefreshCw size={14} className={styles.spin} /> Creating…</> : <><Plus size={14} /> Create Institution</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Success Modal — show created credentials ──────────────────────────────────

function CredentialsModal({ data, onClose }: {
  data: { institution: Institution; admin_user: { email: string }; temp_password: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: 480 }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIcon} style={{ background: 'rgba(34,197,94,0.15)' }}>
            <CheckCircle2 size={20} color="#22c55e" />
          </div>
          <div>
            <h2 className={styles.modalTitle}>Institution Created!</h2>
            <p className={styles.modalSub}>{data.institution.name} — Code: {data.institution.code}</p>
          </div>
        </div>

        <div className={styles.credBox}>
          <p className={styles.credLabel}>Share these credentials with the institution admin:</p>
          <div className={styles.credRow}>
            <span className={styles.credKey}>Login Email</span>
            <span className={styles.credVal}>{data.admin_user.email}</span>
          </div>
          <div className={styles.credRow}>
            <span className={styles.credKey}>Temp Password</span>
            <span className={styles.credVal} style={{ fontFamily: 'monospace' }}>{data.temp_password}</span>
            <button className={styles.copyBtn} onClick={() => copy(`Email: ${data.admin_user.email}\nPassword: ${data.temp_password}`)}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className={styles.credRow}>
            <span className={styles.credKey}>Plan</span>
            <span className={styles.credVal}>{data.institution.plan}</span>
          </div>
          <div className={styles.credNote}>
            ⚠️ Admin must change their password on first login. Store these safely.
          </div>
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btnCreate} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InstitutionsClient() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [credResult, setCredResult] = useState<{
    institution: Institution;
    admin_user: { email: string };
    temp_password: string;
  } | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminService.listInstitutions();
      setInstitutions(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (result: {
    institution: Institution;
    admin_user: { email: string };
    temp_password: string;
  }) => {
    setShowCreate(false);
    setCredResult(result);
    load(); // refresh list
  };

  const toggleStatus = async (inst: Institution) => {
    setActionLoading(inst.id);
    try {
      if (inst.is_active) {
        await adminService.suspendInstitution(inst.id, 'Suspended by platform admin');
      } else {
        await adminService.activateInstitution(inst.id);
      }
      await load();
    } finally {
      setActionLoading(null);
      setActionMenu(null);
    }
  };

  const filtered = institutions.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.code.toLowerCase().includes(search.toLowerCase()) ||
    i.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  // Summary stats
  const total  = institutions.length;
  const active = institutions.filter(i => i.is_active).length;
  const byPlan = { free: 0, pro: 0, enterprise: 0 };
  institutions.forEach(i => { if (i.plan in byPlan) byPlan[i.plan as keyof typeof byPlan]++; });

  return (
    <AdminShell activePage="Institutions">
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Institutions</h1>
          <p className={styles.subtitle}>Manage all registered institutions on the platform</p>
        </div>
        <button className={styles.btnCreate} onClick={() => setShowCreate(true)}>
          <Plus size={15} strokeWidth={2.5} /> Register Institution
        </button>
      </div>

      {/* Summary Stats */}
      <div className={styles.statsRow}>
        {[
          { label: 'Total',     value: total,          color: '#9333ea' },
          { label: 'Active',    value: active,          color: '#22c55e' },
          { label: 'Suspended', value: total - active,  color: '#ef4444' },
          { label: 'Free',      value: byPlan.free,     color: '#64748b' },
          { label: 'Pro',       value: byPlan.pro,      color: '#9333ea' },
          { label: 'Enterprise',value: byPlan.enterprise,color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className={styles.statPill}>
            <span className={styles.statPillVal} style={{ color: s.color }}>{s.value}</span>
            <span className={styles.statPillLbl}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search by name, code or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className={styles.btnRefresh} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? styles.spin : ''} /> Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={22} className={styles.spin} />
          <span>Loading institutions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <Building2 size={40} className={styles.emptyIcon} />
          <p>{search ? 'No institutions match your search.' : 'No institutions yet. Register the first one!'}</p>
          {!search && <button className={styles.btnCreate} onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Register First Institution
          </button>}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Institution</th>
                <th>Code</th>
                <th>Plan</th>
                <th>Admin Email</th>
                <th>Status</th>
                <th>Onboarding</th>
                <th>Checklist</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inst => {
                const plan = PLAN_META[inst.plan] ?? PLAN_META.free;
                const PlanIcon = plan.icon;
                const checklist = inst.checklist ?? {};
                const checkCount = Object.values(checklist).filter(Boolean).length;

                return (
                  <tr key={inst.id} className={styles.row}>
                    {/* Name */}
                    <td>
                      <div className={styles.instName}>
                        <div className={styles.instAvatar}>
                          {inst.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className={styles.nameText}>{inst.name}</p>
                          {inst.email_domain && <p className={styles.nameSub}>{inst.email_domain}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Code */}
                    <td><span className={styles.codePill}>{inst.code}</span></td>

                    {/* Plan */}
                    <td>
                      <span className={styles.planBadge} style={{ color: plan.color, background: plan.bg }}>
                        <PlanIcon size={11} /> {plan.label}
                      </span>
                    </td>

                    {/* Admin Email */}
                    <td className={styles.emailCell}>{inst.contact_email}</td>

                    {/* Status */}
                    <td>
                      {inst.is_active
                        ? <span className={styles.statusActive}><CheckCircle2 size={13} /> Active</span>
                        : <span className={styles.statusSuspended}><XCircle size={13} /> Suspended</span>
                      }
                    </td>

                    {/* Onboarding */}
                    <td>
                      <span className={
                        inst.onboarding_status === 'active'    ? styles.obActive :
                        inst.onboarding_status === 'pending'   ? styles.obPending : styles.obSuspended
                      }>
                        {inst.onboarding_status}
                      </span>
                    </td>

                    {/* Checklist mini */}
                    <td>
                      <div className={styles.checkRow}>
                        <Users size={12} aria-label="Users" className={checklist.has_users ? styles.checkOk : styles.checkNo} />
                        <FlaskConical size={12} aria-label="Experiments" className={checklist.has_experiments ? styles.checkOk : styles.checkNo} />
                        <Zap size={12} aria-label="Environment" className={checklist.has_environment ? styles.checkOk : styles.checkNo} />
                        <span className={styles.checkScore}>{checkCount}/3</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className={styles.actionsCell}>
                      <div style={{ position: 'relative' }}>
                        <button
                          className={styles.moreBtn}
                          onClick={() => setActionMenu(actionMenu === inst.id ? null : inst.id)}
                        >
                          <MoreVertical size={15} />
                        </button>
                        {actionMenu === inst.id && (
                          <div className={styles.actionMenu}>
                            <button className={styles.actionItem}
                              onClick={() => toggleStatus(inst)}
                              disabled={actionLoading === inst.id}>
                              {actionLoading === inst.id
                                ? <RefreshCw size={13} className={styles.spin} />
                                : inst.is_active ? <EyeOff size={13} /> : <Eye size={13} />
                              }
                              {inst.is_active ? 'Suspend' : 'Activate'}
                            </button>
                            <button className={styles.actionItem}>
                              <ChevronRight size={13} /> View Details
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {credResult && (
        <CredentialsModal data={credResult} onClose={() => setCredResult(null)} />
      )}
    </AdminShell>
  );
}
