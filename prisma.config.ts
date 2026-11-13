import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Generation and validation work without credentials; migrations require DIRECT_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(process.env.DIRECT_URL ? { datasource: { url: process.env.DIRECT_URL } } : {}),
});
