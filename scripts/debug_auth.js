import { createClient } from '@supabase/supabase-js';
// Try to read .env file manually if present (avoid requiring dotenv here)
import fs from 'fs';
const envPath = new URL('../.env', import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\n+/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*)\2\s*$/i);
    if (m) {
      const k = m[1];
      const v = m[3];
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE env vars.');
  process.exit(1);
}

const supabase = createClient(url, key);

try {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  console.log('getSession error:', sessionErr);
  console.log('session:', sessionData?.session ?? null);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  console.log('getUser error:', userErr);
  console.log('user:', userData?.user ?? null);
} catch (e) {
  console.error('unexpected error', e);
}
