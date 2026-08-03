# LGPD e governança dos dados

Este documento registra os controles técnicos do Patrimônio Ops. Ele não substitui
o inventário corporativo de tratamento, contratos com operadores nem a decisão do
controlador e do encarregado.

## Situação de homologação

| Evidência | Situação |
| --- | --- |
| Controles técnicos, RLS, trilha de auditoria e revogação de sessão | Implementado e verificável no sistema |
| Controlador definido para cada departamento | Informação pendente de validação |
| Registro das operações de tratamento e avaliação de legítimo interesse | Informação pendente de validação |
| DPA e mecanismo de transferência internacional de Google, Cloudflare e Supabase | Informação pendente de validação |
| Prazos aprovados para inventário, colaboradores e movimentações | Informação pendente de validação |
| Responsáveis internos pelo atendimento a titulares e incidentes | Informação pendente de validação |
| RPO, RTO, backup gerenciado e teste de restauração | Informação pendente de validação |

O sistema não deve ser declarado integralmente conforme à LGPD enquanto as
evidências marcadas como pendentes não forem aprovadas e arquivadas pelos
responsáveis corporativos.

## Inventário resumido

| Categoria | Exemplos | Finalidade | Acesso |
| --- | --- | --- | --- |
| Identificação profissional | nome, código, e-mail autorizado | autenticação e identificação do responsável | departamento liberado |
| Estrutura organizacional | departamento, núcleo, gestor, localização | organização e localização patrimonial | departamento liberado |
| Vínculo patrimonial | ativo, modelo, série, responsável, status | gestão e segurança dos bens | departamento liberado |
| Operação física | custódia, manutenção, localização observada e conferência | inventário, conservação e prevenção de perdas | departamento liberado |
| Geocercas e alertas | coordenadas centrais, raio, posição observada, bateria e resposta ao alerta | segurança do bem e tratamento de exceções | infraestrutura ativa; interface administrativa ainda não exposta |
| Documentos patrimoniais | nota, garantia, contrato, laudo e foto | prova de aquisição, vigência, inspeção e auditoria | departamento liberado; finanças apenas para administrador |
| Integrações | referência externa, tipo de evento, estado e divergência | conciliação com sistemas corporativos | administrador global |
| Auditoria operacional | movimentação, motivo, ator e data | rastreabilidade e exercício de direitos | operadores do departamento |
| Auditoria de segurança | login, bloqueio, permissão, importação e exportação | prevenção, investigação e prestação de contas | administrador global |

Não devem ser inseridos dados de saúde, biometria, religião, filiação sindical,
opinião política ou vida sexual em nomes, observações ou planilhas.

## Bases e finalidades

O aviso publicado em `/privacidade` descreve legítimo interesse na gestão e
segurança patrimonial, execução de relações de trabalho e contratos e cumprimento
de obrigação legal ou regulatória, conforme a operação. A área responsável e o
encarregado devem validar o registro corporativo dessas bases antes de ampliar o
uso do sistema.

## Operadores e transferência internacional

| Operador | Serviço | Situação a comprovar |
| --- | --- | --- |
| Google | OpenID Connect | contrato, política corporativa e configuração da organização |
| Cloudflare | Worker, entrega e proteção da aplicação | DPA, suboperadores e mecanismo de transferência |
| Supabase | Postgres e Função Edge nos EUA | DPA, suboperadores e mecanismo da Resolução ANPD nº 19/2024 |

A localização do Supabase em `us-east-2` caracteriza tratamento internacional.
Antes da homologação corporativa, Jurídico/Privacidade deve confirmar cláusulas
contratuais padrão ou outro mecanismo válido e manter a evidência junto ao contrato.

## Retenção

- Eventos de login e logout: até 180 dias.
- Eventos de acesso, importação, exportação e bloqueio: até 5 anos.
- Limites técnicos e nonces: no máximo 2 dias e 10 minutos, respectivamente.
- Registros patrimoniais: prazo definido pela área proprietária junto ao
  encarregado, conforme a política corporativa e obrigações aplicáveis.
- Documentos, telemetria, contratos e inspeções: prazo definido por categoria,
  obrigação fiscal, contratual ou de segurança; o campo de retenção deve seguir a
  tabela aprovada pelo controlador.
- Fila de inventário offline: removida após sincronização ou, no máximo, em 30 dias.

A rotina `patrimonio_apply_retention` elimina somente registros técnicos cujo
prazo já venceu. Ela não apaga automaticamente inventário, colaboradores,
movimentações ou transferências.

O IndexedDB é usado somente para a contingência de inventário sem rede e contém
departamento, campanha, identificador do ativo, resultado, local, observação e
horário. Nomes, e-mails, série, modelo, documentos e credenciais não são copiados
para essa fila. Em dispositivo compartilhado, o operador deve sincronizar e encerrar
a sessão ao concluir a contagem.

Política corporativa:
<https://www.gazin.com.br/pagina/politica-retencao-dados>

## Direitos dos titulares

O titular pode solicitar confirmação e acesso, correção, informação sobre
compartilhamento, anonimização, bloqueio ou eliminação de dados excessivos,
oposição e revisão quando aplicável.

O canal e o encarregado estão publicados em:
<https://www.gazin.com.br/pagina/privacidade>

Fluxo interno mínimo:

1. registrar a solicitação e validar a identidade do titular;
2. identificar departamentos, ativos, movimentos, importações e eventos relacionados;
3. entregar ou corrigir somente os dados do titular;
4. consultar Jurídico/Privacidade antes de eliminar registros sujeitos a retenção;
5. registrar decisão, responsável, data e fundamento.

## Revisão obrigatória

- Trimestral: usuários ativos, administradores e permissões de exportação.
- Semestral: operadores, transferências internacionais e tabela de retenção.
- Anual: aviso de privacidade, inventário de tratamento e teste de resposta a incidente.
- Imediata: desligamento, mudança de função ou suspeita de comprometimento.

## Pendências corporativas

- confirmar qual empresa do Grupo Gazin é controladora em cada departamento;
- arquivar DPAs e mecanismo de transferência de Google, Cloudflare e Supabase;
- aprovar os prazos dos registros patrimoniais;
- aprovar a tabela de retenção de documentos, telemetria, contratos e inspeções;
- confirmar RTO, RPO e plano contratado de backup/PITR;
- avaliar a necessidade de RIPD com o encarregado.
