const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken(): string {
    return localStorage.getItem('omni_token') ?? '';
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? 'Request failed');
    }
    return res.json() as Promise<T>;
}

export const API_BASE = BASE;
