begin;

create policy patrimonio_collaborators_no_direct_access
  on public.patrimonio_collaborators
  for all
  to anon, authenticated
  using (false)
  with check (false);

commit;
