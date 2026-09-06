'use client';

/**
 * ConductorConference — the custom in-session conference layout (mockup UI).
 *
 * LiveKit's stock <VideoConference/> paints its own full-screen grid over
 * everything else on the page, so instead we build the layout from hooks:
 * a large instructor stage (screen share when active, else camera), a
 * paginated student tile grid with search + grid/list views, and a full
 * control bar (mute / camera / share / record / raise hand / leave /
 * speaker-grid switch). Must render INSIDE <LiveKitRoom> (hooks need room ctx).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useLocalParticipant, useRemoteParticipants, useRoomContext,
  VideoTrack, RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, type Participant, type TrackPublication } from 'livekit-client';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, MonitorOff,
  PhoneOff, Maximize2, Minimize2, Users, Search, LayoutGrid, List as ListIcon,
  ChevronLeft, ChevronRight, Hand, CircleDot,
  LayoutTemplate, Pin, X,
} from 'lucide-react';

export interface RosterEntry {
  id: string;
  name: string;
  roll?: string | null;
  focus?: number | null;
  connected?: boolean;
  /** Latest ~30s screenshot frame (data-url) — shown on tiles by default */
  screenshot?: string | null;
}

/** Imperative screen-share API, exposed to the page via ShareBridge. */
export interface ShareApi {
  toggle: () => Promise<void>;
  pause: () => void;
}

/**
 * Renders nothing. Lives INSIDE <LiveKitRoom> and bridges the room's
 * screen-share controls to the outer page (the Present tab's floating bar
 * sits outside the room context and cannot call the hooks directly).
 */
export function ShareBridge({ apiRef, onShareChange }: {
  apiRef: React.MutableRefObject<ShareApi | null>;
  onShareChange: (sharing: boolean) => void;
}) {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();

  useEffect(() => { onShareChange(isScreenShareEnabled); }, [isScreenShareEnabled, onShareChange]);

  useEffect(() => {
    apiRef.current = {
      toggle: async () => {
        try { await localParticipant.setScreenShareEnabled(!isScreenShareEnabled); }
        catch { /* user dismissed the browser picker */ }
      },
      pause: () => {
        const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const track = pub?.track as MediaStreamTrack | undefined;
        if (track) track.enabled = !track.enabled;
      },
    };
    return () => { apiRef.current = null; };
  }, [localParticipant, isScreenShareEnabled, apiRef]);

  return null;
}

interface Props {
  /** SPARK rows — used to name tiles, colour status dots and show offline students */
  roster: RosterEntry[];
  /** Parent-tracked LiveKit screen-share state (drives badge + button) */
  shareActive: boolean;
  onToggleShare: () => void;
  /** Clicking a student tile selects them in the Student Controls panel */
  onSelectStudent: (studentId: string) => void;
  selectedStudentId?: string | null;
  /** Latest streamed screen frame (data-url) of the selected student */
  spotlightFrame?: string | null;
  /** When true, the spotlight shows the student's LIVE LiveKit track instead
      of their 30s screenshot. Toggled from Student Controls. */
  liveSpotlight?: boolean;
  /** Clear the student spotlight (return stage to instructor) */
  onClearSpotlight?: () => void;
  instructorName: string;
  /** Toast bridge to the outer page */
  notify: (msg: string) => void;
}

const initials = (name: string) =>
  name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

const PAGE_SIZE = 8; // 4 × 2 tile pages, like the mockup carousel

type Tile = {
  key: string; name: string; roll?: string | null; online: boolean; studentId?: string;
  focus?: number | null; participant?: Participant; camPub?: TrackPublication; micMuted?: boolean;
  screenshot?: string | null;
};

