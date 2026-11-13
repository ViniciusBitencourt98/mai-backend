import type { CookieOptions } from 'express';
import type { AuthSettings } from './settings';
import { isSessionToken } from './crypto';

export function cookieOptions(settings: AuthSettings): CookieOptions {
  return { httpOnly: true, secure: settings.secure, sameSite: settings.sameSite, path: '/' };
}
export function sessionCookie(header: string | undefined, name: string): string | undefined {
  const matches = (header ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(name + '='));
  if (matches.length !== 1) return undefined;
  const token = matches[0]!.slice(name.length + 1);
  return isSessionToken(token) ? token : undefined;
}
