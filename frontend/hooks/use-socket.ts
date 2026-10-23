'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

// ── Payload types — mirror backend/app/sockets/events.py exactly ─────────────

export interface StudentJoinedPayload {
  student_id: string;
  full_name: string;
  timestamp: string;
}

export interface StudentLeftPayload {
  student_id: string;
  full_name?: string;
  timestamp: string;
}

export interface FocusUpdatePayload {
  student_id: string;
  full_name?: string;
  focus_score: number;
  signals?: Record<string, number>;
  alerts: string[];
  timestamp: string;
}

export interface ProctorAlertPayload {
  type: 'tab_switch' | 'fullscreen_exit' | 'screen_share_stopped' | 'lockdown_violation';
  student_id: string;
  full_name: string;
  detail: string;
  count?: number;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface CheckpointUpdatePayload {
  student_id: string;
  full_name: string;
  checkpoint_number: number;
  test_cases_passed: number;
  timestamp: string;
}

export interface BehavioralSignals {
  tab_switches_per_min?: number;
  idle_seconds?: number;
  typing_speed_wpm?: number;
  backspace_ratio?: number;
  copy_paste_count?: number;
  window_focus_ratio?: number;
}

export interface StudentScreenshotPayload {
  student_id: string;
  full_name: string;
  frame: string;       // base64 JPEG data-URL: 'data:image/jpeg;base64,...'
  timestamp: string;   // ISO-8601 UTC
}

export interface ModeChangedPayload {
  mode: string;
  rules: { code: string; quiz: string; submit: boolean | string; proctor: string; label: string };
  from?: string;
  reason?: string;
}

export interface DirectCheckpointPayload {
  checkpoint_id: string;
  student_id: string;
  status: string;   // verified | failed | manual_pass | manual_fail | claimed
}

export interface ChatMessagePayload {
  id: string;
  session_id: string;
  from_id: string;
  to_id: string | null;
  text: string;
  at: string;
  from_name?: string;
}

export interface ProctorPolicyPayload {
  policy: {
    lockdown_fullscreen: boolean; block_copy_paste: boolean; block_tab_switch: boolean;
    plagiarism_scan: boolean; focus_ml: boolean; webcam_required: boolean;
  };
  page_id: string | null;
}

export interface ForceSubmitPayload {
  reason: string;
  timestamp: string;
}

export interface PageLaunchedPayload {
  page_id: string;
  page_title: string;
  mode: string;
  timer_ends_at: string | null;
}

export interface QuizLaunchedPayload {
  module_id: string;
  module_title: string;
}

export interface MediaControlPayload {
  action: 'mute' | 'camera' | 'remove';
  value: boolean;
  student_id: string;
}

interface UseSocketOptions {
  sessionId: string;
  enabled?: boolean;
  // Callbacks for events from server → client
  onJoined?:           (data: { room: string; session_id: string }) => void;
  onStudentJoined?:    (data: StudentJoinedPayload) => void;
  onStudentLeft?:      (data: StudentLeftPayload) => void;
  onCodeResult?:       (data: { status: string; stdout: string; stderr: string }) => void;
  onFocusUpdate?:      (data: FocusUpdatePayload) => void;
  onProctorAlert?:     (data: ProctorAlertPayload) => void;
  onCheckpointUpdate?: (data: CheckpointUpdatePayload) => void;
  onSessionStarted?:   (data: { session_id: string }) => void;
  onSessionEnded?:     (data: { session_id: string }) => void;
  onInstructorMessage?: (data: { message: string; from: string; timestamp: string }) => void;
  onScreenshotFrame?:  (data: StudentScreenshotPayload) => void;
  // Conductor events
  onModeChanged?:      (data: ModeChangedPayload) => void;
  onDirectCheckpoint?: (data: DirectCheckpointPayload) => void;
  onChatMessage?:      (data: ChatMessagePayload) => void;
  onProctorPolicy?:    (data: ProctorPolicyPayload) => void;
  onPageLaunched?:     (data: PageLaunchedPayload) => void;
  onQuizLaunched?:     (data: QuizLaunchedPayload) => void;
  onForceSubmit?:      (data: ForceSubmitPayload) => void;
  onMyCheckpoint?:     (data: DirectCheckpointPayload) => void;
  onTimerExpired?:     (data: { session_id: string; page_id: string | null; page_title: string; passed_count: number; total_count: number; timestamp: string }) => void;
  onPollUpdate?:       (data: { poll_id: string; results: number[]; responses_count: number }) => void;
  onPollClosed?:       (data: { id: string; results: number[]; responses_count: number }) => void;
  onMediaControl?:     (data: MediaControlPayload) => void;
  /** Instructor asked to view this student's screen (consent prompt). */
  onScreenShareRequest?: (data: { session_id?: string; instructor_name?: string }) => void;
  /** Sharing was stopped during a proctored session — the student must resume. */
  onReshareRequest?:     (data: { message?: string }) => void;
  /** Full session state sent on join/reconnect — the client's catch-up path. */
  onSessionState?:       (data: any) => void;
  onError?:            (msg: string) => void;
}

/**
 * useSocket — connects to Flask-SocketIO backend for live lab sessions.
 *
 * Callbacks are forwarded through refs so changing a callback (e.g. because
 * a parent state value it closes over changed) does NOT re-register socket
 * listeners and does NOT re-create the socket connection. This eliminates the
 * chief source of lag: a re-render that changes `onForceSubmit` (which closes
 * over `gate`, `language`, `stdin`) was previously tearing down and re-building
 * every socket listener on every keystroke in the stdin box.
 *
 * Backend socket events are in: backend/app/sockets/events.py
 * Event names use underscore style (join_session, student_joined, proctor_alert).
 * Transport: polling first (required for Flask-SocketIO threading mode on Python 3.13)
 */
export function useSocket({
  sessionId,
  enabled = true,
  onJoined,
  onStudentJoined,
  onStudentLeft,
  onCodeResult,
  onFocusUpdate,
  onProctorAlert,
  onCheckpointUpdate,
  onSessionStarted,
  onSessionEnded,
  onInstructorMessage,
  onScreenshotFrame,
  onModeChanged,
  onDirectCheckpoint,
  onChatMessage,
  onProctorPolicy,
  onPageLaunched,
  onQuizLaunched,
  onForceSubmit,
  onMyCheckpoint,
  onTimerExpired,
  onPollUpdate,
  onPollClosed,
  onMediaControl,
  onScreenShareRequest,
  onReshareRequest,
  onSessionState,
  onError,
}: UseSocketOptions) {
  const socketRef    = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // ── Stable callback refs — updated every render, never cause re-registration ─
  // The socket listener calls the ref's current value; the ref always holds the
  // latest callback without the socket needing to be re-created.
  const cbScreenShareReq    = useRef(onScreenShareRequest);
  const cbReshareReq        = useRef(onReshareRequest);
  const cbSessionState      = useRef(onSessionState);
  const cbJoined            = useRef(onJoined);
  const cbStudentJoined     = useRef(onStudentJoined);
  const cbStudentLeft       = useRef(onStudentLeft);
  const cbCodeResult        = useRef(onCodeResult);
  const cbFocusUpdate       = useRef(onFocusUpdate);
  const cbProctorAlert      = useRef(onProctorAlert);
  const cbCheckpointUpdate  = useRef(onCheckpointUpdate);
  const cbSessionStarted    = useRef(onSessionStarted);
  const cbSessionEnded      = useRef(onSessionEnded);
  const cbInstructorMessage = useRef(onInstructorMessage);
  const cbScreenshotFrame   = useRef(onScreenshotFrame);
  const cbModeChanged       = useRef(onModeChanged);
  const cbDirectCheckpoint  = useRef(onDirectCheckpoint);
  const cbChatMessage       = useRef(onChatMessage);
  const cbProctorPolicy     = useRef(onProctorPolicy);
  const cbPageLaunched      = useRef(onPageLaunched);
  const cbQuizLaunched      = useRef(onQuizLaunched);
  const cbForceSubmit       = useRef(onForceSubmit);
  const cbMyCheckpoint      = useRef(onMyCheckpoint);
  const cbTimerExpired      = useRef(onTimerExpired);
  const cbPollUpdate        = useRef(onPollUpdate);
  const cbPollClosed        = useRef(onPollClosed);
  const cbMediaControl      = useRef(onMediaControl);
  const cbError             = useRef(onError);

  // Keep refs in sync with latest props — no socket reconnect needed
  cbJoined.current            = onJoined;
  cbStudentJoined.current     = onStudentJoined;
  cbStudentLeft.current       = onStudentLeft;
  cbCodeResult.current        = onCodeResult;
  cbFocusUpdate.current       = onFocusUpdate;
  cbProctorAlert.current      = onProctorAlert;
  cbCheckpointUpdate.current  = onCheckpointUpdate;
  cbSessionStarted.current    = onSessionStarted;
  cbSessionEnded.current      = onSessionEnded;
  cbInstructorMessage.current = onInstructorMessage;
  cbScreenshotFrame.current   = onScreenshotFrame;
  cbModeChanged.current       = onModeChanged;
  cbDirectCheckpoint.current  = onDirectCheckpoint;
  cbChatMessage.current       = onChatMessage;
  cbProctorPolicy.current     = onProctorPolicy;
  cbPageLaunched.current      = onPageLaunched;
  cbQuizLaunched.current      = onQuizLaunched;
  cbForceSubmit.current       = onForceSubmit;
  cbMyCheckpoint.current      = onMyCheckpoint;
  cbTimerExpired.current      = onTimerExpired;
  cbPollUpdate.current        = onPollUpdate;
  cbPollClosed.current        = onPollClosed;
  cbMediaControl.current      = onMediaControl;
  cbScreenShareReq.current    = onScreenShareRequest;
  cbReshareReq.current        = onReshareRequest;
  cbSessionState.current      = onSessionState;
  cbError.current             = onError;

  useEffect(() => {
    if (!sessionId || !enabled) return;

    const token      = Cookies.get('access_token');
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

    const socket = io(SOCKET_URL, {
      auth:       { token },
      // polling-only avoids websocket handshake failure when running on development server
      transports: ['polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join_session', { session_id: sessionId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('connect_error', (err) => {
      cbError.current?.(`Connection error: ${err.message}`);
    });

    socket.on('error', (msg: string) => cbError.current?.(msg));

    // ── Server → Client events — each listener delegates to the stable ref ────
    // The listeners are registered once per sessionId/enabled change.
    // Callback identity changes in the parent never cause re-registration.
    socket.on('joined',                    (d) => cbJoined.current?.(d));
    socket.on('student_joined',            (d) => cbStudentJoined.current?.(d));
    socket.on('student_left',              (d) => cbStudentLeft.current?.(d));
    socket.on('code_result',               (d) => cbCodeResult.current?.(d));
    socket.on('student_focus_update',      (d) => cbFocusUpdate.current?.(d));
    socket.on('proctor_alert',             (d) => cbProctorAlert.current?.(d));
    socket.on('student_checkpoint_update', (d) => cbCheckpointUpdate.current?.(d));
    socket.on('session_started',           (d) => cbSessionStarted.current?.(d));
    socket.on('session_ended',             (d) => cbSessionEnded.current?.(d));
    socket.on('instructor_message',        (d) => cbInstructorMessage.current?.(d));
    socket.on('student_screenshot',        (d) => cbScreenshotFrame.current?.(d));
    socket.on('session_mode_changed',      (d) => cbModeChanged.current?.(d));
    socket.on('checkpoint_update',         (d) => cbDirectCheckpoint.current?.(d));
    socket.on('chat_message',              (d) => cbChatMessage.current?.(d));
    socket.on('proctor_policy_updated',    (d) => cbProctorPolicy.current?.(d));
    // The backend has always emitted these two; nothing listened, so an
    // instructor asking to see a student's screen produced no prompt at all.
    socket.on('screenshare_request',       (d) => cbScreenShareReq.current?.(d));
    socket.on('reshare_screen_request',    (d) => cbReshareReq.current?.(d));
    // Sent by the server on every join/join-again: whatever was pushed while we
    // were not in the room is recovered from here instead of being lost.
    socket.on('session_state',             (d) => cbSessionState.current?.(d));
    // Page / quiz launch: Conductor emits conductor_* to instructor room and
    // student_* to student room — listen to both so either side works.
    socket.on('conductor_page_launched',   (d) => cbPageLaunched.current?.(d));
    socket.on('student_page_launched',     (d) => cbPageLaunched.current?.(d));
    socket.on('conductor_quiz_launched',   (d) => cbQuizLaunched.current?.(d));
    socket.on('student_quiz_launched',     (d) => cbQuizLaunched.current?.(d));
    socket.on('force_submission',          (d) => cbForceSubmit.current?.(d));
    socket.on('my_checkpoint_update',      (d) => cbMyCheckpoint.current?.(d));
    socket.on('timer_expired',             (d) => cbTimerExpired.current?.(d));
    socket.on('poll_update',               (d) => cbPollUpdate.current?.(d));
    socket.on('poll_closed',               (d) => cbPollClosed.current?.(d));
    socket.on('media_control',             (d) => cbMediaControl.current?.(d));

    return () => {
      socket.emit('leave_session', { session_id: sessionId });
      socket.disconnect();
      socketRef.current = null;
    };
  // Only reconnect when sessionId or enabled changes — NOT when callbacks change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, enabled]);

  // ── Client → Server: Proctoring events ────────────────────────────────────

  const emitTabSwitch = useCallback((count = 1) => {
    socketRef.current?.emit('tab_switch', { session_id: sessionId, count });
  }, [sessionId]);

  const emitFullscreenExit = useCallback(() => {
    socketRef.current?.emit('fullscreen_exit', { session_id: sessionId });
  }, [sessionId]);

  const emitLockdownViolation = useCallback((action: string) => {
    socketRef.current?.emit('lockdown_violation', { session_id: sessionId, action });
  }, [sessionId]);

  /**
   * Behavioral signals sent every ~30s by the student client.
   * Field names MUST match backend handle_behavioral_signals:
   * tab_switches_per_min, idle_seconds, typing_speed_wpm,
   * backspace_ratio, copy_paste_count, window_focus_ratio
   */
  const emitBehavioralSignals = useCallback((signals: BehavioralSignals) => {
    socketRef.current?.emit('behavioral_signals', { session_id: sessionId, ...signals });
  }, [sessionId]);

  const emitScreenShareStopped = useCallback(() => {
    socketRef.current?.emit('screen_share_stopped', { session_id: sessionId });
  }, [sessionId]);

  const emitCheckpointPassed = useCallback((checkpointNumber: number, testCasesPassed: number) => {
    socketRef.current?.emit('checkpoint_passed', {
      session_id: sessionId,
      checkpoint_number: checkpointNumber,
      test_cases_passed: testCasesPassed,
    });
  }, [sessionId]);

  // ── Client → Server: Instructor control events ────────────────────────────

  const emitBroadcast = useCallback((message: string) => {
    socketRef.current?.emit('instructor_broadcast', { session_id: sessionId, message });
  }, [sessionId]);

  const emitMessageStudent = useCallback((studentId: string, message: string) => {
    socketRef.current?.emit('message_student', { session_id: sessionId, student_id: studentId, message });
  }, [sessionId]);

  const emitSessionExtended = useCallback((addedMinutes: number) => {
    socketRef.current?.emit('session_extended', { session_id: sessionId, added_minutes: addedMinutes });
  }, [sessionId]);

  const emitForceSubmit = useCallback((studentId: string, reason?: string) => {
    socketRef.current?.emit('force_submit', { session_id: sessionId, student_id: studentId, reason });
  }, [sessionId]);

  /**
   * Heartbeat — call every ~30s from the live-lab page.
   * The server accumulates elapsed_seconds into SessionAttendance.total_time_seconds.
   * Reaching 1800s (30 min) is required for _finalize_attendance to mark a student 'present'.
   */
  const emitHeartbeat = useCallback((elapsedSeconds = 30) => {
    socketRef.current?.emit('heartbeat', { session_id: sessionId, elapsed_seconds: elapsedSeconds });
  }, [sessionId]);

  /**
   * Send a JPEG screenshot frame to the instructor monitoring grid.
   * @param dataUrl  base64 data-URL from canvas.toDataURL('image/jpeg', 0.6)
   */
  const emitScreenshot = useCallback((dataUrl: string) => {
    socketRef.current?.emit('screenshot_frame', { session_id: sessionId, frame: dataUrl });
  }, [sessionId]);

  return {
    isConnected,
    emitTabSwitch,
    emitFullscreenExit,
    emitLockdownViolation,
    emitBehavioralSignals,
    emitScreenShareStopped,
    emitCheckpointPassed,
    emitBroadcast,
    emitMessageStudent,
    emitSessionExtended,
    emitForceSubmit,
    emitHeartbeat,
    emitScreenshot,
  };
}
