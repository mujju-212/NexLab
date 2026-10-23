'use client';
/**
 * StudentScreenViewer — "click a student, see their live screen".
 *
 * Must be rendered INSIDE a <LiveKitRoom>. It subscribes to that one student's
 * published ScreenShare track (screen sharing is compulsory in a proctored lab,
 * so the track is already there — the instructor never has to ask mid-session).
 *
 * Fallbacks, in order:
 *   1. live LiveKit screen track        (what they are doing right now)
 *   2. newest 30-second screenshot frame (if the live track is not attached yet)
 *   3. an explicit empty state          (student has not shared / not joined)
 *
 * The screenshot frames keep arriving underneath this panel, so the two view
 * modes never compete: live = now, frames = the last couple of minutes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  VideoTrack, useRemoteParticipants, useLocalParticipant,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Monitor, X, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';

export interface ScreenViewTarget {
  student_id: string;
  full_name: string;
  roll_number?: string | null;
}

export interface FrameEntry {
  frames: { frame: string; ts?: string | number }[];
}

interface Props {
  target: ScreenViewTarget | null;
  /** Rolling last-N frames for this student, keyed by student_id. */
  frameEntry?: FrameEntry | null;
  onClose: () => void;
  onOpenDossier: (studentId: string) => void;
}

const FT = {
  ink: '#111827', sub: '#6b7280', line: '#e5e7eb', violet: '#7c3aed',
};

export default function StudentScreenViewer({
  target, frameEntry, onClose, onOpenDossier,
}: Props) {
  const remoteParticipants = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const [tick, setTick] = useState(0);

  // Re-check for the track periodically: a student may start sharing after the
  // panel opened (e.g. they reconnected), and LiveKit does not always force a
  // re-render on publication attach.
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setTick(t => t + 1), 4000);
    return () => clearInterval(id);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  const participant = useMemo(() => {
    if (!target) return undefined;
    const prefix = `student-${target.student_id.slice(0, 8)}`;
    return remoteParticipants.find(p => p.identity === prefix)
      || remoteParticipants.find(p => p.identity.startsWith(prefix))
      // eslint-disable-next-line react-hooks/exhaustive-deps
      || remoteParticipants.find(p => p.identity.includes(target.student_id.slice(0, 8)));
    // tick deliberately participates so the lookup is retried
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteParticipants, target, tick]);

  const sharePub = participant?.getTrackPublication(Track.Source.ScreenShare);
  const camPub = participant?.getTrackPublication(Track.Source.Camera);

  // A student who closes their screen share leaves the publication present but
  // frozen, so "there is a track" is not the same as "it is live". Watch the
  // rendered video element: if its currentTime stops advancing, the feed is dead.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!target) return;
    let last = -1;
    const iv = setInterval(() => {
      const v = stageRef.current?.querySelector('video') as HTMLVideoElement | null;
      if (!v) { setStalled(false); last = -1; return; }
      if (!v.paused && v.currentTime !== last && v.videoWidth > 0) {
        last = v.currentTime;
        setStalled(false);
      } else if (last >= 0) {
        setStalled(true);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [target]);

  const liveScreen = sharePub?.videoTrack && !sharePub.isMuted && !stalled ? sharePub : null;

  const newestFrame = frameEntry?.frames?.[0]?.frame ?? null;
  const frameCount = frameEntry?.frames?.length ?? 0;

  if (!target || typeof document === 'undefined') return null;

  // Rendered through a portal: this component lives inside the conductor's Video
  // tab, which is display:none whenever another tab is selected. A portal keeps
  // the LiveKit context (so the room subscription still works) while placing the
  // DOM at body level, where it is always visible.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95000,
        background: 'rgba(10,7,20,.72)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1080px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          background: '#0f0a1e', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,.45)',
        }}
      >
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.08)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#c4b5fd,#a78bfa)', color: '#fff',
            fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {target.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#fff' }}>
              {target.full_name}
              {target.roll_number ? (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: '#a5a0b5' }}>
                  {target.roll_number}
                </span>
              ) : null}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: liveScreen ? '#4ade80' : '#fbbf24', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />
              {liveScreen
                ? 'Live screen — updating in real time'
                : stalled && sharePub?.videoTrack
                  ? 'Feed stopped updating · showing latest 30s frame'
                  : newestFrame
                    ? `No live track · showing latest 30s frame`
                    : 'Not sharing a screen right now'}
            </p>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => onOpenDossier(target.student_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,.18)',
                background: 'rgba(255,255,255,.08)', color: '#e5e7eb', borderRadius: 9,
                padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              <ExternalLink size={13} /> Full dossier
            </button>
            <button onClick={onClose} title="Close (Esc)"
              style={{
                width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,255,255,.18)',
                background: 'rgba(255,255,255,.08)', color: '#e5e7eb', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* stage */}
        <div ref={stageRef} style={{ position: 'relative', flex: 1, minHeight: 360, background: '#080512', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {stalled && sharePub?.videoTrack ? (
            <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 2, background: 'rgba(180,83,9,.92)',
                          color: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>
              FEED STALLED — screen share looks stopped
            </div>
          ) : null}
          {liveScreen && participant ? (
            <VideoTrack
              trackRef={{ participant, publication: sharePub!, source: Track.Source.ScreenShare }}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : newestFrame ? (
            <img src={newestFrame} alt={`${target.full_name} latest screen frame`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : camPub?.videoTrack && participant ? (
            <VideoTrack
              trackRef={{ participant, publication: camPub, source: Track.Source.Camera }}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#6b5f7a', padding: 30, textAlign: 'center' }}>
              <Monitor size={42} style={{ opacity: .5 }} />
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#9d94ad' }}>
                {participant ? 'This student has not shared a screen yet' : 'This student is not in the video room'}
              </p>
              <p style={{ margin: 0, fontSize: 12, maxWidth: 380, lineHeight: 1.55 }}>
                Screen sharing is compulsory at join, so the live view appears as soon as their
                browser attaches the track. Screenshot frames will also show here.
              </p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                <RefreshCw size={12} /> checking every 4 seconds
              </span>
            </div>
          )}
        </div>

        {/* footer: the 30s frame strip keeps flowing independently */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: 'rgba(255,255,255,.05)', borderTop: '1px solid rgba(255,255,255,.08)',
          fontSize: 11.5, color: '#a5a0b5',
        }}>
          <ShieldCheck size={13} style={{ color: '#4ade80' }} />
          <span>
            Consent on record at join · {frameCount > 0
              ? `${frameCount} screenshot${frameCount === 1 ? '' : 's'} captured this session (auto, every 30s)`
              : 'no screenshot frames received yet'}
          </span>
          <span style={{ marginLeft: 'auto', color: '#6b5f7a' }}>{localParticipant?.identity ? 'Instructor view' : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
