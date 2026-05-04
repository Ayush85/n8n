import React, { useEffect, useState, useMemo } from 'react';
import { Search, Phone, Mail, MessageSquare, ChevronRight, Users } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

interface Contact {
    id: string;
    name: string;
    contact: string;
    email?: string;
    channel: string;
    sessionCount: number;
    lastSeen: string;
    status: 'ai' | 'human' | 'resolved';
}

const CHANNEL_COLORS: Record<string, string> = {
    whatsapp: '#25D366',
    instagram: '#E1306C',
    facebook: '#0084FF',
    tiktok: '#69C9D0',
    livechat: '#00BCD4',
};

const CHANNEL_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    facebook: 'Messenger',
    tiktok: 'TikTok',
    livechat: 'Live Chat',
};

function ContactRow({ c, onClick }: { c: Contact; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors border-b border-white/5 text-left"
        >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                    <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHANNEL_COLORS[c.channel] ?? '#6366f1' }}
                    />
                    <span className="text-[10px] text-slate-500">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{c.contact}</p>
            </div>
            <div className="hidden md:flex flex-col items-end shrink-0">
                <span className="text-xs text-slate-400">{c.sessionCount} session{c.sessionCount !== 1 ? 's' : ''}</span>
                <span className="text-[10px] text-slate-600 mt-0.5">{new Date(c.lastSeen).toLocaleDateString()}</span>
            </div>
            <ChevronRight size={14} className="text-slate-600 shrink-0" />
        </button>
    );
}

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [channelFilter, setChannelFilter] = useState('all');
    const [selected, setSelected] = useState<Contact | null>(null);

    useEffect(() => {
        apiFetch<Contact[]>('/api/contacts')
            .then(setContacts)
            .catch(() => setContacts([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        let result = contacts;
        if (channelFilter !== 'all') result = result.filter(c => c.channel === channelFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.contact.toLowerCase().includes(q) ||
                (c.email ?? '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [contacts, channelFilter, search]);

    const channels = useMemo(() => {
        const seen = new Set(contacts.map(c => c.channel));
        return ['all', ...Array.from(seen)];
    }, [contacts]);

    return (
        <div className="h-full flex overflow-hidden">
            {/* List */}
            <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col flex-1 min-w-0`}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/10 bg-slate-950 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-sm font-bold text-white">Contacts</h1>
                        <span className="text-xs text-slate-500">{contacts.length} total</span>
                    </div>
                    <div className="relative mb-3">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search contacts…"
                            className="w-full bg-slate-800 border border-white/10 rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {channels.map(ch => (
                            <button
                                key={ch}
                                onClick={() => setChannelFilter(ch)}
                                className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${channelFilter === ch ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            >
                                {ch === 'all' ? 'All' : CHANNEL_LABELS[ch] ?? ch}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Contact list */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-white/5 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-slate-800" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 w-32 bg-slate-800 rounded" />
                                    <div className="h-2.5 w-24 bg-slate-800 rounded" />
                                </div>
                            </div>
                        ))
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                            <Users size={32} className="text-slate-700 mb-3" />
                            <p className="text-sm text-slate-400">No contacts found</p>
                            <p className="text-xs text-slate-600 mt-1">Contacts appear as customers message you</p>
                        </div>
                    ) : (
                        filtered.map(c => (
                            <ContactRow key={c.id} c={c} onClick={() => setSelected(c)} />
                        ))
                    )}
                </div>
            </div>

            {/* Detail panel */}
            {selected && (
                <div className="w-full md:w-80 lg:w-96 border-l border-white/10 bg-slate-950 flex flex-col shrink-0">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                        <p className="text-sm font-bold text-white">Contact Details</p>
                        <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-xs">Close</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
                                {selected.name.charAt(0).toUpperCase()}
                            </div>
                            <p className="text-sm font-bold text-white">{selected.name}</p>
                            <div className="flex items-center justify-center gap-1.5 mt-1">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[selected.channel] ?? '#6366f1' }} />
                                <span className="text-xs text-slate-500">{CHANNEL_LABELS[selected.channel] ?? selected.channel}</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl">
                                <Phone size={14} className="text-slate-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-500">Contact</p>
                                    <p className="text-xs text-white">{selected.contact}</p>
                                </div>
                            </div>
                            {selected.email && (
                                <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl">
                                    <Mail size={14} className="text-slate-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-slate-500">Email</p>
                                        <p className="text-xs text-white">{selected.email}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl">
                                <MessageSquare size={14} className="text-slate-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-500">Sessions</p>
                                    <p className="text-xs text-white">{selected.sessionCount}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Last Activity</p>
                            <p className="text-xs text-slate-300">{new Date(selected.lastSeen).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
