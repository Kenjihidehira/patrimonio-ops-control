begin;

update public.patrimonio_nuclei
set
  code = case name
    when 'Atacado' then 'A'
    when 'Canais Especiais' then 'CE'
    when 'Consorcio' then 'C'
    when 'Coordenadora Geral' then 'CG'
    when 'Customer Experience' then 'CX'
    when 'E-Commerce' then 'EC'
    when 'GazinBank' then 'GB'
    when 'Gerente do Atendimento ao Cliente' then 'GAC'
    when 'Suporte &amp; Assistência' then 'SA'
    when 'Suporte & Assistência' then 'SA'
    when 'Teleatendimento' then 'T'
    else code
  end,
  name = replace(name, '&amp;', '&'),
  updated_at = now()
where name in (
  'Atacado',
  'Canais Especiais',
  'Consorcio',
  'Coordenadora Geral',
  'Customer Experience',
  'E-Commerce',
  'GazinBank',
  'Gerente do Atendimento ao Cliente',
  'Suporte &amp; Assistência',
  'Suporte & Assistência',
  'Teleatendimento'
);

do $migration$
declare
  bad_nao text := 'N' || chr(195) || chr(163) || 'o';
  good_nao text := 'N' || chr(227) || 'o';
  bad_bullet text := chr(226) || chr(8364) || chr(162);
  good_bullet text := chr(8226);
  bad_responsavel text := 'respons' || chr(195) || chr(161) || 'vel';
  good_responsavel text := 'respons' || chr(225) || 'vel';
  function_definition text;
begin
  update public.patrimonio_movements
  set
    from_label = replace(
      replace(replace(from_label, bad_nao, good_nao), bad_bullet, good_bullet),
      '&amp;',
      '&'
    ),
    to_label = replace(
      replace(
        replace(replace(to_label, bad_nao, good_nao), bad_bullet, good_bullet),
        bad_responsavel,
        good_responsavel
      ),
      '&amp;',
      '&'
    );

  select pg_get_functiondef(
    'public.patrimonio_import_assets(text,text,bigint,text,jsonb,jsonb,integer,jsonb)'::regprocedure
  )
  into function_definition;

  function_definition := replace(function_definition, bad_nao, good_nao);
  function_definition := replace(function_definition, bad_bullet, good_bullet);
  function_definition := replace(function_definition, bad_responsavel, good_responsavel);
  execute function_definition;
end;
$migration$;

commit;
