import assert from "node:assert/strict";
import test from "node:test";
import { gatewayKeyMatches } from "../supabase/functions/patrimonio-gateway/auth.js";

test("aceita a chave configurada e rejeita valores diferentes", async () => {
  assert.equal(await gatewayKeyMatches("segredo-valido", "segredo-valido"), true);
  assert.equal(await gatewayKeyMatches("segredo-invalido", "segredo-valido"), false);
});

test("aceita uma chave rotacionada somente pelo hash SHA-256", async () => {
  const secret = "chave-rotacionada-de-teste";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const hash = Buffer.from(digest).toString("hex");

  assert.equal(await gatewayKeyMatches(secret, "", hash), true);
  assert.equal(await gatewayKeyMatches("outra-chave", "", hash), false);
  assert.equal(await gatewayKeyMatches(secret, "", "hash-invalido"), false);
});
