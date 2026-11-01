import { createPool } from './database.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = await createApp(pool, config, {
  logger: {
    redact: [
      'err.detail',
      'err.where',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
  },
});
pool.on('error', (error) => app.log.error({ err: error }, 'Idle PostgreSQL connection failed'));
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void app
      .close()
      .then(() => pool.end())
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  });
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exitCode = 1;
}
