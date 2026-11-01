import { parseTrustedProxies } from './proxy.js';
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const origin = env.APP_ORIGIN || 'http://localhost:5175';
  const url = new URL(origin);
  if (url.origin !== origin) throw new Error('APP_ORIGIN must be an exact origin');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('HTTPS is required outside localhost');
  const port = Number(env.PORT || 8082);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (env.DEMO_NOTICE && !['true', 'false'].includes(env.DEMO_NOTICE))
    throw new Error('DEMO_NOTICE must be true or false');
  return {
    demoNotice: env.DEMO_NOTICE === 'true',
    databaseUrl: env.DATABASE_URL,
    trustProxy: parseTrustedProxies(env.TRUST_PROXY_IPS),
    origin,
    secureCookie: url.protocol === 'https:',
    host: env.HOST || '127.0.0.1',
    port,
  };
}
export type Config = ReturnType<typeof loadConfig>;
