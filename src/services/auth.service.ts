import type { AuthContext } from '../auth/dto';
import { csrfToken, digest, isSessionToken, newSessionToken, verifyPassword } from '../auth/crypto';
import type { AuthRepository, UserRecord } from '../repositories/auth.repository';
import { HttpError } from '../errors/http-error';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const denied = () => new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
const publicUser = (user: UserRecord) => ({ id: user.id, email: user.email, name: user.name, preferences: user.preferences });

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly clock: () => Date = () => new Date()) {}

  async login(email: string, password: string, address: string, previousToken?: string) {
    const now = this.clock();
    const window = Math.floor(now.getTime() / WINDOW_MS);
    const expiresAt = new Date((window + 1) * WINDOW_MS);
    const allowed = await this.repository.consumeAttempts([
      { key: digest('account:' + email) + ':' + window, expiresAt, limit: 5 },
      { key: digest('address:' + address) + ':' + window, expiresAt, limit: 20 },
    ]);
    if (!allowed) throw new HttpError(429, 'LOGIN_RATE_LIMITED', 'Too many login attempts; try again later');
    const account = await this.repository.findAccount(email);
    // Always perform the same KDF, including unknown/disabled accounts.
    const valid = await verifyPassword(password, account?.passwordHash ?? null);
    if (!account || !valid || account.disabledAt) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    const token = newSessionToken();
    const expiration = new Date(now.getTime() + SESSION_TTL_MS);
    const record = await this.repository.issueSession({
      userId: account.id, tokenHash: digest(token), expiresAt: expiration, now,
      ...(previousToken && isSessionToken(previousToken) ? { previousHash: digest(previousToken) } : {}),
    });
    return { token, session: { user: publicUser(account), sessionId: record.id,
      expiresAt: expiration, csrfToken: csrfToken(token) } satisfies AuthContext };
  }

  async authenticate(token: string): Promise<AuthContext> {
    if (!isSessionToken(token)) throw denied();
    const session = await this.repository.findSession(digest(token));
    if (!session || session.revokedAt || session.expiresAt.getTime() <= this.clock().getTime() || session.user.disabledAt) throw denied();
    return { user: publicUser(session.user), sessionId: session.id, expiresAt: session.expiresAt, csrfToken: csrfToken(token) };
  }

  async logout(session: AuthContext) {
    await this.repository.revokeSession(session.sessionId, session.user.id, this.clock());
  }
}
