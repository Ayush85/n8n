import { create } from 'zustand';
import { apiFetch } from '../lib/api.js';

export type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'livechat' | 'tiktok' | 'unknown';

export interface Session {
    session_id: string;
    customer_name: string | null;
    user_contact: string | null;
    status: 'ai' | 'human';
    channel: Channel;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_message: string | null;
    last_message_at: string | null;
    metadata?: Record<string, unknown>;
}

export interface Message {
    id?: number;
    session_id?: string;
    sessionId?: string;
    sender: 'user' | 'admin' | 'ai' | 'system';
    content: string;
    created_at?: string;
    timestamp?: string;
}

export interface Notification {
    id: string;
    sessionId: string;
    userName: string;
    preview: string;
    createdAt: string;
    read: boolean;
    isHumanSession: boolean;
}

interface InboxState {
    sessions: Session[];
    activeSessionId: string | null;
    messages: Message[];
    notifications: Notification[];
    loadingSessions: boolean;
    loadingMessages: boolean;
    searchQuery: string;

    fetchSessions: () => Promise<void>;
    fetchMessages: (sessionId: string) => Promise<void>;
    setActiveSession: (sessionId: string | null) => void;
    addMessage: (msg: Message) => void;
    updateSession: (sessionId: string, patch: Partial<Session>) => void;
    addNotification: (n: Notification) => void;
    markNotificationsRead: (sessionId: string) => void;
    markAllNotificationsRead: () => void;
    setSearchQuery: (q: string) => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
    sessions: [],
    activeSessionId: null,
    messages: [],
    notifications: [],
    loadingSessions: false,
    loadingMessages: false,
    searchQuery: '',

    fetchSessions: async () => {
        set({ loadingSessions: true });
        try {
            const data = await apiFetch<Session[]>('/api/sessions');
            set({ sessions: data, loadingSessions: false });
        } catch {
            set({ loadingSessions: false });
        }
    },

    fetchMessages: async (sessionId) => {
        set({ loadingMessages: true });
        try {
            const data = await apiFetch<Message[]>(`/api/sessions/${sessionId}/messages`);
            set({ messages: data, loadingMessages: false });
        } catch {
            set({ loadingMessages: false });
        }
    },

    setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId, messages: [] });
        if (sessionId) {
            get().fetchMessages(sessionId);
            get().markNotificationsRead(sessionId);
        }
    },

    addMessage: (msg) => {
        const activeId = get().activeSessionId;
        const msgSessionId = msg.session_id ?? msg.sessionId;
        if (msgSessionId !== activeId) return;
        set((s) => {
            const exists = s.messages.some(
                (m) => m.content === msg.content && m.sender === msg.sender &&
                    Math.abs(new Date(m.created_at ?? m.timestamp ?? 0).getTime() - new Date(msg.created_at ?? msg.timestamp ?? 0).getTime()) < 2000,
            );
            if (exists) return s;
            return { messages: [...s.messages, msg] };
        });
    },

    updateSession: (sessionId, patch) => {
        set((s) => ({
            sessions: s.sessions.map((sess) =>
                sess.session_id === sessionId ? { ...sess, ...patch } : sess,
            ),
        }));
    },

    addNotification: (n) => {
        set((s) => ({ notifications: [n, ...s.notifications].slice(0, 50) }));
    },

    markNotificationsRead: (sessionId) => {
        set((s) => ({
            notifications: s.notifications.map((n) =>
                n.sessionId === sessionId ? { ...n, read: true } : n,
            ),
        }));
    },

    markAllNotificationsRead: () => {
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
    },

    setSearchQuery: (q) => set({ searchQuery: q }),
}));
