-- reset_coupon_payment_range (v4 - user range = range to RESET)
--
-- Semantik baru:
--   - (p_start_index, p_end_index) adalah range yang INGIN DI-RESET (dianggap belum terbayar).
--   - effective range = [min, max] installment_index di payment_logs kontrak tsb yang
--     berada di dalam [p_start..p_end]. Ini hanya dipakai untuk audit/log.
--   - Aksi:
--       * payment_logs pada [p_start..p_end] dihapus (jika ada).
--       * installment_coupons.status='unpaid' untuk semua index [p_start..p_end].
--       * coupon_handovers yang overlap [p_start..p_end] di-trim:
--             - fully inside range → dihapus
--             - overlap kiri (ch.start < p_start, ch.end di dalam) → end := p_start-1
--             - overlap kanan (ch.start di dalam, ch.end > p_end) → start := p_end+1
--             - handover mencakup seluruh range (ch.start < p_start & ch.end > p_end)
--               → di-split menjadi dua handover (kiri: ch.start..p_start-1,
--                 kanan: p_end+1..ch.end), coupon_count menyesuaikan.
--       * current_installment_index mengikuti kupon edit terakhir agar form
--         serah terima berikutnya mulai dari kupon edit + 1.
--       * Status kontrak: returned tetap; completed jika >= tenor; else active.
--
-- Contoh: user pilih 73-78, payment terakhir dalam range adalah 76.
--   → effective range = 73-76 (untuk audit).
--   → payment_logs 73-76 dihapus (77-78 memang tidak ada).
--   → installment_coupons 73-78 di-set unpaid.
--   → coupon_handovers di-trim/split untuk mengeluarkan indeks 73-78.

drop function if exists public.reset_coupon_payment_range(uuid, integer, integer, text, text);
drop function if exists public.reset_coupon_payment_range(uuid, integer, integer, uuid[], text, text);
drop function if exists public.reset_coupon_payment_range(text, uuid, integer, text, integer);
drop function if exists public.reset_coupon_payment_range(text, uuid, integer, uuid[], text, integer);

