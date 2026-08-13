'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: 'rgba(239,68,68,.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ef4444', fontSize: 22, fontWeight: 700,
          }}
        >
          ⚠
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 20px' }}>
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          style={{
            padding: '9px 22px', border: 'none', borderRadius: 10, cursor: 'pointer',
            background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
            color: '#fff', fontSize: 13.5, fontWeight: 600,
            boxShadow: '0 3px 14px rgba(147,51,234,.3)',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
