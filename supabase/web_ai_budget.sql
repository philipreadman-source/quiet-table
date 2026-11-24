-- The website's daily AI budget ("community credits"). Run once in Supabase →
-- SQL Editor, after web_public.sql. Web only: the iOS app isn't capped here.
--
-- Each day (midnight to midnight, Amsterdam time) the site can spend
-- daily_budget_cents (100 = €1) on live AI answers, and each device and each
-- network gets a few answers. Past either, Find answers from the catalog.
--
-- Only the site's server can record spending or use an answer: it sends a
-- secret that's generated here and copied into Vercel. Anyone can read how
-- much is left (that's the line under the prompt). No one can read the tables.
--
-- After running this, get the secret with:
--   select value from public.web_ai_settings where key = 'secret';
-- and set it in Vercel (and .env.local) as WEB_AI_BUDGET_SECRET.

create extension if not exists pgcrypto;

create table if not exists public.web_ai_settings (
  key text primary key,
  value text not null
);
alter table public.web_ai_settings enable row level security;

insert into public.web_ai_settings (key, value) values
  ('secret', encode(gen_random_bytes(24), 'hex')),
  ('daily_budget_cents', '100'),
  ('answers_per_device', '3'),
  ('answers_per_network', '6')
on conflict (key) do nothing;

-- Euro cents spent per day.
create table if not exists public.web_ai_spend (
  day date primary key,
  cents numeric not null default 0
);
alter table public.web_ai_spend enable row level security;

-- Answers used per day, per device (a random id the browser keeps) and per
-- network (a hash of the IP address, made on the server; never the address).
create table if not exists public.web_ai_answers (
  day date not null,
  who text not null check (char_length(who) between 8 and 128),
  answers integer not null default 0,
  primary key (day, who)
);
alter table public.web_ai_answers enable row level security;
-- No policies on any of these: only the functions below touch them.

create or replace function public.web_ai_today()
returns date
language sql stable
as $$ select (now() at time zone 'Europe/Amsterdam')::date $$;

create or replace function public.web_ai_setting(p_key text)
returns text
language sql stable security definer set search_path = public
as $$ select value from public.web_ai_settings where key = p_key $$;

-- Share of today's budget left, 0 to 1. Anyone can ask.
create or replace function public.web_ai_remaining()
returns numeric
language sql stable security definer set search_path = public
as $$
  select greatest(0, 1 - coalesce((select cents from public.web_ai_spend where day = public.web_ai_today()), 0)
    / greatest(1, public.web_ai_setting('daily_budget_cents')::numeric))
$$;

-- The server asks before a live answer. Allowed (and counted) when there's
-- budget left and this device and network have answers left today.
-- Returns {allowed, reason, remaining}; reason is 'budget' or 'device'.
create or replace function public.web_ai_allow(p_secret text, p_device text, p_network text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  today date := public.web_ai_today();
  device_used integer;
  network_used integer;
begin
  if p_secret is distinct from public.web_ai_setting('secret') then
    return jsonb_build_object('allowed', false, 'reason', 'secret', 'remaining', public.web_ai_remaining());
  end if;
  if public.web_ai_remaining() <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'budget', 'remaining', 0);
  end if;
  select answers into device_used from public.web_ai_answers where day = today and who = 'd:' || p_device;
  select answers into network_used from public.web_ai_answers where day = today and who = 'n:' || p_network;
  if coalesce(device_used, 0) >= public.web_ai_setting('answers_per_device')::integer
     or coalesce(network_used, 0) >= public.web_ai_setting('answers_per_network')::integer then
    return jsonb_build_object('allowed', false, 'reason', 'device', 'remaining', public.web_ai_remaining());
  end if;
  insert into public.web_ai_answers (day, who, answers) values (today, 'd:' || p_device, 1)
    on conflict (day, who) do update set answers = public.web_ai_answers.answers + 1;
  insert into public.web_ai_answers (day, who, answers) values (today, 'n:' || p_network, 1)
    on conflict (day, who) do update set answers = public.web_ai_answers.answers + 1;
  return jsonb_build_object('allowed', true, 'reason', null, 'remaining', public.web_ai_remaining());
end;
$$;

-- The server records what an answer cost, in euro cents (0 to 50 per call).
-- Returns the share of today's budget left.
create or replace function public.web_ai_charge(p_secret text, p_cents numeric)
returns numeric
language plpgsql volatile security definer set search_path = public
as $$
begin
  if p_secret is distinct from public.web_ai_setting('secret') then
    return public.web_ai_remaining();
  end if;
  insert into public.web_ai_spend (day, cents)
    values (public.web_ai_today(), least(greatest(coalesce(p_cents, 0), 0), 50))
    on conflict (day) do update set cents = public.web_ai_spend.cents + excluded.cents;
  return public.web_ai_remaining();
end;
$$;

revoke all on function public.web_ai_setting(text) from public;
revoke all on function public.web_ai_remaining() from public;
revoke all on function public.web_ai_allow(text, text, text) from public;
revoke all on function public.web_ai_charge(text, numeric) from public;
grant execute on function public.web_ai_remaining() to anon, authenticated;
grant execute on function public.web_ai_allow(text, text, text) to anon, authenticated;
grant execute on function public.web_ai_charge(text, numeric) to anon, authenticated;
