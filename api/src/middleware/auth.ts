import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
    userId: number;
    email: string;
    role: 'owner' | 'admin' | 'agent';
    workspaceId: number;
}

declare global {
    namespace Express {
        interface Request {
            auth?: AuthPayload;
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(payload: AuthPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        req.auth = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export function requireRole(...roles: AuthPayload['role'][]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.auth || !roles.includes(req.auth.role)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    };
}
