-- Grupo de prueba para scripts/e2e-real.mjs (se corre en el SQL Editor; no tiene dueño).
delete from public.fulbito_state where id = 'test-e2e-grupo';
insert into public.fulbito_state (id, name, data)
values ('test-e2e-grupo', 'Prueba E2E', '{"mode":"interno","settings":{"teamAName":"Claros","teamBName":"Oscuros","palette":"clasico"}}');
insert into public.fulbito_matches (league_id, id, data)
values ('test-e2e-grupo', 'mc', '{"id":"mc","date":"2020-01-01","mode":"interno","teamAName":"Claros","teamBName":"Oscuros","rivalName":"","teamA":[],"teamB":[],"events":[],"assists":{},"bets":{},"escabioTotal":0,"comments":[],"closed":true}');
select count(*) as listo from public.fulbito_matches where league_id = 'test-e2e-grupo';

-- Al terminar (borra el grupo y todo lo suyo, por la cascada):
--   delete from public.fulbito_state where id = 'test-e2e-grupo';