export default function ConductorConference({
  roster, shareActive, onToggleShare, onSelectStudent, selectedStudentId, spotlightFrame, liveSpotlight, onClearSpotlight, instructorName, notify,
}: Props) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const room = useRoomContext();
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<'speaker' | 'grid'>('speaker');
  const [tileView, setTileView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [recording, setRecording] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ctrlHover, setCtrlHover] = useState(false);   // show controls on stage hover
  const [isFullscreen, setIsFullscreen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const handleFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFs);
    document.addEventListener('webkitfullscreenchange', handleFs);
    return () => {
      document.removeEventListener('fullscreenchange', handleFs);
      document.removeEventListener('webkitfullscreenchange', handleFs);
    };
  }, []);

  // LiveKit identities look like "student-<first 8 uuid chars>"
  const rosterByPrefix = useMemo(() => {
    const map = new Map<string, RosterEntry>();
    for (const r of roster) map.set(r.id.slice(0, 8), r);
    return map;
  }, [roster]);

  // Build the tile list: live participants first (matched to the roster for
  // names), then roster students who have not joined video yet (dimmed).
  const tiles = useMemo(() => {
    const out: Tile[] = [];
    const seen = new Set<string>();
    for (const p of remoteParticipants) {
      if (p.isLocal) continue;
      const entry = rosterByPrefix.get(p.identity.replace(/^student-/, ''));
      const pub = p.getTrackPublication(Track.Source.Camera);
      out.push({
        key: p.identity,
        name: entry?.name || p.name || p.identity,
        roll: entry?.roll,
        online: true,
        studentId: entry?.id,
        focus: entry?.focus,
        participant: p,
        camPub: pub && pub.videoTrack ? pub : undefined,
        micMuted: !p.isMicrophoneEnabled,
        screenshot: entry?.screenshot,
      });
      if (entry) seen.add(entry.id);
    }
    for (const r of roster) {
      if (!seen.has(r.id)) out.push({ key: r.id, name: r.name, roll: r.roll, online: !!r.connected, studentId: r.id, focus: r.focus, screenshot: r.screenshot });
    }
    return out;
  }, [remoteParticipants, rosterByPrefix, roster]);

  const onlineCount = tiles.filter(t => t.online).length + 1; // + instructor

  // Search + pagination over the tiles
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tiles.filter(t => t.name.toLowerCase().includes(q) || (t.roll || '').toLowerCase().includes(q)) : tiles;
  }, [tiles, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageTiles = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const dotColor = (t: Tile) => {
    if (!t.online) return '#9ca3af';
    if (t.focus == null) return '#22c55e';
    return t.focus >= 60 ? '#22c55e' : t.focus >= 30 ? '#f59e0b' : '#ef4444';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const target = (view === 'grid' ? containerRef.current : stageRef.current) || stageRef.current;
      target?.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  // ── Record — captures the instructor's own published tracks locally ──────
  const toggleRecord = () => {
    if (recorderRef.current) { recorderRef.current.stop(); return; }
    const tracks: MediaStreamTrack[] = [];
    for (const src of [Track.Source.Camera, Track.Source.Microphone, Track.Source.ScreenShare]) {
      const wrapper = localParticipant.getTrackPublication(src)?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined;
      if (wrapper?.mediaStreamTrack) tracks.push(wrapper.mediaStreamTrack);
    }
    if (!tracks.length) { notify('Nothing to record — enable your camera or mic first.'); return; }
    const rec = new MediaRecorder(new MediaStream(tracks));
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-recording-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      recorderRef.current = null;
      setRecording(false);
      notify('Recording saved to your downloads.');
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    notify('Recording started (your camera, mic and shared screen).');
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    localParticipant.setAttributes({ hand_raised: next ? '1' : '' }).catch(() => undefined);
  };

  // Stage shows the screen share when active, else the instructor camera
  const stageSharePub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const stageCamPub = localParticipant.getTrackPublication(Track.Source.Camera);

  // Spotlight: when a student is selected the stage shows THEIR screen/cam
  const spotlightParticipant = useMemo(() => {
    if (!selectedStudentId) return undefined;
    const prefix = selectedStudentId.slice(0, 8);
    return remoteParticipants.find(p => p.identity === `student-${prefix}` || p.identity.includes(prefix) || p.identity === selectedStudentId);
  }, [remoteParticipants, selectedStudentId]);
  const spotSharePub = spotlightParticipant?.getTrackPublication(Track.Source.ScreenShare);
  const spotCamPub = spotlightParticipant?.getTrackPublication(Track.Source.Camera);
  const spotlightName = roster.find(r => r.id === selectedStudentId)?.name;

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
  };

  const renderTile = (t: Tile, fill = false) => (
    <div key={t.key} onClick={() => t.studentId && onSelectStudent(t.studentId)}
      title={t.roll ? `${t.name} · ${t.roll}` : t.name}
      style={{
        borderRadius: 10, overflow: 'hidden', position: 'relative',
        aspectRatio: fill ? undefined : '16/9',
        height: fill ? '100%' : undefined, minHeight: 0,
        cursor: t.studentId ? 'pointer' : 'default',
        background: '#171226',
        border: selectedStudentId && t.studentId === selectedStudentId ? '2px solid #7c3aed' : '1px solid #e5e7eb',
        opacity: t.online ? 1 : .5,
      }}>
      {/* Default view is the ~30s screenshot; camera only if no screenshot yet */}
      {t.screenshot ? (
        <img src={t.screenshot} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : t.camPub && t.participant ? (
        <VideoTrack trackRef={{
          participant: t.participant, publication: t.camPub, source: Track.Source.Camera,
        }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#c4b5fd' }}>{initials(t.name)}</span>
          <span style={{ fontSize: 9.5, color: '#9ca3af' }}>{t.online ? 'Waiting for screenshot' : 'Not joined'}</span>
        </div>
      )}
      {/* mic muted badge */}
      {t.online && t.micMuted && (
        <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(17,24,39,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MicOff size={11} color="#fff" />
        </div>
      )}
      {/* camera off badge */}
      {t.online && !t.camPub && (
        <div style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(17,24,39,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <VideoOff size={11} color="#fff" />
        </div>
      )}
      {/* name pill */}
      <div style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(17,24,39,.75)', borderRadius: 6, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 5, maxWidth: 'calc(100% - 12px)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: dotColor(t), flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
      </div>
    </div>
  );

  const arrowBtn = (disabled: boolean): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff',
    color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .35 : 1, flexShrink: 0,
  });

  // Dark-on-video circular control used inside the hover overlay
  const glassCircle = (active: boolean, danger = false): React.CSSProperties => ({
    width: 42, height: 42, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', cursor: 'pointer', color: '#fff',
    background: danger ? '#ef4444' : active ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : 'rgba(255,255,255,.18)',
    backdropFilter: 'blur(6px)', transition: 'background .12s, transform .12s',
  });

  // Control overlay — always visible at the bottom of the stage / grid (like
  // Meet/Zoom), brightening on hover. This is the ONLY control surface.
  const renderControls = () => (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
        padding: '32px 14px 14px',
        background: 'linear-gradient(transparent, rgba(0,0,0,.72))',
        opacity: ctrlHover ? 1 : 0.94,
        transition: 'opacity .16s',
        pointerEvents: 'auto',
      }}>
      <button title={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'} style={glassCircle(false, !isMicrophoneEnabled)}
        onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}>
        {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button title={isCameraEnabled ? 'Stop camera' : 'Start camera'} style={glassCircle(false, !isCameraEnabled)}
        onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}>
        {isCameraEnabled ? <VideoIcon size={18} /> : <VideoOff size={18} />}
      </button>
      <button title={shareActive ? 'Stop sharing screen' : 'Share your screen'} style={glassCircle(shareActive)}
        onClick={onToggleShare}>
        {shareActive ? <MonitorOff size={18} /> : <MonitorUp size={18} />}
      </button>
      <button title={recording ? 'Stop recording' : 'Record session'} style={glassCircle(recording)}
        onClick={toggleRecord}>
        <CircleDot size={18} />
      </button>
      <button title={handRaised ? 'Lower hand' : 'Raise hand'} style={glassCircle(handRaised)}
        onClick={toggleHand}>
        <Hand size={18} />
      </button>
      {/* view switch */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: 3, backdropFilter: 'blur(6px)' }}>
        <button title="Speaker view" onClick={() => setView('speaker')}
          style={{ width: 34, height: 34, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: view === 'speaker' ? '#fff' : 'transparent', color: view === 'speaker' ? '#7c3aed' : '#fff' }}>
          <LayoutTemplate size={15} />
        </button>
        <button title="Grid view" onClick={() => setView('grid')}
          style={{ width: 34, height: 34, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: view === 'grid' ? '#fff' : 'transparent', color: view === 'grid' ? '#7c3aed' : '#fff' }}>
          <LayoutGrid size={15} />
        </button>
      </div>
      <button title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={glassCircle(isFullscreen)} onClick={toggleFullscreen}>
        {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
      <button title="Leave video room" onClick={() => room.disconnect()}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 42, borderRadius: 999, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
        <PhoneOff size={16} /> Leave
      </button>
    </div>
  );

  return (
    <div ref={containerRef} style={{ minHeight: 640, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Remote audio (students' mics + shared screens) */}
      <RoomAudioRenderer />

      {view === 'speaker' ? (
        <>
          {/* ── Instructor stage — hover to reveal controls; drag corner to resize ── */}
          <div ref={stageRef}
            onMouseEnter={() => setCtrlHover(true)}
            onMouseLeave={() => { setCtrlHover(false); setMoreOpen(false); }}
            style={{
              position: 'relative',
              flex: isFullscreen ? '1 1 100%' : '0 0 auto',
              height: isFullscreen ? '100vh' : 340,
              width: isFullscreen ? '100vw' : '100%',
              minHeight: isFullscreen ? '100vh' : 200,
              maxHeight: isFullscreen ? '100vh' : 640,
              borderRadius: isFullscreen ? 0 : 16,
              background: '#0f0a1e',
              overflow: 'hidden',
              resize: isFullscreen ? 'none' : 'vertical',
              zIndex: isFullscreen ? 99999 : undefined,
            }}>
            {selectedStudentId ? (
              /* When student has an active LiveKit screen track, prioritize showing it live.
                 Otherwise show their latest 30s screenshot snapshot or camera. */
              spotSharePub?.track && spotlightParticipant ? (
                <VideoTrack trackRef={{
                  participant: spotlightParticipant, publication: spotSharePub, source: Track.Source.ScreenShare,
                }} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : liveSpotlight && spotCamPub?.track && spotlightParticipant ? (
                <VideoTrack trackRef={{
                  participant: spotlightParticipant, publication: spotCamPub, source: Track.Source.Camera,
                }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : spotlightFrame ? (
                <img src={spotlightFrame} alt="student screen" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6b5f7a' }}>
                  <VideoIcon size={40} style={{ opacity: .5 }} />
                  <p style={{ margin: 0, fontSize: 12.5 }}>
                    Waiting for {spotlightName || 'student'}'s screen…
                  </p>
                </div>
              )
            ) : stageSharePub?.track ? (
              <VideoTrack trackRef={{
                participant: localParticipant, publication: stageSharePub, source: Track.Source.ScreenShare,
              }} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : stageCamPub?.track ? (
              <VideoTrack trackRef={{
                participant: localParticipant, publication: stageCamPub, source: Track.Source.Camera,
              }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6b5f7a' }}>
                <VideoIcon size={40} style={{ opacity: .5 }} />
                <p style={{ margin: 0, fontSize: 12.5 }}>Camera is off</p>
              </div>
            )}

            {/* identity / spotlight badge */}
            <div style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(17,24,39,.75)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              {selectedStudentId ? (
                <>
                  <MonitorUp size={12} /> Viewing: {spotlightName || 'Student'}
                  {onClearSpotlight && (
                    <button onClick={onClearSpotlight} title="Back to your view"
                      style={{ marginLeft: 2, width: 18, height: 18, borderRadius: 5, border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <X size={11} />
                    </button>
                  )}
                </>
              ) : (
                <><Pin size={12} /> You (Instructor)</>
              )}
            </div>
            {/* sharing badge */}
            {shareActive && (
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(34,197,94,.9)', borderRadius: 8, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                <MonitorUp size={12} /> Sharing with students
              </div>
            )}
            {/* hand raised badge */}
            {handRaised && !shareActive && (
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(245,158,11,.9)', borderRadius: 8, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Hand size={12} /> Hand raised
              </div>
            )}
            {/* rec + fullscreen */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 25 }}>
              {recording && (
                <div style={{ background: 'rgba(220,38,38,.9)', borderRadius: 8, padding: '5px 9px', fontSize: 11, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: '#fff', animation: 'pulse 1s infinite' }} /> REC
                </div>
              )}
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: isFullscreen ? 'linear-gradient(135deg,#7c3aed,#9333ea)' : 'rgba(17,24,39,.75)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isFullscreen ? '0 2px 8px rgba(124,58,237,.5)' : 'none',
                  transition: 'background .15s',
                }}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>

            {/* Camera picture-in-picture — shown while sharing your screen so
                students still see your face in the corner */}
            {!selectedStudentId && stageSharePub?.track && stageCamPub?.track && (
              <div style={{ position: 'absolute', right: 12, bottom: 72, width: 150, aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 4px 14px rgba(0,0,0,.4)', background: '#0f0a1e' }}>
                <VideoTrack trackRef={{
                  participant: localParticipant, publication: stageCamPub, source: Track.Source.Camera,
                }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span style={{ position: 'absolute', left: 5, bottom: 4, fontSize: 9.5, color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,.8)' }}>You</span>
              </div>
            )}

            {/* Hover control overlay */}
            {renderControls()}
          </div>

          {/* ── Students card — fixed height, drag bottom-right to resize ── */}
          <div style={{ ...card, flex: '0 0 auto', height: 280, minHeight: 200, maxHeight: 640, display: 'flex', flexDirection: 'column', overflow: 'hidden', resize: 'vertical' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Students ({roster.length})</span>
              <span style={{ flex: 1 }} />
              {/* grid / list toggle */}
              <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
                <button title="Grid view" onClick={() => setTileView('grid')}
                  style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tileView === 'grid' ? '#fff' : 'transparent', color: tileView === 'grid' ? '#7c3aed' : '#6b7280' }}>
                  <LayoutGrid size={12} />
                </button>
                <button title="List view" onClick={() => setTileView('list')}
                  style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tileView === 'list' ? '#fff' : 'transparent', color: tileView === 'list' ? '#7c3aed' : '#6b7280' }}>
                  <ListIcon size={12} />
                </button>
              </div>
              {/* search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px' }}>
                <Search size={12} color="#9ca3af" />
                <input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}
                  placeholder="Search students…"
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, width: 120, color: '#111827' }} />
              </div>
              {/* pager */}
              <button style={arrowBtn(safePage === 0)} disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft size={14} /></button>
              <button style={arrowBtn(safePage >= pages - 1)} disabled={safePage >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))}><ChevronRight size={14} /></button>
            </div>

            {/* body */}
            {tileView === 'grid' ? (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: 6, padding: '10px 10px 12px' }}>
                <button style={{ ...arrowBtn(safePage === 0), alignSelf: 'center' }} disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft size={14} /></button>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignContent: 'start' }}>
                    {pageTiles.map(t => renderTile(t))}
                  </div>
                </div>
                <button style={{ ...arrowBtn(safePage >= pages - 1), alignSelf: 'center' }} disabled={safePage >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))}><ChevronRight size={14} /></button>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map(t => (
                  <div key={t.key} onClick={() => t.studentId && onSelectStudent(t.studentId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10,
                      border: selectedStudentId && t.studentId === selectedStudentId ? '1px solid #7c3aed' : '1px solid #e5e7eb',
                      background: '#fff', cursor: t.studentId ? 'pointer' : 'default', opacity: t.online ? 1 : .55,
                    }}>
                    <div style={{ width: 30, height: 30, borderRadius: 99, background: 'linear-gradient(135deg,#c4b5fd,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {initials(t.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{t.roll || '—'}</p>
                    </div>
                    {t.online && (t.micMuted ? <MicOff size={13} color="#dc2626" /> : <Mic size={13} color="#6b7280" />)}
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: dotColor(t), flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Grid view: everyone equal, instructor included ── */
        <div
          onMouseEnter={() => setCtrlHover(true)}
          onMouseLeave={() => { setCtrlHover(false); setMoreOpen(false); }}
          style={{ ...card, flex: 1, minHeight: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} /> Everyone ({onlineCount})
            </span>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px' }}>
              <Search size={12} color="#9ca3af" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search students…"
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, width: 120, color: '#111827' }} />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, alignContent: 'start' }}>
            {/* instructor tile */}
            <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', position: 'relative', background: '#171226', border: '1px solid #e5e7eb' }}>
              {stageCamPub?.track ? (
                <VideoTrack trackRef={{
                  participant: localParticipant, publication: stageCamPub, source: Track.Source.Camera,
                }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#c4b5fd' }}>
                  {initials(instructorName)}
                </div>
              )}
              <div style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(17,24,39,.75)', borderRadius: 6, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: '#22c55e' }} />
                <span style={{ fontSize: 10.5, color: '#fff', fontWeight: 600 }}>{instructorName} (You)</span>
              </div>
            </div>
            {filtered.map(t => renderTile(t))}
          </div>
          {/* Hover control overlay (grid view) */}
          {renderControls()}
        </div>
      )}
    </div>
  );
}
