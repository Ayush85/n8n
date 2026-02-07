import { z } from 'zod';

export const MessageSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    sender: z.enum(['user', 'admin', 'system', 'ai']).default('user'),
    content: z.string().min(1, "Message content cannot be empty"),
    metadata: z.object({
        client_id: z.string().optional(),
        site_name: z.string().optional(),
        host: z.string().optional(),
        href: z.string().optional(),
        title: z.string().optional(),
        referrer: z.string().optional(),
        user_agent: z.string().optional(),
        language: z.string().optional(),
        screen_width: z.number().optional(),
        screen_height: z.number().optional(),
        timezone: z.string().optional(),
    }).optional(),
});

export const SessionSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    customerName: z.string().optional(),
});
