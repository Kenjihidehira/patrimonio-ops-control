# Contexto consolidado do projeto

## 1. Objetivo

O Patrimônio Ops Control é o sistema empresarial de operação patrimonial do Grupo Gazin. Ele centraliza a existência, localização, responsabilidade, situação e histórico dos bens, substituindo controles fragmentados por uma base auditável por departamento.

O sistema deve responder, com evidência:

- qual bem existe;
- qual é seu identificador oficial ou referência interna;
- onde está e a qual núcleo pertence;
- quem responde por ele;
- quais movimentações, conferências e manutenções ocorreram;
- quem executou cada ação e quando;
- quais itens exigem regularização.

## 2. Ambientes e acesso

Cada departamento possui um ambiente lógico isolado e uma chave interna própria.

Ambientes iniciais:

- Atendimento ao Cliente;
- Gazin LOG.

Operadores veem somente os departamentos explicitamente liberados. Administradores globais podem administrar todos os ambientes. Auditores consultam todos os departamentos atuais e futuros, mas não podem alterar, importar nem administrar. As permissões operacionais de alteração, importação e exportação permanecem independentes.

A lista de usuários autorizados pertence ao banco e não ao código-fonte. A concessão ou revogação de acesso incrementa a versão de sessão, invalida cookies anteriores e gera auditoria administrativa.

## 3. Regras patrimoniais

- Patrimônios comuns usam exatamente seis dígitos.
- Itens ainda não etiquetados recebem referência interna `Sxxxxx` e permanecem como divergência.
- A alteração do número patrimonial exige unicidade, mudança efetiva e justificativa.
- O identificador anterior permanece como alias para que uma planilha desatualizada não recrie o mesmo bem.
- A baixa é lógica; o histórico não é eliminado.
- `Reserva` é um marcador operacional, não um colaborador, e não participa da contagem nem de termos de custódia.
- O responsável efetivo continua visível mesmo que ainda não possua perfil auxiliar cadastrado.
- Transferências entre departamento, núcleo, local e responsável preservam origem, destino, ator, data e motivo.

## 4. Particularidade da Gazin LOG

Uma frota imobilizada usa o número da frota como base do patrimônio:

```text
Frota 10775 -> patrimônio 10775.0
```

O tipo Frota e esse formato são aceitos somente no ambiente Gazin LOG. A integração do Sabium preserva código-base, incorporação, identificador visível, descrição original, grupo, filial, baixa, nota, valores e linha de origem. Quando incorporações distintas compartilham um identificador visível, a aplicação usa uma chave técnica para manter a identidade relacional de cada bem.

Tipos controlados:

- CPU;
- Monitor 1 e Monitor 2;
- Cadeira;
- Notebook;
- Frota;
- Automóvel;
- Implemento rodoviário;
- Componente de frota;
- Máquina ou equipamento;
- Móvel ou utensílio;
- Extintor;
- Software;
- Outros bens.

## 5. Fontes de dados

O projeto trabalha com responsabilidades de dados explícitas e aplicadas por campo:

| Informação | Fonte atual ou prevista |
| --- | --- |
| Cadastro patrimonial, incorporação e dados fiscais de origem | Sabium/importação corporativa |
| Responsável, localização, status e conferência física | Patrimônio Ops Control |
| Nome, e-mail, departamento e vínculo do colaborador | RH/diretório corporativo, integração planejada |
| Manutenção e registro técnico | Patrimônio Ops Control até escolha formal de ITSM |
| Telemetria de frota | Provedor de frota, integração planejada |
| Conformidade de dispositivos | MDM corporativo, integração planejada |
| Identidade e autorização de acesso | Google OIDC mais cadastro administrativo interno |
| Auditoria de alteração | Patrimônio Ops Control, somente acréscimo |

A matriz executável e o procedimento para alterar uma fonte oficial estão em [`governanca-dados.md`](governanca-dados.md). O Sabium atualiza apenas os campos fiscais e de origem; conflitos em responsável, núcleo, localização, status ou apresentação operacional preservam o valor vigente e entram na fila de conciliação. A planilha XLSX comum é um canal operacional em lote e exige confirmação explícita quando modifica campos existentes.

## 6. Capacidades funcionais

### Inventário e cadastro

- cadastro, edição e busca de ativos;
- filtros por tipo, status, núcleo, responsável e identificador;
- importação XLSX em prévia e confirmação transacional;
- exportação XLSX controlada por permissão;
- paginação para bases superiores a mil registros;
- leitor USB ou Bluetooth em modo teclado HID;
- etiquetas QR e leitura por câmera ou imagem.

### Operação

- inventários cíclicos por campanha e conferência em lote;
- contingência offline com fila mínima em IndexedDB;
- termos de custódia e resposta identificada;
- manutenção preventiva, corretiva e inspeção;
- garantias, contratos, seguros, locações e licenças;
- reservas e kits de ativos;
- desligamento com conferência de devoluções;
- campos customizados e dados contábeis;
- documentos privados, notas, fotos, laudos e contratos;
- rastreamento por QR, código de barras, RFID, BLE, UWB, GPS e MDM;
- catálogo de integrações externas.

