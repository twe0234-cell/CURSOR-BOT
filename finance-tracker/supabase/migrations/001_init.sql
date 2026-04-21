-- Finance Tracker — Initial Schema
-- Run this in Supabase SQL Editor on the finance-tracker project

-- ─── categories ───────────────────────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  type        text not null check (type in ('income', 'fixed', 'variable')),
  parent_id   uuid references categories(id) on delete set null,
  color       text,
  created_at  timestamptz default now()
);
alter table categories enable row level security;
create policy "own categories" on categories using (auth.uid() = user_id);

-- ─── transactions ─────────────────────────────────────────────────────────────
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  date        date not null,
  amount      numeric(14,2) not null,
  description text not null default '',
  source      text not null default 'manual',
  hash        text,
  category_id uuid references categories(id) on delete set null,
  notes       text,
  created_at  timestamptz default now(),
  unique (user_id, hash)
);
alter table transactions enable row level security;
create policy "own transactions" on transactions using (auth.uid() = user_id);
create index if not exists transactions_user_date on transactions(user_id, date desc);
create index if not exists transactions_hash on transactions(user_id, hash);

-- ─── classification_rules ─────────────────────────────────────────────────────
create table if not exists classification_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  match_type  text not null check (match_type in ('contains','equals','starts_with','regex')),
  pattern     text not null,
  category_id uuid references categories(id) on delete cascade not null,
  priority    int not null default 0,
  created_at  timestamptz default now()
);
alter table classification_rules enable row level security;
create policy "own rules" on classification_rules using (auth.uid() = user_id);

-- ─── recurring_expenses ───────────────────────────────────────────────────────
create table if not exists recurring_expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  category_id uuid references categories(id) on delete set null,
  amount      numeric(14,2) not null,
  frequency   text not null check (frequency in ('monthly','quarterly','yearly')),
  start_date  date not null,
  end_date    date,
  notes       text,
  created_at  timestamptz default now()
);
alter table recurring_expenses enable row level security;
create policy "own recurring" on recurring_expenses using (auth.uid() = user_id);

-- ─── assets ───────────────────────────────────────────────────────────────────
create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  asset_type  text not null default 'other',
  notes       text,
  created_at  timestamptz default now()
);
alter table assets enable row level security;
create policy "own assets" on assets using (auth.uid() = user_id);

-- ─── asset_snapshots ──────────────────────────────────────────────────────────
create table if not exists asset_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  asset_id      uuid references assets(id) on delete cascade not null,
  value         numeric(14,2) not null,
  snapshot_date date not null default current_date,
  notes         text,
  created_at    timestamptz default now()
);
alter table asset_snapshots enable row level security;
create policy "own snapshots" on asset_snapshots using (auth.uid() = user_id);
create index if not exists snapshots_asset_date on asset_snapshots(asset_id, snapshot_date desc);

-- ─── imports (audit log) ──────────────────────────────────────────────────────
create table if not exists imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  file_name     text not null,
  source        text not null,
  rows_total    int not null default 0,
  rows_imported int not null default 0,
  rows_skipped  int not null default 0,
  status        text not null default 'done',
  created_at    timestamptz default now()
);
alter table imports enable row level security;
create policy "own imports" on imports using (auth.uid() = user_id);

-- ─── bank_connections (Open Banking / scraper) ────────────────────────────────
create table if not exists bank_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  bank_id           text not null,
  display_name      text not null,
  account_number    text,
  access_token_enc  text,
  refresh_token_enc text,
  expires_at        timestamptz,
  last_synced_at    timestamptz,
  last_error        text,
  is_active         boolean not null default true,
  created_at        timestamptz default now(),
  unique (user_id, bank_id, account_number)
);
alter table bank_connections enable row level security;
create policy "own bank connections" on bank_connections using (auth.uid() = user_id);
