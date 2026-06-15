-- Add pickup_date (tanggal pengambilan) to contract_products
-- Run: node tools/run_sql_file.mjs supabase/add_pickup_date_to_contract_products.sql
ALTER TABLE public.contract_products
  ADD COLUMN IF NOT EXISTS pickup_date date;
