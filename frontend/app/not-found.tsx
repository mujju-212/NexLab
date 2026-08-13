import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9ff',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 32,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <p
          style={{
            fontSize: 64, fontWeight: 800, letterSpacing: '-.04em',
            background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            margin: '0 0 8px',
          }}
        >
          404
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
          Page not found
        </h2>
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 24px' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/login"
          style={{
            display: 'inline-block', padding: '10px 24px', borderRadius: 10,
            background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
            color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 3px 14px rgba(147,51,234,.3)',
          }}
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}
