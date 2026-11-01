import pg from 'pg';
import { seedDemo } from './demo.js';
if (process.env.SEED_DEMO !== 'true' || !process.env.DATABASE_URL)
  throw new Error(
    'Set SEED_DEMO=true and DATABASE_URL explicitly. This adds fictional sample content; existing records are preserved.',
  );
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await seedDemo(pool);
  console.log('Fictional conversations added; existing records and credentials preserved.');
} finally {
  await pool.end();
}
