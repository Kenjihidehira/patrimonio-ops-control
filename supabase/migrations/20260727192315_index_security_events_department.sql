create index if not exists patrimonio_security_events_department_idx
  on public.patrimonio_security_events (department_slug)
  where department_slug is not null;
