-- Coupon range reset mechanism for overpayment correction.
-- Provides:
-- 1) Audit table for every range reset operation.
-- 2) Integrity constraints for handover range consistency.
-- 3) RPC function to reset a processed coupon range and recalculate contract progress/status.

create table if not exists public.coupon_range_adjustments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.credit_contracts(id) on delete cascade,
  reset_start_index integer not null,
  reset_end_index integer not null,
  deleted_payment_count integer not null default 0,
  before_current_installment_index integer not null,
  after_current_installment_index integer not null,
  before_status text not null,
  after_status text not null,
  reason text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  constraint coupon_range_adjustments_range_check
    check (reset_start_index >= 1 and reset_end_index >= reset_start_index)
);

alter table public.coupon_range_adjustments enable row level security;

drop policy if exists "Authenticated can read coupon_range_adjustments" on public.coupon_range_adjustments;
create policy "Authenticated can read coupon_range_adjustments"
on public.coupon_range_adjustments
for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert coupon_range_adjustments" on public.coupon_range_adjustments;
create policy "Authenticated can insert coupon_range_adjustments"
on public.coupon_range_adjustments
for insert
to authenticated
with check (true);

-- Keep coupon handover range internally consistent (future writes).
alter table public.coupon_handovers
  drop constraint if exists coupon_handovers_range_consistency_check;

alter table public.coupon_handovers
  add constraint coupon_handovers_range_consistency_check
  check (
    start_index >= 1
    and end_index >= start_index
    and coupon_count = (end_index - start_index + 1)
  ) not valid;

-- Keep payment installment index valid (future writes).
alter table public.payment_logs
  drop constraint if exists payment_logs_installment_index_positive_check;

alter table public.payment_logs
  add constraint payment_logs_installment_index_positive_check
  check (installment_index >= 1) not valid;

drop function if exists public.reset_coupon_payment_range(uuid, integer, integer, text, text);

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
  if p_contract_id is null then
    raise exception 'contract_id wajib diisi';
  end if;

  if p_start_index is null or p_end_index is null then
    raise exception 'range kupon wajib diisi';
  end if;

  if p_start_index < 1 or p_end_index < p_start_index then
    raise exception 'range kupon tidak valid';
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  select aps.value
  into v_admin_password
  from public.app_settings aps
  where aps.key = 'admin_password';

  if coalesce(v_admin_password, '') = '' then
    v_admin_password := 'Kemuje97';
  end if;

  if coalesce(p_admin_password, '') = '' or p_admin_password <> v_admin_password then
    raise exception 'password admin salah';
  end if;

  v_handover_ids := coalesce(p_handover_ids, array[]::uuid[]);
  if array_length(v_handover_ids, 1) > 0 then
    select
      min(ch.start_index),
      max(ch.end_index),
      min(ch.contract_id)
    into v_old_start, v_old_end, v_handover_contract_id
    from public.coupon_handovers ch
    where ch.id = any(v_handover_ids);

    if v_handover_contract_id is null then
      raise exception 'handover tidak ditemukan';
    end if;

    if v_handover_contract_id <> p_contract_id then
      raise exception 'handover tidak sesuai kontrak';
    end if;
  else
    select
      min(ch.start_index),
      max(ch.end_index)
    into v_old_start, v_old_end
    from public.coupon_handovers ch
    where ch.contract_id = p_contract_id;
  end if;

  if v_old_start is null or v_old_end is null then
    raise exception 'handover belum ditemukan';
  end if;

  select cc.tenor_days, cc.current_installment_index, cc.status
  into v_tenor, v_before_current, v_before_status
  from public.credit_contracts cc
  where cc.id = p_contract_id
  for update;

  if not found then
    raise exception 'kontrak tidak ditemukan';
  end if;

  if p_end_index > v_tenor then
    raise exception 'kupon akhir melebihi tenor (%).', v_tenor;
  end if;

  delete from public.payment_logs pl
  where pl.contract_id = p_contract_id
    and pl.installment_index between v_old_start and v_old_end;

  get diagnostics v_deleted_count = row_count;

  update public.coupon_handovers ch
  set start_index = p_start_index,
      end_index = p_end_index,
      coupon_count = (p_end_index - p_start_index + 1)
  where ch.contract_id = p_contract_id
    and (
      coalesce(array_length(v_handover_ids, 1), 0) = 0
      or ch.id = any(v_handover_ids)
    );

  update public.installment_coupons ic
  set status = 'unpaid'
  where ic.contract_id = p_contract_id
    and ic.installment_index between v_old_start and v_old_end;

  insert into public.payment_logs (
    contract_id,
    payment_date,
    installment_index,
    amount_paid,
    collector_id,
    notes
  )
  select
    p_contract_id,
    coalesce((select min(ch.handover_date) from public.coupon_handovers ch where ch.contract_id = p_contract_id), current_date),
    gs,
    cc.daily_installment_amount,
    coalesce((select ch.collector_id from public.coupon_handovers ch where ch.contract_id = p_contract_id order by ch.created_at desc limit 1), null),
    case
      when p_reason is not null and trim(p_reason) <> '' then
        'Range reset: ' || p_reason
      else
        'Range reset'
    end
  from generate_series(p_start_index, p_end_index) as gs
  cross join public.credit_contracts cc
  where cc.id = p_contract_id;

  update public.installment_coupons ic
  set status = 'paid'
  where ic.contract_id = p_contract_id
    and ic.installment_index between p_start_index and p_end_index;

  select coalesce(max(installment_index), 0)
  into v_after_current
  from public.payment_logs pl
  where pl.contract_id = p_contract_id;

  if v_before_status = 'returned' then
    v_after_status := 'returned';
  elsif v_after_current >= v_tenor then
    v_after_status := 'completed';
  else
    v_after_status := 'active';
  end if;

  update public.credit_contracts cc
  set current_installment_index = v_after_current,
      status = v_after_status
  where cc.id = p_contract_id;

  insert into public.coupon_range_adjustments (
    contract_id,
    reset_start_index,
    reset_end_index,
    deleted_payment_count,
    before_current_installment_index,
    after_current_installment_index,
    before_status,
    after_status,
    reason,
    requested_by
  )
  values (
    p_contract_id,
    p_start_index,
    p_end_index,
    v_deleted_count,
    v_before_current,
    v_after_current,
    v_before_status,
    v_after_status,
    nullif(trim(p_reason), ''),
    v_uid
  )
  returning id into v_adjustment_id;

  return query
  select
    v_adjustment_id,
    p_contract_id,
    v_deleted_count,
    v_before_current,
    v_after_current,
    v_before_status,
    v_after_status;
