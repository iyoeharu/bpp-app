-- =========================================
-- COMPLETE DATABASE RESET AND SAMPLE DATA
-- =========================================
-- This script first deletes all data, then inserts sample data
-- Use with caution in production environments!

-- =========================================
-- STEP 1: DELETE ALL EXISTING DATA
-- =========================================
BEGIN;

-- Delete data in reverse dependency order
DELETE FROM public.payment_logs;
DELETE FROM public.installment_coupons;
DELETE FROM public.credit_contracts;
DELETE FROM public.customers;
DELETE FROM public.routes;
DELETE FROM public.sales_agents;
-- =========================================
-- REORDERED SCHEMA: CREATE TABLES FIRST, THEN ADD FOREIGN KEYS
-- WARNING: This file creates schema objects. Review before running on production.
-- Run as a privileged user (service_role). This file is idempotent where possible.
-- =========================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Ensure enum types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'user');
    END IF;
END$$;

-- =============================
-- Phase 1: CREATE TABLES (without FK constraints)
-- =============================

CREATE TABLE IF NOT EXISTS public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT app_settings_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public.collectors (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    collector_code text NOT NULL UNIQUE,
    name text NOT NULL,
    phone text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT collectors_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sales_agents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    agent_code text NOT NULL UNIQUE,
    name text NOT NULL,
    phone text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    commission_percentage numeric DEFAULT 0,
    use_tiered_commission boolean NOT NULL DEFAULT true,
    CONSTRAINT sales_agents_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.commission_tiers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    min_amount numeric NOT NULL,
    max_amount numeric,
    percentage numeric NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT commission_tiers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text,
    phone text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    nik character varying UNIQUE,
    business_address text,
    branch_origin text NOT NULL DEFAULT 'A'::text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT customers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.credit_contracts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    contract_ref text NOT NULL UNIQUE,
    customer_id uuid NOT NULL,
    product_type text,
    total_loan_amount numeric NOT NULL DEFAULT 0,
    tenor_days integer NOT NULL DEFAULT 100,
    daily_installment_amount numeric NOT NULL DEFAULT 0,
    current_installment_index integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text])),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    start_date date NOT NULL DEFAULT CURRENT_DATE,
    omset numeric DEFAULT 0,
    sales_agent_id uuid,
    collector_id uuid,
    dp numeric NOT NULL DEFAULT 0,
    branch_origin text NOT NULL DEFAULT 'A'::text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT credit_contracts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.holidays (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    holiday_date date,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    holiday_type text NOT NULL DEFAULT 'specific_date'::text,
    day_of_week integer CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
    CONSTRAINT holidays_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.installment_coupons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    contract_id uuid NOT NULL,
    installment_index integer NOT NULL,
    due_date date NOT NULL,
    amount numeric NOT NULL,
    status text NOT NULL DEFAULT 'unpaid'::text CHECK (status = ANY (ARRAY['unpaid'::text, 'paid'::text])),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT installment_coupons_pkey PRIMARY KEY (id),
    CONSTRAINT installment_coupons_unique UNIQUE (contract_id, installment_index)
);

CREATE TABLE IF NOT EXISTS public.operational_expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    expense_date date NOT NULL DEFAULT CURRENT_DATE,
    description text NOT NULL,
    amount numeric NOT NULL DEFAULT 0,
    category text,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT operational_expenses_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.payment_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    contract_id uuid NOT NULL,
    payment_date date NOT NULL DEFAULT CURRENT_DATE,
    installment_index integer NOT NULL,
    amount_paid numeric NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    coupon_id uuid,
    collector_id uuid,
    branch_origin text NOT NULL DEFAULT 'A'::text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT payment_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.commission_payments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sales_agent_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    amount numeric NOT NULL DEFAULT 0,
    payment_date date NOT NULL DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT commission_payments_pkey PRIMARY KEY (id),
    CONSTRAINT commission_payments_contract_id_unique UNIQUE (contract_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_handovers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    collector_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    coupon_count integer NOT NULL,
    start_index integer NOT NULL,
    end_index integer NOT NULL,
    handover_date date NOT NULL DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT coupon_handovers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    action character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id uuid,
    user_id uuid,
    user_name character varying,
    user_role character varying,
    description text NOT NULL,
    details jsonb,
    ip_address inet,
    user_agent text,
    customer_id uuid,
    contract_id uuid,
    sales_agent_id uuid,
    CONSTRAINT activity_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sync_state (
    id text NOT NULL,
    last_sync_at timestamp with time zone,
    last_status text,
    last_message text,
    rows_synced jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT sync_state_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role public.app_role NOT NULL DEFAULT 'user'::public.app_role,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_roles_pkey PRIMARY KEY (id)
);

-- =============================
-- Phase 2: ADD FOREIGN KEY CONSTRAINTS
-- =============================

ALTER TABLE IF EXISTS public.credit_contracts
    ADD CONSTRAINT credit_contracts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    ADD CONSTRAINT credit_contracts_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collectors(id),
    ADD CONSTRAINT credit_contracts_sales_agent_id_fkey FOREIGN KEY (sales_agent_id) REFERENCES public.sales_agents(id);

ALTER TABLE IF EXISTS public.installment_coupons
    ADD CONSTRAINT installment_coupons_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id);

ALTER TABLE IF EXISTS public.payment_logs
    ADD CONSTRAINT payment_logs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id),
    ADD CONSTRAINT payment_logs_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.installment_coupons(id),
    ADD CONSTRAINT payment_logs_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collectors(id);

ALTER TABLE IF EXISTS public.commission_payments
    ADD CONSTRAINT commission_payments_sales_agent_id_fkey FOREIGN KEY (sales_agent_id) REFERENCES public.sales_agents(id),
    ADD CONSTRAINT commission_payments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id);

ALTER TABLE IF EXISTS public.coupon_handovers
    ADD CONSTRAINT coupon_handovers_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collectors(id),
    ADD CONSTRAINT coupon_handovers_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id);

ALTER TABLE IF EXISTS public.activity_logs
    ADD CONSTRAINT activity_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    ADD CONSTRAINT activity_logs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id),
    ADD CONSTRAINT activity_logs_sales_agent_id_fkey FOREIGN KEY (sales_agent_id) REFERENCES public.sales_agents(id);

ALTER TABLE IF EXISTS public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- End of reordered schema
