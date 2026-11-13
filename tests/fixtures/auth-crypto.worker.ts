import { csrfToken, hashPassword, newSessionToken, verifyPassword } from '../../src/auth/crypto';

// Local test entrypoint only. Not used by wrangler.jsonc.
export default {
  async fetch() {
    const hash = await hashPassword('synthetic long test passphrase');
    return Response.json({
      valid: await verifyPassword('synthetic long test passphrase', hash),
      invalid: await verifyPassword('wrong', hash),
      unknown: await verifyPassword('wrong', null),
      csrf: csrfToken(newSessionToken()).length === 64,
    });
  },
};
