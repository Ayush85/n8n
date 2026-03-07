import { z } from 'zod';

export const MessageSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required").max(100),
    sender: z.enum(['user', 'admin', 'system', 'ai']).default('user'),
    content: z.string().min(1, "Message content cannot be empty").max(4000),
    metadata: z.object({
        client_id: z.string().max(100).optional(),
        site_name: z.string().max(200).optional(),
        host: z.string().max(500).optional(),
        href: z.string().max(1000).optional(),
        title: z.string().max(300).optional(),
        referrer: z.string().max(500).optional(),
        user_agent: z.string().max(500).optional(),
        language: z.string().max(20).optional(),
        screen_width: z.number().optional(),
        screen_height: z.number().optional(),
        timezone: z.string().max(100).optional(),
    }).optional(),
});

export const SessionSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required").max(100),
    customerName: z.string().max(200).optional(),
});

