-- Fulbito FC · esquema de Supabase (ligas con dueño y administradores).
-- Se pega entero en SQL Editor y se ejecuta. Se puede volver a correr: no borra datos.
--
-- Cada fila de public.fulbito_state es UNA LIGA (un torneo con todos sus equipos):
--   id      = identificador del link (?liga=<id>); 'main' es la liga original de Leandro.
--   data    = todo el estado de la app (equipos, jugadores, campeonatos, amistosos) en jsonb.
--   owner   = quien la creó (no se puede cambiar ni sacar).
--   admins  = emails que también pueden cargar datos (los agregan el dueño o cualquier admin).
-- Leer: cualquiera (los links son públicos). Escribir: solo el dueño y los admins de ESA liga.
-- Los admins se reconocen por el email del token; esto es seguro porque el proyecto exige
-- confirmar el email (Authentication > Sign In / Providers > Email > Confirm email = activado).

create table if not exists public.fulbito_state (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
alter table public.fulbito_state add column if not exists name text not null default 'Fulbito FC';
alter table public.fulbito_state add column if not exists owner uuid default auth.uid();
alter table public.fulbito_state add column if not exists owner_email text;
alter table public.fulbito_state add column if not exists admins text[] not null default '{}';
alter table public.fulbito_state add column if not exists created_at timestamptz not null default now();

-- Superadmin de la liga original: el email de Leandro (o app_metadata.is_admin, que solo pone el dueño
-- del proyecto). OJO: nunca user_metadata, que el propio usuario puede editar.
create or replace function public.fulbito_is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'leandroarmonelli@gmail.com'
      or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

-- ¿El usuario logueado puede cargar datos en esta liga?
create or replace function public.fulbito_can_edit(league_id text, league_owner uuid, league_admins text[])
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and (
    auth.uid() = league_owner
    or lower(coalesce(auth.jwt() ->> 'email', '')) = any (league_admins)
    or (league_id = 'main' and public.fulbito_is_admin())
  );
$$;

-- Al crear: el dueño es quien la crea. Al editar: el dueño y su email no cambian nunca; los emails
-- de admins se guardan en minúscula, sin repetidos y como mucho 20.
create or replace function public.fulbito_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.owner := auth.uid();
    new.owner_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    new.created_at := now();
  else
    new.owner := old.owner;
    new.owner_email := old.owner_email;
    new.created_at := old.created_at;
  end if;
  new.admins := coalesce((
    select array_agg(distinct e) from (
      select lower(trim(x)) as e from unnest(coalesce(new.admins, '{}')) as x
    ) s where e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ), '{}');
  if array_length(new.admins, 1) > 20 then
    raise exception 'Como mucho 20 administradores por liga' using errcode = '22023';
  end if;
  new.name := left(coalesce(nullif(trim(new.name), ''), 'Fulbito FC'), 60);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists fulbito_state_touch on public.fulbito_state;
create trigger fulbito_state_touch before insert or update on public.fulbito_state
for each row execute function public.fulbito_touch();

alter table public.fulbito_state enable row level security;

-- Permisos de la API (en proyectos nuevos las tablas no quedan expuestas solas). Las políticas de
-- abajo siguen mandando: leer cualquiera, escribir solo dueño y admins.
grant select on public.fulbito_state to anon, authenticated;
grant insert, update, delete on public.fulbito_state to authenticated;

drop policy if exists fulbito_select on public.fulbito_state;
create policy fulbito_select on public.fulbito_state
  for select using (true);

-- Crear una liga: cualquier usuario logueado, con un id de link válido. 'main' solo el superadmin.
drop policy if exists fulbito_insert on public.fulbito_state;
create policy fulbito_insert on public.fulbito_state
  for insert to authenticated
  with check (id ~ '^[a-z0-9][a-z0-9-]{2,39}$' and (id <> 'main' or public.fulbito_is_admin()));

drop policy if exists fulbito_update on public.fulbito_state;
create policy fulbito_update on public.fulbito_state
  for update to authenticated
  using (public.fulbito_can_edit(id, owner, admins))
  with check (public.fulbito_can_edit(id, owner, admins));

-- Borrar la liga: solo su dueño.
drop policy if exists fulbito_delete on public.fulbito_state;
create policy fulbito_delete on public.fulbito_state
  for delete to authenticated using (auth.uid() = owner);

create index if not exists fulbito_state_owner_idx on public.fulbito_state (owner);
create index if not exists fulbito_state_admins_idx on public.fulbito_state using gin (admins);

-- Cambios en vivo para los que están mirando.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fulbito_state'
  ) then
    alter publication supabase_realtime add table public.fulbito_state;
  end if;
end $$;
