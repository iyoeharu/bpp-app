-- reset_coupon_payment_range
--
-- Konsep baru (sinkron dengan UI "Edit Range Kupon"):
--   - (p_start_index, p_end_index) adalah range BARU yang ingin dipertahankan.
--   - Semua kupon di range LAMA (handover yang dipilih) yang berada DI LUAR
--     range baru akan di-reset:
--       * payment_logs untuk index tsb dihapus
--       * installment_coupons.status dikembalikan ke 'unpaid'
--       * coupon_handovers di-trim (atau dihapus jika tidak lagi overlap)
--   - current_installment_index dihitung ulang dari MAX(payment_logs.installment_index)
--   - Status kontrak dihitung ulang (returned tetap, completed jika >= tenor, else active)
--
-- Jalankan sekali di Supabase SQL Editor.

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
  v_handover_ids uuid[];
  v_old_start integer;
  v_old_end integer;
  v_handover_contract_id uuid;
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

  v_handover_ids := coalesce(p_handover_ids, array[]::uuid[]);
  if array_length(v_handover_ids, 1) > 0 then
    select min(ch.start_index), max(ch.end_index)
    into v_old_start, v_old_end
    from public.coupon_handovers ch where ch.id = any(v_handover_ids);

    select ch.contract_id into v_handover_contract_id
    from public.coupon_handovers ch where ch.id = any(v_handover_ids) limit 1;

    if v_handover_contract_id is null then raise exception 'handover tidak ditemukan'; end if;
    if v_handover_contract_id <> p_contract_id then raise exception 'handover tidak sesuai kontrak'; end if;
  else
    select min(ch.start_index), max(ch.end_index) into v_old_start, v_old_end
    from public.coupon_handovers ch where ch.contract_id = p_contract_id;
  end if;
  if v_old_start is null or v_old_end is null then raise exception 'handover belum ditemukan'; end if;

  select cc.tenor_days, cc.current_installment_index, cc.status
  into v_tenor, v_before_current, v_before_status
  from public.credit_contracts cc where cc.id = p_contract_id for update;
  if not found then raise exception 'kontrak tidak ditemukan'; end if;
  if p_end_index > v_tenor then raise exception 'kupon akhir melebihi tenor (%).', v_tenor; end if;

  -- 1) Hapus payment_logs pada index di dalam range lama TAPI di luar range baru
  delete from public.payment_logs pl
  where pl.contract_id = p_contract_id
    and pl.installment_index between v_old_start and v_old_end
    and (pl.installment_index < p_start_index or pl.installment_index > p_end_index);
  get diagnostics v_deleted_count = row_count;

  -- 2) Trim / hapus coupon_handovers agar selaras dengan range baru
  --    Handover yang dipilih (atau seluruh kontrak jika tidak ada pilihan)
  --    di luar [p_start..p_end] dihapus; yang overlap di-trim ke irisan.
  with target_handovers as (
    select ch.*
    from public.coupon_handovers ch
    where ch.contract_id = p_contract_id
      and (
        coalesce(array_length(v_handover_ids, 1), 0) > 0 and ch.id = any(v_handover_ids)
        or coalesce(array_length(v_handover_ids, 1), 0) = 0
           and ch.start_index <= v_old_end
           and ch.end_index   >= v_old_start
      )
  ),
  to_delete as (
    select id from target_handovers
    where end_index < p_start_index or start_index > p_end_index
  ),
  deleted as (
    delete from public.coupon_handovers ch
    using to_delete d where ch.id = d.id
    returning ch.id
  )
  update public.coupon_handovers ch
  set start_index = greatest(ch.start_index, p_start_index),
      end_index   = least(ch.end_index, p_end_index),
      coupon_count = least(ch.end_index, p_end_index) - greatest(ch.start_index, p_start_index) + 1
  from target_handovers t
  where ch.id = t.id
    and ch.id not in (select id from deleted)
    and (ch.start_index < p_start_index or ch.end_index > p_end_index);

  -- 3) Reset status kupon yang ter-reset menjadi 'unpaid'
  update public.installment_coupons ic
  set status = 'unpaid'
  where ic.contract_id = p_contract_id
    and ic.installment_index between v_old_start and v_old_end
    and (ic.installment_index < p_start_index or ic.installment_index > p_end_index);

  -- 4) Hitung ulang current_installment_index dari payment_logs yang tersisa
  select coalesce(max(installment_index), 0) into v_after_current
  from public.payment_logs pl where pl.contract_id = p_contract_id;

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
    p_contract_id, p_start_index, p_end_index, v_deleted_count,
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
