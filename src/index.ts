import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createApp } from './app';
import { createApplicationServices } from './services/container';

// In Workers, this port is only a routing key for the native HTTP adapter.
// It does not open a TCP socket or run a persistent Node.js server.
const virtualPort = 3000;
createServer(createApp(env.CORS_ALLOWED_ORIGIN, { services: createApplicationServices(env) })).listen(virtualPort);
export default httpServerHandler({ port: virtualPort });
