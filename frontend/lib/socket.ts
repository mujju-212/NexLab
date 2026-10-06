import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

let socketInstance: Socket | null = null;
let currentToken: string | null = null;

/**
 * Get or initialize the global authenticated Socket.IO connection.
 * Used for receiving real-time user-level notifications (e.g. session started,
 * announcements, alerts) across all authenticated shells and pages.
 */
export function getGlobalSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  const token = Cookies.get('access_token');
  if (!token) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
      currentToken = null;
    }
    return null;
  }

  // Reconnect if user/token changed
  if (socketInstance && currentToken !== token) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  if (!socketInstance) {
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
    currentToken = token;
    socketInstance = io(SOCKET_URL, {
      auth: { token },
      // websocket-first: each polling client pins a server HTTP thread for
      // ~25s at a time (long-poll), which starved real API calls. WebSockets
      // hold no request slot. Polling stays as fallback for proxies that
      // break upgrades.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });
  }

  return socketInstance;
}

export function disconnectGlobalSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    currentToken = null;
  }
}
