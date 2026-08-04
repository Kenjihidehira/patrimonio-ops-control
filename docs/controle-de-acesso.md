# Controle de acesso e segregação de funções

O Patrimônio Ops separa administração, auditoria e operação. A função exibida na
interface é persistida no banco e validada novamente no gateway e nas funções de
autorização; ocultar um botão não é considerado controle de segurança.

## Matriz de responsabilidades

| Capacidade | Administrador global | Auditor | Operador |
| --- | --- | --- | --- |
| Consultar departamentos | Todos | Todos | Somente os vinculados |
| Consultar inventário, auditoria e histórico | Sim | Sim | Sim |
| Acompanhar campanhas, termos e manutenções | Sim | Sim, sem alterar | Sim |
| Abrir documentos e evidências | Sim | Sim | Sim |
| Exportar relatórios | Sim | Sim, com evento de segurança | Somente com permissão explícita |
| Alterar patrimônio, status ou responsável | Sim | Não | Somente com permissão explícita |
| Criar ou concluir controles operacionais | Sim | Não | Somente com permissão explícita |
| Importar planilhas | Sim | Não | Somente com permissão explícita |
| Excluir ou baixar ativos | Sim, com trilha | Não | Somente com permissão de alteração e trilha |
| Criar administradores ou alterar acessos | Sim | Não | Não |
| Configurar ou redefinir login por senha | Sim | Não | Não |
| Transferir entre departamentos | Sim | Não | Não |
| Remover ou modificar documentos de evidência | Sim, com trilha | Não | Somente com permissão de alteração e trilha |
| Consultar auditoria de segurança e integrações | Sim | Não | Não |
| Consultar dados financeiros | Sim | Somente com permissão financeira | Somente com permissão financeira |
| Exportar dados financeiros | Sim | Exige permissão financeira e de exportação | Exige permissão financeira e de exportação |

## Invariantes técnicas do auditor

- `is_auditor` e `is_admin` não podem produzir privilégios cumulativos.
- Auditor não pode receber `can_write` nem `can_import`; a restrição é verificada
  pelo Postgres, mesmo se um cliente enviar valores conflitantes.
- O auditor tem alcance global de leitura em todos os departamentos ativos,
  inclusive os criados depois da concessão. Apenas operadores dependem de
  associação explícita em `patrimonio_department_memberships`.
- A exportação operacional exige `can_export`, omite valores financeiros e cria
  evento de segurança com a função do usuário.
- A exportação financeira é uma ação separada e cumulativa: exige simultaneamente
  `can_export` e `can_view_financial_data`, além de registrar o escopo financeiro.
- Toda mutação passa por autorização `write`; a API retorna `403` para o auditor.
- Administração de usuários e transferências exige `is_admin` no gateway e na RPC.
- `can_view_financial_data` concede somente leitura. Custos, contabilidade,
  documentos financeiros, transferências entre departamentos e alterações de
  campos financeiros continuam restritos às operações administrativas definidas
  no gateway e no Postgres.

## Proteção de dados financeiros

- Administradores recebem a permissão financeira obrigatoriamente. Auditores e
  operadores só a recebem por concessão explícita de um administrador.
- A permissão vale apenas nos departamentos que o usuário já pode consultar; ela
  não amplia o alcance organizacional do perfil.
- Valores de aquisição e operação, número de nota, depreciação, custos contratuais
  e estimativas financeiras são removidos no gateway antes de o estado chegar ao
  Worker ou ao navegador quando a permissão não existe.
- Documentos e campos personalizados que contenham valores financeiros devem ser
  classificados no cadastro. Notas fiscais, contratos e documentos de baixa são
  classificados automaticamente como financeiros.
- Campos livres não devem ser usados para armazenar valores contábeis ou fiscais:
  texto sem classificação não pode ser protegido de forma confiável pelo sistema.
- A abertura de documento financeiro, a exportação financeira, a concessão ou
  remoção da permissão e a transferência entre departamentos geram eventos de
  auditoria sem copiar os valores financeiros para o log.

## Provisionamento inicial

O usuário `fabiano.audit@gmail.com` é provisionado como auditor global de leitura,
com exportação controlada e acesso automático a todos os departamentos atuais e
futuros. A migração remove seus vínculos individuais e mantém bloqueados os
privilégios administrativos, de escrita, de importação e de leitura financeira.
Caso exista necessidade formal, um administrador pode conceder apenas a leitura
financeira sem transformar o auditor em administrador.

Alcance global não significa poder administrativo: somente um administrador pode
alterar acessos, transferir departamentos ou consultar áreas administrativas
restritas.

## Credenciais de acesso

- O administrador pode habilitar o acesso por e-mail e senha e, opcionalmente, cadastrar um nome de usuário de 3 a 32 caracteres.
- A senha inicial ou redefinida deve ter no mínimo 12 caracteres e no máximo 72 bytes. Ela é processada exclusivamente pelo Supabase Auth e nunca pode ser copiada para observações, planilhas ou chamados.
- Desabilitar as credenciais randomiza a senha no provedor, remove o vínculo interno e incrementa a versão da sessão para revogar sessões da aplicação.
- Contas Supabase Auth que não foram marcadas como gerenciadas pelo Patrimônio Ops não podem ser apropriadas nem redefinidas pelo gateway.
- O acesso Google permanece independente; desativar o usuário interno bloqueia os dois provedores.

## Revisão de acesso

Revisar trimestralmente:

1. administradores globais ativos;
2. auditores globais ativos e necessidade de permanência desse alcance;
3. operadores com exportação ou alteração;
4. contas sem acesso recente;
5. contas com login por senha e necessidade de redefinição ou desativação;
6. eventos negados, exportações e mudanças de função.
