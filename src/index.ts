import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createApp } from './app';
import { createApplicationServices } from './services/container';

// In Workers, this port is only a routing key for the native HTTP adapter.
// It does not open a TCP socket or run a persistent Node.js server.
const virtualPort = 3000;
const services = createApplicationServices(env, (req) => req.get('CF-Connecting-IP') ?? 'unknown');
createServer(createApp(env.CORS_ALLOWED_ORIGIN, { services })).listen(virtualPort);
export default httpServerHandler({ port: virtualPort });