Tecnologias automáticas de rastreamento exigem hardware, gateway ou serviço externo real. O sistema registra eventos recebidos, mas não simula leituras.

O banco de produção também contém geocercas, alertas de violação e alerta automático de bateria abaixo de 20%. Essa infraestrutura é acionada por eventos de rastreamento, mas a administração de geocercas e o tratamento dos alertas ainda não estão expostos pelo gateway nem pela interface. Não devem ser apresentados como fluxo disponível ao usuário nesta versão.

## 7. Arquitetura

```text
React 19 + TypeScript
        |
        v
Rotas Node/Vinext no Cloudflare Worker
        |
        v
Edge Function patrimonio-gateway
        |
        v
RPCs transacionais e tabelas no Supabase Postgres
```

O navegador nunca recebe a chave privilegiada do Supabase. A interface acessa somente as rotas da aplicação. O Worker envia ao gateway a identidade previamente validada e o departamento solicitado. O gateway resolve internamente a chave do ambiente e aplica as operações enumeradas.

O estado autoritativo permanece no servidor. A única persistência operacional permitida no navegador é a fila mínima de inventário offline; nomes, e-mails, séries, modelos, documentos e credenciais não são gravados nessa fila.

## 8. Autenticação e autorização

O login usa exclusivamente Google OpenID Connect com Authorization Code, PKCE, `state` e `nonce`. Depois de validar a identidade, o servidor consulta a autorização interna e emite uma sessão própria assinada em cookie `HttpOnly`, `Secure` e `SameSite`.

Supabase Auth não é usado para o login da aplicação. O cliente também não decide permissões: cada requisição é revalidada no servidor.

As permissões financeiras são administrativas. Valores de aquisição, depreciação, custos contratuais e configuração técnica de integrações não devem ser projetados para perfis comuns.

## 9. Persistência e concorrência

- Tabelas relacionais normalizadas preservam integridade por chave estrangeira.
- Mutações usam RPCs transacionais.
- O cliente informa a revisão esperada.
- Uma gravação baseada em revisão antiga recebe `409 Conflict`.
- Alterações patrimoniais, importações e controles operacionais atualizam dados e auditoria na mesma transação.
- RLS permanece habilitado e o acesso direto dos papéis públicos é negado.
- Funções privilegiadas têm execução restrita ao serviço intermediário.

## 10. Segurança e privacidade

- Gateway protegido por HMAC, timestamp, nonce e rate limit.
- Segredos permanecem em variáveis do Worker e da Edge Function.
- Sessões e respostas operacionais não são armazenadas em cache público.
- Documentos ficam em bucket privado, com checksum e URLs assinadas temporárias.
- Logs e auditorias registram o mínimo necessário.
- Coordenadas devem representar o bem, não vigilância contínua do colaborador.
- Dados sensíveis não devem ser inseridos em observações ou planilhas.

O sistema possui controles técnicos relevantes, mas não deve ser declarado integralmente conforme à LGPD enquanto controlador, bases, DPAs, transferência internacional, retenção, RIPD e responsáveis internos permanecerem sem aprovação formal.

## 11. Experiência de uso

A interface segue padrão de aplicação empresarial com header responsivo, tabelas densas, filtros, lista com detalhe contextual e ações progressivas. Os temas claro e escuro usam superfícies neutras e cores semânticas, evitando neon, gradientes excessivos e métricas fictícias.

Referências de produto e design registradas no projeto incluem Snipe-IT, InvGate, ManageEngine AssetExplorer, Asset Panda, SAP Fiori, IBM Carbon, Atlassian Design System e Shopify Polaris.

## 12. Qualidade e publicação

O pipeline executa:

```text
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

O GitHub é a fonte oficial do código. O Cloudflare Worker é o ambiente de execução. Toda publicação deve partir de um commit presente na `main`, registrar o SHA no deploy e ser acompanhada de verificação das rotas e dos hashes dos assets gerados.

## 13. Pendências de governança

- definir RPO, RTO, retenção de backup e confirmar PITR;
- executar e arquivar teste de restauração;
- arquivar DPAs e mecanismos de transferência internacional;
- aprovar retenção de documentos, telemetria, contratos e inspeções;
- avaliar RIPD antes de rastreamento automático em escala;
- definir responsáveis por incidente, restauração e atendimento a titulares;
- adotar conta corporativa e domínio corporativo quando aprovados;
- revisar trimestralmente a segregação entre administradores, auditores e operadores.

## 14. Regra de continuidade

Antes de alterar o sistema:

1. atualizar a `main` a partir de `origin/main`;
2. trabalhar em branch própria;
3. revisar migrações e impacto de autorização;
4. validar testes, tipos, lint, build e dependências;
5. publicar a branch e integrar por pull request;
6. publicar produção somente pelo commit integrado;
7. verificar versão ativa, rotas e assets remotos;
8. registrar a mudança no changelog.
