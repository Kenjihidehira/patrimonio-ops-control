import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ler = (caminho) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8");

const [rota, workflow] = await Promise.all([
  ler("app/api/health/route.ts"),
  ler(".github/workflows/keep-alive.yml"),
]);

test("a sonda de saude mantem o contrato que o keep-alive depende", () => {
  // Precisa ser dinamica: uma resposta cacheada nao tocaria o banco e o ping
  // seria decorativo.
  assert.match(rota, /export const dynamic = "force-dynamic"/);

  // Tem que tocar o banco de verdade. `getSystemAccess` com identificador nao
  // vazio forca o SELECT — e o identificador NAO pode ser vazio, senao o
  // gateway faz curto-circuito antes do banco.
  assert.match(rota, /getSystemAccess\(/);
  assert.match(rota, /const SONDA = "[^"]+@[^"]+"/);

  // NAO pode exigir sessao: o cron bate sem cookie. Se alguem colar um
  // getAuthenticatedUser aqui, o ping passa a receber 401 e para de acordar
  // o banco sem ninguem perceber.
  assert.doesNotMatch(rota, /getAuthenticatedUser|requireUser|isIdentityStillAuthorized/);

  // Falha tem que ser 503, nao 200: o cron precisa quebrar quando o banco
  // esta fora, em vez de mascarar.
  assert.match(rota, /status:\s*503/);

  // A resposta nao expoe o resultado do acesso — nao pode virar oraculo de
  // existencia de conta.
  assert.doesNotMatch(rota, /authorized/);
});

test("o cron do keep-alive dispara sozinho e aponta para /api/health", () => {
  // Sem `schedule`, nada roda sem alguem clicar. Sem `workflow_dispatch`, nao
  // da para testar na hora.
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:\s*"[^"]+"/);
  assert.match(workflow, /workflow_dispatch/);

  // O alvo e a rota certa e o alias ESTAVEL — nao a URL de um deploy, que muda
  // a cada publicacao.
  assert.match(workflow, /\/api\/health/);
  assert.match(workflow, /patrimonio-ops-control\.vercel\.app/);

  // Precisa falhar quando o health falha, senao o cron "verde" esconderia um
  // banco pausado.
  assert.match(workflow, /exit 1/);
});
