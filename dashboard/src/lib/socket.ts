import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api.js';

let socket: Socket | null = null;

export function getSocket(): Socket {
    if (!socket) {
        socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    }
    return socket;
}

export function disconnectSocket(): void {
    socket?.disconnect();
    socket = null;
}
