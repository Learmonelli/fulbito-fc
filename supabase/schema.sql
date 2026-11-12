-- Fulbito FC · esquema de Supabase. Se pega entero en SQL Editor y se ejecuta una vez.
-- Todo el estado de la app (equipos, jugadores, campeonatos, amistosos) se guarda como UN documento
-- jsonb en la fila 'main'. Leer: cualquiera (la app es pública). Escribir: solo el administrador.

create table if not exists public.fulbito_state (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- Administrador: solo por el email del token (lo firma Supabase; el usuario no lo puede cambiar)
-- o por app_metadata.is_admin (lo pone el dueño del proyecto, nunca el usuario).
-- OJO: no usar user_metadata, que el propio usuario puede editar.
create or replace function public.fulbito_is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'leandroarmonelli@gmail.com'
      or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

create or replace function public.fulbito_touch()
returns trigger
language plpgsql
as $$
begin
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
-- abajo siguen mandando: leer cualquiera, escribir solo el admin.
grant select on public.fulbito_state to anon, authenticated;
grant insert, update on public.fulbito_state to authenticated;

drop policy if exists fulbito_select on public.fulbito_state;
create policy fulbito_select on public.fulbito_state
  for select using (true);

drop policy if exists fulbito_insert on public.fulbito_state;
create policy fulbito_insert on public.fulbito_state
  for insert to authenticated with check (public.fulbito_is_admin());

drop policy if exists fulbito_update on public.fulbito_state;
create policy fulbito_update on public.fulbito_state
  for update to authenticated using (public.fulbito_is_admin()) with check (public.fulbito_is_admin());

-- Borrar la fila no se permite a nadie desde la app (no hay policy de delete).

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
