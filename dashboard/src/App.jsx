import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
    MessageSquare,
    Send,
    User,
    ShieldCheck,
    Search,
    Clock,
    MoreVertical,
    CheckCheck,
    Paperclip,
    Smile,
    Sidebar as SidebarIcon,
    BarChart3,
    TrendingUp,
    Users,
    MessageCircle,
    Activity,
    Zap,
    X,
    ChevronRight,
    Hash,
    FileText,
    Bot,
    Timer,
    Tag,
    Sparkles,
    ThumbsUp,
    ThumbsDown,
    Target,
    CheckCircle2,
    AlertCircle,
    HelpCircle,
    Loader2,
    ToggleLeft,
    ToggleRight,
    Menu,
    ArrowLeft,
    Phone,
    Mail,
    Globe,
    MapPin,
    ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || '';

// Helper: fetch with admin Authorization header pre-attached
const adminFetch = (url, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (ADMIN_SECRET) headers['Authorization'] = `Bearer ${ADMIN_SECRET}`;
    return fetch(url, { ...options, headers });
};

// Helper: format message timestamp — today shows HH:mm, older shows MMM d, HH:mm
function formatMsgTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
        ? format(d, 'HH:mm')
        : format(d, 'MMM d, HH:mm');
}

// Helper: parse a file-message payload from a message content string
function parseFileMsg(content) {
    try {
        const p = JSON.parse(content);
        return (p && typeof p.fileUrl === 'string') ? p : null;
    } catch {
        return null;
    }
}

