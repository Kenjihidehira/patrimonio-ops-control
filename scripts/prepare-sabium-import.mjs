import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import readXlsxFile from "read-excel-file/node";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const chunkSize = Number(process.argv[4] ?? 0);

if (!inputPath || !outputPath) {
  throw new Error(
    "Uso: node scripts/prepare-sabium-import.mjs <arquivo.xlsx> <saida.json>",
  );
}

const resolvedInput = resolve(inputPath);
const isJsonInput = extname(resolvedInput).toLocaleLowerCase("pt-BR") === ".json";
const sourceRows = isJsonInput
  ? JSON.parse(await readFile(resolvedInput, "utf8"))
  : await readXlsxFile(resolvedInput, { sheet: "sfhwiugfbsifbisf" });
const rows = isJsonInput ? [expectedHeaderLabels(), ...sourceRows] : sourceRows;
if (rows.length < 2) throw new Error("A planilha não possui registros.");

const expectedHeaders = [
  "patrimonio",
  "corporacao",
  "identificador",
  "descricao",
  "data aquisicao",
  "valor aquisicao",
  "grupo",
  "filial",
  "data baixa",
  "valor operacao",
  "nr nota",
];
const actualHeaders = rows[0].map((value) => canonicalText(value));
if (
  actualHeaders.length !== expectedHeaders.length
  || actualHeaders.some((value, index) => value !== expectedHeaders[index])
) {
  throw new Error(
    `Cabeçalhos inesperados: ${JSON.stringify(actualHeaders)}`,
  );
}

const preparedRows = rows.slice(1).map((row, index) => {
  const sourceRow = index + 2;
  const [
    patrimony,
    incorporation,
    identifier,
    description,
    acquiredAt,
    acquisitionValue,
    group,
    branch,
    disposedAt,
    operationValue,
    invoiceNumber,
  ] = row;

  const baseCode = plainValue(patrimony);
  const incorporationNumber = integerValue(incorporation, "Corporação", sourceRow);
  const sourceIdentifier = plainValue(identifier);
  const sourceDescription = normalizedDescription(description);
  const assetGroup = normalizedDescription(group);
  const branchCode = plainValue(branch);
  const fingerprintSource = JSON.stringify({
    sourceRow,
    baseCode,
    incorporation: incorporationNumber,
    sourceIdentifier,
    sourceDescription,
    acquiredAt: isoDate(acquiredAt),
    acquisitionValue: moneyValue(acquisitionValue, "Valor aquisição", sourceRow),
    assetGroup,
    branchCode,
    disposedAt: isoDate(disposedAt),
    operationValue: optionalMoneyValue(operationValue, "Valor operação", sourceRow),
    invoiceNumber: plainValue(invoiceNumber),
  });
  const sourceFingerprint = createHash("sha256")
    .update(fingerprintSource)
    .digest("hex");
  const branchToken = slugToken(branchCode || "nao-informada");

  if (!baseCode || !sourceIdentifier || !sourceDescription) {
    throw new Error(`Linha ${sourceRow}: patrimônio, identificador ou descrição ausente.`);
  }

  return {
    code: `G${sourceFingerprint.slice(0, 20).toUpperCase()}`,
    type: classifyAsset(sourceDescription, assetGroup),
    nucleusId: `filial-${branchToken}`,
    nucleusCode: branchCode ? `F-${branchToken.toUpperCase()}` : "F-NI",
    nucleusName: branchCode ? `Filial ${branchCode}` : "Filial não informada",
    location: branchCode ? `Gazin LOG · Filial ${branchCode}` : "Gazin LOG · Filial não informada",
    brandModel: sourceDescription,
    acquiredAt: isoDate(acquiredAt),
    acquisitionValue: moneyValue(acquisitionValue, "Valor aquisição", sourceRow),
    status: disposedAt ? "retired" : "available",
    sourceFingerprint,
    baseCode,
    incorporation: incorporationNumber,
    sourceIdentifier,
    sourceDescription: plainValue(description),
    assetGroup,
    branchCode,
    disposedAt: isoDate(disposedAt),
    operationValue: optionalMoneyValue(operationValue, "Valor operação", sourceRow),
    invoiceNumber: plainValue(invoiceNumber),
    sourceRow,
  };
});

const internalCodes = new Set(preparedRows.map((row) => row.code));
if (internalCodes.size !== preparedRows.length) {
  throw new Error("Colisão na chave técnica gerada.");
}

const report = {
  rows: preparedRows.length,
  active: preparedRows.filter((row) => row.status === "available").length,
  retired: preparedRows.filter((row) => row.status === "retired").length,
  nuclei: countBy(preparedRows, (row) => row.nucleusName),
  types: countBy(preparedRows, (row) => row.type),
  duplicateSourceIdentifiers: duplicateCount(
    preparedRows.map((row) => row.sourceIdentifier),
  ),
};

