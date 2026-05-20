#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const [,, connectionString, rawQuery] = process.argv;
  if (!connectionString || !rawQuery) {
    console.error('Usage: node run_query.mjs <connectionString> <sql-query>');
    process.exit(2);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(rawQuery);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Query error:');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
