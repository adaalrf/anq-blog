import pg from 'pg';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = await createApp(pool, config);
await app.listen({ host: config.host, port: config.port });
console.log(`ANQ Blog API listening on ${config.host}:${config.port}`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    await pool.end();
  });
