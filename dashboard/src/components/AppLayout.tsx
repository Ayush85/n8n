import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    Inbox, BarChart3, Users, Settings, LogOut, MessageSquare,
    Bell, BellRing, Menu, X, ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../store/auth.js';
import { useInboxStore } from '../store/inbox.js';

interface NavItem { to: string; icon: React.ReactNode; label: string; badge?: number }

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const { user, workspace, logout } = useAuthStore();
    const notifications = useInboxStore((s) => s.notifications);
    const unread = notifications.filter((n) => !n.read).length;
    const markAllRead = useInboxStore((s) => s.markAllNotificationsRead);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [notifOpen, setNotifOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const navItems: NavItem[] = [
        { to: '/inbox', icon: <Inbox size={18} />, label: 'Inbox', badge: unread > 0 ? unread : undefined },
        { to: '/analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
        { to: '/contacts', icon: <Users size={18} />, label: 'Contacts' },
        { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
    ];

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
            {/* Sidebar */}
            <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-200 flex flex-col border-r border-white/5 bg-slate-900 shrink-0`}>
                {/* Logo */}
                <div className="flex items-center gap-3 p-4 border-b border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0">
                        <MessageSquare size={16} className="text-white" />
                    </div>
                    {sidebarOpen && (
                        <div className="min-w-0">
                            <p className="font-bold text-white text-sm truncate">OmniDesk</p>
                            <p className="text-[10px] text-slate-500 truncate">{workspace?.name}</p>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarOpen((v) => !v)}
                        className="ml-auto text-slate-500 hover:text-white transition-colors"
                    >
                        <Menu size={16} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative ${isActive
                                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`
                            }
                        >
                            <span className="shrink-0">{item.icon}</span>
                            {sidebarOpen && <span className="truncate">{item.label}</span>}
                            {item.badge != null && (
                                <span className={`${sidebarOpen ? 'ml-auto' : 'absolute top-1 right-1'} min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center`}>
                                    {item.badge > 99 ? '99+' : item.badge}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* User */}
                <div className="p-2 border-t border-white/5">
                    <button
                        onClick={() => setUserMenuOpen((v) => !v)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
                    >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        {sidebarOpen && (
                            <>
                                <div className="flex-1 min-w-0 text-left">
                                    <p className="text-xs font-medium text-white truncate">{user?.name}</p>
                                    <p className="text-[10px] text-slate-500 truncate capitalize">{user?.role}</p>
                                </div>
                                <ChevronDown size={14} className="text-slate-500 shrink-0" />
                            </>
                        )}
                    </button>
                    {userMenuOpen && sidebarOpen && (
                        <div className="mx-2 mt-1 rounded-xl border border-white/10 bg-slate-800 overflow-hidden">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <LogOut size={14} />
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="h-12 flex items-center justify-between px-4 border-b border-white/5 bg-slate-950 shrink-0">
                    <div />
                    <div className="flex items-center gap-2 relative">
                        <button
                            onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) markAllRead(); }}
                            className="relative w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                        >
                            {unread > 0 ? <BellRing size={15} /> : <Bell size={15} />}
                            {unread > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                                    {unread > 99 ? '99+' : unread}
                                </span>
                            )}
                        </button>

                        {notifOpen && (
                            <div className="absolute top-10 right-0 w-80 max-h-96 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 shadow-2xl z-50">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                                    <p className="text-xs font-semibold text-white">Notifications</p>
                                    <button onClick={() => setNotifOpen(false)} className="text-slate-500 hover:text-white">
                                        <X size={14} />
                                    </button>
                                </div>
                                {notifications.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-xs text-slate-500">No notifications yet</div>
                                ) : (
                                    notifications.map((n) => (
                                        <div key={n.id} className={`px-4 py-3 border-b border-white/5 ${n.read ? 'opacity-60' : ''}`}>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <p className="text-xs font-semibold text-white truncate">{n.userName}</p>
                                                <span className="text-[10px] text-slate-500 shrink-0">{new Date(n.createdAt).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 line-clamp-2">{n.preview}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
}
