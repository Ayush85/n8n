import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../store/auth.js';

const BENEFITS = [
    '14-day free trial, no credit card',
    'WhatsApp, Instagram, Messenger, TikTok & Live Chat',
    'AI-powered replies & summaries',
    'Unlimited conversations on Pro',
];

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register, isLoading } = useAuthStore();
    const [form, setForm] = useState({ workspaceName: '', name: '', email: '', password: '' });
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
        try {
            await register(form.workspaceName, form.name, form.email, form.password);
            navigate('/inbox');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Left panel */}
            <div className="hidden lg:flex w-1/2 flex-col justify-center px-16 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-white/5">
                <div className="flex items-center gap-2.5 mb-12">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center">
                        <MessageSquare size={18} className="text-white" />
                    </div>
                    <span className="font-bold text-white text-xl">OmniDesk</span>
                </div>

                <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
                    Unified inbox for<br />every channel
                </h2>
                <p className="text-slate-400 mb-10 leading-relaxed">
                    Connect all your customer messaging channels and respond faster with AI assistance.
                </p>

                <ul className="space-y-4">
                    {BENEFITS.map((b) => (
                        <li key={b} className="flex items-center gap-3 text-sm text-slate-300">
                            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                            {b}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Right panel — form */}
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center">
                            <MessageSquare size={16} className="text-white" />
                        </div>
                        <span className="font-bold text-white text-lg">OmniDesk</span>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900 p-8">
                        <h1 className="text-xl font-bold text-white mb-1">Create your workspace</h1>
                        <p className="text-sm text-slate-400 mb-8">Free 14-day trial, no card required</p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1.5">Workspace name</label>
                                <input
                                    type="text"
                                    required
                                    value={form.workspaceName}
                                    onChange={set('workspaceName')}
                                    placeholder="Acme Corp"
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1.5">Your name</label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={set('name')}
                                    placeholder="Jane Smith"
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1.5">Work email</label>
                                <input
                                    type="email"
                                    required
                                    value={form.email}
                                    onChange={set('email')}
                                    placeholder="jane@acme.com"
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
                                <div className="relative">
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        required
                                        value={form.password}
                                        onChange={set('password')}
                                        placeholder="Min. 8 characters"
                                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPw((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20"
                            >
                                {isLoading ? <><Loader2 size={16} className="animate-spin" /> Creating workspace…</> : 'Create workspace'}
                            </button>

                            <p className="text-center text-[11px] text-slate-600">
                                By creating an account you agree to our Terms of Service and Privacy Policy.
                            </p>
                        </form>
                    </div>

                    <p className="text-center text-sm text-slate-500 mt-6">
                        Already have a workspace?{' '}
                        <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
