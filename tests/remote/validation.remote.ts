import { validationContract } from '../shared/validation-contract';

const configuredUrl = process.env.MAI_VALIDATION_URL;
if (!configuredUrl) throw new Error('MAI_VALIDATION_URL is required; remote validation was NOT executed');
const url = new URL(configuredUrl);
if (url.protocol !== 'https:' || !/^[a-z0-9-]+-dev\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
  || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) {
  throw new Error('Use the approved HTTPS development Worker URL (<name>-dev.<subdomain>.workers.dev), without path or credentials');
}

// This suite deliberately performs no deployment. Never follow redirects to another target.
validationContract((path, init) => fetch(new URL(path, url), {
  ...init, redirect: 'error', signal: AbortSignal.timeout(10_000),
}));
