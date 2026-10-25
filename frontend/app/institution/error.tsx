'use client';

/**
 * Route-level error boundary for the institution admin portal. Keeps a client
 * render crash from producing a blank white screen — shows the message and a
 * retry instead.
 */
import { useEffect } from 'react';

export default function InstitutionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[institution] page crashed:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, color: '#201b2e' }}>Something went wrong</h2>
      <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', maxWidth: 480, wordBreak: 'break-word' }}>
        {error.message || 'An unexpected error occurred while rendering this page.'}
      </p>
      {error.digest && (
        <p style={{ margin: 0, fontSize: 11, color: '#9891a6' }}>digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          border: 'none',
          borderRadius: 10,
          background: '#7c3aed',
          color: '#fff',
          padding: '10px 22px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
