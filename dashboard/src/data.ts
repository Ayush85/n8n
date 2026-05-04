import type { Channel, ChannelConfig, Conversation, StatusMeta, TagMeta } from './types.js';

export const CHANNELS: Record<Channel, ChannelConfig> = {
    whatsapp:  { label: 'WhatsApp',  color: '#25D366', bg: '#e8faf0' },
    instagram: { label: 'Instagram', color: '#E1306C', bg: '#fde8f0' },
    facebook:  { label: 'Messenger', color: '#0084FF', bg: '#e6f3ff' },
    livechat:  { label: 'Live Chat', color: '#00BCD4', bg: '#e5f9fb' },
    tiktok:    { label: 'TikTok',    color: '#010101', bg: '#f0f0f0' },
};

export const STATUS_META: Record<string, StatusMeta> = {
    urgent:   { label: 'Urgent',   bg: '#fef2f2', color: '#ef4444', border: '#fecaca', darkBg: 'rgba(239,68,68,0.15)',  darkColor: '#f87171', darkBorder: 'rgba(239,68,68,0.3)'  },
    open:     { label: 'Open',     bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe', darkBg: 'rgba(59,130,246,0.15)', darkColor: '#60a5fa', darkBorder: 'rgba(59,130,246,0.3)'  },
    pending:  { label: 'Pending',  bg: '#fffbeb', color: '#f59e0b', border: '#fde68a', darkBg: 'rgba(245,158,11,0.15)', darkColor: '#fbbf24', darkBorder: 'rgba(245,158,11,0.3)'  },
    resolved: { label: 'Resolved', bg: '#f0fdf4', color: '#22c55e', border: '#bbf7d0', darkBg: 'rgba(34,197,94,0.15)',  darkColor: '#4ade80', darkBorder: 'rgba(34,197,94,0.3)'  },
};

export const TAG_META: Record<string, TagMeta> = {
    Lead:    { bg: '#f3f0ff', color: '#7c3aed', darkBg: 'rgba(124,58,237,0.15)',  darkColor: '#a78bfa' },
    Support: { bg: '#eff6ff', color: '#2563eb', darkBg: 'rgba(37,99,235,0.15)',   darkColor: '#60a5fa' },
    Urgent:  { bg: '#fef2f2', color: '#dc2626', darkBg: 'rgba(220,38,38,0.15)',   darkColor: '#f87171' },
    Hot:     { bg: '#fff7ed', color: '#ea580c', darkBg: 'rgba(234,88,12,0.15)',   darkColor: '#fb923c' },
    Demo:    { bg: '#ecfdf5', color: '#059669', darkBg: 'rgba(5,150,105,0.15)',   darkColor: '#34d399' },
};

export const INITIAL_CONVERSATIONS: Conversation[] = [
    {
        id: 1, channel: 'whatsapp', name: 'Sofia Martínez', handle: '+52 55 1234 5678',
        avatar: 'SM', avatarColor: '#f97316', unread: 3,
        tags: ['Lead', 'Hot'], status: 'urgent', lastTime: '2m ago',
        lastMsg: "I still haven't received the pricing info you promised.",
        assignedTo: 'Alex R.',
        messages: [
            { id: 1, from: 'customer', text: "Hi! I saw your offer and I'm interested in the Pro plan.", time: '10:12 AM' },
            { id: 2, from: 'ai', text: "Hello Sofia! Thanks for reaching out 👋 I'd be happy to help with info about our Pro plan.", time: '10:12 AM' },
            { id: 3, from: 'customer', text: 'We have a small team of 8 people doing customer support.', time: '10:14 AM' },
            { id: 4, from: 'agent', text: 'Great news — our Pro plan supports up to 15 seats and includes WhatsApp, Instagram, Facebook, TikTok, and live chat.', time: '10:15 AM', agentName: 'Alex R.' },
            { id: 5, from: 'customer', text: 'What about pricing?', time: '10:17 AM' },
            { id: 6, from: 'ai', text: 'Our Pro plan starts at $149/mo for up to 10 seats. Would you like a full pricing breakdown?', time: '10:17 AM' },
            { id: 7, from: 'customer', text: "I still haven't received the pricing info you promised.", time: '10:22 AM' },
        ],
        notes: 'Interested in Pro. Decision maker. Call scheduled for Thursday.',
    },
    {
        id: 2, channel: 'instagram', name: 'Lucas Ferreira', handle: '@lucasdesigns',
        avatar: 'LF', avatarColor: '#8b5cf6', unread: 1,
        tags: ['Support'], status: 'open', lastTime: '8m ago',
        lastMsg: "My order hasn't arrived and it's been 2 weeks",
        assignedTo: 'Unassigned',
        messages: [
            { id: 1, from: 'customer', text: "Hey, my order hasn't arrived and it's been 2 weeks.", time: '9:55 AM' },
            { id: 2, from: 'ai', text: 'Hi Lucas! Could you share your order number so I can look into this?', time: '9:55 AM' },
            { id: 3, from: 'customer', text: 'Order #ORD-8821', time: '9:56 AM' },
            { id: 4, from: 'ai', text: 'Your package is now in transit and should arrive within 2–3 business days.', time: '9:57 AM' },
            { id: 5, from: 'customer', text: "My order hasn't arrived and it's been 2 weeks", time: '10:03 AM' },
        ],
        notes: '',
    },
    {
        id: 3, channel: 'facebook', name: 'Marie Dubois', handle: 'marie.dubois.fr',
        avatar: 'MD', avatarColor: '#0ea5e9', unread: 0,
        tags: ['Support', 'Urgent'], status: 'pending', lastTime: '15m ago',
        lastMsg: 'Can I upgrade my plan mid-cycle?',
        assignedTo: 'Sarah K.',
        messages: [
            { id: 1, from: 'customer', text: 'Hello, can I upgrade my subscription plan mid-cycle?', time: '9:45 AM' },
            { id: 2, from: 'agent', text: "Hi Marie! Yes, absolutely — we'll prorate the difference.", time: '9:47 AM', agentName: 'Sarah K.' },
            { id: 3, from: 'customer', text: "I'm on Starter, want to go to Pro. Does billing reset?", time: '9:50 AM' },
            { id: 4, from: 'ai', text: "Your billing cycle stays the same — we charge the prorated difference for remaining days.", time: '9:51 AM' },
            { id: 5, from: 'customer', text: 'Can I upgrade my plan mid-cycle?', time: '9:52 AM' },
        ],
        notes: 'Existing Starter customer. Wants to upgrade.',
    },
    {
        id: 4, channel: 'livechat', name: 'Kenji Tanaka', handle: 'kenji@acme.co',
        avatar: 'KT', avatarColor: '#10b981', unread: 0,
        tags: ['Lead'], status: 'resolved', lastTime: '1h ago',
        lastMsg: "Thanks, I'll check the docs",
        assignedTo: 'Alex R.',
        messages: [
            { id: 1, from: 'customer', text: 'Does your API support webhooks for real-time events?', time: '8:30 AM' },
            { id: 2, from: 'ai', text: 'Yes! Our API supports webhooks for all major events: new message, conversation assigned, status change, and more.', time: '8:30 AM' },
            { id: 3, from: 'customer', text: 'Can we filter by channel?', time: '8:32 AM' },
            { id: 4, from: 'agent', text: "Absolutely — each webhook can be scoped to specific channels.", time: '8:33 AM', agentName: 'Alex R.' },
            { id: 5, from: 'customer', text: "Thanks, I'll check the docs", time: '8:40 AM' },
        ],
        notes: 'Developer at Acme. Evaluating for enterprise.',
    },
    {
        id: 5, channel: 'tiktok', name: 'Priya Sharma', handle: '@priya_creates',
        avatar: 'PS', avatarColor: '#f43f5e', unread: 2,
        tags: ['Support'], status: 'open', lastTime: '22m ago',
        lastMsg: 'Love your content! Can I collab with your brand?',
        assignedTo: 'Unassigned',
        messages: [
            { id: 1, from: 'customer', text: 'Hi! I saw your TikTok and absolutely love it. Would love to collab!', time: '9:38 AM' },
            { id: 2, from: 'ai', text: "Hi Priya! Thanks for reaching out 🎵 We'd love to explore collaboration opportunities. Can you tell us more about your audience?", time: '9:38 AM' },
            { id: 3, from: 'customer', text: '500K followers, mostly 18-24 lifestyle/fashion. DM me!', time: '9:40 AM' },
            { id: 4, from: 'customer', text: 'Love your content! Can I collab with your brand?', time: '9:42 AM' },
        ],
        notes: 'TikTok influencer. High-potential collab lead.',
    },
    {
        id: 6, channel: 'instagram', name: 'Carlos Vega', handle: '@carlosvega_mx',
        avatar: 'CV', avatarColor: '#6366f1', unread: 0,
        tags: ['Lead', 'Demo'], status: 'open', lastTime: '35m ago',
        lastMsg: 'When can we schedule the product demo?',
        assignedTo: 'Sarah K.',
        messages: [
            { id: 1, from: 'customer', text: "Hi! A colleague recommended your platform. We're looking for a support solution.", time: '9:15 AM' },
            { id: 2, from: 'ai', text: "Hi Carlos! Great to hear from you 🙌 We'd love to show you how OmniDesk can help.", time: '9:15 AM' },
            { id: 3, from: 'customer', text: 'Yes, we use WhatsApp and Instagram mainly. When can we schedule the product demo?', time: '9:25 AM' },
        ],
        notes: 'E-commerce referral. Interested in demo.',
    },
];

export const QUICK_REPLIES = [
    "Thanks for reaching out!",
    "Looking into this now",
    "Resolved ✓",
    "Let me check",
    "Can you share more details?",
];

export const AI_SUGGESTIONS = [
    "Of course! I'd be happy to help with that. Let me look into it right away and get back to you.",
    "Absolutely! We offer a 14-day free trial with full access to all Pro features — no credit card required.",
    "Thank you for the details. I've flagged this for immediate attention and our team will follow up within the hour.",
];
