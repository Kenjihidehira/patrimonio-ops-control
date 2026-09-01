import assert from "node:assert/strict";
import test from "node:test";
import { nucleusGlyph } from "../lib/nucleus-glyph.js";

// A sigla saiu do badge do núcleo e entrou um ícone por significado. Este teste
// trava a taxonomia: os departamentos reais da Gazin (vistos em produção)
// precisam cair em ícones distintos e coerentes, e qualquer nome não previsto
// precisa cair na reserva `building` — nunca num ícone errado.

test("os departamentos reais mapeiam para ícones coerentes", () => {
  const esperado = {
    "ATACADO": "boxes",
    "CANAIS ESPECIAIS": "broadcast",
    "CONSORCIO": "coins",
    "COORDENADORA GERAL": "compass",
    "CUSTOMER EXPERIENCE": "headset",
    "E-COMMERCE": "cart",
    "GAZINBANK": "bank",
    "GERENTE DO ATENDIMENTO AO CLIENTE": "headset",
  };
  for (const [nome, glifo] of Object.entries(esperado)) {
    assert.equal(nucleusGlyph(nome), glifo, `${nome} deveria ser ${glifo}`);
  }
});

test("acentos e caixa não mudam o resultado", () => {
  // O núcleo de ensaio "Logística" tem acento e vem em caixa mista.
  assert.equal(nucleusGlyph("Logística"), "truck");
  assert.equal(nucleusGlyph("LOGISTICA"), "truck");
  assert.equal(nucleusGlyph("Tecnologia da Informação"), "chip");
  assert.equal(nucleusGlyph("Consórcio Gazin"), "coins");
});

test("nome não previsto cai na reserva, nunca num ícone errado", () => {
  // Recursos Humanos, Jurídico, Facilities — sem ícone próprio no conjunto —
  // devem usar `building`, não pegar um match espúrio.
  assert.equal(nucleusGlyph("Recursos Humanos"), "building");
  assert.equal(nucleusGlyph("Jurídico"), "building");
  assert.equal(nucleusGlyph("Núcleo 42"), "building");
  assert.equal(nucleusGlyph(""), "building");
});

test("a ordem resolve ambiguidade a favor do mais específico", () => {
  // "Coordenadoria de E-commerce" contém tanto "coordenad" (compass) quanto
  // "e-comm" (cart). O específico do canal vence o genérico de gestão.
  assert.equal(nucleusGlyph("Coordenadoria de E-commerce"), "cart");
  // "Banco" vence qualquer coisa: é a primeira regra.
  assert.equal(nucleusGlyph("GazinBank Financeiro"), "bank");
});
