import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).email();
const password = z.string().min(1).max(256).refine((value) => new TextEncoder().encode(value).length <= 1024);
export const loginDto = z.object({ email, password }).strict();
export const bootstrapUserDto = z.object({
  email,
  password: password.refine((value) => Array.from(value).length >= 15, 'Use at least 15 characters'),
  name: z.string().trim().min(1).max(100),
}).strict();

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  preferences: { timezone: string; emailEnabled: boolean };
}
export interface AuthContext {
  user: PublicUser;
  sessionId: string;
  expiresAt: Date;
  csrfToken: string;
}
export interface SessionResponse {
  user: PublicUser;
  expiresAt: string;
  csrfToken: string;
}
export function sessionResponse(session: AuthContext): SessionResponse {
  return { user: session.user, expiresAt: session.expiresAt.toISOString(), csrfToken: session.csrfToken };
}
