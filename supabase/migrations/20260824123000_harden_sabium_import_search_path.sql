begin;

-- A unica funcao SECURITY DEFINER do projeto manipula tabelas temporarias e
-- objetos publicos sempre qualificados. Retirar `public` do search_path impede
-- que um objeto homonimo seja resolvido com os privilegios do proprietario.
alter function public.patrimonio_import_sabium_assets(jsonb, text, text)
  set search_path = pg_catalog, pg_temp;

-- A funcao permanece acessivel somente ao gateway administrativo.
revoke all on function public.patrimonio_import_sabium_assets(jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.patrimonio_import_sabium_assets(jsonb, text, text)
  to service_role;

commit;
