import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
    MessageSquare,
    Send,
    User,
    Bot,
    ShieldCheck,
    Clock,
    Search,
    AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

const SOCKET_URL = 'http://localhost:3001';

function App() {
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [socket, setSocket] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const messagesEndRef = useRef(null);

    // Initialize Socket
    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('new_message', (msg) => {
            if (activeSession && msg.sessionId === activeSession.session_id) {
                setMessages(prev => [...prev, msg]);
            }
            // Update session list to show new last message
            fetchSessions();
        });

        newSocket.on('session_update', () => {
            fetchSessions();
        });

        return () => newSocket.close();
    }, [activeSession]);

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
            sender: 'admin'
        };

        socket.emit('send_manual_message', msgData);

        // Optimistic update
        setMessages(prev => [...prev, { ...msgData, created_at: new Date().toISOString() }]);
        setNewMessage('');
    };

    const filteredSessions = sessions.filter(s =>
    (s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.session_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
            {/* Sidebar: Session List */}
            <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-xl">
                <div className="p-6 border-b border-slate-800">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
                        <MessageSquare className="text-blue-500 w-6 h-6" />
                        Chat Support
                    </h1>
                    <div className="mt-4 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search sessions..."
                            className="w-full bg-slate-800 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredSessions.map(session => (
                        <button
                            key={session.session_id}
                            onClick={() => setActiveSession(session)}
                            className={`w-full p-4 flex gap-4 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 text-left ${activeSession?.session_id === session.session_id ? 'bg-slate-800 border-l-4 border-l-blue-500' : ''}`}
                        >
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${session.status === 'human' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                {session.status === 'human' ? <ShieldCheck /> : <Bot />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-semibold truncate text-slate-100">{session.customer_name || 'Guest'}</h3>
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                                        {session.status}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 truncate">{session.last_message || 'No messages yet'}</p>
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                                    <Clock className="w-3 h-3" />
                                    {session.last_message_at ? format(new Date(session.last_message_at), 'HH:mm') : 'Never'}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                {activeSession ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeSession.status === 'human' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                    <User className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-100">{activeSession.customer_name || 'Guest'}</h2>
                                    <p className="text-[10px] text-slate-500 font-mono tracking-tight">{activeSession.session_id}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${activeSession.status === 'human' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                    Mode: {activeSession.status}
                                </span>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] group ${msg.sender === 'admin' ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-2 mb-1 px-1">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{msg.sender}</span>
                                            <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {format(new Date(msg.created_at || new Date()), 'HH:mm:ss')}
                                            </span>
                                        </div>
                                        <div className={`p-4 rounded-2xl shadow-lg border ${msg.sender === 'admin'
                                                ? 'bg-blue-600 border-blue-500 text-white rounded-tr-none'
                                                : msg.sender === 'ai'
                                                    ? 'bg-slate-800 border-slate-700 text-slate-200 rounded-tl-none'
                                                    : 'bg-indigo-900/50 border-indigo-500/50 text-indigo-100 rounded-tl-none'
                                            }`}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-6 bg-slate-900/50 backdrop-blur-xl border-t border-slate-800">
                            <form onSubmit={handleSendMessage} className="flex gap-4 p-1 bg-slate-800 rounded-2xl border border-slate-700 shadow-xl focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                <input
                                    type="text"
                                    className="flex-1 bg-transparent border-none px-4 text-sm outline-none placeholder:text-slate-500"
                                    placeholder="Type your manual response..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white p-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 font-bold text-xs uppercase"
                                >
                                    <Send size={16} />
                                    Send
                                </button>
                            </form>
                            <p className="mt-2 text-[10px] text-center text-slate-600 font-medium">
                                Pressing Send will automatically switch the session to HUMAN mode.
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                        <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-2xl">
                            <MessageSquare size={40} className="text-slate-700" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-400 mb-2">No Active Discussion</h2>
                        <p className="text-sm">Select a session from the sidebar to begin manual support.</p>
                        <div className="mt-8 flex gap-4">
                            <div className="flex items-center gap-2 text-xs">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                AI Managed
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                                Human Priority
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
