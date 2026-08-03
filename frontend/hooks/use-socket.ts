'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

export function useSocket(namespace: string = '/') {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = Cookies.get('access_token');
    socketRef.current = io(`${process.env.NEXT_PUBLIC_SOCKET_URL}${namespace}`, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => setIsConnected(true));
    socketRef.current.on('disconnect', () => setIsConnected(false));

    return () => {
      socketRef.current?.disconnect();
    };
  }, [namespace]);

  return { socket: socketRef.current, isConnected };
}
