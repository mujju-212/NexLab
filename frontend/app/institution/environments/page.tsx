'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PackagePlus, RefreshCw, Send } from 'lucide-react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';

type EnvironmentProfile = { id: string; name: string; display_name: string; docker_image: string; build_status: string; is_platform_default: boolean; institution_id: string | null; pip_packages: string[]; apt_packages: string[] };

export default function InstitutionEnvironmentRequestsPage() {
  const [profiles, setProfiles] = useState<EnvironmentProfile[]>([]);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [image, setImage] = useState('');
  const [pipPackages, setPipPackages] = useState('');
  const [aptPackages, setAptPackages] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await institutionService.getEnvironments();
      setProfiles(result.environments || []);
    } catch (e) { setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not load environment requests.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    const split = (value: string) => value.split(',').map(x => x.trim()).filter(Boolean);
    try {
      const result = await institutionService.requestEnvironmentProfile({
        name: name.trim().toLowerCase(), display_name: displayName.trim(), docker_image: image.trim(),
        pip_packages: split(pipPackages), apt_packages: split(aptPackages),
      });
      setNotice(result.message || 'Request submitted.');
      setName(''); setDisplayName(''); setImage(''); setPipPackages(''); setAptPackages('');
      await load();
    } catch (e) { setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not submit the request.'); }
    finally { setSaving(false); }
  };

  return (
    <InstitutionShell activePage="Environment Requests" title="Environment Requests" subtitle="Request custom runtime profiles for platform review">
      <main style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
        <div role="note" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#fff7e6', border: '1px solid #f3ddb0', color: '#805c18', borderRadius: 11, padding: 13, marginBottom: 18, fontSize: 12.5, lineHeight: 1.5 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /><span><strong>Runtime limitation:</strong> requests can be reviewed and recorded, but this deployment has no image builder. Approved custom images are not built, selected, or run; execution uses the standard runtime.</span>
        </div>
        {error && <div role="alert" style={alertStyle}>{error}</div>}{notice && <div role="status" style={noticeStyle}>{notice}</div>}

        <form onSubmit={submit} style={cardStyle}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, margin: '0 0 14px', color: '#302a41' }}><PackagePlus size={18} /> Request a profile</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <label style={labelStyle}>Short name (lowercase slug)<input value={name} maxLength={40} pattern="[a-z0-9][a-z0-9-]{1,39}" onChange={e => setName(e.target.value)} placeholder="data-science" style={inputStyle} required /></label>
            <label style={labelStyle}>Display name<input value={displayName} maxLength={120} onChange={e => setDisplayName(e.target.value)} placeholder="Data Science lab" style={inputStyle} required /></label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Image reference<input value={image} maxLength={255} onChange={e => setImage(e.target.value)} placeholder="registry.example.org/team/image:tag" style={inputStyle} required /></label>
            <label style={labelStyle}>Python packages (comma-separated)<input value={pipPackages} onChange={e => setPipPackages(e.target.value)} placeholder="numpy==1.26, pandas" style={inputStyle} /></label>
            <label style={labelStyle}>System packages (comma-separated)<input value={aptPackages} onChange={e => setAptPackages(e.target.value)} placeholder="build-essential, libpq-dev" style={inputStyle} /></label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button type="submit" disabled={saving} style={primaryButton}>{saving ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Submit for review</button></div>
        </form>

        <section style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><h2 style={{ fontSize: 17, margin: 0, color: '#302a41' }}>Profiles and requests</h2><button type="button" onClick={() => void load()} disabled={loading} style={buttonStyle}><RefreshCw size={14} /> Refresh</button></div>
          {loading ? <p style={{ color: '#716b80' }}>Loading…</p> : profiles.length === 0 ? <div style={{ ...cardStyle, textAlign: 'center', color: '#716b80' }}>No environment profiles or requests are available to this institution.</div> : <div style={{ display: 'grid', gap: 10 }}>
            {profiles.map(profile => <article key={profile.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong style={{ color: '#302a41' }}>{profile.display_name}</strong><span style={{ fontSize: 11, fontWeight: 750, color: profile.build_status === 'active' ? '#216e39' : '#805c18', background: profile.build_status === 'active' ? '#e9f8ef' : '#fff4dc', padding: '4px 8px', borderRadius: 999 }}>{profile.build_status.toUpperCase()}</span></div>
              <div style={{ fontSize: 12, color: '#716b80', marginTop: 6 }}>{profile.name} · {profile.is_platform_default ? 'Platform default' : 'Institution request'} · image: {profile.docker_image}</div>
              {(profile.pip_packages?.length > 0 || profile.apt_packages?.length > 0) && <div style={{ fontSize: 12, color: '#716b80', marginTop: 6 }}>Packages: {[...(profile.pip_packages || []), ...(profile.apt_packages || [])].join(', ')}</div>}
            </article>)}
          </div>}
        </section>
      </main>
    </InstitutionShell>
  );
}

const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,.8)', border: '1px solid #ece9f2', borderRadius: 14, padding: 18 };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 7, color: '#514a60', fontWeight: 700, fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd8e8', borderRadius: 9, padding: '10px 11px', font: 'inherit', fontSize: 13, color: '#302a41', background: '#fff' };
const buttonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 11px', borderRadius: 9, border: '1px solid #ddd8e8', background: '#fff', color: '#433b55', cursor: 'pointer', fontWeight: 650, fontSize: 12 };
const primaryButton: React.CSSProperties = { ...buttonStyle, background: '#5b3cc4', color: '#fff', borderColor: '#5b3cc4' };
const alertStyle: React.CSSProperties = { background: '#fff0f0', border: '1px solid #f5c4c4', color: '#a4262c', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 };
const noticeStyle: React.CSSProperties = { background: '#effaf2', border: '1px solid #c8ead0', color: '#216e39', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 };
