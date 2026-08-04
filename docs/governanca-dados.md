# Governança e fontes oficiais dos dados

Este documento define qual sistema é mestre para cada domínio do Patrimônio Ops Control. A regra não é apenas documental: a matriz é persistida em `patrimonio_data_source_policies`, carregada pelo gateway somente para administradores e aplicada na importação do Sabium.

## Princípio obrigatório

Uma integração pode alterar somente os campos sob seu domínio. Quando uma fonte externa divergir de responsável, núcleo, localização, status, série, classificação operacional, marca/modelo ou observações, o valor atual é preservado e a diferença segue para conciliação.

Não existe sincronização bidirecional genérica. Cada nova integração precisa declarar campos de entrada, sistema mestre, política de conflito, retenção, ator técnico e mecanismo de auditoria antes de ser ativada.

## Matriz vigente

| Domínio | Fonte oficial | Campos principais | Regra | Situação |
| --- | --- | --- | --- | --- |
| Cadastro fiscal do patrimônio | Sabium | patrimônio-base, incorporação, identificador e descrição de origem, grupo, filial, aquisição, baixa fiscal, valores e nota | atualiza somente campos fiscais e de origem | vigente |
| Custódia e localização atual | Patrimônio Ops Control | núcleo, responsável, localização, status, série, tipo operacional, marca/modelo e observações | protegido contra integrações externas | vigente |
| Identidade organizacional | RH ou diretório corporativo | nome, e-mail, departamento e vínculo | fonte corporativa será mestre quando integrada | planejada |
| Manutenção | Patrimônio Ops Control | tipo, prioridade, status, prazo e registro técnico | protegido até escolha formal de ITSM | vigente |
| Telemetria de frota | Provedor de frota | coordenadas, precisão, odômetro e data da leitura | eventos acrescentados sem alterar cadastro ou custódia | planejada |
| Conformidade de dispositivos | MDM corporativo | conformidade, último contato, criptografia e gerenciamento | mestre somente para postura técnica | planejada |
| Identidade e autorização | Supabase Auth, Google OIDC e administração interna | identidade autenticada, username, verificação de senha, ambientes, perfil, permissões e versão de sessão | identidade vem do Supabase Auth ou Google; autorização vem do cadastro interno | vigente |
| Trilha de auditoria | Patrimônio Ops Control | ator, evento, estado anterior, estado posterior e data | somente acréscimo; evidências anteriores não são regravadas | vigente |

## Comportamento das importações

### Sabium

- A identidade natural é o par `base_code + incorporation`; uma mudança de descrição, valor, linha ou fingerprint não cria outro ativo.
- Dados fiscais e metadados de origem são atualizados.
- Campos operacionais de um ativo já existente são preservados.
- Divergências operacionais geram `sabium_operational_conflict` na fila de conciliação, sem duplicar uma ocorrência ainda aberta para o mesmo ativo.
- Cada alteração de dados de origem gera movimento de importação e execução registrada.
- Núcleos existentes não recebem novamente os placeholders de localização ou gestor da carga.

### Planilha operacional XLSX

A planilha comum é um canal de escrita em lote do próprio Patrimônio Ops, não uma fonte externa. Por isso ela pode atualizar campos operacionais, mas somente depois de:

1. comparar a planilha com a revisão atual;
2. informar quantos ativos e campos serão alterados;
3. listar amostras das mudanças na prévia;
4. exigir confirmação explícita do operador;
5. registrar os movimentos e a execução da importação.

A comparação resolve também os aliases criados por troca de número patrimonial. Assim, uma planilha antiga é comparada com o ativo atual antes da confirmação e não aparece falsamente como novo cadastro.

Núcleos existentes não são sobrescritos pelos valores genéricos `Não informada na planilha` e `Não informado`. Em ativos existentes, esses placeholders, série vazia e a observação automática do importador preservam o valor operacional atual. Data e valor de aquisição também não são alterados pela planilha operacional, pois pertencem ao domínio fiscal.

## Mudança de fonte oficial

Trocar um sistema mestre exige uma migração versionada e não apenas editar a interface. A alteração deve incluir:

- responsável de negócio pela decisão;
- lista exata de campos transferidos;
- regra para conflitos e dados ausentes;
- carga inicial e estratégia de rollback;
- testes de autorização, idempotência e reprocessamento;
- trilha de auditoria e métricas de conciliação;
- atualização desta matriz e do changelog.

Até que esses itens existam, RH, telemetria e MDM continuam marcados como planejados. Cadastrar um conector sem implementar o contrato não transforma esse conector em fonte oficial.
