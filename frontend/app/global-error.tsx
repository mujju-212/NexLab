'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8f9ff',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#111827',
          padding: 32,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
              background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 24, fontWeight: 700,
            }}
          >
            !
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-.02em' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px', border: 'none', borderRadius: 10, cursor: 'pointer',
              background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
              color: '#fff', fontSize: 14, fontWeight: 600,
              boxShadow: '0 3px 14px rgba(147,51,234,.3)',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
