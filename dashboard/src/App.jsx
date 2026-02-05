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
    Sidebar as SidebarIcon
} from 'lucide-react';
import { format } from 'date-fns';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [socket, setSocket] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
            const res = await fetch(`${SOCKET_URL}/api/sessions`);
            const data = await res.json();
            setSessions(data);
        } catch (err) {
            console.error('Error fetching sessions:', err);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    // Fetch Messages when session changes
    useEffect(() => {
        if (activeSession) {
            fetch(`${SOCKET_URL}/api/sessions/${activeSession.session_id}/messages`)
                .then(res => res.json())
                .then(data => {
                    setMessages(data);
                    socket?.emit('join_session', activeSession.session_id);
                });
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
    (s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.session_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans selection:bg-blue-500/30">
            {/* Elegant Sidebar */}
            <div className={`${isSidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 border-r border-white/5 flex flex-col bg-slate-900/40 backdrop-blur-2xl z-20`}>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center p-1.5 shadow-lg shadow-blue-500/20">
                                <MessageSquare className="text-white w-full h-full" />
                            </div>
                            <span className="font-bold text-lg tracking-tight text-white">Console</span>
                        </div>
                        <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white transition-colors">
                            <SidebarIcon size={18} />
                        </button>
                    </div>

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
                </div>

                <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4 custom-scrollbar">
                    <div className="px-3 mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Active Chats</span>
                    </div>
                    {filteredSessions.map(session => (
                        <button
                            key={session.session_id}
                            onClick={() => setActiveSession(session)}
                            className={`w-full p-4  flex gap-4 rounded-2xl transition-all duration-200 group relative ${activeSession?.session_id === session.session_id ? 'bg-blue-600/10 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                        >
                            <div className="relative shrink-0">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors overflow-hidden">
                                    <User className="w-6 h-6" />
                                </div>
                                {/* Dynamic status based on last activity (within 5 minutes = online) */}
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
                                <p className="text-[12px] text-slate-400 truncate opacity-70 leading-relaxed font-light">{session.last_message || 'Started a conversation'}</p>
                            </div>
                            {activeSession?.session_id === session.session_id && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                            )}
                        </button>
                    ))}
                    {filteredSessions.length === 0 && (
                        <div className="p-8 text-center mt-10">
                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                                <Search className="text-slate-600" size={20} />
                            </div>
                            <p className="text-xs text-slate-500 font-medium italic">No results found</p>
                        </div>
                    )}
                </div>

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
                    <button onClick={() => setIsSidebarOpen(true)} className="absolute left-6 top-6 z-30 w-10 h-10 bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-xl">
                        <SidebarIcon size={18} />
                    </button>
                )}

                {activeSession ? (
                    <>
                        {/* Header */}
                        <div className="h-20 border-b border-white/5 px-8 flex items-center justify-between bg-slate-950/20 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                    <User className="w-5 h-5 ml-0.5" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-[17px] text-white tracking-tight">{activeSession.customer_name || 'Anonymous User'}</h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">{activeSession.session_id}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                                    <ShieldCheck size={18} />
                                </button>
                                <button className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                                    <MoreVertical size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Chat Screen */}
                        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar scroll-smooth">
                            {messages.map((msg, idx) => {
                                const isPreviousSameSender = idx > 0 && messages[idx - 1].sender === msg.sender;
                                return (
                                    <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'} ${isPreviousSameSender ? '-mt-6' : ''}`}>
                                        <div className={`max-w-[75%] group flex flex-col ${msg.sender === 'admin' ? 'items-end' : 'items-start'}`}>
                                            {!isPreviousSameSender && (
                                                <div className="flex items-center gap-3 mb-2 px-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{msg.sender === 'admin' ? 'You' : 'Customer'}</span>
                                                </div>
                                            )}
                                            <div className={`relative px-5 py-4 rounded-3xl shadow-2xl transition-all duration-300 ${msg.sender === 'admin'
                                                ? 'bg-blue-600 text-white rounded-tr-none border border-blue-400/20 ring-1 ring-blue-500/30'
                                                : 'bg-slate-800/80 backdrop-blur-md border border-white/10 text-slate-100 rounded-tl-none ring-1 ring-white/5'
                                                }`}>
                                                <p className="text-[14px] leading-relaxed font-normal whitespace-pre-wrap">{msg.content}</p>
                                                <div className={`absolute bottom-1 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-1 group-hover:translate-y-0`}>
                                                    <span className="text-[9px] font-medium text-white/40 font-mono tracking-tighter">
                                                        {format(new Date(msg.created_at || new Date()), 'HH:mm')}
                                                    </span>
                                                    {msg.sender === 'admin' && <CheckCheck size={10} className="text-white/60" />}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Deck */}
                        <div className="p-8 mt-auto">
                            <div className="max-w-4xl mx-auto backdrop-blur-3xl bg-slate-900/60 border border-white/10 rounded-[28px] overflow-hidden shadow-3xl shadow-black/40 ring-1 ring-white/5 transition-all focus-within:ring-blue-500/50 focus-within:border-blue-500/30">
                                <form onSubmit={handleSendMessage} className="flex flex-col">
                                    <div className="flex items-center gap-2 px-6 pt-2 pb-0">
                                        <button type="button" className="p-2 text-slate-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5">
                                            <Paperclip size={18} />
                                        </button>
                                        <button type="button" className="p-2 text-slate-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5">
                                            <Smile size={18} />
                                        </button>
                                        <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Rich Editor</span>
                                    </div>
                                    <div className="flex items-center gap-4 p-4 pl-6">
                                        <textarea
                                            rows="1"
                                            className="flex-1 bg-transparent border-none py-2 text-[15px] outline-none placeholder:text-slate-600 text-slate-100 resize-none min-h-[44px]"
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
                                            className="bg-blue-600 hover:bg-blue-550 disabled:opacity-30 disabled:grayscale text-white h-12 px-8 rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-95 flex items-center gap-3 font-bold text-sm tracking-tight"
                                        >
                                            <Send size={18} />
                                            <span>Send</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                            <p className="mt-4 text-center text-[11px] text-slate-600 font-medium tracking-tight">
                                Reply is sent instantly via <span className="text-blue-400/50 italic">Socket.io Protocol</span>
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-20">
                        <div className="relative group cursor-default">
                            <div className="absolute -inset-10 bg-blue-600/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-1000"></div>
                            <div className="w-28 h-28 rounded-3xl bg-slate-900 border border-white/5 flex items-center justify-center mb-8 shadow-2xl relative z-10 transition-transform duration-500 hover:rotate-6">
                                <MessageSquare size={50} className="text-blue-500/40" strokeWidth={1.5} />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-3 tracking-tighter">Support Commander</h2>
                        <p className="text-slate-500 text-center max-w-[280px] leading-relaxed text-sm font-medium">
                            Welcome back. Select a guest from the left panel to start a high-performance manual session.
                        </p>
                    </div>
                )}
            </div>

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