create function public.reset_coupon_payment_range(
  p_contract_id uuid,
  p_start_index integer,
  p_end_index integer,
  p_handover_ids uuid[] default null,
  p_reason text default null,
  p_admin_password text default null
)
returns table (
  adjustment_id uuid,
  affected_contract_id uuid,
  deleted_payment_count integer,
  before_current_installment_index integer,
  after_current_installment_index integer,
  before_status text,
  after_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_tenor integer;
  v_before_current integer;
  v_before_status text;
  v_after_current integer;
  v_after_status text;
  v_deleted_count integer := 0;
  v_admin_password text;
  v_adjustment_id uuid;
  v_eff_start integer;
  v_eff_end integer;
begin
  if p_contract_id is null then raise exception 'contract_id wajib diisi'; end if;
  if p_start_index is null or p_end_index is null then raise exception 'range kupon wajib diisi'; end if;
  if p_start_index < 1 or p_end_index < p_start_index then raise exception 'range kupon tidak valid'; end if;

  v_uid := auth.uid();
  if v_uid is null then raise exception 'unauthorized'; end if;

  select aps.value into v_admin_password
  from public.app_settings aps where aps.key = 'admin_password';
  if coalesce(v_admin_password, '') = '' then v_admin_password := 'Kemuje97'; end if;
  if coalesce(p_admin_password, '') = '' or p_admin_password <> v_admin_password then
    raise exception 'password admin salah';
  end if;

  select cc.tenor_days, cc.current_installment_index, cc.status
  into v_tenor, v_before_current, v_before_status
  from public.credit_contracts cc where cc.id = p_contract_id for update;
  if not found then raise exception 'kontrak tidak ditemukan'; end if;
  if p_end_index > v_tenor then raise exception 'kupon akhir melebihi tenor (%).', v_tenor; end if;

  -- Effective range (audit only): pembayaran yang benar-benar ada dalam range user.
  select min(pl.installment_index), max(pl.installment_index)
  into v_eff_start, v_eff_end
  from public.payment_logs pl
  where pl.contract_id = p_contract_id
    and pl.installment_index between p_start_index and p_end_index;

  -- 1) Hapus payment_logs pada [p_start..p_end].
  delete from public.payment_logs pl
  where pl.contract_id = p_contract_id
    and pl.installment_index between p_start_index and p_end_index;
  get diagnostics v_deleted_count = row_count;

  -- 2) Set installment_coupons.status='unpaid' untuk seluruh range user.
  update public.installment_coupons ic
  set status = 'unpaid'
  where ic.contract_id = p_contract_id
    and ic.installment_index between p_start_index and p_end_index;

  -- 3) Trim / split coupon_handovers yang overlap [p_start..p_end].
  --    a) Handover yang fully inside range → hapus.
  delete from public.coupon_handovers ch
  where ch.contract_id = p_contract_id
    and ch.start_index >= p_start_index
    and ch.end_index   <= p_end_index;

  --    b) Handover yang mencakup seluruh range (kiri < p_start dan kanan > p_end)
  --       → split menjadi dua: buat handover kanan (p_end+1..ch.end), lalu trim kiri.
  insert into public.coupon_handovers (
    contract_id, collector_id, handover_date, start_index, end_index,
    coupon_count, notes
  )
  select
    ch.contract_id, ch.collector_id, ch.handover_date,
    p_end_index + 1, ch.end_index,
    ch.end_index - (p_end_index + 1) + 1,
    coalesce(ch.notes, '') ||
      case when coalesce(ch.notes,'') = '' then '' else ' | ' end ||
      '[split dari reset ' || p_start_index || '-' || p_end_index || ']'
  from public.coupon_handovers ch
  where ch.contract_id = p_contract_id
    and ch.start_index < p_start_index
    and ch.end_index   > p_end_index;

  update public.coupon_handovers ch
  set end_index = p_start_index - 1,
      coupon_count = (p_start_index - 1) - ch.start_index + 1
  where ch.contract_id = p_contract_id
    and ch.start_index < p_start_index
    and ch.end_index   > p_end_index;

  --    c) Overlap kanan (start di dalam range, end > p_end) → geser start.
  update public.coupon_handovers ch
  set start_index = p_end_index + 1,
      coupon_count = ch.end_index - (p_end_index + 1) + 1
  where ch.contract_id = p_contract_id
    and ch.start_index between p_start_index and p_end_index
    and ch.end_index   > p_end_index;

  --    d) Overlap kiri (start < p_start, end di dalam range) → geser end.
  update public.coupon_handovers ch
  set end_index = p_start_index - 1,
      coupon_count = (p_start_index - 1) - ch.start_index + 1
  where ch.contract_id = p_contract_id
    and ch.start_index < p_start_index
    and ch.end_index between p_start_index and p_end_index;

  -- 4) Anchor serah terima berikutnya mengikuti kupon edit terakhir.
  v_after_current := p_end_index;

  if v_before_status = 'returned' then v_after_status := 'returned';
  elsif v_after_current >= v_tenor then v_after_status := 'completed';
  else v_after_status := 'active'; end if;

  update public.credit_contracts cc
  set current_installment_index = v_after_current, status = v_after_status
  where cc.id = p_contract_id;

  insert into public.coupon_range_adjustments (
    contract_id, reset_start_index, reset_end_index, deleted_payment_count,
    before_current_installment_index, after_current_installment_index,
    before_status, after_status, reason, requested_by
  )
  values (
    p_contract_id,
    coalesce(v_eff_start, p_start_index),
    coalesce(v_eff_end, p_end_index),
    v_deleted_count,
    v_before_current, v_after_current, v_before_status, v_after_status,
    nullif(trim(p_reason), ''), v_uid
  )
  returning id into v_adjustment_id;

  return query select v_adjustment_id, p_contract_id, v_deleted_count,
    v_before_current, v_after_current, v_before_status, v_after_status;
end;
$$;

revoke all on function public.reset_coupon_payment_range(uuid, integer, integer, uuid[], text, text) from public;
grant execute on function public.reset_coupon_payment_range(uuid, integer, integer, uuid[], text, text) to authenticated;
