'use client';

import React from 'react';
import { AlertCircle, FileQuestion, RefreshCw } from 'lucide-react';
import styles from './analytics.module.css';

export function LoadingSkeleton({ cards = 4, height = 300 }: { cards?: number; height?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className={styles.kpiGrid}>
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={`skel-kpi-${i}`}
            className={styles.kpiCard}
            style={{ minHeight: 104, opacity: 0.6, background: '#f9fafb' }}
          >
            <div style={{ height: 14, width: '40%', background: '#e5e7eb', borderRadius: 4 }} />
            <div style={{ height: 28, width: '60%', background: '#e5e7eb', borderRadius: 6, marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div
        className={styles.card}
        style={{
          height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          opacity: 0.7,
        }}
      >
        <RefreshCw size={24} className="animate-spin" style={{ color: '#7c3aed' }} />
        <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 600 }}>
          Calculating real-time analytics...
        </span>
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Failed to load analytics',
  message = 'An unexpected error occurred while communicating with the analytics service.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={styles.card}
      style={{
        padding: 40,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#fef2f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ef4444',
        }}
      >
        <AlertCircle size={26} />
      </div>
      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
        {title}
      </h3>
      <p style={{ margin: 0, maxWidth: 440, fontSize: '0.85rem', color: '#6b7280' }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`${styles.actionBtn} ${styles.primaryBtn}`}
          style={{ marginTop: 8 }}
        >
          <RefreshCw size={14} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title = 'No analytics available',
  message = 'There are no records matching your current filter criteria.',
  icon,
}: {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={styles.card}
      style={{
        padding: 40,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
        }}
      >
        {icon || <FileQuestion size={22} />}
      </div>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
        {title}
      </h3>
      <p style={{ margin: 0, maxWidth: 400, fontSize: '0.825rem', color: '#6b7280' }}>
        {message}
      </p>
    </div>
  );
}

export function LoadingState({ message = 'Loading analytics data...' }: { message?: string }) {
  return (
    <div
      className={styles.card}
      style={{
        padding: 40,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <RefreshCw size={24} className="animate-spin" style={{ color: '#7c3aed' }} />
      <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 600 }}>
        {message}
      </span>
    </div>
  );
}

