'use client';

import React from 'react';

// ── Shared Shimmer Styles ────────────────────────────────────────────────────
const ShimmerStyles = () => (
  <style jsx global>{`
    @keyframes practice-shimmer {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }
    .ps-skel {
      position: relative;
      overflow: hidden;
      background: #edf0f5;
      border-radius: 8px;
    }
    .ps-skel::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      transform: translateX(-100%);
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0) 0%,
        rgba(255, 255, 255, 0.65) 50%,
        rgba(255, 255, 255, 0) 100%
      );
      animation: practice-shimmer 1.5s infinite ease-in-out;
      pointer-events: none;
    }
  `}</style>
);

// ── 1. Dashboard Skeleton ────────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1380, margin: '0 auto', width: '100%' }}>
      <ShimmerStyles />
      
      {/* Hero Banner */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 22,
          padding: '28px 32px',
          border: '1px solid #e2e8f0',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="ps-skel" style={{ width: '45%', height: 28, borderRadius: 10, marginBottom: 12 }} />
          <div className="ps-skel" style={{ width: '70%', height: 16, borderRadius: 8, marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="ps-skel" style={{ width: 140, height: 38, borderRadius: 10 }} />
            <div className="ps-skel" style={{ width: 130, height: 38, borderRadius: 10 }} />
          </div>
        </div>
        <div className="ps-skel" style={{ width: 180, height: 120, borderRadius: 16 }} />
      </div>

      {/* 4 Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: '20px 22px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="ps-skel" style={{ width: 80, height: 14, borderRadius: 6 }} />
              <div className="ps-skel" style={{ width: 34, height: 34, borderRadius: 10 }} />
            </div>
            <div className="ps-skel" style={{ width: 90, height: 26, borderRadius: 8, marginBottom: 8 }} />
            <div className="ps-skel" style={{ width: '60%', height: 12, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Main 2-Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24 }}>
        {/* Left Column: Courses In Progress & Next Up */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="ps-skel" style={{ width: 180, height: 20, borderRadius: 8, marginBottom: 18 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <div className="ps-skel" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="ps-skel" style={{ width: '50%', height: 16, borderRadius: 6, marginBottom: 8 }} />
                    <div className="ps-skel" style={{ width: '80%', height: 10, borderRadius: 4 }} />
                  </div>
                  <div className="ps-skel" style={{ width: 70, height: 32, borderRadius: 8 }} />
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="ps-skel" style={{ width: 200, height: 20, borderRadius: 8, marginBottom: 18 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="ps-skel" style={{ width: 12, height: 12, borderRadius: '50%' }} />
                    <div className="ps-skel" style={{ width: 140, height: 14, borderRadius: 6 }} />
                  </div>
                  <div className="ps-skel" style={{ width: 50, height: 22, borderRadius: 6 }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Quest Level & Mastery */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="ps-skel" style={{ width: 140, height: 18, borderRadius: 8, marginBottom: 16 }} />
            <div className="ps-skel" style={{ width: '100%', height: 110, borderRadius: 14, marginBottom: 16 }} />
            <div className="ps-skel" style={{ width: '100%', height: 12, borderRadius: 6 }} />
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="ps-skel" style={{ width: 160, height: 18, borderRadius: 8, marginBottom: 16 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="ps-skel" style={{ height: 74, borderRadius: 12 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 2. Courses Catalog Skeleton ──────────────────────────────────────────────
export function CoursesCatalogSkeleton() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1380, margin: '0 auto', width: '100%' }}>
      <ShimmerStyles />

      {/* Hero Banner Skeleton */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 22,
          padding: '28px 32px',
          border: '1px solid #e2e8f0',
          marginBottom: 24,
        }}
      >
        <div className="ps-skel" style={{ width: 220, height: 28, borderRadius: 10, marginBottom: 10 }} />
        <div className="ps-skel" style={{ width: 480, height: 16, borderRadius: 8, marginBottom: 20 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="ps-skel" style={{ width: 100, height: 28, borderRadius: 20 }} />
          <div className="ps-skel" style={{ width: 110, height: 28, borderRadius: 20 }} />
        </div>
      </div>

      {/* Filter Row */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 18,
          padding: '16px 20px',
          border: '1px solid #e2e8f0',
          marginBottom: 24,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="ps-skel" style={{ width: 280, height: 40, borderRadius: 10 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ps-skel" style={{ width: 90, height: 36, borderRadius: 10 }} />
          ))}
        </div>
      </div>

      {/* 6 Course Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 260,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div className="ps-skel" style={{ width: 44, height: 44, borderRadius: 12 }} />
              <div className="ps-skel" style={{ width: 68, height: 22, borderRadius: 12 }} />
            </div>
            <div className="ps-skel" style={{ width: '75%', height: 20, borderRadius: 6, marginBottom: 10 }} />
            <div className="ps-skel" style={{ width: '95%', height: 14, borderRadius: 6, marginBottom: 8 }} />
            <div className="ps-skel" style={{ width: '60%', height: 14, borderRadius: 6, marginBottom: 20 }} />
            <div style={{ marginTop: 'auto' }}>
              <div className="ps-skel" style={{ width: '100%', height: 8, borderRadius: 4, marginBottom: 14 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="ps-skel" style={{ width: 70, height: 14, borderRadius: 6 }} />
                <div className="ps-skel" style={{ width: 85, height: 32, borderRadius: 8 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 3. Practice Library Skeleton ─────────────────────────────────────────────
export function LibrarySkeleton() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1380, margin: '0 auto', width: '100%' }}>
      <ShimmerStyles />

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="ps-skel" style={{ width: 200, height: 26, borderRadius: 8, marginBottom: 8 }} />
          <div className="ps-skel" style={{ width: 320, height: 14, borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="ps-skel" style={{ width: 110, height: 36, borderRadius: 10 }} />
          <div className="ps-skel" style={{ width: 110, height: 36, borderRadius: 10 }} />
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: '16px 20px',
          border: '1px solid #e2e8f0',
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div className="ps-skel" style={{ width: 280, height: 38, borderRadius: 10 }} />
        <div className="ps-skel" style={{ width: 120, height: 38, borderRadius: 10 }} />
        <div className="ps-skel" style={{ width: 120, height: 38, borderRadius: 10 }} />
        <div className="ps-skel" style={{ width: 120, height: 38, borderRadius: 10 }} />
      </div>

      {/* Problem Rows Table */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 18,
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div className="ps-skel" style={{ width: 100, height: 14, borderRadius: 6 }} />
          <div className="ps-skel" style={{ width: 80, height: 14, borderRadius: 6 }} />
        </div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
              <div className="ps-skel" style={{ width: 18, height: 18, borderRadius: 4 }} />
              <div className="ps-skel" style={{ width: `${35 + (i % 4) * 10}%`, height: 16, borderRadius: 6 }} />
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <div className="ps-skel" style={{ width: 64, height: 22, borderRadius: 12 }} />
              <div className="ps-skel" style={{ width: 50, height: 14, borderRadius: 6 }} />
              <div className="ps-skel" style={{ width: 60, height: 14, borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. Progress / Growth Skeleton ────────────────────────────────────────────
export function ProgressSkeleton() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1380, margin: '0 auto', width: '100%' }}>
      <ShimmerStyles />

      {/* Header Bar */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="ps-skel" style={{ width: 160, height: 26, borderRadius: 8, marginBottom: 8 }} />
          <div className="ps-skel" style={{ width: 340, height: 14, borderRadius: 6 }} />
        </div>
        <div className="ps-skel" style={{ width: 120, height: 36, borderRadius: 10 }} />
      </div>

      {/* Tab Pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="ps-skel" style={{ width: 110, height: 36, borderRadius: 20 }} />
        ))}
      </div>

      {/* 3 Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 24 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: '22px 24px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="ps-skel" style={{ width: 100, height: 14, borderRadius: 6, marginBottom: 12 }} />
            <div className="ps-skel" style={{ width: 80, height: 28, borderRadius: 8, marginBottom: 8 }} />
            <div className="ps-skel" style={{ width: 140, height: 12, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Chart Panel */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: 26,
          border: '1px solid #e2e8f0',
          minHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div className="ps-skel" style={{ width: 220, height: 18, borderRadius: 6 }} />
        <div className="ps-skel" style={{ width: '100%', height: 180, borderRadius: 12 }} />
      </div>
    </div>
  );
}

// ── 5. Profile Skeleton ──────────────────────────────────────────────────────
export function ProfileSkeleton() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1380, margin: '0 auto', width: '100%' }}>
      <ShimmerStyles />

      {/* Profile Hero Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 22,
          padding: '28px 32px',
          border: '1px solid #e2e8f0',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div className="ps-skel" style={{ width: 80, height: 80, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="ps-skel" style={{ width: 200, height: 24, borderRadius: 8, marginBottom: 8 }} />
          <div className="ps-skel" style={{ width: 140, height: 14, borderRadius: 6, marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="ps-skel" style={{ width: 90, height: 24, borderRadius: 12 }} />
            <div className="ps-skel" style={{ width: 110, height: 24, borderRadius: 12 }} />
          </div>
        </div>
      </div>

      {/* Stats Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: 18,
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="ps-skel" style={{ width: 70, height: 12, borderRadius: 6, marginBottom: 8 }} />
            <div className="ps-skel" style={{ width: 50, height: 22, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      {/* Badges Grid */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: 24,
          border: '1px solid #e2e8f0',
        }}
      >
        <div className="ps-skel" style={{ width: 160, height: 20, borderRadius: 8, marginBottom: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="ps-skel" style={{ height: 100, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
