/**
 * Escolhe o ícone de um núcleo a partir do nome.
 *
 * Isolado do componente por dois motivos: a decisão é pura (nome → glifo) e
 * merece teste próprio, e a taxonomia é o tipo de coisa que se ajusta com o
 * tempo (produção cria departamentos novos). O `NucleusIcon`, em `ui.tsx`, só
 * desenha o SVG do glifo que esta função devolve.
 *
 * Núcleo não tem campo de categoria no dado, então a escolha sai do próprio
 * nome por palavra-chave. Qualquer nome que não case cai em `building` — a mesma
 * reserva de sempre —, o que cobre os departamentos que ninguém previu aqui.
 *
 * @typedef {"bank"|"cart"|"headset"|"phone"|"lifebuoy"|"boxes"|"coins"|"broadcast"|"truck"|"chip"|"compass"|"building"} NucleusGlyph
 */

// Ordem importa: do mais específico para o mais amplo. `compass` fica por último
// entre os nomeados porque "geral"/"coordenad" é o mais genérico dos
// reconhecíveis e não deve roubar um match mais preciso.
const GLIFOS_POR_PALAVRA = [
  [/banco|bank|financ|tesour|credito|cobranc/, "bank"],
  [/e-?comm|comerc|loja|varejo|marketplace|venda/, "cart"],
  // A família de atendimento se divide: tele antes do genérico (senão
  // "teleatendimento" casa "atend"), suporte/assistência vira boia, e o resto
  // do atendimento/experiência fica no headset. Distintos, mas todos parentes.
  [/teleatend|call\s?center|0800|telefon/, "phone"],
  [/suporte|assistenc|help\s?desk|ajuda/, "lifebuoy"],
  [/atend|customer|experience|\bcx\b|\bsac\b|relacionament/, "headset"],
  [/atacad|distribui|estoque|armazem|abastec/, "boxes"],
  [/consorci|poupan|investiment/, "coins"],
  [/canais|canal|midia|comunicac|marketing|publicid/, "broadcast"],
  [/logistic|transport|frota|entrega|expedic/, "truck"],
  [/tecnolog|informatic|\bti\b|sistem|dados|digital|software/, "chip"],
  [/coordenad|diretor|presidenc|governanc|geral|estrateg/, "compass"],
];

/**
 * @param {string} name
 * @returns {NucleusGlyph}
 */
export function nucleusGlyph(name) {
  // Sem acento e em minúsculas: "Logística" casa `logistic`, "Consórcio" casa
  // `consorci`, sem precisar duplicar cada palavra com e sem acento.
  const n = String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [re, glyph] of GLIFOS_POR_PALAVRA) if (re.test(n)) return glyph;
  return "building";
}
