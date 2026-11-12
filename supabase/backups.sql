-- Fulbito FC · copias de seguridad de cada liga (como el backup semanal de Piel Morena, pero diario).
-- Se pega en SQL Editor y se ejecuta (después de schema.sql). Se puede volver a correr.
--
-- * Todos los días a las 06:00 UTC (03:00 Argentina) el servidor guarda una copia de cada liga
--   que cambió desde su última copia, aunque nadie abra la app (pg_cron).
-- * Se conservan las últimas 30 copias de cada liga.
-- * Los administradores de una liga ven sus copias, pueden guardar una a mano y restaurarla desde la app.

create extension if not exists pg_cron;

create table if not exists public.fulbito_backups (
  id          bigserial primary key,
  league_id   text not null references public.fulbito_state(id) on delete cascade,
  kind        text not null default 'auto' check (kind in ('auto', 'manual')),
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index if not exists fulbito_backups_league_idx on public.fulbito_backups (league_id, created_at desc);

alter table public.fulbito_backups enable row level security;
grant select, insert on public.fulbito_backups to authenticated;
grant usage, select on sequence public.fulbito_backups_id_seq to authenticated;

-- Solo los administradores de ESA liga ven y guardan sus copias.
drop policy if exists fulbito_backups_select on public.fulbito_backups;
create policy fulbito_backups_select on public.fulbito_backups
  for select to authenticated using (exists (
    select 1 from public.fulbito_state s
    where s.id = league_id and public.fulbito_can_edit(s.id, s.owner, s.admins)));

drop policy if exists fulbito_backups_insert on public.fulbito_backups;
create policy fulbito_backups_insert on public.fulbito_backups
  for insert to authenticated with check (kind = 'manual' and exists (
    select 1 from public.fulbito_state s
    where s.id = league_id and public.fulbito_can_edit(s.id, s.owner, s.admins)));
-- Nadie borra ni cambia copias desde la app (solo el recorte automático de abajo).

-- Deja como mucho 30 copias por liga (las más nuevas).
create or replace function public.fulbito_prune_backups(p_league text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.fulbito_backups
  where league_id = p_league and id not in (
    select id from public.fulbito_backups where league_id = p_league order by created_at desc, id desc limit 30);
$$;

-- Al guardar una copia manual, también se recorta.
create or replace function public.fulbito_backups_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fulbito_prune_backups(new.league_id);
  return null;
end;
$$;
drop trigger if exists fulbito_backups_prune on public.fulbito_backups;
create trigger fulbito_backups_prune after insert on public.fulbito_backups
for each row execute function public.fulbito_backups_after_insert();

-- Copia diaria: una por liga, solo si cambió desde su última copia.
create or replace function public.fulbito_daily_backup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  for r in select id, data from public.fulbito_state loop
    if not exists (
      select 1 from public.fulbito_backups b
      where b.id = (select max(id) from public.fulbito_backups where league_id = r.id) and b.data = r.data
    ) then
      insert into public.fulbito_backups (league_id, kind, data, created_by) values (r.id, 'auto', r.data, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Solo el reloj del servidor (pg_cron) ejecuta la copia diaria y el recorte.
revoke all on function public.fulbito_daily_backup() from public, anon, authenticated;
revoke all on function public.fulbito_prune_backups(text) from public, anon, authenticated;

select cron.unschedule('fulbito-daily-backup')
where exists (select 1 from cron.job where jobname = 'fulbito-daily-backup');

-- 06:00 UTC = 03:00 en Argentina.
select cron.schedule('fulbito-daily-backup', '0 6 * * *', $$select public.fulbito_daily_backup();$$);

-- Primera copia ya mismo y verificación.
select public.fulbito_daily_backup() as copias_nuevas,
  (select count(*) from cron.job where jobname = 'fulbito-daily-backup') as tarea_programada;
