# Controle de acesso e segregação de funções

O Patrimônio Ops separa administração, auditoria e operação. A função exibida na
interface é persistida no banco e validada novamente no gateway e nas funções de
autorização; ocultar um botão não é considerado controle de segurança.

## Matriz de responsabilidades

| Capacidade | Administrador global | Auditor | Operador |
| --- | --- | --- | --- |
| Consultar departamentos | Todos | Somente os vinculados | Somente os vinculados |
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
- O acesso do auditor depende de associação explícita em
  `patrimonio_department_memberships`. Novos departamentos não são liberados
  automaticamente.
- A exportação exige `can_export`, passa pela autorização do departamento e cria
  evento de segurança com a função do usuário.
- Toda mutação passa por autorização `write`; a API retorna `403` para o auditor.
- Administração de usuários e transferências exige `is_admin` no gateway e na RPC.
- Dados contábeis, integrações e auditoria de segurança permanecem projetados
  somente para administradores.

## Provisionamento inicial

O usuário `fabiano.audit@gmail.com` é provisionado como auditor, com exportação
controlada e associação aos departamentos que estavam ativos na aplicação da
migração. A migração remove seus privilégios administrativos, de escrita e de
importação e incrementa a versão de sessão para exigir uma nova autenticação.

Departamentos criados depois dessa migração devem ser liberados manualmente por
um administrador no módulo **Ambientes**.

## Revisão de acesso

Revisar trimestralmente:

1. administradores globais ativos;
2. auditores e departamentos vinculados;
3. operadores com exportação ou alteração;
4. contas sem acesso recente;
5. eventos negados, exportações e mudanças de função.

