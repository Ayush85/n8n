import { z } from 'zod';

export const MessageSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    sender: z.enum(['user', 'admin', 'system']).default('user'),
    content: z.string().min(1, "Message content cannot be empty"),
});

export const SessionSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    customerName: z.string().optional(),
});
