#!/usr/bin/env node
// Simple migration runner: executes all SQL files in supabase/migrations in alphabetical order
// Usage: DATABASE_URL=postgresql://user:pass@host:port/dbname node tools/run_migrations.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if present
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

if (!process.env.DATABASE_URL) {
  console.error('Please set DATABASE_URL environment variable (Postgres connection string).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    await client.connect();
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const full = path.join(migrationsDir, f);
      console.log('Applying', full);
      const sql = fs.readFileSync(full, 'utf8');
      try {
        await client.query(sql);
        console.log('Applied', f);
      } catch (err) {
        console.error('Failed to apply', f, '\n', err.message || err);
        await client.end();
        process.exit(2);
      }
    }
    await client.end();
    console.log('All migrations applied successfully');
  } catch (err) {
    console.error('Migration runner failed:', err.message || err);
    process.exit(3);
  }
})();
