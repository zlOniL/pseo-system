-- AI cost telemetry. Prompts and completions are intentionally not retained here.

create table if not exists public.ai_runs (
  id uuid primary key,
  content_id uuid references public.contents(id) on delete set null,
  kind text not null,
  session_id text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_runs(id) on delete cascade,
  operation text not null,
  section_key text,
  attempt integer,
  model text not null,
  provider text,
  request_id text,
  session_id text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  estimated_cost_usd numeric(14, 8) not null default 0,
  estimated_cache_savings_usd numeric(14, 8) not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_runs_content_started_idx
  on public.ai_runs (content_id, started_at desc);

create index if not exists ai_usage_events_run_created_idx
  on public.ai_usage_events (run_id, created_at);

alter table public.contents
  add column if not exists ai_last_run_id uuid references public.ai_runs(id) on delete set null,
  add column if not exists ai_cost_usd numeric(14, 8),
  add column if not exists ai_cache_savings_usd numeric(14, 8),
  add column if not exists ai_cache_hit_rate numeric(7, 4),
  add column if not exists ai_call_count integer;

alter table public.ai_runs enable row level security;
alter table public.ai_usage_events enable row level security;
revoke all on table public.ai_runs from anon, authenticated;
revoke all on table public.ai_usage_events from anon, authenticated;

comment on table public.ai_runs is 'A single page or template generation, used to aggregate AI usage.';
comment on table public.ai_usage_events is 'Token and estimated-cost telemetry; prompts and completions are not stored.';