function App() {
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [socket, setSocket] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
    const [currentView, setCurrentView] = useState('chats'); // 'chats' | 'analytics' | 'users'
    const [analytics, setAnalytics] = useState(null);
    const [sessionSummary, setSessionSummary] = useState(null);
    const [topQueries, setTopQueries] = useState([]);
    const [showSessionSummary, setShowSessionSummary] = useState(false);
    const [allSessionSummaries, setAllSessionSummaries] = useState([]);
    const [loadingSessionSummaries, setLoadingSessionSummaries] = useState(false);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [chatReport, setChatReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    const [userSortField, setUserSortField] = useState('updated_at');
    const [userSortDir, setUserSortDir] = useState('desc');
    const [expandedChatUsers, setExpandedChatUsers] = useState(new Set());
    const [expandedUserRows, setExpandedUserRows] = useState(new Set());
    const [expandedQueryIdx, setExpandedQueryIdx] = useState(null);
    const [analyticsModal, setAnalyticsModal] = useState(null);
    const messagesEndRef = useRef(null);

    // Initialize Socket (only once on mount)
    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        return () => newSocket.close();
    }, []);

    // Listen for new messages (separate effect to avoid re-creating socket)
    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (msg) => {
            // Only add if it's from another user (not our optimistic update)
            if (msg.sender !== 'admin') {
                setMessages(prev => {
                    // Check if already exists (prevent duplicates)
                    const exists = prev.some(m => m.content === msg.content && m.sender === msg.sender && Math.abs(new Date(m.created_at || 0).getTime() - new Date(msg.timestamp || msg.created_at || 0).getTime()) < 2000);
                    if (exists) return prev;
                    return [...prev, { ...msg, created_at: msg.timestamp || msg.created_at }];
                });
            }
            fetchSessions();
        };

        const handleSessionUpdate = () => {
            fetchSessions();
        };

        socket.on('new_message', handleNewMessage);
        socket.on('session_update', handleSessionUpdate);

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('session_update', handleSessionUpdate);
        };
    }, [socket]);

    // Fetch Sessions
    const fetchSessions = async () => {
        try {
            const res = await adminFetch(`${SOCKET_URL}/api/sessions`);
            const data = await res.json();
            setSessions(data);
        } catch (err) {
            console.error('Error fetching sessions:', err);
        }
    };

    // Fetch Analytics
    const fetchAnalytics = async () => {
        try {
            const res = await adminFetch(`${SOCKET_URL}/api/analytics`);
            const data = await res.json();
            setAnalytics(data);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        }
    };

    // Fetch Top Queries
    const fetchTopQueries = async () => {
        try {
            const res = await adminFetch(`${SOCKET_URL}/api/analytics/top-queries?limit=10`);
            const data = await res.json();
            setTopQueries(data.topQueries || []);
        } catch (err) {
            console.error('Error fetching top queries:', err);
        }
    };

    // Fetch Session Summary (GPT-powered)
    const fetchSessionSummary = async (sessionId) => {
        setLoadingSummary(true);
        try {
            const res = await adminFetch(`${SOCKET_URL}/api/sessions/${sessionId}/summary`);
            const data = await res.json();
            setSessionSummary(data);
        } catch (err) {
            console.error('Error fetching session summary:', err);
        }
        setLoadingSummary(false);
    };

    // Fetch Chat Report (GPT-powered batch analysis)
    const fetchChatReport = async () => {
        setLoadingReport(true);
        try {
            const res = await adminFetch(`${SOCKET_URL}/api/reports/chat`, {
                method: 'POST',
                body: JSON.stringify({ limit: 20 })
            });
            const data = await res.json();
            setChatReport(data);
        } catch (err) {
            console.error('Error fetching chat report:', err);
        }
        setLoadingReport(false);
    };

    useEffect(() => {
        fetchSessions();
        fetchAnalytics();
        fetchTopQueries();
        // Refresh analytics every 30 seconds
        const interval = setInterval(() => {
            fetchAnalytics();
            fetchTopQueries();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // No longer auto-fetch session summaries on analytics view
    // User clicks 'Generate AI Report' button instead

    // Fetch Messages when session changes
    useEffect(() => {
        if (activeSession) {
            adminFetch(`${SOCKET_URL}/api/sessions/${activeSession.session_id}/messages`)
                .then(res => res.json())
                .then(data => {
                    setMessages(data);
                    socket?.emit('join_session', activeSession.session_id);
                });
            // Also fetch session summary
            fetchSessionSummary(activeSession.session_id);
        }
    }, [activeSession, socket]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeSession) return;

        const msgData = {
            sessionId: activeSession.session_id,
            content: newMessage,
        };

        socket.emit('send_manual_message', msgData);

        // Optimistic update
        setMessages(prev => [...prev, { ...msgData, sender: 'admin', created_at: new Date().toISOString() }]);
        setNewMessage('');
    };

    const filteredSessions = sessions.filter(s =>
        s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.user_contact?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Group sessions by user for the chats sidebar
    const chatUserGroups = filteredSessions.reduce((acc, session) => {
        const key = session.user_contact || session.customer_name || session.session_id;
        if (!acc[key]) acc[key] = { key, name: session.customer_name || 'Anonymous', contact: session.user_contact || session.metadata?.user_contact || session.metadata?.user_email || session.metadata?.user_phone, sessions: [], latestAt: 0, lastMessage: '', latestSession: null };
        acc[key].sessions.push(session);
        const t = new Date(session.last_message_at || 0).getTime();
        if (t > acc[key].latestAt) { acc[key].latestAt = t; acc[key].lastMessage = session.last_message || ''; acc[key].latestSession = session; }
        return acc;
    }, {});
    const sortedChatUserGroups = Object.values(chatUserGroups).sort((a, b) => b.latestAt - a.latestAt);

    // Users view: deduplicated list based on sessions (each session = one user entry)
    const filteredUsers = sessions
        .filter(s => {
            const q = userSearch.toLowerCase();
            return (
                !q ||
                s.customer_name?.toLowerCase().includes(q) ||
                s.user_contact?.toLowerCase().includes(q) ||
                s.session_id.toLowerCase().includes(q) ||
                s.metadata?.ip_address?.toLowerCase().includes(q) ||
                s.metadata?.site_name?.toLowerCase().includes(q) ||
                s.metadata?.host?.toLowerCase().includes(q)
            );
        });

    // Group filtered sessions into unique user groups for the Users view
    const uniqueUserGroups = Object.values(
        filteredUsers.reduce((acc, session) => {
            const key = session.user_contact || session.customer_name || session.session_id;
            if (!acc[key]) acc[key] = { key, name: session.customer_name || 'Anonymous', contact: session.user_contact || session.metadata?.user_contact || session.metadata?.user_email || session.metadata?.user_phone, sessions: [], latestAt: 0, earliestAt: Infinity, latestSession: null };
            acc[key].sessions.push(session);
            const t = new Date(session.last_message_at || 0).getTime();
            const c = new Date(session.created_at || 0).getTime();
            if (t > acc[key].latestAt) { acc[key].latestAt = t; acc[key].latestSession = session; }
            if (c < acc[key].earliestAt) acc[key].earliestAt = c;
            return acc;
        }, {})
    ).sort((a, b) => {
        const aS = a.latestSession || a.sessions[0];
        const bS = b.latestSession || b.sessions[0];
        let av = aS?.[userSortField] || aS?.metadata?.[userSortField] || '';
        let bv = bS?.[userSortField] || bS?.metadata?.[userSortField] || '';
        if (userSortField === 'created_at' || userSortField === 'updated_at' || userSortField === 'last_message_at') {
            av = new Date(av || 0).getTime();
            bv = new Date(bv || 0).getTime();
        } else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
        return userSortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });

    // Count total unique users across all sessions (unfiltered)
    const totalUniqueUsers = Object.keys(sessions.reduce((acc, s) => { acc[s.user_contact || s.customer_name || s.session_id] = true; return acc; }, {})).length;

    const toggleUserSort = (field) => {
        if (userSortField === field) {
            setUserSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setUserSortField(field);
            setUserSortDir('desc');
        }
    };

    return (
        <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans selection:bg-blue-500/30">
            {/* Mobile sidebar backdrop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-[30] md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            {/* Elegant Sidebar */}
            <div className={`${isSidebarOpen ? 'w-full md:w-80' : 'w-0'} overflow-hidden transition-all duration-300 border-r border-white/5 flex flex-col bg-slate-900 md:bg-slate-900/40 backdrop-blur-2xl z-[40] fixed md:relative inset-y-0 left-0 md:inset-auto`}>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center p-1.5 shadow-lg shadow-blue-500/20">
                                <MessageSquare className="text-white w-full h-full" />
                            </div>
                            <span className="font-bold text-lg tracking-tight text-white">Console</span>
                        </div>
                        <button onClick={() => setIsSidebarOpen(false)} className="text-slate-500 hover:text-white transition-colors md:hidden">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex flex-col gap-1.5 mb-6">
                        <div className="flex gap-1.5">
                            <button
                                onClick={() => setCurrentView('chats')}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${currentView === 'chats'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                <MessageSquare size={15} />
                                Chats
                            </button>
                            <button
                                onClick={() => setCurrentView('analytics')}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${currentView === 'analytics'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                <BarChart3 size={15} />
                                Analytics
                            </button>
                        </div>
                        <button
                            onClick={() => setCurrentView('users')}
                            className={`w-full py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${currentView === 'users'
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            <Users size={15} />
                            Users
                            <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${currentView === 'users' ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400'}`}>
                                {totalUniqueUsers}
                            </span>
                        </button>
                    </div>

                    {currentView === 'chats' && (
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Find chat..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/50 transition-all outline-none text-slate-200 placeholder:text-slate-500"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                {currentView === 'chats' && (
                    <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4 custom-scrollbar">
                        <div className="px-3 mb-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Active Chats</span>
                        </div>
                        {sortedChatUserGroups.map(group => {
                            const hasMultiple = group.sessions.length > 1;
                            const isExpanded = expandedChatUsers.has(group.key);
                            const rep = group.latestSession || group.sessions[0];
                            const isOnline = rep.last_message_at && (new Date() - new Date(rep.last_message_at)) < 300000;
                            const toggleGroup = () => setExpandedChatUsers(prev => { const n = new Set(prev); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n; });

                            if (!hasMultiple) {
                                const session = group.sessions[0];
                                return (
                                    <button
                                        key={session.session_id}
                                        onClick={() => { setActiveSession(session); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                                        className={`w-full p-4  flex gap-4 rounded-2xl transition-all duration-200 group relative ${activeSession?.session_id === session.session_id ? 'bg-blue-600/10 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                                    >
                                        <div className="relative shrink-0">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors overflow-hidden">
                                                <User className="w-6 h-6" />
                                            </div>
                                            {session.last_message_at && (new Date() - new Date(session.last_message_at)) < 300000 ? (
                                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#020617] rounded-full"></div>
                                            ) : (
                                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-slate-500 border-2 border-[#020617] rounded-full"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <h3 className="font-semibold truncate text-[14px] text-white tracking-tight">{session.customer_name || 'Anonymous'}</h3>
                                                <span className="text-[10px] text-slate-500 font-medium">
                                                    {session.last_message_at ? format(new Date(session.last_message_at), 'HH:mm') : ''}
                                                </span>
                                            </div>
                                            {(session.user_contact || session.metadata?.user_contact || session.metadata?.user_email || session.metadata?.user_phone) &&
                                                (session.customer_name !== session.user_contact &&
                                                    session.customer_name !== (session.metadata?.user_contact || session.metadata?.user_email || session.metadata?.user_phone)) && (
                                                    <p className="text-[11px] text-emerald-400 truncate mb-0.5">
                                                        📧 {session.user_contact || session.metadata?.user_contact || session.metadata?.user_email || session.metadata?.user_phone}
                                                    </p>
                                                )}
                                            <p className="text-[12px] text-slate-400 line-clamp-2 opacity-70 leading-relaxed font-light" title={session.last_message || ''}>{session.last_message || 'Started a conversation'}</p>
                                        </div>
                                        {activeSession?.session_id === session.session_id && (
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                                        )}
                                    </button>
                                );
                            }

                            // Multiple sessions — render collapsible user group
                            return (
                                <div key={group.key}>
                                    <button
                                        onClick={toggleGroup}
                                        className="w-full p-4 flex gap-4 rounded-2xl transition-all duration-200 group relative hover:bg-white/5 border border-transparent"
                                    >
                                        <div className="relative shrink-0">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-800 to-slate-900 border border-indigo-500/20 flex items-center justify-center text-indigo-400 overflow-hidden">
                                                <User className="w-6 h-6" />
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-[#020617] rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-500'}`}></div>
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <h3 className="font-semibold truncate text-[14px] text-white tracking-tight">{group.name}</h3>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400">{group.sessions.length}</span>
                                                    <ChevronRight size={13} className={`text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                                </div>
                                            </div>
                                            {group.contact && group.name !== group.contact && (
                                                <p className="text-[11px] text-emerald-400 truncate mb-0.5">📧 {group.contact}</p>
                                            )}
                                            <p className="text-[12px] text-slate-400 line-clamp-2 opacity-70 leading-relaxed font-light" title={group.lastMessage || ''}>{group.lastMessage || 'Started a conversation'}</p>
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="ml-4 pl-4 border-l border-indigo-500/20 space-y-0.5 mb-1">
                                            {[...group.sessions].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)).map((session, idx) => (
                                                <button
                                                    key={session.session_id}
                                                    onClick={() => { setActiveSession(session); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                                                    className={`w-full px-3 py-2.5 flex gap-3 rounded-xl transition-all duration-150 text-left ${activeSession?.session_id === session.session_id ? 'bg-blue-600/10 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                                                >
                                                    <span className="text-[10px] text-slate-600 font-mono mt-0.5 shrink-0">#{idx + 1}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-slate-300 line-clamp-2" title={session.last_message || ''}>{session.last_message || 'Started a conversation'}</p>
                                                        <p className="text-[10px] text-slate-500">{session.last_message_at ? format(new Date(session.last_message_at), 'MMM d, HH:mm') : ''}</p>
                                                    </div>
                                                    {activeSession?.session_id === session.session_id && (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1 shadow-[0_0_6px_rgba(59,130,246,0.8)]"></div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {sortedChatUserGroups.length === 0 && (
                            <div className="p-8 text-center mt-10">
                                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                                    <Search className="text-slate-600" size={20} />
                                </div>
                                <p className="text-xs text-slate-500 font-medium italic">No results found</p>
                            </div>
                        )}
                    </div>
                )}

                {currentView === 'analytics' && (
                    <div className="flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
                        <div className="px-3 mb-4">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Quick Stats</span>
                        </div>
                        {analytics && (
                            <div className="space-y-3 px-2">
                                {/* Total Sessions → navigate to chats */}
                                <button
                                    onClick={() => setCurrentView('chats')}
                                    className="w-full bg-slate-800/50 border border-white/5 rounded-xl p-4 hover:bg-slate-700/60 hover:border-blue-500/30 transition-all duration-200 group cursor-pointer text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center group-hover:bg-blue-600/30 transition-colors">
                                            <MessageSquare size={18} className="text-blue-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xl font-bold text-white">{analytics.totalSessions}</p>
                                            <p className="text-[10px] text-slate-400">Total Sessions</p>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                                    </div>
                                </button>
                                {/* Total Users → navigate to users */}
                                <button
                                    onClick={() => setCurrentView('users')}
                                    className="w-full bg-slate-800/50 border border-white/5 rounded-xl p-4 hover:bg-slate-700/60 hover:border-emerald-500/30 transition-all duration-200 group cursor-pointer text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center group-hover:bg-emerald-600/30 transition-colors">
                                            <Users size={18} className="text-emerald-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xl font-bold text-white">{analytics.totalUsers ?? totalUniqueUsers}</p>
                                            <p className="text-[10px] text-slate-400">Total Users</p>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                                    </div>
                                </button>
                                {/* Total Messages — no dedicated view, highlight stat */}
                                <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                            <MessageCircle size={18} className="text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-xl font-bold text-white">{analytics.totalMessages}</p>
                                            <p className="text-[10px] text-slate-400">Total Messages</p>
                                        </div>
                                    </div>
                                </div>
                                {/* Active Today → navigate to chats */}
                                <button
                                    onClick={() => setCurrentView('chats')}
                                    className="w-full bg-slate-800/50 border border-white/5 rounded-xl p-4 hover:bg-slate-700/60 hover:border-green-500/30 transition-all duration-200 group cursor-pointer text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center group-hover:bg-green-600/30 transition-colors">
                                            <Activity size={18} className="text-green-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xl font-bold text-white">{analytics.activeSessions24h}</p>
                                            <p className="text-[10px] text-slate-400">Active Today</p>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-600 group-hover:text-green-400 transition-colors" />
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="p-6 border-t border-white/5 mt-auto bg-slate-900/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-white">
                            A
                        </div>
                        <div>
                            <p className="text-xs font-bold text-white uppercase tracking-wider">Admin Agent</p>
                            <p className="text-[10px] text-slate-400">Manual Status: Online</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.05),_rgba(2,6,23,1)_40%)]">
                {!isSidebarOpen && (
                    <button onClick={() => setIsSidebarOpen(true)} className="absolute left-4 top-5 z-[30] w-10 h-10 bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-xl md:left-6 md:top-6">
                        <Menu size={18} />
                    </button>
                )}

                {/* Users Page View */}
                {currentView === 'users' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {/* Users Header */}
                        <div className="h-16 md:h-20 border-b border-white/5 px-4 md:px-8 flex items-center justify-between bg-slate-950/20 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-[17px] text-white tracking-tight">Chat Users</h2>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{totalUniqueUsers} unique users · {sessions.length} total sessions</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search users..."
                                        className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-emerald-500/50 transition-all outline-none text-slate-200 placeholder:text-slate-500 w-48"
                                        value={userSearch}
                                        onChange={e => setUserSearch(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={fetchSessions}
                                    className="px-4 py-2 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2 text-xs font-medium"
                                >
                                    <Activity size={14} />
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {/* Stats Strip */}
                        <div className="px-4 md:px-8 pt-6 pb-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                                            <Users size={16} className="text-emerald-400" />
                                        </div>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Total Users</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{totalUniqueUsers}</p>
                                </div>
                                <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                            <MessageSquare size={16} className="text-purple-400" />
                                        </div>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Total Sessions</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{sessions.length}</p>
                                </div>
                                <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-orange-600/20 flex items-center justify-center">
                                            <Activity size={16} className="text-orange-400" />
                                        </div>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Human Mode</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{sessions.filter(s => s.status === 'human').length}</p>
                                </div>
                                <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center">
                                            <Bot size={16} className="text-green-400" />
                                        </div>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">AI Mode</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{sessions.filter(s => s.status === 'ai').length}</p>
                                </div>
                            </div>

                            {/* Users Table */}
                            <div className="bg-slate-800/30 border border-white/5 rounded-2xl overflow-hidden">
                                {/* Table Header */}
                                <div className="grid grid-cols-[1fr_1fr_120px_60px_100px_120px_90px] gap-4 px-5 py-3 border-b border-white/5 bg-slate-900/40">
                                    {[
                                        { label: 'User', field: 'customer_name' },
                                        { label: 'Contact / IP', field: 'user_contact' },
                                        { label: 'Site / Origin', field: null },
                                        { label: 'Chats', field: null },
                                        { label: 'Status', field: 'status' },
                                        { label: 'Last Active', field: 'last_message_at' },
                                        { label: 'Started', field: 'created_at' },
                                    ].map(({ label, field }) => (
                                        <button
                                            key={label}
                                            onClick={() => field && toggleUserSort(field)}
                                            className={`text-left text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 transition-colors ${field ? 'hover:text-white cursor-pointer' : 'cursor-default'
                                                } ${userSortField === field ? 'text-emerald-400' : 'text-slate-500'}`}
                                        >
                                            {label}
                                            {field && userSortField === field && (
                                                <span className="text-emerald-400">{userSortDir === 'desc' ? '↓' : '↑'}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* Table Rows */}
                                <div className="divide-y divide-white/[0.03]">
                                    {uniqueUserGroups.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16">
                                            <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                                                <Users className="text-slate-600" size={24} />
                                            </div>
                                            <p className="text-sm text-slate-500 font-medium">No users found</p>
                                            <p className="text-xs text-slate-600 mt-1">Try adjusting your search</p>
                                        </div>
                                    ) : uniqueUserGroups.map((group) => {
                                        const session = group.latestSession || group.sessions[0];
                                        const contact = group.contact;
                                        const ip = session.metadata?.ip_address;
                                        const siteName = session.metadata?.site_name;
                                        const host = session.metadata?.host;
                                        const isOnline = session.last_message_at && (new Date() - new Date(session.last_message_at)) < 300000;
                                        const isExpanded = expandedUserRows.has(group.key);
                                        const hasMultiple = group.sessions.length > 1;
                                        return (
                                            <React.Fragment key={group.key}>
                                                {/* User group row */}
                                                <div
                                                    className="grid grid-cols-[1fr_1fr_120px_60px_100px_120px_90px] gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer items-start"
                                                    onClick={() => { setActiveSession(session); setCurrentView('chats'); }}
                                                >
                                                    {/* User */}
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="relative shrink-0">
                                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-slate-300">
                                                                <User size={16} />
                                                            </div>
                                                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#020617] ${isOnline ? 'bg-green-500' : 'bg-slate-500'}`} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-white truncate">
                                                                {group.name !== 'Anonymous' ? group.name : <span className="text-slate-500 italic font-normal">Anonymous</span>}
                                                            </p>
                                                            <p className="text-[10px] text-slate-600 font-mono truncate">{session.session_id.slice(0, 20)}…</p>
                                                        </div>
                                                    </div>

                                                    {/* Contact / IP */}
                                                    <div className="flex flex-col justify-center gap-1 min-w-0">
                                                        {contact ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <Mail size={11} className="text-emerald-400 shrink-0" />
                                                                <span className="text-xs text-emerald-300 truncate">{contact}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-600 italic">No contact</span>
                                                        )}
                                                        {ip && (
                                                            <div className="flex items-center gap-1.5">
                                                                <MapPin size={10} className="text-slate-500 shrink-0" />
                                                                <span className="text-[10px] text-slate-500 font-mono truncate">{ip}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Site / Origin */}
                                                    <div className="flex flex-col justify-center gap-1 min-w-0">
                                                        {siteName ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <Globe size={11} className="text-blue-400 shrink-0" />
                                                                <span className="text-xs text-blue-300 truncate">{siteName}</span>
                                                            </div>
                                                        ) : null}
                                                        {host ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <ExternalLink size={10} className="text-slate-500 shrink-0" />
                                                                <span className="text-[10px] text-slate-500 truncate">{host}</span>
                                                            </div>
                                                        ) : (
                                                            !siteName && <span className="text-xs text-slate-600 italic">—</span>
                                                        )}
                                                    </div>

                                                    {/* Sessions count with expand toggle */}
                                                    <div className="flex items-center">
                                                        <button
                                                            onClick={e => { e.stopPropagation(); if (hasMultiple) setExpandedUserRows(prev => { const n = new Set(prev); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n; }); }}
                                                            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-bold border transition-colors ${hasMultiple ? 'bg-blue-500/15 text-blue-400 border-blue-500/20 hover:bg-blue-500/25 cursor-pointer' : 'bg-slate-700/50 text-slate-400 border-transparent cursor-default'}`}
                                                            title={hasMultiple ? (isExpanded ? 'Collapse sessions' : 'Expand sessions') : '1 session'}
                                                        >
                                                            {group.sessions.length}
                                                            {hasMultiple && <ChevronRight size={11} className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />}
                                                        </button>
                                                    </div>

                                                    {/* Status */}
                                                    <div className="flex items-center">
                                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${session.status === 'human'
                                                            ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                                                            : 'bg-green-500/15 text-green-400 border border-green-500/20'
                                                            }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${session.status === 'human' ? 'bg-orange-400' : 'bg-green-400'}`} />
                                                            {session.status === 'human' ? 'Human' : 'AI'}
                                                        </span>
                                                    </div>

                                                    {/* Last Active */}
                                                    <div className="flex items-center">
                                                        <span className="text-xs text-slate-400">
                                                            {session.last_message_at
                                                                ? format(new Date(session.last_message_at), 'MMM d, HH:mm')
                                                                : <span className="text-slate-600">—</span>}
                                                        </span>
                                                    </div>

                                                    {/* Started (earliest session) */}
                                                    <div className="flex items-center">
                                                        <span className="text-xs text-slate-500">
                                                            {group.earliestAt && isFinite(group.earliestAt)
                                                                ? format(new Date(group.earliestAt), 'MMM d')
                                                                : '—'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Expanded sub-sessions */}
                                                {isExpanded && hasMultiple && [...group.sessions]
                                                    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
                                                    .map((sub, idx) => (
                                                        <div
                                                            key={sub.session_id}
                                                            className="grid grid-cols-[1fr_1fr_120px_60px_100px_120px_90px] gap-4 pl-10 pr-5 py-2.5 bg-slate-900/30 hover:bg-white/[0.02] border-l-2 border-indigo-500/20 cursor-pointer transition-colors items-center"
                                                            onClick={() => { setActiveSession(sub); setCurrentView('chats'); }}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-[10px] text-slate-600 font-mono shrink-0">#{idx + 1}</span>
                                                                <span className="text-[10px] text-slate-500 font-mono truncate">{sub.session_id.slice(0, 24)}…</span>
                                                            </div>
                                                            <div className="col-span-2 min-w-0">
                                                                <p className="text-xs text-slate-400 line-clamp-2" title={sub.last_message || ''}>{sub.last_message || 'Started a conversation'}</p>
                                                            </div>
                                                            <div></div>
                                                            <div className="flex items-center">
                                                                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${sub.status === 'human' ? 'bg-orange-500/10 text-orange-400' : 'bg-green-500/10 text-green-400'}`}>
                                                                    {sub.status === 'human' ? 'Human' : 'AI'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs text-slate-500">
                                                                    {sub.last_message_at ? format(new Date(sub.last_message_at), 'MMM d, HH:mm') : '—'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs text-slate-600">
                                                                    {sub.created_at ? format(new Date(sub.created_at), 'MMM d') : '—'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                {/* Footer */}
                                {uniqueUserGroups.length > 0 && (
                                    <div className="px-5 py-3 border-t border-white/5 bg-slate-900/20 flex items-center justify-between">
                                        <p className="text-[11px] text-slate-500">
                                            Showing <span className="text-slate-300 font-semibold">{uniqueUserGroups.length}</span> unique users · <span className="text-slate-300 font-semibold">{filteredUsers.length}</span> sessions
                                        </p>
                                        <p className="text-[11px] text-slate-600">Click row to open chat · Click count to expand sessions</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Analytics Page View */}
                {currentView === 'analytics' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {/* Analytics Header */}
                        <div className="h-16 md:h-20 border-b border-white/5 px-4 md:px-8 flex items-center justify-between bg-slate-950/20 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                                    <BarChart3 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-[17px] text-white tracking-tight">Analytics Dashboard</h2>
                                    <p className="text-[10px] text-slate-400 mt-0.5">User message summaries & insights</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { fetchAnalytics(); fetchTopQueries(); }}
                                className="px-4 py-2 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2 text-xs font-medium"
                            >
                                <Activity size={14} />
                                Refresh
                            </button>
                        </div>

                        {/* Analytics Content */}
                        <div className="p-4 md:p-8">
                            {analytics ? (
                                <>
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                                        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-blue-500/30 hover:bg-slate-800/80 transition-all group" onClick={() => setAnalyticsModal('total_sessions')}>
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                                                    <Users size={20} className="text-blue-400" />
                                                </div>
                                                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Total Sessions</span>
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-blue-400 transition-colors" />
                                            </div>
                                            <p className="text-3xl font-bold text-white">{analytics.totalSessions}</p>
                                            <p className="text-xs text-green-400 mt-1">+{analytics.activeSessions24h} today</p>
                                        </div>

                                        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-purple-500/30 hover:bg-slate-800/80 transition-all group" onClick={() => setAnalyticsModal('total_messages')}>
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center">
                                                    <MessageCircle size={20} className="text-purple-400" />
                                                </div>
                                                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Total Messages</span>
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-purple-400 transition-colors" />
                                            </div>
                                            <p className="text-3xl font-bold text-white">{analytics.totalMessages}</p>
                                            <p className="text-xs text-slate-400 mt-1">~{analytics.avgMessagesPerSession} per session</p>
                                        </div>

                                        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-green-500/30 hover:bg-slate-800/80 transition-all group" onClick={() => setAnalyticsModal('active_24h')}>
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center">
                                                    <Activity size={20} className="text-green-400" />
                                                </div>
                                                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Active (24h)</span>
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-green-400 transition-colors" />
                                            </div>
                                            <p className="text-3xl font-bold text-white">{analytics.activeSessions24h}</p>
                                            <p className="text-xs text-slate-400 mt-1">sessions today</p>
                                        </div>

                                        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-orange-500/30 hover:bg-slate-800/80 transition-all group" onClick={() => setAnalyticsModal('avg_response')}>
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-xl bg-orange-600/20 flex items-center justify-center">
                                                    <Zap size={20} className="text-orange-400" />
                                                </div>
                                                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Avg Response</span>
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-orange-400 transition-colors" />
                                            </div>
                                            <p className="text-3xl font-bold text-white">{Math.round(analytics.avgResponseTimeSeconds || 0)}s</p>
                                            <p className="text-xs text-slate-400 mt-1">response time</p>
                                        </div>
                                    </div>

                                    {/* Two Column Layout */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
                                        {/* Messages by Sender */}
                                        <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-blue-500/20 hover:bg-slate-800/60 transition-all group" onClick={() => setAnalyticsModal('messages_by_sender')}>
                                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                                <TrendingUp size={16} className="text-blue-400" />
                                                Messages by Sender
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-blue-400 transition-colors" />
                                            </h3>
                                            <div className="space-y-3">
                                                {analytics.messagesBySender?.map((item, idx) => (
                                                    <div key={idx} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full ${item.sender === 'user' ? 'bg-blue-500' :
                                                                item.sender === 'ai' ? 'bg-green-500' : 'bg-purple-500'
                                                                }`}></div>
                                                            <span className="text-sm text-slate-300 capitalize">{item.sender}</span>
                                                        </div>
                                                        <span className="text-sm font-mono text-white">{item.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Sessions by Status */}
                                        <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-green-500/20 hover:bg-slate-800/60 transition-all group" onClick={() => setAnalyticsModal('sessions_by_status')}>
                                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                                <Activity size={16} className="text-green-400" />
                                                Sessions by Status
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-green-400 transition-colors" />
                                            </h3>
                                            <div className="space-y-3">
                                                {analytics.sessionsByStatus?.map((item, idx) => (
                                                    <div key={idx} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full ${item.status === 'ai' ? 'bg-green-500' : 'bg-orange-500'
                                                                }`}></div>
                                                            <span className="text-sm text-slate-300 uppercase">{item.status} Mode</span>
                                                        </div>
                                                        <span className="text-sm font-mono text-white">{item.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Peak Hours */}
                                        <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-orange-500/20 hover:bg-slate-800/60 transition-all group" onClick={() => setAnalyticsModal('peak_hours')}>
                                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                                <Clock size={16} className="text-orange-400" />
                                                Peak Activity Hours
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-orange-400 transition-colors" />
                                            </h3>
                                            <div className="space-y-2">
                                                {analytics.peakHours?.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-3">
                                                        <span className="text-xs text-slate-400 w-16">{String(item.hour).padStart(2, '0')}:00</span>
                                                        <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full"
                                                                style={{ width: `${(item.count / (analytics.peakHours[0]?.count || 1)) * 100}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs font-mono text-slate-300 w-10 text-right">{item.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Messages Per Day */}
                                        <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-purple-500/20 hover:bg-slate-800/60 transition-all group" onClick={() => setAnalyticsModal('messages_per_day')}>
                                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                                <BarChart3 size={16} className="text-purple-400" />
                                                Messages (Last 7 Days)
                                                <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-purple-400 transition-colors" />
                                            </h3>
                                            <div className="space-y-2">
                                                {analytics.messagesPerDay?.slice(0, 7).map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-3">
                                                        <span className="text-xs text-slate-400 w-20">{format(new Date(item.date), 'MMM dd')}</span>
                                                        <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                                                                style={{ width: `${(item.count / Math.max(...analytics.messagesPerDay.map(d => d.count), 1)) * 100}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs font-mono text-slate-300 w-10 text-right">{item.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Top User Queries Section */}
                                    <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-5">
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 cursor-pointer group" onClick={() => setAnalyticsModal('top_queries')}>
                                            <Hash size={16} className="text-cyan-400" />
                                            Top User Queries & Messages
                                            <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-cyan-400 transition-colors" />
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                                            {topQueries.length > 0 ? topQueries.map((item, idx) => {
                                                const isExpanded = expandedQueryIdx === idx;
                                                const isLong = item.query?.length > 80;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`bg-slate-900/50 rounded-xl p-3 border border-white/5 transition-colors ${isLong ? 'cursor-pointer hover:border-cyan-500/20 hover:bg-slate-900/80' : ''}`}
                                                        onClick={() => isLong && setExpandedQueryIdx(isExpanded ? null : idx)}
                                                        title={isLong && !isExpanded ? item.query : undefined}
                                                    >
                                                        <p className={`text-sm text-slate-200 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'}`}>{item.query}</p>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <span className="text-[10px] text-slate-500 uppercase">Frequency</span>
                                                            <div className="flex items-center gap-2">
                                                                {isLong && (
                                                                    <span className="text-[10px] text-cyan-500/70">{isExpanded ? 'show less ↑' : 'show more ↓'}</span>
                                                                )}
                                                                <span className="text-xs font-bold text-cyan-400">{item.count}x</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }) : (
                                                <p className="text-sm text-slate-500 col-span-3">No queries recorded yet</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* AI-Powered Chat Report Section */}
                                    <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-5 mt-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                <Sparkles size={16} className="text-cyan-400" />
                                                AI Chat Report
                                            </h3>
                                            <button
                                                onClick={fetchChatReport}
                                                disabled={loadingReport}
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-medium flex items-center gap-2 hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-600/20 disabled:opacity-50"
                                            >
                                                {loadingReport ? (
                                                    <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
                                                ) : (
                                                    <><Sparkles size={14} /> Generate AI Report</>
                                                )}
                                            </button>
                                        </div>

                                        {chatReport ? (
                                            <div className="space-y-4">
                                                {/* Report Summary */}
                                                <div className="bg-gradient-to-br from-cyan-600/10 to-blue-600/10 border border-cyan-500/20 rounded-xl p-4">
                                                    <p className="text-xs text-slate-200 leading-relaxed">{chatReport.reportSummary}</p>
                                                    <p className="text-[10px] text-slate-500 mt-2">
                                                        Based on {chatReport.sessionsAnalyzed} sessions • {chatReport.tokensUsed} tokens
                                                    </p>
                                                </div>

                                                {/* Sentiment Breakdown */}
                                                {chatReport.sentimentBreakdown && (
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                                                            <ThumbsUp size={18} className="text-green-400 mx-auto mb-1" />
                                                            <p className="text-lg font-bold text-green-400">{chatReport.sentimentBreakdown.positive || 0}</p>
                                                            <p className="text-[10px] text-slate-400">Positive</p>
                                                        </div>
                                                        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                                                            <AlertCircle size={18} className="text-slate-400 mx-auto mb-1" />
                                                            <p className="text-lg font-bold text-slate-300">{chatReport.sentimentBreakdown.neutral || 0}</p>
                                                            <p className="text-[10px] text-slate-400">Neutral</p>
                                                        </div>
                                                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                                                            <ThumbsDown size={18} className="text-red-400 mx-auto mb-1" />
                                                            <p className="text-lg font-bold text-red-400">{chatReport.sentimentBreakdown.negative || 0}</p>
                                                            <p className="text-[10px] text-slate-400">Negative</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Common Topics */}
                                                {chatReport.commonTopics?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                            <Hash size={12} /> Common Topics
                                                        </h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {chatReport.commonTopics.map((topic, idx) => (
                                                                <span key={idx} className="px-2 py-1 bg-purple-600/10 text-purple-300 rounded-lg text-[11px] border border-purple-500/20">
                                                                    {topic}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Key Insights */}
                                                {chatReport.keyInsights?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                            <Target size={12} /> Key Insights
                                                        </h4>
                                                        <div className="space-y-2">
                                                            {chatReport.keyInsights.map((insight, idx) => (
                                                                <div key={idx} className="bg-slate-900/50 rounded-lg p-3 border border-white/5 flex items-start gap-2">
                                                                    <span className="text-amber-400 mt-0.5">💡</span>
                                                                    <p className="text-xs text-slate-300">{insight}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Recommendations */}
                                                {chatReport.recommendations?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                            <CheckCircle2 size={12} /> Recommendations
                                                        </h4>
                                                        <div className="space-y-2">
                                                            {chatReport.recommendations.map((rec, idx) => (
                                                                <div key={idx} className="bg-cyan-600/5 rounded-lg p-3 border border-cyan-500/10 flex items-start gap-2">
                                                                    <span className="text-cyan-400 mt-0.5">✅</span>
                                                                    <p className="text-xs text-slate-300">{rec}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <Sparkles size={32} className="text-slate-600 mx-auto mb-3" />
                                                <p className="text-sm text-slate-500">Click "Generate AI Report" to analyze recent conversations</p>
                                                <p className="text-xs text-slate-600 mt-1">Uses GPT to summarize trends, sentiment & provide recommendations</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-20">
                                    <div className="text-center">
                                        <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                        <p className="text-slate-400">Loading analytics...</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Chats View */}
                {currentView === 'chats' && activeSession ? (
                    <>
                        {/* Header */}
                        <div className="h-16 md:h-20 border-b border-white/5 px-3 md:px-8 flex items-center justify-between bg-slate-950/20 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-2 md:gap-4 min-w-0">
                                {/* Mobile back button */}
                                <button
                                    onClick={() => { setActiveSession(null); setIsSidebarOpen(true); }}
                                    className="md:hidden w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
                                >
                                    <ArrowLeft size={18} />
                                </button>
                                <div className="w-9 h-9 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
                                    <User className="w-5 h-5 ml-0.5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="font-bold text-[14px] md:text-[17px] text-white tracking-tight truncate">{activeSession.customer_name || 'Anonymous User'}</h2>
                                        {/* User Contact Badge - only show if different from name */}
                                        {(activeSession.user_contact || activeSession.metadata?.user_contact || activeSession.metadata?.user_email || activeSession.metadata?.user_phone) &&
                                            (activeSession.customer_name !== activeSession.user_contact &&
                                                activeSession.customer_name !== (activeSession.metadata?.user_contact || activeSession.metadata?.user_email || activeSession.metadata?.user_phone)) && (
                                                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-medium hidden sm:inline">
                                                    {activeSession.user_contact || activeSession.metadata?.user_contact || activeSession.metadata?.user_email || activeSession.metadata?.user_phone}
                                                </span>
                                            )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest hidden sm:inline">{activeSession.session_id}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
                                {/* Admin Mode Toggle */}
                                <button
                                    onClick={async () => {
                                        const newStatus = activeSession.status === 'ai' ? 'human' : 'ai';
                                        try {
                                            await fetch(`${SOCKET_URL}/api/sessions/${activeSession.session_id}/status`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ status: newStatus })
                                            });
                                            setActiveSession(prev => ({ ...prev, status: newStatus }));
                                            setSessions(prev => prev.map(s =>
                                                s.session_id === activeSession.session_id ? { ...s, status: newStatus } : s
                                            ));
                                        } catch (err) {
                                            console.error('Failed to toggle mode:', err);
                                        }
                                    }}
                                    className={`px-2 md:px-4 py-2 rounded-xl border flex items-center gap-1.5 md:gap-2 transition-all ${activeSession.status === 'human'
                                        ? 'bg-orange-600/20 border-orange-500/30 text-orange-400'
                                        : 'bg-green-600/20 border-green-500/30 text-green-400'
                                        }`}
                                    title={activeSession.status === 'ai' ? 'Switch to Human mode' : 'Switch to AI mode'}
                                >
                                    {activeSession.status === 'human' ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                    <span className="text-xs font-medium hidden sm:inline">
                                        {activeSession.status === 'ai' ? '🤖 AI' : '👤 Human'}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setShowSessionSummary(!showSessionSummary)}
                                    className={`hidden md:flex px-4 py-2 rounded-xl border items-center gap-2 transition-all ${showSessionSummary
                                        ? 'bg-cyan-600/20 border-cyan-500/30 text-cyan-400'
                                        : 'border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    <FileText size={16} />
                                    <span className="text-xs font-medium">Summary</span>
                                </button>
                                <button className="hidden sm:flex w-9 h-9 rounded-xl border border-white/10 items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                                    <ShieldCheck size={18} />
                                </button>
                                <button className="hidden sm:flex w-9 h-9 rounded-xl border border-white/10 items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                                    <MoreVertical size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Main Chat Area with Optional Summary Panel */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Chat Screen */}
                            <div className={`flex-1 overflow-y-auto p-4 md:p-10 space-y-4 md:space-y-8 custom-scrollbar scroll-smooth ${showSessionSummary ? 'md:pr-4' : ''}`}>
                                {messages.map((msg, idx) => {
                                    const isPreviousSameSender = idx > 0 && messages[idx - 1].sender === msg.sender;
                                    const getSenderLabel = (sender) => {
                                        if (sender === 'admin') return 'You';
                                        if (sender === 'ai') return 'AI Bot';
                                        return 'Customer';
                                    };
                                    return (
                                        <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'} ${isPreviousSameSender ? '-mt-6' : ''}`}>
                                            <div className={`max-w-[75%] group flex flex-col ${msg.sender === 'admin' ? 'items-end' : 'items-start'}`}>
                                                {!isPreviousSameSender && (
                                                    <div className="flex items-center gap-3 mb-2 px-1">
                                                        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${msg.sender === 'ai' ? 'text-green-400' : 'text-slate-400'
                                                            }`}>{getSenderLabel(msg.sender)}</span>
                                                    </div>
                                                )}
                                                <div className={`px-5 py-4 rounded-3xl shadow-2xl transition-all duration-300 ${msg.sender === 'admin'
                                                    ? 'bg-blue-600 text-white rounded-tr-none border border-blue-400/20 ring-1 ring-blue-500/30'
                                                    : msg.sender === 'ai'
                                                        ? 'bg-green-900/40 backdrop-blur-md border border-green-500/20 text-slate-100 rounded-tl-none ring-1 ring-green-500/10'
                                                        : 'bg-slate-800/80 backdrop-blur-md border border-white/10 text-slate-100 rounded-tl-none ring-1 ring-white/5'
                                                    }`}>
                                                    {(() => {
                                                        const fileData = parseFileMsg(msg.content);
                                                        if (fileData) {
                                                            const isImage = fileData.fileType && fileData.fileType.startsWith('image/');
                                                            return isImage ? (
                                                                <a href={fileData.fileUrl} target="_blank" rel="noopener noreferrer">
                                                                    <img
                                                                        src={fileData.fileUrl}
                                                                        alt={fileData.fileName || 'image'}
                                                                        className="max-w-[240px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                                    />
                                                                </a>
                                                            ) : (
                                                                <a
                                                                    href={fileData.fileUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
                                                                >
                                                                    <Paperclip size={14} />
                                                                    <span className="max-w-[180px] truncate">{fileData.fileName || 'File'}</span>
                                                                    {fileData.fileSize && <span className="text-xs opacity-70">{Math.round(fileData.fileSize / 1024)}KB</span>}
                                                                    <ExternalLink size={12} className="opacity-60" />
                                                                </a>
                                                            );
                                                        }
                                                        return <p className="text-[14px] leading-relaxed font-normal whitespace-pre-wrap">{msg.content}</p>;
                                                    })()}
                                                </div>
                                                {/* Timestamp — always visible below the bubble */}
                                                <div className={`flex items-center gap-1.5 mt-1 px-1 ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                        {formatMsgTime(msg.created_at)}
                                                    </span>
                                                    {msg.sender === 'admin' && <CheckCheck size={11} className="text-blue-400/70" />}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Session Summary Panel */}
                            {showSessionSummary && sessionSummary && (
                                <div className="hidden lg:block w-80 border-l border-white/5 bg-slate-900/60 backdrop-blur-md overflow-y-auto custom-scrollbar">
                                    <div className="p-5">
                                        {/* Summary Header */}
                                        <div className="flex items-center justify-between mb-5">
                                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                <FileText size={16} className="text-cyan-400" />
                                                Chat Summary
                                            </h3>
                                            <button
                                                onClick={() => setShowSessionSummary(false)}
                                                className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        {loadingSummary ? (
                                            <div className="flex flex-col items-center justify-center py-12">
                                                <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                                <p className="text-xs text-slate-400 animate-pulse">AI is analyzing conversation...</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* GPT Summary */}
                                                {sessionSummary.summary && (
                                                    <div className="bg-gradient-to-br from-cyan-600/10 to-blue-600/10 border border-cyan-500/20 rounded-xl p-4 mb-4">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Sparkles size={14} className="text-cyan-400" />
                                                            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">AI Summary</span>
                                                        </div>
                                                        <p className="text-xs text-slate-200 leading-relaxed">{sessionSummary.summary}</p>
                                                    </div>
                                                )}

                                                {/* Sentiment & Resolution Row */}
                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                    {sessionSummary.sentiment && (
                                                        <div className={`rounded-xl p-3 border text-center ${sessionSummary.sentiment === 'positive' ? 'bg-green-500/10 border-green-500/20' :
                                                            sessionSummary.sentiment === 'negative' ? 'bg-red-500/10 border-red-500/20' :
                                                                'bg-slate-800/50 border-white/5'
                                                            }`}>
                                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                                {sessionSummary.sentiment === 'positive' ? <ThumbsUp size={14} className="text-green-400" /> :
                                                                    sessionSummary.sentiment === 'negative' ? <ThumbsDown size={14} className="text-red-400" /> :
                                                                        <AlertCircle size={14} className="text-slate-400" />}
                                                            </div>
                                                            <p className="text-[10px] text-slate-400">Sentiment</p>
                                                            <p className={`text-xs font-bold capitalize ${sessionSummary.sentiment === 'positive' ? 'text-green-400' :
                                                                sessionSummary.sentiment === 'negative' ? 'text-red-400' :
                                                                    'text-slate-300'
                                                                }`}>{sessionSummary.sentiment}</p>
                                                        </div>
                                                    )}
                                                    {sessionSummary.resolved !== undefined && (
                                                        <div className={`rounded-xl p-3 border text-center ${sessionSummary.resolved === true ? 'bg-green-500/10 border-green-500/20' :
                                                            sessionSummary.resolved === false ? 'bg-red-500/10 border-red-500/20' :
                                                                'bg-slate-800/50 border-white/5'
                                                            }`}>
                                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                                {sessionSummary.resolved === true ? <CheckCircle2 size={14} className="text-green-400" /> :
                                                                    sessionSummary.resolved === false ? <AlertCircle size={14} className="text-red-400" /> :
                                                                        <HelpCircle size={14} className="text-slate-400" />}
                                                            </div>
                                                            <p className="text-[10px] text-slate-400">Resolved</p>
                                                            <p className={`text-xs font-bold ${sessionSummary.resolved === true ? 'text-green-400' :
                                                                sessionSummary.resolved === false ? 'text-red-400' :
                                                                    'text-slate-300'
                                                                }`}>{sessionSummary.resolved === true ? 'Yes' : sessionSummary.resolved === false ? 'No' : 'Unclear'}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Stats Cards */}
                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                    <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                                                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center mx-auto mb-2">
                                                            <User size={14} className="text-blue-400" />
                                                        </div>
                                                        <p className="text-lg font-bold text-white">{sessionSummary.stats?.userMessages || 0}</p>
                                                        <p className="text-[10px] text-slate-400">User Msgs</p>
                                                    </div>
                                                    <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                                                        <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center mx-auto mb-2">
                                                            <Bot size={14} className="text-green-400" />
                                                        </div>
                                                        <p className="text-lg font-bold text-white">{sessionSummary.stats?.aiMessages || 0}</p>
                                                        <p className="text-[10px] text-slate-400">AI Replies</p>
                                                    </div>
                                                    <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                                                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center mx-auto mb-2">
                                                            <ShieldCheck size={14} className="text-purple-400" />
                                                        </div>
                                                        <p className="text-lg font-bold text-white">{sessionSummary.stats?.adminMessages || 0}</p>
                                                        <p className="text-[10px] text-slate-400">Admin Msgs</p>
                                                    </div>
                                                    <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                                                        <div className="w-8 h-8 rounded-lg bg-orange-600/20 flex items-center justify-center mx-auto mb-2">
                                                            <Timer size={14} className="text-orange-400" />
                                                        </div>
                                                        <p className="text-lg font-bold text-white">
                                                            {sessionSummary.stats?.sessionDurationSeconds
                                                                ? sessionSummary.stats.sessionDurationSeconds < 60
                                                                    ? `${sessionSummary.stats.sessionDurationSeconds}s`
                                                                    : `${Math.round(sessionSummary.stats.sessionDurationSeconds / 60)}m`
                                                                : '0s'}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400">Duration</p>
                                                    </div>
                                                </div>

                                                {/* Intent */}
                                                {sessionSummary.intent && (
                                                    <div className="bg-slate-800/30 border border-white/5 rounded-xl p-3 mb-4">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Target size={12} className="text-amber-400" />
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">User Intent</span>
                                                        </div>
                                                        <p className="text-xs text-slate-200">{sessionSummary.intent}</p>
                                                    </div>
                                                )}

                                                {/* Session Status */}
                                                <div className="bg-slate-800/30 border border-white/5 rounded-xl p-3 mb-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-slate-400">Mode</span>
                                                        <span className={`text-xs font-bold uppercase px-2 py-1 rounded-lg ${sessionSummary.status === 'ai'
                                                            ? 'bg-green-600/20 text-green-400'
                                                            : 'bg-orange-600/20 text-orange-400'
                                                            }`}>
                                                            {sessionSummary.status === 'ai' ? '🤖 AI Mode' : '👤 Human Mode'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Topics */}
                                                {sessionSummary.topics?.length > 0 && (
                                                    <div className="mb-4">
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                            <Tag size={12} />
                                                            Topics
                                                        </h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {sessionSummary.topics.map((topic, idx) => (
                                                                <span
                                                                    key={idx}
                                                                    className="px-2 py-1 bg-cyan-600/10 text-cyan-300 rounded-lg text-[11px] border border-cyan-500/20"
                                                                >
                                                                    {topic}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Highlights */}
                                                {sessionSummary.highlights?.length > 0 && (
                                                    <div className="mb-4">
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                            <Sparkles size={12} />
                                                            Key Moments
                                                        </h4>
                                                        <div className="space-y-2">
                                                            {sessionSummary.highlights.map((highlight, idx) => (
                                                                <div key={idx} className="bg-slate-800/50 border border-white/5 rounded-lg p-3">
                                                                    <p className="text-xs text-slate-300 italic">"{highlight}"</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Metadata Info */}
                                                {sessionSummary.metadata && (
                                                    <div className="mt-4 pt-4 border-t border-white/5">
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                                            Session Info
                                                        </h4>
                                                        <div className="space-y-2 text-[11px]">
                                                            {sessionSummary.metadata.site_name && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">Site</span>
                                                                    <span className="text-slate-300">{sessionSummary.metadata.site_name}</span>
                                                                </div>
                                                            )}
                                                            {sessionSummary.metadata.host && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">Origin</span>
                                                                    <span className="text-slate-300 truncate ml-2 max-w-[150px]">{sessionSummary.metadata.host}</span>
                                                                </div>
                                                            )}
                                                            {sessionSummary.createdAt && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">Started</span>
                                                                    <span className="text-slate-300">{format(new Date(sessionSummary.createdAt), 'MMM dd, HH:mm')}</span>
                                                                </div>
                                                            )}
                                                            {sessionSummary.tokensUsed > 0 && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">AI Tokens</span>
                                                                    <span className="text-cyan-400 font-mono">{sessionSummary.tokensUsed}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input Deck */}
                        <div className="p-3 md:p-8 mt-auto">
                            <div className="max-w-4xl mx-auto backdrop-blur-3xl bg-slate-900/60 border border-white/10 rounded-2xl md:rounded-[28px] overflow-hidden shadow-3xl shadow-black/40 ring-1 ring-white/5 transition-all focus-within:ring-blue-500/50 focus-within:border-blue-500/30">
                                <form onSubmit={handleSendMessage} className="flex flex-col">
                                    <div className="hidden md:flex items-center gap-2 px-6 pt-2 pb-0">
                                        <button type="button" className="p-2 text-slate-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5">
                                            <Paperclip size={18} />
                                        </button>
                                        <button type="button" className="p-2 text-slate-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5">
                                            <Smile size={18} />
                                        </button>
                                        <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Rich Editor</span>
                                    </div>
                                    <div className="flex items-center gap-2 md:gap-4 p-3 md:p-4 md:pl-6">
                                        <textarea
                                            rows="1"
                                            className="flex-1 bg-transparent border-none py-2 text-[14px] md:text-[15px] outline-none placeholder:text-slate-600 text-slate-100 resize-none min-h-[40px] md:min-h-[44px]"
                                            placeholder="Compose your reply..."
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    handleSendMessage(e);
                                                }
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newMessage.trim()}
                                            className="bg-blue-600 hover:bg-blue-550 disabled:opacity-30 disabled:grayscale text-white h-10 md:h-12 px-4 md:px-8 rounded-xl md:rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-95 flex items-center gap-2 md:gap-3 font-bold text-sm tracking-tight"
                                        >
                                            <Send size={18} />
                                            <span className="hidden sm:inline">Send</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                            <p className="hidden md:block mt-4 text-center text-[11px] text-slate-600 font-medium tracking-tight">
                                Reply is sent instantly via <span className="text-blue-400/50 italic">Socket.io Protocol</span>
                            </p>
                        </div>
                    </>
                ) : currentView === 'chats' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 md:p-20">
                        <div className="relative group cursor-default">
                            <div className="absolute -inset-10 bg-blue-600/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-1000"></div>
                            <div className="w-20 h-20 md:w-28 md:h-28 rounded-3xl bg-slate-900 border border-white/5 flex items-center justify-center mb-6 md:mb-8 shadow-2xl relative z-10 transition-transform duration-500 hover:rotate-6">
                                <MessageSquare size={40} className="text-blue-500/40 md:hidden" strokeWidth={1.5} />
                                <MessageSquare size={50} className="text-blue-500/40 hidden md:block" strokeWidth={1.5} />
                            </div>
                        </div>
                        <h2 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tighter">Support Commander</h2>
                        <p className="text-slate-500 text-center max-w-[280px] leading-relaxed text-sm font-medium">
                            Welcome back. Select a guest from the left panel to start a high-performance manual session.
                        </p>
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="mt-6 md:hidden px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-600/20"
                        >
                            <MessageSquare size={16} />
                            Open Chats
                        </button>
                    </div>
                )}
            </div>

            {/* ── Analytics Detail Modal ── */}
            {analyticsModal && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    onClick={() => setAnalyticsModal(null)}
                >
                    <div
                        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                            <h3 className="text-base font-bold text-white">
                                {analyticsModal === 'total_sessions' && 'All Sessions'}
                                {analyticsModal === 'total_messages' && 'Message Breakdown'}
                                {analyticsModal === 'active_24h' && 'Active Sessions (Last 24h)'}
                                {analyticsModal === 'avg_response' && 'Response Time Details'}
                                {analyticsModal === 'messages_by_sender' && 'Messages by Sender'}
                                {analyticsModal === 'sessions_by_status' && 'Sessions by Status'}
                                {analyticsModal === 'peak_hours' && 'All Activity Hours (Full 24h)'}
                                {analyticsModal === 'messages_per_day' && 'Daily Message History'}
                                {analyticsModal === 'top_queries' && 'All User Queries'}
                            </h3>
                            <button
                                onClick={() => setAnalyticsModal(null)}
                                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="overflow-y-auto custom-scrollbar p-5 flex-1 space-y-3">

                            {/* TOTAL SESSIONS */}
                            {analyticsModal === 'total_sessions' && (
                                <div className="space-y-2">
                                    {sessions.length === 0 ? (
                                        <p className="text-slate-500 text-sm text-center py-8">No sessions found.</p>
                                    ) : (
                                        [...sessions]
                                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                                            .map(s => (
                                                <div key={s.session_id} className="flex items-center justify-between bg-slate-800/50 rounded-xl p-3 border border-white/5 gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">{s.customer_name || 'Anonymous'}</p>
                                                        <p className="text-xs text-slate-400 font-mono truncate">{s.session_id}</p>
                                                        {s.user_contact && <p className="text-xs text-slate-500 truncate">{s.user_contact}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.status === 'ai' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                            {s.status?.toUpperCase()} MODE
                                                        </span>
                                                        <span className="text-xs text-slate-500 whitespace-nowrap">{s.created_at ? format(new Date(s.created_at), 'MMM dd, HH:mm') : '—'}</span>
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            )}

                            {/* TOTAL MESSAGES */}
                            {analyticsModal === 'total_messages' && analytics && (
                                <div className="space-y-5">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">By Sender</h4>
                                        <div className="space-y-2">
                                            {analytics.messagesBySender?.map((item, idx) => {
                                                const pct = analytics.totalMessages > 0 ? Math.round((item.count / analytics.totalMessages) * 100) : 0;
                                                return (
                                                    <div key={idx} className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                                                        <div className="flex justify-between mb-1.5">
                                                            <span className="text-sm text-slate-300 capitalize">{item.sender}</span>
                                                            <span className="text-sm font-mono text-white">{item.count} ({pct}%)</span>
                                                        </div>
                                                        <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${item.sender === 'user' ? 'bg-blue-500' : item.sender === 'ai' ? 'bg-green-500' : 'bg-purple-500'}`}
                                                                style={{ width: `${pct}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Per Day</h4>
                                        <div className="space-y-1">
                                            {analytics.messagesPerDay?.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/40">
                                                    <span className="text-sm text-slate-300">{format(new Date(item.date), 'MMM dd, yyyy')}</span>
                                                    <span className="text-sm font-mono text-white">{item.count} messages</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ACTIVE 24H */}
                            {analyticsModal === 'active_24h' && (() => {
                                const now = Date.now();
                                const active = sessions.filter(s => now - new Date(s.last_message_at || s.updated_at || 0).getTime() < 86400000);
                                return active.length === 0 ? (
                                    <p className="text-slate-500 text-sm text-center py-8">No sessions active in the last 24 hours.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {active.map(s => (
                                            <div key={s.session_id} className="bg-slate-800/50 rounded-xl p-3 border border-white/5 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{s.customer_name || 'Anonymous'}</p>
                                                    <p className="text-xs text-slate-400 font-mono truncate">{s.session_id}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium block mb-1 ${s.status === 'ai' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                        {s.status?.toUpperCase()}
                                                    </span>
                                                    <p className="text-xs text-green-400">{s.last_message_at || s.updated_at ? format(new Date(s.last_message_at || s.updated_at), 'HH:mm') : '—'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* AVG RESPONSE */}
                            {analyticsModal === 'avg_response' && analytics && (
                                <div className="space-y-4">
                                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-6 text-center">
                                        <p className="text-5xl font-bold text-orange-400">{Math.round(analytics.avgResponseTimeSeconds || 0)}s</p>
                                        <p className="text-sm text-slate-400 mt-2">Average AI Response Time</p>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 space-y-3">
                                        <p className="text-xs text-slate-300 leading-relaxed">Measures the average time between a user message and the AI reply across all sessions.</p>
                                        <div className="space-y-2 mt-2">
                                            {[
                                                { color: 'bg-green-500', label: 'Under 5s — Excellent response time' },
                                                { color: 'bg-yellow-500', label: '5–15s — Acceptable response time' },
                                                { color: 'bg-red-500', label: 'Over 15s — Consider optimization' },
                                            ].map((row, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${row.color}`}></div>
                                                    <span className="text-xs text-slate-400">{row.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 text-center">
                                            <p className="text-2xl font-bold text-white">{analytics.totalSessions}</p>
                                            <p className="text-xs text-slate-400 mt-1">Total Sessions</p>
                                        </div>
                                        <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 text-center">
                                            <p className="text-2xl font-bold text-white">{analytics.avgMessagesPerSession}</p>
                                            <p className="text-xs text-slate-400 mt-1">Avg Msgs / Session</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* MESSAGES BY SENDER */}
                            {analyticsModal === 'messages_by_sender' && analytics && (
                                <div className="space-y-3">
                                    {analytics.messagesBySender?.map((item, idx) => {
                                        const pct = analytics.totalMessages > 0 ? Math.round((item.count / analytics.totalMessages) * 100) : 0;
                                        return (
                                            <div key={idx} className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className={`w-4 h-4 rounded-full ${item.sender === 'user' ? 'bg-blue-500' : item.sender === 'ai' ? 'bg-green-500' : 'bg-purple-500'}`}></div>
                                                    <span className="text-sm font-medium text-white capitalize">{item.sender}</span>
                                                    <span className="ml-auto text-2xl font-bold text-white">{item.count}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-3 bg-slate-700/50 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${item.sender === 'user' ? 'bg-blue-500' : item.sender === 'ai' ? 'bg-green-500' : 'bg-purple-500'}`}
                                                            style={{ width: `${pct}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-300 w-10 text-right">{pct}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="bg-slate-800/30 rounded-xl p-4 border border-white/5 text-center">
                                        <p className="text-3xl font-bold text-white">{analytics.totalMessages}</p>
                                        <p className="text-xs text-slate-400 mt-1">Total Messages</p>
                                    </div>
                                </div>
                            )}

                            {/* SESSIONS BY STATUS */}
                            {analyticsModal === 'sessions_by_status' && analytics && (
                                <div className="space-y-5">
                                    {analytics.sessionsByStatus?.map((statusItem, idx) => {
                                        const statusSessions = sessions.filter(s => s.status === statusItem.status);
                                        return (
                                            <div key={idx}>
                                                <div className="flex items-center gap-2 mb-2 px-1">
                                                    <div className={`w-3 h-3 rounded-full ${statusItem.status === 'ai' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                                                    <span className="text-sm font-bold text-white uppercase">{statusItem.status} Mode</span>
                                                    <span className="ml-auto text-sm font-mono text-slate-300">{statusItem.count} sessions</span>
                                                </div>
                                                <div className="space-y-1.5 pl-3">
                                                    {statusSessions.map(s => (
                                                        <div key={s.session_id} className="flex items-center justify-between bg-slate-800/40 rounded-lg p-2.5 border border-white/5">
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-medium text-white truncate">{s.customer_name || 'Anonymous'}</p>
                                                                <p className="text-[10px] text-slate-500 font-mono truncate">{s.session_id}</p>
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 shrink-0 ml-3">{s.created_at ? format(new Date(s.created_at), 'MMM dd') : '—'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* PEAK HOURS — full 24h */}
                            {analyticsModal === 'peak_hours' && analytics && (
                                <div className="space-y-1.5">
                                    {Array.from({ length: 24 }, (_, h) => {
                                        const item = analytics.peakHours?.find(p => Number(p.hour) === h);
                                        const count = item?.count || 0;
                                        const max = Math.max(...(analytics.peakHours?.map(p => p.count) || [1]), 1);
                                        return (
                                            <div key={h} className="flex items-center gap-3">
                                                <span className="text-xs text-slate-400 w-14 text-right">{String(h).padStart(2, '0')}:00</span>
                                                <div className="flex-1 bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${count > 0 ? 'bg-gradient-to-r from-orange-500 to-yellow-500' : ''}`}
                                                        style={{ width: `${(count / max) * 100}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-mono text-slate-300 w-8 text-right">{count || '—'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* MESSAGES PER DAY — full history */}
                            {analyticsModal === 'messages_per_day' && analytics && (
                                <div className="space-y-1">
                                    {analytics.messagesPerDay?.map((item, idx) => {
                                        const max = Math.max(...analytics.messagesPerDay.map(d => d.count), 1);
                                        return (
                                            <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/40">
                                                <span className="text-sm text-slate-300 w-28 shrink-0">{format(new Date(item.date), 'MMM dd, yyyy')}</span>
                                                <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                                                        style={{ width: `${(item.count / max) * 100}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-mono text-slate-300 w-14 text-right">{item.count} msgs</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* TOP QUERIES */}
                            {analyticsModal === 'top_queries' && (
                                <div className="space-y-2">
                                    {topQueries.length === 0 ? (
                                        <p className="text-slate-500 text-sm text-center py-8">No queries recorded yet.</p>
                                    ) : topQueries.map((item, idx) => (
                                        <div key={idx} className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                                            <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{item.query}</p>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-[10px] text-slate-500 uppercase">Frequency</span>
                                                <span className="text-xs font-bold text-cyan-400">{item.count}x</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 5px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );
}

export default App;
