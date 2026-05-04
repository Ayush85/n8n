import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch } from '../lib/api.js';

export interface User {
    id: number;
    email: string;
    name: string;
    role: 'owner' | 'admin' | 'agent';
    avatarUrl?: string;
}

export interface Workspace {
    id: number;
    name: string;
    slug: string;
    plan: string;
}

interface AuthState {
    token: string | null;
    user: User | null;
    workspace: Workspace | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (workspaceName: string, name: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    rehydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            user: null,
            workspace: null,
            isLoading: false,

            login: async (email, password) => {
                set({ isLoading: true });
                try {
                    const data = await apiFetch<{ token: string; user: User; workspace: Workspace }>(
                        '/api/auth/login',
                        { method: 'POST', body: JSON.stringify({ email, password }) },
                    );
                    localStorage.setItem('omni_token', data.token);
                    set({ token: data.token, user: data.user, workspace: data.workspace, isLoading: false });
                } catch (err) {
                    set({ isLoading: false });
                    throw err;
                }
            },

            register: async (workspaceName, name, email, password) => {
                set({ isLoading: true });
                try {
                    const data = await apiFetch<{ token: string; user: User; workspace: Workspace }>(
                        '/api/auth/register',
                        { method: 'POST', body: JSON.stringify({ workspaceName, name, email, password }) },
                    );
                    localStorage.setItem('omni_token', data.token);
                    set({ token: data.token, user: data.user, workspace: data.workspace, isLoading: false });
                } catch (err) {
                    set({ isLoading: false });
                    throw err;
                }
            },

            logout: () => {
                localStorage.removeItem('omni_token');
                set({ token: null, user: null, workspace: null });
            },

            rehydrate: async () => {
                const token = localStorage.getItem('omni_token');
                if (!token) return;
                try {
                    const data = await apiFetch<{ user: User; workspace: Workspace }>('/api/auth/me');
                    set({ token, user: data.user, workspace: data.workspace });
                } catch {
                    localStorage.removeItem('omni_token');
                    set({ token: null, user: null, workspace: null });
                }
            },
        }),
        { name: 'omni-auth', partialize: (s) => ({ token: s.token, user: s.user, workspace: s.workspace }) },
    ),
);
