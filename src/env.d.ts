declare namespace Cloudflare {
  interface Env {
    CORS_ALLOWED_ORIGIN: string;
    DATABASE_URL?: string;
    AUTH_PUBLIC_ORIGIN?: string;
    AUTH_ENV?: string;
    AUTH_COOKIE_SECURE?: string;
    AUTH_COOKIE_SAME_SITE?: string;
  }
}