const resolvedOutput = resolve(outputPath);
await mkdir(dirname(resolvedOutput), { recursive: true });
await writeFile(
  resolvedOutput,
  `${JSON.stringify({ rows: preparedRows, report })}\n`,
  "utf8",
);
if (Number.isInteger(chunkSize) && chunkSize > 0) {
  const chunkDirectory = join(
    dirname(resolvedOutput),
    `${basename(resolvedOutput, extname(resolvedOutput))}-chunks`,
  );
  await mkdir(chunkDirectory, { recursive: true });
  const chunks = [];
  for (let start = 0; start < preparedRows.length; start += chunkSize) {
    chunks.push(preparedRows.slice(start, start + chunkSize));
  }
  await Promise.all(chunks.map((chunk, index) =>
    writeFile(
      join(chunkDirectory, `part-${String(index + 1).padStart(3, "0")}.json`),
      JSON.stringify(chunk),
      "utf8",
    ),
  ));
  report.chunks = chunks.length;
  report.chunkSize = chunkSize;
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function classifyAsset(description, group) {
  const text = canonicalText(`${description} ${group}`);
  const normalizedGroup = canonicalText(group);

  if (/\b(notebook|laptop)\b/.test(text)) return "notebook";
  if (/\b(monitor|munitor|monitior)\b/.test(text)) return "monitor_1";
  if (/\b(computador|desktop|microcomputador|cpu)\b/.test(text)) return "cpu";
  if (/\bcadeira\b/.test(text) || normalizedGroup === "cadeira de escritorio") return "chair";
  if (normalizedGroup.includes("software") || /\bsoftware\b/.test(text)) return "software";
  if (normalizedGroup.includes("extintor") || /\bextintor\b/.test(text)) return "extinguisher";

  if (
    /\b(reboque|semirreboque|semi reboque|carreta|bitrem|bau|carroceria)\b/.test(text)
  ) return "trailer";

  if (normalizedGroup === "automoveis") {
    return isVehicleComponent(text) ? "vehicle_component" : "car";
  }

  if (normalizedGroup === "caminhoes") {
    if (
      /\bchassi\b/.test(text)
      || /^(cam|caminhao)\b/.test(canonicalText(description))
    ) return "fleet";
    return "vehicle_component";
  }

  if (
    normalizedGroup.includes("moveis")
    || normalizedGroup.includes("moveis de madeira")
  ) return "furniture";

  if (
    normalizedGroup.includes("maquinas e equipamentos")
    || normalizedGroup.includes("equipamentos de informatica")
  ) return "equipment";

  return "other";
}

function isVehicleComponent(text) {
  return /\b(motor|cambio|diferencial|eixo|pecas|peca|kit|reforma|conserto|servico|retifica|turbina|pneu|tanque|bomba|compressor)\b/.test(text);
}

function normalizedDescription(value) {
  return plainValue(value)
    .replace(/\bMUNITOR\b/gi, "MONITOR")
    .replace(/\bMONITIOR\b/gi, "MONITOR")
    .replace(/\bCADEIRA\s+ESCRITORIO\b/gi, "CADEIRA DE ESCRITÓRIO")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalText(value) {
  return plainValue(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plainValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function integerValue(value, field, row) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Linha ${row}: ${field} inválida.`);
  }
  return number;
}

function moneyValue(value, field, row) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || number > 100_000_000) {
    throw new Error(`Linha ${row}: ${field} inválido.`);
  }
  return Math.round(number * 100) / 100;
}

function optionalMoneyValue(value, field, row) {
  if (value === null || value === undefined || value === "") return null;
  return moneyValue(value, field, row);
}

function isoDate(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.round(value) * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  throw new Error(`Data inválida: ${plainValue(value)}`);
}

function expectedHeaderLabels() {
  return [
    "Patrimônio",
    "Corporação",
    "Identificador",
    "Descrição",
    "Data aquisição",
    "Valor aquisição",
    "Grupo",
    "Filial",
    "Data baixa",
    "Valor operação",
    "Nr nota",
  ];
}

function slugToken(value) {
  const token = canonicalText(value).replace(/\s+/g, "-").slice(0, 56);
  return token || "nao-informada";
}

function countBy(values, selector) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => {
      const key = selector(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map())].sort((left, right) => right[1] - left[1]),
  );
}

function duplicateCount(values) {
  const counts = values.reduce((map, value) => {
    map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  }, new Map());
  return [...counts.values()].filter((count) => count > 1)
    .reduce((total, count) => total + count, 0);
}
