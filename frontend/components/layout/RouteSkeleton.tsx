'use client';

/**
 * Shared navigation skeleton — rendered instantly while the dashboard
 * route chunk compiles/streams. Kills the "frozen login page" feel.
 */
export default function RouteSkeleton({ label = 'Loading your dashboard…' }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg,#f7f5fd 0%,#fdfbff 60%,#f4f0fb 100%)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Manrope', sans-serif",
      }}
      aria-busy="true"
      aria-label={label}
    >
      {/* Top bar */}
      <div style={{
        height: 58, borderBottom: '1px solid #ece7f7', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg,#7c3aed,#9333ea)' }} />
          <div className="skel" style={{ width: 90, height: 12, borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skel" style={{ width: 200, height: 30, borderRadius: 10 }} />
          <div className="skel" style={{ width: 32, height: 32, borderRadius: 10 }} />
          <div className="skel" style={{ width: 90, height: 32, borderRadius: 10 }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '26px 28px', maxWidth: 1280, width: '100%', margin: '0 auto' }}>
        <div className="skel" style={{ width: 260, height: 22, borderRadius: 8, marginBottom: 8 }} />
        <div className="skel" style={{ width: 420, height: 13, borderRadius: 6, marginBottom: 26 }} />

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 26 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skel" style={{ height: 92, borderRadius: 16 }} />
          ))}
        </div>

        {/* Panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
          <div className="skel" style={{ height: 260, borderRadius: 18 }} />
          <div className="skel" style={{ height: 260, borderRadius: 18 }} />
        </div>
      </div>

      <style jsx global>{`
        .skel {
          position: relative;
          overflow: hidden;
          background: #ece7f7;
          display: block;
        }
        .skel::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent);
          animation: skel-wave 1.3s infinite;
        }
        @keyframes skel-wave {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
