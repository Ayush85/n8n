import React, { useEffect, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
    Search, Send, Paperclip, Smile, Zap, User, ChevronRight,
    Bot, X, Volume2, VolumeX, RefreshCw, CheckCheck, Loader2,
    MoreVertical, Phone, Mail,
} from 'lucide-react';
import { getSocket } from '../lib/socket.js';
import { apiFetch, API_BASE } from '../lib/api.js';
import { useInboxStore, type Session, type Message, type Channel } from '../store/inbox.js';
import { useAuthStore } from '../store/auth.js';

// ── Channel config ────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; color: string; bg: string; darkBg: string }> = {
    whatsapp:  { label: 'WhatsApp',  color: '#25D366', bg: '#e8faf0', darkBg: 'rgba(37,211,102,0.12)' },
    instagram: { label: 'Instagram', color: '#E1306C', bg: '#fde8f0', darkBg: 'rgba(225,48,108,0.12)' },
    facebook:  { label: 'Messenger', color: '#0084FF', bg: '#e6f3ff', darkBg: 'rgba(0,132,255,0.12)'  },
    livechat:  { label: 'Live Chat', color: '#00BCD4', bg: '#e5f9fb', darkBg: 'rgba(0,188,212,0.12)'  },
    tiktok:    { label: 'TikTok',    color: '#69C9D0', bg: '#e8f9fa', darkBg: 'rgba(105,201,208,0.12)' },
    unknown:   { label: 'Unknown',   color: '#94a3b8', bg: '#f1f5f9', darkBg: 'rgba(148,163,184,0.12)' },
};

const QUICK_REPLIES = [
    'Thanks for reaching out! 👋',
    'Looking into this right now',
    'Could you share more details?',
    'Your issue has been resolved ✓',
    "I'll follow up within the hour",
];

const AI_SUGGESTIONS = [
    "Of course! I'd be happy to help with that. Let me look into it and get back to you shortly.",
    "Absolutely! We offer a 14-day free trial with full access to all Pro features — no credit card required.",
    "Thank you for the details. I've flagged this for immediate attention and our team will follow up within the hour.",
    "I completely understand your concern. Let me escalate this to our specialist team right away.",
];

// ── Channel icons ─────────────────────────────────────────────────────────────

