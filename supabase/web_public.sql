-- The public web version (no sign-in). Run once in Supabase → SQL Editor.
--
-- The website can't read the tables: it calls these functions with the
-- public key, and they hand back only what's safe to show anyone.
--
-- 1. web_place_scores(): every reviewed place's average and count, for Find.
-- 2. web_place(place_id): one place's reviews, anonymous (initials only, no
--    names, usernames or ids), with their photos, plus gallery photos.
--    Anything reported is left out.
-- 3. web_chat_allow(...): the website's AI search allowance, a few
--    questions per device a day and a daily cap overall, logged in
--    web_find_chats (no one can read that table but these functions).

-- 1. Scores
create or replace function public.web_place_scores()
returns table (place_id text, score numeric, reviews integer)
language sql stable security definer set search_path = public
as $$
  select r.place_id, round(avg(r.score)::numeric, 1), count(*)::integer
  from public.reviews r
  where not exists (select 1 from public.reports x where x.review_id = r.id)
  group by r.place_id
$$;

-- 2. One place: anonymous reviews and photos
create or replace function public.web_initials(name text)
returns text
language sql immutable
as $$
  select upper(
    left(split_part(trim(name), ' ', 1), 1) ||
    left(nullif(split_part(trim(name), ' ', 2), ''), 1)
  )
$$;

create or replace function public.web_place(p_place_id text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'initials', public.web_initials(coalesce(nullif(p.display_name, ''), p.username)),
        'score', r.score,
        'reasons', r.reasons,
        'reason', r.reason,
        'body', r.body,
        'visited', to_char(coalesce(r.visited_on, r.created_at::date), 'YYYY-MM'),
        'photos', coalesce((
          select jsonb_agg(ph.path order by ph.created_at)
          from public.review_photos ph
          where ph.review_id = r.id
            and not exists (select 1 from public.reports x where x.photo_id = ph.id)
        ), '[]'::jsonb)
      ) order by r.created_at desc)
      from public.reviews r
      join public.profiles p on p.id = r.user_id
      where r.place_id = p_place_id
        and not exists (select 1 from public.reports x where x.review_id = r.id)
    ), '[]'::jsonb),
    'gallery', coalesce((
      select jsonb_agg(ph.path order by ph.created_at desc)
      from public.review_photos ph
      where ph.place_id = p_place_id
        and ph.review_id is null
        and not exists (select 1 from public.reports x where x.photo_id = ph.id)
    ), '[]'::jsonb)
  )
$$;

-- 3. The website's AI search allowance
create table if not exists public.web_find_chats (
  id uuid primary key default gen_random_uuid(),
  device text not null check (char_length(device) between 8 and 64),
  city text check (char_length(city) <= 60),
  question text check (char_length(question) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists web_find_chats_device_idx on public.web_find_chats (device, created_at);
alter table public.web_find_chats enable row level security;
-- No policies: only the function below reads and writes it.

-- True (and logs the question) if this device has had fewer than 3
-- questions in the last 24 hours and the site fewer than 200 today.
create or replace function public.web_chat_allow(p_device text, p_city text, p_question text)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return false;
  end if;
  if (select count(*) from public.web_find_chats
      where device = p_device and created_at > now() - interval '24 hours') >= 3 then
    return false;
  end if;
  if (select count(*) from public.web_find_chats
      where created_at > now() - interval '24 hours') >= 200 then
    return false;
  end if;
  insert into public.web_find_chats (device, city, question)
  values (p_device, left(p_city, 60), left(p_question, 300));
  return true;
end;
$$;

-- Who can call what: the public key (anon) and members.
revoke all on function public.web_place_scores() from public;
revoke all on function public.web_place(text) from public;
revoke all on function public.web_chat_allow(text, text, text) from public;
grant execute on function public.web_place_scores() to anon, authenticated;
grant execute on function public.web_place(text) to anon, authenticated;
grant execute on function public.web_chat_allow(text, text, text) to anon, authenticated;
