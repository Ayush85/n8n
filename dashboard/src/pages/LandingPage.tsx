import React from 'react';
import { Link } from 'react-router-dom';
import {
    MessageSquare, Zap, Shield, Globe, ArrowRight,
    CheckCircle, Star, Users, BarChart3, Inbox,
} from 'lucide-react';

const CHANNELS = [
    { name: 'WhatsApp',  color: '#25D366', icon: '💬' },
    { name: 'Instagram', color: '#E1306C', icon: '📸' },
    { name: 'Messenger', color: '#0084FF', icon: '💙' },
    { name: 'TikTok',    color: '#010101', icon: '🎵' },
    { name: 'Live Chat', color: '#00BCD4', icon: '💬' },
];

const FEATURES = [
    { icon: <Inbox size={20} />, title: 'Unified Inbox', desc: 'All your customer messages from every channel in one place. No more tab-switching.' },
    { icon: <Zap size={20} />, title: 'AI-Powered Replies', desc: 'Let AI handle routine questions instantly. Human agents focus on what matters.' },
    { icon: <BarChart3 size={20} />, title: 'Deep Analytics', desc: 'Track response times, sentiment, resolution rates, and team performance in real time.' },
    { icon: <Users size={20} />, title: 'Team Collaboration', desc: 'Assign conversations, leave internal notes, and escalate seamlessly across your team.' },
    { icon: <Shield size={20} />, title: 'Role-Based Access', desc: 'Owner, Admin, and Agent roles with fine-grained permissions for your whole org.' },
    { icon: <Globe size={20} />, title: 'Omnichannel Ready', desc: 'WhatsApp, Instagram, Messenger, TikTok, and Live Chat — all connected from day one.' },
];

const PLANS = [
    {
        name: 'Starter', price: '$49', period: '/mo', highlight: false,
        features: ['3 agents', '2 channels', '5,000 conversations/mo', 'AI replies', 'Basic analytics'],
    },
    {
        name: 'Pro', price: '$149', period: '/mo', highlight: true,
        features: ['15 agents', 'All 5 channels', 'Unlimited conversations', 'AI replies + summaries', 'Advanced analytics', 'Priority support'],
    },
    {
        name: 'Enterprise', price: 'Custom', period: '', highlight: false,
        features: ['Unlimited agents', 'Custom channels', 'SLA guarantee', 'Dedicated CSM', 'SSO & audit logs', 'On-prem option'],
    },
];

