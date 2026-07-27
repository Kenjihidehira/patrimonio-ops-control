import assert from "node:assert/strict";
import test from "node:test";
import {
  signGatewayRequest,
  verifyGatewayRequest,
} from "../supabase/functions/patrimonio-gateway/auth.js";

const secret = "segredo-de-teste-com-entropia-suficiente-para-assinatura-hmac";
const nonce = "nonce_seguro_1234567890";
const body = JSON.stringify({ operation: "load_workspace_context", identifier: "user@example.com" });

test("aceita assinatura HMAC válida dentro da janela de tempo", async () => {
  const now = Date.now();
  const timestamp = String(now);
  const signature = await signGatewayRequest(secret, timestamp, nonce, body);

  assert.equal(await verifyGatewayRequest({
    secret,
    timestamp,
    nonce,
    signature,
    body,
    now,
  }), true);
});

test("rejeita corpo alterado, assinatura inválida e requisição expirada", async () => {
  const now = Date.now();
  const timestamp = String(now);
  const signature = await signGatewayRequest(secret, timestamp, nonce, body);

  assert.equal(await verifyGatewayRequest({
    secret,
    timestamp,
    nonce,
    signature,
    body: `${body} `,
    now,
  }), false);
  assert.equal(await verifyGatewayRequest({
    secret,
    timestamp,
    nonce,
    signature: "A".repeat(43),
    body,
    now,
  }), false);
  assert.equal(await verifyGatewayRequest({
    secret,
    timestamp,
    nonce,
    signature,
    body,
    now: now + 6 * 60 * 1000,
  }), false);
});
