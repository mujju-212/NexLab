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
  onError?:            (msg: string) => void;
}

/**
 * useSocket — connects to Flask-SocketIO backend for live lab sessions.
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
  onError,
}: UseSocketOptions) {
  const socketRef   = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId || !enabled) return;

    const token      = Cookies.get('access_token');
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

    const socket = io(SOCKET_URL, {
      auth:       { token },
      // polling MUST come before websocket for Flask-SocketIO threading mode
      transports: ['polling', 'websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // Join the session room immediately on connect
      socket.emit('join_session', { session_id: sessionId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('connect_error', (err) => {
      onError?.(`Connection error: ${err.message}`);
    });

    socket.on('error', (msg: string) => onError?.(msg));

    // ── Server → Client events (names must match backend/app/sockets/events.py) ─
    if (onJoined)            socket.on('joined',                onJoined);
    if (onStudentJoined)     socket.on('student_joined',        onStudentJoined);
    if (onStudentLeft)       socket.on('student_left',          onStudentLeft);
    if (onCodeResult)        socket.on('code_result',           onCodeResult);
    if (onFocusUpdate)       socket.on('student_focus_update',  onFocusUpdate);
    if (onProctorAlert)      socket.on('proctor_alert',         onProctorAlert);
    if (onCheckpointUpdate)  socket.on('student_checkpoint_update', onCheckpointUpdate);
    if (onSessionStarted)    socket.on('session_started',       onSessionStarted);
    if (onSessionEnded)      socket.on('session_ended',         onSessionEnded);
    if (onInstructorMessage) socket.on('instructor_message',    onInstructorMessage);
    if (onScreenshotFrame)   socket.on('student_screenshot',    onScreenshotFrame);

    return () => {
      socket.emit('leave_session', { session_id: sessionId });
      socket.disconnect();
      socketRef.current = null;
    };
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
   * Call every ~30s from the student live-lab page (see Task #37).
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
