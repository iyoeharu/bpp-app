#!/usr/bin/env node
import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const [,, sqlPath, connectionString] = process.argv;
  if (!sqlPath || !connectionString) {
    console.error('Usage: node run_sql_file.mjs <sql-file> <connectionString>');
    process.exit(2);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to DB');
    // Split by semicolon followed by newline to avoid single giant query for huge files
    // but run as one because we've written idempotent blocks; use simple execution
    await client.query(sql);
    console.log('SQL executed successfully');
  } catch (err) {
    console.error('SQL execution error:');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
