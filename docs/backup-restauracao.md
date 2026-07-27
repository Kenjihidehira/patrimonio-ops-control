# Backup e restauração

Exportação XLSX não substitui backup do Postgres. Este runbook precisa ser validado
de acordo com o plano contratado no Supabase.

## Metas pendentes de aprovação

| Item | Valor |
| --- | --- |
| RPO máximo | Informação pendente de validação |
| RTO máximo | Informação pendente de validação |
| Retenção de backups | Informação pendente de validação |
| Responsável pela restauração | Informação pendente de validação |
| Plano Supabase/PITR | Informação pendente de validação |

## Verificação mensal

1. confirmar que os backups gerenciados estão ativos;
2. verificar a data do último backup recuperável;
3. confirmar acesso restrito aos administradores necessários;
4. registrar mudanças de plano, região ou retenção;
5. revisar alertas de falha e disponibilidade.

## Teste trimestral de restauração

1. abrir uma solicitação de mudança e registrar o ponto de restauração;
2. restaurar em projeto ou ambiente isolado, nunca sobre produção;
3. validar quantidade de departamentos, usuários, núcleos, ativos e movimentos;
4. testar login, isolamento por departamento, uma leitura e uma exportação autorizada;
5. medir RPO e RTO observados;
6. eliminar o ambiente de teste pelo processo aprovado;
7. arquivar evidências e correções necessárias.

## Recuperação de produção

1. conter escritas e preservar logs;
2. confirmar o ponto íntegro mais recente com o proprietário dos dados;
3. restaurar pelo procedimento oficial do Supabase;
4. publicar a versão compatível da aplicação e da Função Edge;
5. executar advisors de segurança e verificações funcionais;
6. liberar acesso gradualmente;
7. tratar perda de dados pessoais pelo runbook de incidentes.

Não execute restauração destrutiva sem aprovação explícita do responsável pelo
banco, do gestor da área e, quando houver dados pessoais afetados, de Privacidade.