const TESTIMONIALS = [
    { name: 'Sofia M.', role: 'Head of CX, Shopify store', text: 'Response time dropped from 4 hours to under 5 minutes. Our CSAT went from 3.2 to 4.8 in 6 weeks.', stars: 5 },
    { name: 'Kenji T.', role: 'CTO, Acme Corp', text: "The API and webhook support is rock solid. We integrated OmniDesk into our stack in one afternoon.", stars: 5 },
    { name: 'Marie D.', role: 'Support Lead, TechSaaS', text: 'Switching from Zendesk saved us $1,200/mo and the AI is genuinely smarter than anything we tried before.', stars: 5 },
];

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
            {/* Nav */}
            <nav className="border-b border-white/5 sticky top-0 bg-slate-950/90 backdrop-blur z-50">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center">
                            <MessageSquare size={16} className="text-white" />
                        </div>
                        <span className="font-bold text-white text-lg">OmniDesk</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
                        <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/login" className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5">
                            Sign in
                        </Link>
                        <Link to="/register" className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors">
                            Start free trial
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-indigo-600/10 pointer-events-none" />
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

                <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center relative">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-medium mb-8">
                        <Zap size={11} />
                        Now with TikTok DM support
                    </div>

                    <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
                        All your customer<br />
                        <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            conversations, unified
                        </span>
                    </h1>

                    <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                        OmniDesk connects WhatsApp, Instagram, Messenger, TikTok, and Live Chat into one
                        AI-powered inbox. Respond faster, never miss a message, and grow your business.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                        <Link
                            to="/register"
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                        >
                            Start your free trial
                            <ArrowRight size={16} />
                        </Link>
                        <Link
                            to="/login"
                            className="flex items-center gap-2 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white font-medium px-6 py-3.5 rounded-xl transition-all"
                        >
                            Sign in to your workspace
                        </Link>
                    </div>

                    {/* Channel pills */}
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        {CHANNELS.map((ch) => (
                            <div key={ch.name} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-slate-300">
                                <span>{ch.icon}</span>
                                {ch.name}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dashboard preview */}
                <div className="max-w-5xl mx-auto px-6 pb-20">
                    <div className="rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900">
                        <div className="h-8 flex items-center gap-2 px-4 border-b border-white/5 bg-slate-950">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                        </div>
                        <div className="flex h-72">
                            {/* Sidebar preview */}
                            <div className="w-64 border-r border-white/5 p-3 space-y-1 bg-slate-900">
                                {['Sofia Martínez', 'Lucas Ferreira', 'Marie Dubois', 'Kenji Tanaka', 'Priya Sharma'].map((name, i) => (
                                    <div key={name} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-blue-600/15 border border-blue-500/20' : 'hover:bg-white/5'}`}>
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0 bg-gradient-to-br ${['from-orange-500 to-red-500','from-purple-500 to-pink-500','from-sky-500 to-blue-500','from-emerald-500 to-teal-500','from-rose-500 to-pink-500'][i]}`}>
                                            {name.split(' ').map(w => w[0]).join('')}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{name}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{['WhatsApp','Instagram','Messenger','Live Chat','TikTok'][i]}</p>
                                        </div>
                                        {i < 2 && <span className="w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">{i + 1}</span>}
                                    </div>
                                ))}
                            </div>
                            {/* Chat preview */}
                            <div className="flex-1 flex flex-col">
                                <div className="h-10 border-b border-white/5 flex items-center px-4 gap-3">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-[9px] font-bold">SM</div>
                                    <span className="text-sm font-semibold text-white">Sofia Martínez</span>
                                    <span className="text-xs text-slate-500 ml-auto">WhatsApp · urgent</span>
                                </div>
                                <div className="flex-1 p-4 space-y-3 overflow-hidden">
                                    <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-xs text-slate-300 max-w-xs">Hi! I'm interested in the Pro plan pricing.</div></div>
                                    <div className="flex justify-end"><div className="bg-blue-600/20 border border-blue-500/20 rounded-2xl rounded-tr-sm px-4 py-2 text-xs text-blue-200 max-w-xs">Hello! Our Pro plan starts at $149/mo for up to 10 seats. Want me to send a full breakdown? 😊</div></div>
                                    <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-xs text-slate-300 max-w-xs">Still waiting for the pricing email...</div></div>
                                </div>
                                <div className="h-12 border-t border-white/5 flex items-center px-4 gap-2">
                                    <div className="flex-1 bg-slate-800 rounded-xl h-8 flex items-center px-3 text-xs text-slate-500">Type a message…</div>
                                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center"><ArrowRight size={14} className="text-white" /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-20 border-t border-white/5">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Everything your support team needs</h2>
                        <p className="text-slate-400 max-w-xl mx-auto">Built for modern omnichannel support — from solo founders to enterprise teams.</p>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="p-6 rounded-2xl border border-white/5 bg-slate-900 hover:border-blue-500/20 hover:bg-slate-900/80 transition-all group">
                                <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-600/25 transition-colors">
                                    {f.icon}
                                </div>
                                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-20 border-t border-white/5">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Simple, transparent pricing</h2>
                        <p className="text-slate-400">No hidden fees. Cancel anytime. 14-day free trial on all plans.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6">
                        {PLANS.map((plan) => (
                            <div key={plan.name} className={`p-6 rounded-2xl border flex flex-col ${plan.highlight ? 'border-blue-500/40 bg-blue-600/10 ring-1 ring-blue-500/20' : 'border-white/10 bg-slate-900'}`}>
                                {plan.highlight && (
                                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-semibold mb-4 self-start">
                                        <Star size={10} fill="currentColor" /> Most Popular
                                    </div>
                                )}
                                <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                                <div className="flex items-baseline gap-1 mb-6">
                                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                                    <span className="text-slate-400 text-sm">{plan.period}</span>
                                </div>
                                <ul className="space-y-3 mb-8 flex-1">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                                            <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    to="/register"
                                    className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all ${plan.highlight ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'border border-white/10 hover:border-white/20 text-slate-300 hover:text-white'}`}
                                >
                                    {plan.name === 'Enterprise' ? 'Contact sales' : 'Get started'}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section id="testimonials" className="py-20 border-t border-white/5">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Loved by support teams</h2>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6">
                        {TESTIMONIALS.map((t) => (
                            <div key={t.name} className="p-6 rounded-2xl border border-white/5 bg-slate-900">
                                <div className="flex gap-0.5 mb-4">
                                    {Array.from({ length: t.stars }).map((_, i) => (
                                        <Star key={i} size={14} className="text-yellow-400" fill="currentColor" />
                                    ))}
                                </div>
                                <p className="text-sm text-slate-300 leading-relaxed mb-6">"{t.text}"</p>
                                <div>
                                    <p className="text-xs font-semibold text-white">{t.name}</p>
                                    <p className="text-[11px] text-slate-500">{t.role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 border-t border-white/5">
                <div className="max-w-2xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-white mb-4">Ready to unify your support?</h2>
                    <p className="text-slate-400 mb-8">Start your 14-day free trial. No credit card required.</p>
                    <Link
                        to="/register"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-blue-500/25"
                    >
                        Create your workspace
                        <ArrowRight size={16} />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/5 py-8">
                <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center">
                            <MessageSquare size={12} className="text-white" />
                        </div>
                        <span className="font-bold text-white text-sm">OmniDesk</span>
                    </div>
                    <p className="text-xs text-slate-600">© {new Date().getFullYear()} OmniDesk. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
