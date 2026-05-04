export type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'livechat' | 'tiktok';
export type ConvStatus = 'urgent' | 'open' | 'pending' | 'resolved';
export type MessageSender = 'customer' | 'agent' | 'ai';
export type NavSection = 'dashboard' | 'inbox' | 'contacts' | 'tags' | 'reports' | 'settings';
export type FilterType = 'All' | 'Unread' | 'Mine' | 'Unassigned';

export interface Message {
    id: number;
    from: MessageSender;
    text: string;
    time: string;
    agentName?: string;
}

export interface Conversation {
    id: number;
    channel: Channel;
    name: string;
    handle: string;
    avatar: string;
    avatarColor: string;
    unread: number;
    tags: string[];
    status: ConvStatus;
    lastTime: string;
    lastMsg: string;
    assignedTo: string;
    messages: Message[];
    notes: string;
}

export interface ChannelConfig {
    label: string;
    color: string;
    bg: string;
}

export interface StatusMeta {
    label: string;
    bg: string;
    color: string;
    border: string;
    darkBg: string;
    darkColor: string;
    darkBorder: string;
}

export interface TagMeta {
    bg: string;
    color: string;
    darkBg: string;
    darkColor: string;
}

export interface Theme {
    bg: string;
    bgPanel: string;
    bgSidebar: string;
    bgHover: string;
    bgActive: string;
    bgInput: string;
    bgBubbleCustomer: string;
    bgBubbleAgent: string;
    bgBubbleAI: string;
    border: string;
    borderLight: string;
    text: string;
    textMuted: string;
    textDim: string;
    textLight: string;
    pillBg: string;
    shadow: string;
    shadowCard: string;
    navBg: string;
    navIcon: string;
    navIconActive: string;
    scrollbar: string;
    accent: string;
    accentText: string;
    accentLight: string;
    accentBorder: string;
}
