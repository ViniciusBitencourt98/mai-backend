import type { PublicUser } from '../auth/dto';

export interface UserRecord extends PublicUser { disabledAt: Date | null }
export interface AccountRecord extends UserRecord { passwordHash: string }
export interface SessionRecord {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: UserRecord;
}
export interface LoginBucket { key: string; expiresAt: Date; limit: number }
export interface AuthRepository {
  findAccount(email: string): Promise<AccountRecord | null>;
  consumeAttempts(buckets: LoginBucket[]): Promise<boolean>;
  issueSession(input: { userId: string; tokenHash: string; expiresAt: Date; now: Date; previousHash?: string }): Promise<{ id: string }>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(id: string, userId: string, now: Date): Promise<void>;
}
