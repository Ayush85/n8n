import React, { useEffect, useState } from 'react';
import { User, Bell, Shield, Zap, Plus, Trash2, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { useAuthStore } from '../store/auth.js';
import { apiFetch } from '../lib/api.js';

type Tab = 'profile' | 'team' | 'channels' | 'notifications';

interface Member {
    id: number;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'agent';
    createdAt: string;
}

interface ChannelConfig {
    id: number;
    channel: string;
    label: string;
    enabled: boolean;
    webhookUrl?: string;
    accessToken?: string;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User size={15} /> },
    { id: 'team', label: 'Team', icon: <Shield size={15} /> },
    { id: 'channels', label: 'Channels', icon: <Zap size={15} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
];

const ROLE_COLORS: Record<string, string> = {
    owner: 'text-amber-400 bg-amber-400/10',
    admin: 'text-blue-400 bg-blue-400/10',
    agent: 'text-slate-400 bg-slate-400/10',
};

function ProfileTab() {
    const { user, workspace } = useAuthStore();
    const [form, setForm] = useState({ name: user?.name ?? '', currentPassword: '', newPassword: '' });
    const [showPw, setShowPw] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true); setError(''); setSaved(false);
        try {
            await apiFetch('/api/auth/profile', {
                method: 'PATCH',
                body: JSON.stringify({ name: form.name, currentPassword: form.currentPassword || undefined, newPassword: form.newPassword || undefined }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-lg space-y-6">
            <div>
                <h2 className="text-sm font-bold text-white mb-1">Profile</h2>
                <p className="text-xs text-slate-500">Manage your personal information</p>
            </div>

            <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                        {user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-white">{user?.name}</p>
                        <p className="text-xs text-slate-500">{user?.email}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${ROLE_COLORS[user?.role ?? 'agent']}`}>
                            {user?.role}
                        </span>
                    </div>
                </div>

                <form onSubmit={save} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Display name</label>
                        <input
                            value={form.name}
                            onChange={set('name')}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Workspace</label>
                        <input
                            value={workspace?.name ?? ''}
                            disabled
                            className="w-full bg-slate-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Current password</label>
                        <input
                            type={showPw ? 'text' : 'password'}
                            value={form.currentPassword}
                            onChange={set('currentPassword')}
                            placeholder="Leave blank to keep current"
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">New password</label>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                value={form.newPassword}
                                onChange={set('newPassword')}
                                placeholder="Min. 8 characters"
                                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}

                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
                        {saved ? 'Saved!' : 'Save changes'}
                    </button>
                </form>
            </div>
        </div>
    );
}

function TeamTab() {
    const { user } = useAuthStore();
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', password: '', role: 'agent' as Member['role'] });
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');

    const load = () => {
        apiFetch<Member[]>('/api/workspace/members')
            .then(setMembers)
            .catch(() => setMembers([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const invite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviting(true); setInviteError('');
        try {
            await apiFetch('/api/workspace/members', {
                method: 'POST',
                body: JSON.stringify(inviteForm),
            });
            setInviteForm({ name: '', email: '', password: '', role: 'agent' });
            load();
        } catch (err) {
            setInviteError(err instanceof Error ? err.message : 'Failed to invite');
        } finally {
            setInviting(false);
        }
    };

    const canManage = user?.role === 'owner' || user?.role === 'admin';

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-sm font-bold text-white mb-1">Team</h2>
                <p className="text-xs text-slate-500">Manage team members and roles</p>
            </div>

            <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="p-5 space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-12 animate-pulse bg-slate-800 rounded-xl" />
                        ))}
                    </div>
                ) : members.map((m, i) => (
                    <div key={m.id} className={`flex items-center gap-4 px-5 py-4 ${i < members.length - 1 ? 'border-b border-white/5' : ''}`}>
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{m.name}</p>
                            <p className="text-xs text-slate-500 truncate">{m.email}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${ROLE_COLORS[m.role]}`}>
                            {m.role}
                        </span>
                        {canManage && m.role !== 'owner' && (
                            <button className="text-slate-600 hover:text-red-400 transition-colors">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {canManage && (
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-white mb-4">Invite Team Member</p>
                    <form onSubmit={invite} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Name</label>
                                <input
                                    required
                                    value={inviteForm.name}
                                    onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Jane Smith"
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                                <input
                                    required
                                    type="email"
                                    value={inviteForm.email}
                                    onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="jane@company.com"
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Temp Password</label>
                                <input
                                    required
                                    type="password"
                                    value={inviteForm.password}
                                    onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="Min. 8 characters"
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                                <select
                                    value={inviteForm.role}
                                    onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as Member['role'] }))}
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                >
                                    <option value="agent">Agent</option>
                                    {user?.role === 'owner' && <option value="admin">Admin</option>}
                                </select>
                            </div>
                        </div>
                        {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
                        <button
                            type="submit"
                            disabled={inviting}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
                        >
                            {inviting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Invite Member
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}

function ChannelsTab() {
    const [channels, setChannels] = useState<ChannelConfig[]>([
        { id: 1, channel: 'whatsapp', label: 'WhatsApp', enabled: false, webhookUrl: '', accessToken: '' },
        { id: 2, channel: 'instagram', label: 'Instagram', enabled: false, accessToken: '' },
        { id: 3, channel: 'facebook', label: 'Messenger', enabled: false, accessToken: '' },
        { id: 4, channel: 'tiktok', label: 'TikTok', enabled: false, accessToken: '' },
        { id: 5, channel: 'livechat', label: 'Live Chat', enabled: true },
    ]);
    const [saving, setSaving] = useState<number | null>(null);

    const save = async (c: ChannelConfig) => {
        setSaving(c.id);
        try {
            await apiFetch(`/api/workspace/channels/${c.channel}`, {
                method: 'PUT',
                body: JSON.stringify({ enabled: c.enabled, webhookUrl: c.webhookUrl, accessToken: c.accessToken }),
            });
        } catch {
            // silently fail — user still sees the toggle state
        } finally {
            setSaving(null);
        }
    };

    const CHANNEL_COLORS_MAP: Record<string, string> = {
        whatsapp: '#25D366', instagram: '#E1306C', facebook: '#0084FF',
        tiktok: '#69C9D0', livechat: '#00BCD4',
    };

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-sm font-bold text-white mb-1">Channels</h2>
                <p className="text-xs text-slate-500">Configure your messaging channel integrations</p>
            </div>
            <div className="space-y-4">
                {channels.map(c => (
                    <div key={c.id} className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${CHANNEL_COLORS_MAP[c.channel]}20` }}>
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS_MAP[c.channel] }} />
                                </div>
                                <p className="text-sm font-semibold text-white">{c.label}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        const updated = { ...c, enabled: !c.enabled };
                                        setChannels(prev => prev.map(ch => ch.id === c.id ? updated : ch));
                                        save(updated);
                                    }}
                                    className={`relative w-9 h-5 rounded-full transition-all ${c.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${c.enabled ? 'translate-x-4' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {c.enabled && c.channel !== 'livechat' && (
                            <div className="space-y-3 pt-3 border-t border-white/10">
                                {c.webhookUrl !== undefined && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-300 mb-1">Webhook URL</label>
                                        <input
                                            value={c.webhookUrl}
                                            onChange={e => setChannels(prev => prev.map(ch => ch.id === c.id ? { ...ch, webhookUrl: e.target.value } : ch))}
                                            placeholder="https://…"
                                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Access Token</label>
                                    <input
                                        type="password"
                                        value={c.accessToken}
                                        onChange={e => setChannels(prev => prev.map(ch => ch.id === c.id ? { ...ch, accessToken: e.target.value } : ch))}
                                        placeholder="Paste token…"
                                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                </div>
                                <button
                                    onClick={() => save(c)}
                                    disabled={saving === c.id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-all"
                                >
                                    {saving === c.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                    Save
                                </button>
                            </div>
                        )}
                        {c.enabled && c.channel === 'livechat' && (
                            <div className="pt-3 border-t border-white/10">
                                <p className="text-xs text-slate-500">Live Chat is always enabled. Embed the widget on your website.</p>
                                <code className="block mt-2 bg-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400">
                                    {'<script src="https://chat.aydexis.com/widget.js"></script>'}
                                </code>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function NotificationsTab() {
    const [prefs, setPrefs] = useState({
        newSession: true,
        humanHandoff: true,
        newMessage: true,
        sound: true,
        webPush: false,
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const toggle = (k: keyof typeof prefs) => () => setPrefs(p => ({ ...p, [k]: !p[k] }));

    const save = async () => {
        setSaving(true);
        try {
            await apiFetch('/api/auth/notification-prefs', { method: 'PUT', body: JSON.stringify(prefs) });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
            // ignore
        } finally {
            setSaving(false);
        }
    };

    const items: { key: keyof typeof prefs; label: string; desc: string }[] = [
        { key: 'newSession', label: 'New sessions', desc: 'Notify when a new customer starts a conversation' },
        { key: 'humanHandoff', label: 'Human handoff', desc: 'Notify when AI escalates a session to human' },
        { key: 'newMessage', label: 'New messages', desc: 'Notify on every incoming message' },
        { key: 'sound', label: 'Sound alerts', desc: 'Play a chime for new notifications' },
        { key: 'webPush', label: 'Web push', desc: 'Receive push notifications even when the tab is inactive' },
    ];

    return (
        <div className="max-w-lg space-y-6">
            <div>
                <h2 className="text-sm font-bold text-white mb-1">Notifications</h2>
                <p className="text-xs text-slate-500">Control when and how you receive alerts</p>
            </div>
            <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
                {items.map((item, i) => (
                    <div key={item.key} className={`flex items-center justify-between px-5 py-4 ${i < items.length - 1 ? 'border-b border-white/5' : ''}`}>
                        <div>
                            <p className="text-sm font-medium text-white">{item.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                        </div>
                        <button
                            onClick={toggle(item.key)}
                            className={`relative w-9 h-5 rounded-full transition-all shrink-0 ml-4 ${prefs[item.key] ? 'bg-blue-600' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${prefs[item.key] ? 'translate-x-4' : ''}`} />
                        </button>
                    </div>
                ))}
            </div>
            <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
            >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
                {saved ? 'Saved!' : 'Save preferences'}
            </button>
        </div>
    );
}

export default function SettingsPage() {
    const [tab, setTab] = useState<Tab>('profile');

    return (
        <div className="h-full flex overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 shrink-0 border-r border-white/10 bg-slate-950 p-3 space-y-0.5">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${tab === t.id ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {t.icon}
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {tab === 'profile' && <ProfileTab />}
                {tab === 'team' && <TeamTab />}
                {tab === 'channels' && <ChannelsTab />}
                {tab === 'notifications' && <NotificationsTab />}
            </div>
        </div>
    );
}
