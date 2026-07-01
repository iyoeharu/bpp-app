-- reset_coupon_payment_range (v3 - effective range collapses to actual payments)
--
-- Perilaku:
--   - (p_start_index, p_end_index) adalah range BARU yang INGIN dipertahankan LUNAS.
--   - Sistem membaca payment_logs untuk kontrak tsb dan menghitung range EFEKTIF:
--        eff_start = MIN(installment_index) di payment_logs dalam [p_start..p_end]
--        eff_end   = MAX(installment_index) di payment_logs dalam [p_start..p_end]
--     Jika tidak ada pembayaran dalam range yang diminta, effective range = kosong
--     (tidak ada kupon yang dipertahankan).
--   - Contoh: user pilih 73-78, tapi payment_logs terakhir di dalam range adalah 76,
--     maka effective range = 73-76. Kupon 77-78 dianggap TIDAK jadi terbayar dan
--     ikut di-reset (dihapus dari payment_logs jika ada, coupon.status='unpaid').
--   - Semua kupon di range LAMA (handover yang dipilih) DI LUAR effective range
--     akan di-reset dan coupon_handovers ditrim/dihapus mengikuti effective range.
--   - current_installment_index dihitung ulang dari MAX(payment_logs.installment_index).
--   - Status kontrak dihitung ulang (returned tetap; completed jika >= tenor; else active).
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
  v_eff_start integer;
  v_eff_end integer;
  v_has_effective boolean := false;
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

  -- Hitung EFFECTIVE range dari payment_logs yang benar-benar ada di dalam
  -- range yang diminta user. Kupon di luar effective range dianggap tidak terbayar.
  select min(pl.installment_index), max(pl.installment_index)
  into v_eff_start, v_eff_end
  from public.payment_logs pl
  where pl.contract_id = p_contract_id
    and pl.installment_index between p_start_index and p_end_index;

  v_has_effective := v_eff_start is not null and v_eff_end is not null;

  -- 1) Hapus payment_logs pada index di dalam range LAMA yang berada DI LUAR effective range
  if v_has_effective then
    delete from public.payment_logs pl
    where pl.contract_id = p_contract_id
      and pl.installment_index between v_old_start and v_old_end
      and (pl.installment_index < v_eff_start or pl.installment_index > v_eff_end);
  else
    -- Tidak ada pembayaran di dalam range user → reset seluruh range lama.
    delete from public.payment_logs pl
    where pl.contract_id = p_contract_id
      and pl.installment_index between v_old_start and v_old_end;
  end if;
  get diagnostics v_deleted_count = row_count;

  -- 2) Trim / hapus coupon_handovers mengikuti effective range.
  --    Handover target (atau seluruh kontrak jika tidak ada pilihan) yang berada
  --    di luar effective range dihapus; yang overlap di-trim ke irisan.
  if v_has_effective then
    with target_handovers as (
      select ch.*
      from public.coupon_handovers ch
      where ch.contract_id = p_contract_id
        and (
          (coalesce(array_length(v_handover_ids, 1), 0) > 0 and ch.id = any(v_handover_ids))
          or (coalesce(array_length(v_handover_ids, 1), 0) = 0
              and ch.start_index <= v_old_end
              and ch.end_index   >= v_old_start)
        )
    ),
    to_delete as (
      select id from target_handovers
      where end_index < v_eff_start or start_index > v_eff_end
    ),
    deleted as (
      delete from public.coupon_handovers ch
      using to_delete d where ch.id = d.id
      returning ch.id
    )
    update public.coupon_handovers ch
    set start_index = greatest(ch.start_index, v_eff_start),
        end_index   = least(ch.end_index, v_eff_end),
        coupon_count = least(ch.end_index, v_eff_end) - greatest(ch.start_index, v_eff_start) + 1
    from target_handovers t
    where ch.id = t.id
      and ch.id not in (select id from deleted)
      and (ch.start_index < v_eff_start or ch.end_index > v_eff_end);
  else
    -- Tidak ada effective range → hapus seluruh handover target dalam range lama.
    delete from public.coupon_handovers ch
    where ch.contract_id = p_contract_id
      and (
        (coalesce(array_length(v_handover_ids, 1), 0) > 0 and ch.id = any(v_handover_ids))
        or (coalesce(array_length(v_handover_ids, 1), 0) = 0
            and ch.start_index <= v_old_end
            and ch.end_index   >= v_old_start)
      );
  end if;

  -- 3) Reset status kupon di luar effective range menjadi 'unpaid'
  if v_has_effective then
    update public.installment_coupons ic
    set status = 'unpaid'
    where ic.contract_id = p_contract_id
      and ic.installment_index between v_old_start and v_old_end
      and (ic.installment_index < v_eff_start or ic.installment_index > v_eff_end);
  else
    update public.installment_coupons ic
    set status = 'unpaid'
    where ic.contract_id = p_contract_id
      and ic.installment_index between v_old_start and v_old_end;
  end if;

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