function ChannelDot({ channel }: { channel: Channel }) {
    const c = CHANNEL_META[channel] ?? CHANNEL_META.unknown;
    return (
        <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color: c.color, background: c.darkBg }}
        >
            {c.label}
        </span>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts?: string | null): string {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return format(d, 'HH:mm');
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${format(d, 'HH:mm')}`;
    return format(d, 'MMM d, HH:mm');
}

function parseFileMsg(content: string): { fileUrl: string; fileName: string; fileType: string } | null {
    try {
        const p = JSON.parse(content);
        if (p && typeof p.fileUrl === 'string') return p as { fileUrl: string; fileName: string; fileType: string };
    } catch { /* not json */ }
    return null;
}

function initials(name: string | null): string {
    if (!name) return '?';
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['from-orange-500 to-red-500','from-purple-500 to-pink-500','from-sky-500 to-blue-600','from-emerald-500 to-teal-500','from-rose-500 to-pink-600','from-indigo-500 to-purple-600','from-amber-500 to-orange-500'];
function avatarColor(str: string): string {
    let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SessionItem({ session, active, unreadCount, onClick }: {
    session: Session; active: boolean; unreadCount: number; onClick: () => void;
}) {
    const isOnline = session.last_message_at
        ? Date.now() - new Date(session.last_message_at).getTime() < 300_000
        : false;
    const grad = avatarColor(session.session_id);
    const name = session.customer_name || session.user_contact || 'Anonymous';

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left group ${active ? 'bg-blue-600/10 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent'}`}
        >
            <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-xs font-bold`}>
                    {initials(session.customer_name ?? session.user_contact)}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950 ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-white truncate">{name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{formatTime(session.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                    <ChannelDot channel={session.channel} />
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${session.status === 'human' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                        {session.status === 'human' ? '🟡 Human' : '🤖 AI'}
                    </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{session.last_message || 'Started a conversation'}</p>
            </div>

            {unreadCount > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
}

function MsgBubble({ msg }: { msg: Message }) {
    const isUser = msg.sender === 'user';
    const isAI = msg.sender === 'ai';
    const isAdmin = msg.sender === 'admin';
    const fileData = parseFileMsg(msg.content);
    const ts = formatTime(msg.created_at ?? msg.timestamp);

    if (isUser) {
        return (
            <div className="flex justify-start mb-3">
                <div className="max-w-[70%]">
                    {fileData ? (
                        <a href={fileData.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-slate-800 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                            <Paperclip size={13} />
                            {fileData.fileName}
                        </a>
                    ) : (
                        <div className="bg-slate-800 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-200 leading-relaxed">
                            {msg.content}
                        </div>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1 pl-1">{ts}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-end mb-3">
            <div className="max-w-[70%]">
                <div className="flex items-center justify-end gap-2 mb-1">
                    {isAI && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                            <Bot size={9} /> AI
                        </span>
                    )}
                    {isAdmin && <span className="text-[10px] text-emerald-400 font-medium">Agent</span>}
                    <span className="text-[10px] text-slate-600">{ts}</span>
                    <CheckCheck size={11} className="text-blue-400" />
                </div>
                <div className={`rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed ${isAI ? 'bg-purple-600/15 border border-purple-500/20 text-purple-100' : 'bg-blue-600/20 border border-blue-500/20 text-blue-100'}`}>
                    {msg.content}
                </div>
            </div>
        </div>
    );
}

// ── Main InboxPage ────────────────────────────────────────────────────────────

export default function InboxPage() {
    const { user } = useAuthStore();
    const {
        sessions, activeSessionId, messages, notifications, loadingSessions, loadingMessages,
        fetchSessions, setActiveSession, addMessage, updateSession, addNotification,
        markNotificationsRead, searchQuery, setSearchQuery,
    } = useInboxStore();

    const [input, setInput] = useState('');
    const [aiSuggestion, setAiSuggestion] = useState('');
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [statusLoading, setStatusLoading] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
    const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'ai' | 'human'>('all');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);

    const activeSession = sessions.find((s) => s.session_id === activeSessionId) ?? null;

    // ── Socket setup ──────────────────────────────────────────────────────────
    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 30_000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const socket = getSocket();

        socket.on('new_message', (msg: Message & { sessionId?: string }) => {
            addMessage({ ...msg, session_id: msg.session_id ?? msg.sessionId });
            fetchSessions();
        });

        socket.on('admin_alert', (alert: {
            sessionId: string; userName: string; content: string;
            isHumanSession: boolean; timestamp: string;
        }) => {
            const isActive = activeSessionId === alert.sessionId;
            if (alert.isHumanSession) {
                addNotification({
                    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    sessionId: alert.sessionId,
                    userName: alert.userName || 'Customer',
                    preview: String(alert.content || '').slice(0, 120),
                    createdAt: alert.timestamp || new Date().toISOString(),
                    read: isActive,
                    isHumanSession: true,
                });
                if (!isActive && soundEnabled) playChime();
            }
            fetchSessions();
        });

        socket.on('session_update', () => fetchSessions());

        socket.on('status_change', ({ sessionId, status }: { sessionId: string; status: 'ai' | 'human' }) => {
            updateSession(sessionId, { status });
        });

        return () => {
            socket.off('new_message');
            socket.off('admin_alert');
            socket.off('session_update');
            socket.off('status_change');
        };
    }, [activeSessionId, soundEnabled]);

    // Join/leave socket rooms
    useEffect(() => {
        const socket = getSocket();
        if (activeSessionId) {
            socket.emit('join_session', activeSessionId);
            markNotificationsRead(activeSessionId);
        }
        return () => {
            if (activeSessionId) socket.emit('leave_session', activeSessionId);
        };
    }, [activeSessionId]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Sound ─────────────────────────────────────────────────────────────────
    const playChime = useCallback(() => {
        try {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
            const ctx = audioCtxRef.current;
            [880, 1320].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const start = ctx.currentTime + i * 0.15;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.1, start + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(start); osc.stop(start + 0.23);
            });
        } catch { /* no audio */ }
    }, []);

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSend = useCallback(() => {
        if (!input.trim() || !activeSessionId) return;
        const socket = getSocket();
        socket.emit('send_manual_message', { sessionId: activeSessionId, content: input.trim() });
        addMessage({ session_id: activeSessionId, sender: 'admin', content: input.trim(), created_at: new Date().toISOString() });
        setInput('');
        setAiSuggestion('');
    }, [input, activeSessionId]);

    // ── File upload ───────────────────────────────────────────────────────────
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeSessionId) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('sessionId', activeSessionId);
            const token = localStorage.getItem('omni_token') ?? '';
            await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            fetchSessions();
        } catch (err) {
            console.error('Upload failed', err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Status change ─────────────────────────────────────────────────────────
    const handleStatusChange = async (status: 'ai' | 'human') => {
        if (!activeSessionId) return;
        setStatusLoading(true);
        try {
            await apiFetch(`/api/sessions/${activeSessionId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
            updateSession(activeSessionId, { status });
        } finally {
            setStatusLoading(false);
        }
    };

    // ── AI Summary ────────────────────────────────────────────────────────────
    const handleFetchSummary = async () => {
        if (!activeSessionId) return;
        setSummaryLoading(true);
        try {
            const data = await apiFetch<Record<string, unknown>>(`/api/sessions/${activeSessionId}/summary`);
            setSummary(data);
        } catch { setSummary(null); }
        finally { setSummaryLoading(false); }
    };

    // ── Filter sessions ───────────────────────────────────────────────────────
    const filteredSessions = sessions.filter((s) => {
        const q = searchQuery.toLowerCase();
        if (q && !s.customer_name?.toLowerCase().includes(q) && !s.user_contact?.toLowerCase().includes(q) && !s.session_id.includes(q)) return false;
        if (channelFilter !== 'all' && s.channel !== channelFilter) return false;
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        return true;
    });

    const unreadBySession = notifications.reduce<Record<string, number>>((acc, n) => {
        if (!n.read) acc[n.sessionId] = (acc[n.sessionId] ?? 0) + 1;
        return acc;
    }, {});

    const handleAiSuggest = () => {
        const s = AI_SUGGESTIONS[Math.floor(Math.random() * AI_SUGGESTIONS.length)];
        setAiSuggestion(s);
        setInput(s);
        inputRef.current?.focus();
    };

    return (
        <div className="flex h-full bg-slate-950">
            {/* ── Session list ── */}
            <div className="w-72 shrink-0 border-r border-white/5 flex flex-col bg-slate-900">
                {/* Search + filters */}
                <div className="p-3 border-b border-white/5 space-y-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search conversations…"
                            className="w-full bg-slate-800 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                        />
                    </div>
                    <div className="flex gap-1.5">
                        {(['all', 'ai', 'human'] as const).map((s) => (
                            <button key={s} onClick={() => setStatusFilter(s)}
                                className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg capitalize transition-all ${statusFilter === s ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
                                {s === 'all' ? 'All' : s === 'human' ? '🟡 Human' : '🤖 AI'}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {(['all', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'livechat'] as const).map((ch) => (
                            <button key={ch} onClick={() => setChannelFilter(ch)}
                                className={`text-[9px] font-semibold px-2 py-1 rounded-full capitalize transition-all ${channelFilter === ch ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-600 hover:text-slate-400'}`}>
                                {ch === 'all' ? 'All' : CHANNEL_META[ch as Channel]?.label ?? ch}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Session list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {loadingSessions && sessions.length === 0 ? (
                        <div className="flex items-center justify-center py-12 text-slate-600">
                            <Loader2 size={18} className="animate-spin" />
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-600">No conversations found</div>
                    ) : (
                        filteredSessions.map((s) => (
                            <SessionItem
                                key={s.session_id}
                                session={s}
                                active={s.session_id === activeSessionId}
                                unreadCount={unreadBySession[s.session_id] ?? 0}
                                onClick={() => setActiveSession(s.session_id)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* ── Chat area ── */}
            {activeSession ? (
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Chat header */}
                    <div className="h-14 flex items-center justify-between px-5 border-b border-white/5 bg-slate-950 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(activeSession.session_id)} flex items-center justify-center text-white text-xs font-bold`}>
                                {initials(activeSession.customer_name ?? activeSession.user_contact)}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white">
                                        {activeSession.customer_name || activeSession.user_contact || 'Anonymous'}
                                    </span>
                                    <ChannelDot channel={activeSession.channel} />
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                    {activeSession.user_contact && (
                                        <span className="flex items-center gap-1">
                                            {activeSession.user_contact.includes('@') ? <Mail size={9} /> : <Phone size={9} />}
                                            {activeSession.user_contact}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={() => setSoundEnabled((v) => !v)} title="Toggle sound"
                                className="w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-slate-500 hover:text-white transition-all">
                                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                            </button>
                            <button onClick={handleFetchSummary} disabled={summaryLoading} title="AI Summary"
                                className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-medium hover:bg-purple-500/20 transition-all disabled:opacity-50">
                                {summaryLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                Summary
                            </button>
                            <div className="flex items-center gap-1 border border-white/10 rounded-xl p-1">
                                {(['ai', 'human'] as const).map((st) => (
                                    <button key={st} onClick={() => handleStatusChange(st)}
                                        disabled={statusLoading || activeSession.status === st}
                                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg capitalize transition-all ${activeSession.status === st ? (st === 'human' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300') : 'text-slate-500 hover:text-white'}`}>
                                        {st === 'human' ? '🟡 Human' : '🤖 AI'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* AI Summary panel */}
                    {summary && (
                        <div className="mx-5 mt-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 flex gap-3">
                            <Zap size={14} className="text-purple-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-purple-300 mb-1">AI Summary</p>
                                <p className="text-xs text-slate-400 leading-relaxed">{String(summary.summary ?? '')}</p>
                                {Array.isArray(summary.topics) && summary.topics.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {(summary.topics as string[]).map((t) => (
                                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{t}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSummary(null)} className="text-slate-600 hover:text-slate-400"><X size={14} /></button>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                        {loadingMessages ? (
                            <div className="flex items-center justify-center h-full text-slate-600">
                                <Loader2 size={20} className="animate-spin" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                                <Bot size={32} className="opacity-30" />
                                <p className="text-sm">No messages yet</p>
                            </div>
                        ) : (
                            messages.map((msg, i) => <MsgBubble key={msg.id ?? i} msg={msg} />)
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* AI suggestion */}
                    {aiSuggestion && (
                        <div className="mx-5 mb-2 flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                            <Zap size={13} className="text-blue-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-blue-300 flex-1 leading-relaxed">{aiSuggestion}</span>
                            <button onClick={() => setAiSuggestion('')} className="text-slate-600 hover:text-slate-400"><X size={13} /></button>
                        </div>
                    )}

                    {/* Quick replies */}
                    <div className="px-5 mb-2 flex gap-2 flex-wrap">
                        {QUICK_REPLIES.map((qr) => (
                            <button key={qr} onClick={() => { setInput(qr); inputRef.current?.focus(); }}
                                className="text-[11px] px-3 py-1.5 rounded-full border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all bg-slate-900">
                                {qr}
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="px-5 pb-5 shrink-0">
                        <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
                                rows={2}
                                className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                            />
                            <div className="flex items-center justify-between px-3 pb-3">
                                <div className="flex items-center gap-1">
                                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload}
                                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
                                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-all">
                                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                                    </button>
                                    <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-all">
                                        <Smile size={14} />
                                    </button>
                                    <div className="w-px h-4 bg-white/10 mx-1" />
                                    <button onClick={handleAiSuggest}
                                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[11px] font-semibold hover:bg-purple-500/20 transition-all">
                                        <Zap size={11} /> AI Assist
                                    </button>
                                </div>
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim()}
                                    className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/20"
                                >
                                    <Send size={14} /> Send
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Empty state */
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center">
                        <Bot size={28} className="opacity-40" />
                    </div>
                    <div className="text-center">
                        <p className="text-base font-medium text-slate-400 mb-1">Select a conversation</p>
                        <p className="text-sm text-slate-600">Choose from the list to start replying</p>
                    </div>
                    <button onClick={() => fetchSessions()}
                        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors mt-2">
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>
            )}

            {/* ── Right panel: contact details ── */}
            {activeSession && (
                <div className="w-64 shrink-0 border-l border-white/5 bg-slate-900 flex flex-col overflow-y-auto">
                    <div className="p-4 border-b border-white/5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Contact Details</p>
                        <div className="flex flex-col items-center text-center gap-2 mb-4">
                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarColor(activeSession.session_id)} flex items-center justify-center text-white font-bold text-lg`}>
                                {initials(activeSession.customer_name ?? activeSession.user_contact)}
                            </div>
                            <div>
                                <p className="font-semibold text-white text-sm">{activeSession.customer_name || 'Anonymous'}</p>
                                {activeSession.user_contact && (
                                    <p className="text-xs text-slate-400 mt-0.5">{activeSession.user_contact}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Channel</span>
                                <ChannelDot channel={activeSession.channel} />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Status</span>
                                <span className={`font-medium ${activeSession.status === 'human' ? 'text-amber-300' : 'text-slate-300'}`}>
                                    {activeSession.status === 'human' ? '🟡 Human' : '🤖 AI'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Created</span>
                                <span className="text-slate-300">{formatTime(activeSession.created_at)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Session ID</span>
                                <span className="text-slate-500 font-mono text-[10px] truncate ml-2">{activeSession.session_id.slice(0, 12)}…</span>
                            </div>
                        </div>
                    </div>

                    {/* Session metadata */}
                    {activeSession.metadata && Object.keys(activeSession.metadata).length > 0 && (
                        <div className="p-4 border-b border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Metadata</p>
                            <div className="space-y-1.5">
                                {Object.entries(activeSession.metadata)
                                    .filter(([, v]) => v != null && v !== '')
                                    .slice(0, 8)
                                    .map(([k, v]) => (
                                        <div key={k} className="flex items-start justify-between gap-2 text-[11px]">
                                            <span className="text-slate-500 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                                            <span className="text-slate-400 text-right break-all">{String(v).slice(0, 40)}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* All sessions for this contact */}
                    {activeSession.user_contact && (
                        <div className="p-4">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Other Sessions</p>
                            <div className="space-y-1">
                                {sessions
                                    .filter((s) => s.user_contact === activeSession.user_contact && s.session_id !== activeSessionId)
                                    .slice(0, 5)
                                    .map((s) => (
                                        <button
                                            key={s.session_id}
                                            onClick={() => setActiveSession(s.session_id)}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                                        >
                                            <p className="text-[11px] text-slate-400 truncate">{s.last_message || 'Session'}</p>
                                            <p className="text-[10px] text-slate-600">{formatTime(s.created_at)}</p>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
