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
| Transferir entre departamentos | Sim | Não | Não |
| Remover ou modificar documentos de evidência | Sim, com trilha | Não | Somente com permissão de alteração e trilha |
| Consultar auditoria de segurança e integrações | Sim | Não | Não |
| Consultar dados financeiros | Sim | Não | Não |

## Invariantes técnicas do auditor

- `is_auditor` e `is_admin` não podem produzir privilégios cumulativos.
- Auditor não pode receber `can_write` nem `can_import`; a restrição é verificada
  pelo Postgres, mesmo se um cliente enviar valores conflitantes.
- O auditor tem alcance global de leitura em todos os departamentos ativos,
  inclusive os criados depois da concessão. Apenas operadores dependem de
  associação explícita em `patrimonio_department_memberships`.
- A exportação exige `can_export`, passa pela autorização do departamento e cria
  evento de segurança com a função do usuário.
- Toda mutação passa por autorização `write`; a API retorna `403` para o auditor.
- Administração de usuários e transferências exige `is_admin` no gateway e na RPC.
- Dados contábeis, integrações e auditoria de segurança permanecem projetados
  somente para administradores.

## Provisionamento inicial

O usuário `fabiano.audit@gmail.com` é provisionado como auditor global de leitura,
com exportação controlada e acesso automático a todos os departamentos atuais e
futuros. A migração remove seus vínculos individuais e mantém bloqueados os
privilégios administrativos, de escrita e de importação.

Alcance global não significa poder administrativo: somente um administrador pode
alterar acessos, transferir departamentos ou consultar áreas administrativas
restritas.

## Revisão de acesso

Revisar trimestralmente:

1. administradores globais ativos;
2. auditores globais ativos e necessidade de permanência desse alcance;
3. operadores com exportação ou alteração;
4. contas sem acesso recente;
5. eventos negados, exportações e mudanças de função.
