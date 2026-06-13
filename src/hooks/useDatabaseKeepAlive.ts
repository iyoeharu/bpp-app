import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Auto-ping ke database setiap 3 hari untuk mencegah pause/sleep
 * pada Supabase free-tier ketika project tidak aktif.
 *
 * Strategi:
 * - Simpan timestamp ping terakhir di localStorage.
 * - Saat app dimuat, jika sudah > 3 hari sejak ping terakhir → kirim
 *   1 query ringan (HEAD count) ke tabel kecil.
 * - Selama tab terbuka, jalankan interval 24 jam untuk re-cek.
 */

const STORAGE_KEY = 'db_last_ping_at';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function pingDatabase() {
  try {
    // Query ringan: HEAD count, tidak menarik baris data
    const { error } = await supabase
      .from('operational_expenses')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.warn('[KeepAlive] Ping gagal:', error.message);
      return false;
    }
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    console.info('[KeepAlive] Ping database berhasil.');
    return true;
  } catch (err) {
    console.warn('[KeepAlive] Ping error:', err);
    return false;
  }
}

function shouldPing(): boolean {
  const last = localStorage.getItem(STORAGE_KEY);
  if (!last) return true;
  const lastTs = Number(last);
  if (!Number.isFinite(lastTs)) return true;
  return Date.now() - lastTs >= THREE_DAYS_MS;
}

export function useDatabaseKeepAlive() {
  useEffect(() => {
    // Cek saat mount
    if (shouldPing()) {
      void pingDatabase();
    }

    // Re-cek setiap 24 jam selama tab aktif
    const interval = setInterval(() => {
      if (shouldPing()) {
        void pingDatabase();
      }
    }, ONE_DAY_MS);

    return () => clearInterval(interval);
  }, []);
}