end;
$$;

revoke all on function public.reset_coupon_payment_range(uuid, integer, integer, text, text) from public;
grant execute on function public.reset_coupon_payment_range(uuid, integer, integer, text, text) to authenticated;

drop function if exists public.reset_coupon_payment_range(uuid, integer, integer, text, text);

create function public.reset_coupon_payment_range(
  p_contract_id uuid,
  p_start_index integer,
  p_end_index integer,
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
begin
  return query
  select *
  from public.reset_coupon_payment_range(
    p_contract_id,
    p_start_index,
    p_end_index,
    null::uuid[],
    p_reason,
    p_admin_password
  );
end;
$$;

revoke all on function public.reset_coupon_payment_range(uuid, integer, integer, text, text) from public;
grant execute on function public.reset_coupon_payment_range(uuid, integer, integer, text, text) to authenticated;

drop function if exists public.reset_coupon_payment_range(text, uuid, integer, text, integer);

create function public.reset_coupon_payment_range(
  p_admin_password text,
  p_contract_id uuid,
  p_end_index integer,
  p_reason text default null,
  p_start_index integer default null
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
begin
  return query
  select *
  from public.reset_coupon_payment_range(
    p_contract_id,
    p_start_index,
    p_end_index,
    null::uuid[],
    p_reason,
    p_admin_password
  );
end;
$$;

revoke all on function public.reset_coupon_payment_range(text, uuid, integer, text, integer) from public;
grant execute on function public.reset_coupon_payment_range(text, uuid, integer, text, integer) to authenticated;

drop function if exists public.reset_coupon_payment_range(text, uuid, integer, uuid[], text, integer);

create function public.reset_coupon_payment_range(
  p_admin_password text,
  p_contract_id uuid,
  p_end_index integer,
  p_handover_ids uuid[] default null,
  p_reason text default null,
  p_start_index integer default null
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
begin
  return query
  select *
  from public.reset_coupon_payment_range(
    p_contract_id,
    p_start_index,
    p_end_index,
    p_handover_ids,
    p_reason,
    p_admin_password
  );
end;
$$;

revoke all on function public.reset_coupon_payment_range(text, uuid, integer, uuid[], text, integer) from public;
grant execute on function public.reset_coupon_payment_range(text, uuid, integer, uuid[], text, integer) to authenticated;
