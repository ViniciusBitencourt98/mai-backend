declare namespace Cloudflare {
  interface Env {
    CORS_ALLOWED_ORIGIN: string;
    DATABASE_URL?: string;
    EMAIL_DELIVERY_ENABLED?: string;
    GMAIL_CLIENT_ID?: string;
    GMAIL_CLIENT_SECRET?: string;
    GMAIL_REFRESH_TOKEN?: string;
    GMAIL_FROM?: string;
    APPLICATION_URL?: string;
    NOTIFICATION_QUEUE: Queue<import('./notifications/processing').NotificationMessage>;
    NOTIFICATION_BATCH_SIZE?: string;
    NOTIFICATION_LEASE_SECONDS?: string;
    AUTH_PUBLIC_ORIGIN?: string;
    AUTH_ENV?: string;
    AUTH_COOKIE_SECURE?: string;
    AUTH_COOKIE_SAME_SITE?: string;
  }
}
