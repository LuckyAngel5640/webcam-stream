import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useSignaling(url, callbacks = {}) {
  const socketRef = useRef(null);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      callbacksRef.current.onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      callbacksRef.current.onDisconnect?.();
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      callbacksRef.current.onError?.(error);
    });

    socket.on('camera_list', (cameras) => {
      callbacksRef.current.onCameraList?.(cameras);
    });

    socket.on('motion_alert', (alert) => {
      callbacksRef.current.onMotionAlert?.(alert);
    });

    socket.on('camera_disconnected', (data) => {
      callbacksRef.current.onCameraDisconnected?.(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [url]);

  const sendMessage = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return { socket: socketRef.current, sendMessage };
}