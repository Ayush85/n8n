import React, { useEffect, useState, useCallback } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, MessageSquare, Users, Clock, Zap, RefreshCw, Download } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

interface DailyStat { date: string; sessions: number; messages: number; resolved: number }
interface ChannelStat { channel: string; count: number; color: string }
interface MetricCard { label: string; value: string; delta: string; up: boolean; icon: React.ReactNode }

interface AnalyticsData {
    totalSessions: number;
    totalMessages: number;
    avgResponseTime: number;
    aiHandoffRate: number;
    daily: DailyStat[];
    byChannel: ChannelStat[];
    topContacts: { name: string; contact: string; count: number }[];
    aiReport?: string;
}

const CHANNEL_COLORS: Record<string, string> = {
    whatsapp: '#25D366',
    instagram: '#E1306C',
    facebook: '#0084FF',
    tiktok: '#69C9D0',
    livechat: '#00BCD4',
};

function StatCard({ label, value, delta, up, icon }: MetricCard) {
    return (
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/15 flex items-center justify-center text-blue-400">
                    {icon}
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {delta}
                </span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        </div>
    );
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [reportLoading, setReportLoading] = useState(false);
    const [report, setReport] = useState('');
    const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await apiFetch<AnalyticsData>(`/api/analytics?range=${range}`);
            setData(d);
        } catch {
            // fallback to empty state
            setData({
                totalSessions: 0, totalMessages: 0,
                avgResponseTime: 0, aiHandoffRate: 0,
                daily: [], byChannel: [], topContacts: [],
            });
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => { load(); }, [load]);

    const generateReport = async () => {
        setReportLoading(true);
        try {
            const r = await apiFetch<{ report: string }>('/api/analytics/report', { method: 'POST', body: JSON.stringify({ range }) });
            setReport(r.report);
        } catch {
            setReport('Unable to generate report at this time.');
        } finally {
            setReportLoading(false);
        }
    };

    const metrics: MetricCard[] = data ? [
        { label: 'Total Sessions', value: data.totalSessions.toLocaleString(), delta: '+12%', up: true, icon: <MessageSquare size={16} /> },
        { label: 'Total Messages', value: data.totalMessages.toLocaleString(), delta: '+8%', up: true, icon: <Zap size={16} /> },
        { label: 'Avg Response Time', value: `${data.avgResponseTime}s`, delta: '-3%', up: true, icon: <Clock size={16} /> },
        { label: 'AI Handoff Rate', value: `${data.aiHandoffRate}%`, delta: '+2%', up: false, icon: <Users size={16} /> },
    ] : [];

    const channelData = data?.byChannel.map(c => ({
        ...c,
        color: CHANNEL_COLORS[c.channel] ?? '#6366f1',
        name: c.channel.charAt(0).toUpperCase() + c.channel.slice(1),
    })) ?? [];

    return (
        <div className="h-full overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-white">Analytics</h1>
                    <p className="text-xs text-slate-500">Performance overview across all channels</p>
                </div>
                <div className="flex items-center gap-2">
                    {(['7d', '30d', '90d'] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${range === r ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            {r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'Last 90 days'}
                        </button>
                    ))}
                    <button onClick={load} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-slate-900 border border-white/10 rounded-2xl p-5 animate-pulse">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 mb-3" />
                            <div className="h-8 w-20 bg-slate-800 rounded mb-1" />
                            <div className="h-3 w-24 bg-slate-800 rounded" />
                        </div>
                    ))
                ) : metrics.map(m => <StatCard key={m.label} {...m} />)}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Daily trend */}
                <div className="lg:col-span-2 bg-slate-900 border border-white/10 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-white mb-4">Daily Activity</p>
                    {loading ? (
                        <div className="h-48 animate-pulse bg-slate-800 rounded-xl" />
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={data?.daily ?? []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                                    labelStyle={{ color: '#f1f5f9' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Line type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={2} dot={false} name="Sessions" />
                                <Line type="monotone" dataKey="messages" stroke="#818cf8" strokeWidth={2} dot={false} name="Messages" />
                                <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={false} name="Resolved" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Channel distribution */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-white mb-4">By Channel</p>
                    {loading ? (
                        <div className="h-48 animate-pulse bg-slate-800 rounded-xl" />
                    ) : channelData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-xs text-slate-500">No data</div>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={160}>
                                <PieChart>
                                    <Pie data={channelData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" paddingAngle={3}>
                                        {channelData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-3 space-y-1.5">
                                {channelData.map(c => (
                                    <div key={c.channel} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                                            <span className="text-slate-400">{c.name}</span>
                                        </div>
                                        <span className="text-white font-medium">{c.count}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Volume bar chart */}
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                <p className="text-sm font-semibold text-white mb-4">Session Volume</p>
                {loading ? (
                    <div className="h-40 animate-pulse bg-slate-800 rounded-xl" />
                ) : (
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={data?.daily ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                                labelStyle={{ color: '#f1f5f9' }}
                            />
                            <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sessions" />
                            <Bar dataKey="resolved" fill="#10b981" radius={[4, 4, 0, 0]} name="Resolved" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Top contacts + AI report */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-white mb-4">Top Contacts</p>
                    {loading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-10 animate-pulse bg-slate-800 rounded-xl" />
                            ))}
                        </div>
                    ) : data?.topContacts.length === 0 ? (
                        <p className="text-xs text-slate-500">No contacts yet</p>
                    ) : (
                        <div className="space-y-2">
                            {data?.topContacts.map((c, i) => (
                                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                        {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-white truncate">{c.name}</p>
                                        <p className="text-[10px] text-slate-500 truncate">{c.contact}</p>
                                    </div>
                                    <span className="text-xs text-slate-400 shrink-0">{c.count} msgs</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-white">AI Report</p>
                        <button
                            onClick={generateReport}
                            disabled={reportLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-all"
                        >
                            {reportLoading ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                            Generate
                        </button>
                    </div>
                    {report ? (
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{report}</div>
                    ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-center">
                            <Zap size={24} className="text-slate-700 mb-2" />
                            <p className="text-xs text-slate-500">Click "Generate" to get an AI-powered analysis of your support performance.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
