const originalHeaders = [
  "colaborador(a)",
  "nucleo",
  "maquina",
  "tela 1",
  "tela 2",
  "cadeira",
  "notebook",
];

const originalTypes = ["cpu", "monitor_1", "monitor_2", "chair", "notebook"];

const typeAliases = new Map([
  ["cpu", "cpu"],
  ["cpu (computador)", "cpu"],
  ["computador", "cpu"],
  ["maquina", "cpu"],
  ["monitor 1", "monitor_1"],
  ["tela 1", "monitor_1"],
  ["monitor 2", "monitor_2"],
  ["tela 2", "monitor_2"],
  ["cadeira", "chair"],
  ["notebook", "notebook"],
]);

const statusAliases = new Map([
  ["disponivel", "available"],
  ["em uso", "allocated"],
  ["alocado", "allocated"],
  ["manutencao", "maintenance"],
  ["divergencia", "discrepancy"],
  ["baixado", "retired"],
]);

export function parsePatrimonioRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return invalidStructure("A planilha está vazia.");
  }

  const normalizedRows = rows.map((row) =>
    Array.isArray(row) ? row.map(normalizeCell) : [],
  );
  const flatHeader = findFlatHeader(normalizedRows);
  const candidates = flatHeader
    ? parseFlatRows(normalizedRows, flatHeader)
    : parseOriginalRows(normalizedRows);

  if (candidates.structureError) return invalidStructure(candidates.structureError);
  return finalizeCandidates(candidates.assets, candidates.warnings);
}

function parseOriginalRows(rows) {
  const headers = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex <= rows[rowIndex].length - originalHeaders.length; columnIndex += 1) {
      const slice = rows[rowIndex]
        .slice(columnIndex, columnIndex + originalHeaders.length)
        .map(normalizeKey);
      if (slice.every((value, index) => value === originalHeaders[index])) {
        headers.push({ rowIndex, columnIndex });
      }
    }
  }

  if (!headers.length) {
    return {
      assets: [],
      warnings: [],
      structureError:
        "Cabeçalhos não reconhecidos. Use a planilha-base ou o modelo exportado pelo sistema.",
    };
  }

  const assets = [];
  const warnings = [];
  for (const header of headers) {
    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const assignee = rows[rowIndex][header.columnIndex];
      if (!assignee) break;
      const nucleus = rows[rowIndex][header.columnIndex + 1];
      if (!nucleus) {
        warnings.push(issue(rowIndex, header.columnIndex + 1, "Linha ignorada: núcleo não informado."));
        continue;
      }

      originalTypes.forEach((type, typeIndex) => {
        const columnIndex = header.columnIndex + 2 + typeIndex;
        const rawCode = rows[rowIndex][columnIndex];
        const result = normalizeAssetCode(rawCode);
        if (result.kind === "empty") return;
        if (result.kind === "personal") {
          warnings.push(issue(rowIndex, columnIndex, "Item pessoal ignorado na importação."));
          return;
        }
        if (result.kind === "invalid") {
          assets.push({
            invalid: true,
            code: result.code,
            rowIndex,
            columnIndex,
            issue: "O identificador deve conter 5 ou 6 números.",
          });
          return;
        }
        if (result.padded) {
          warnings.push(
            issue(
              rowIndex,
              columnIndex,
              `O identificador ${result.original} recebeu zero à esquerda: ${result.code}.`,
            ),
          );
        }
        assets.push(
          assetCandidate({
            code: result.code,
            type,
            nucleus,
            assignee,
            rowIndex,
            columnIndex,
          }),
        );
      });
    }
  }

  return { assets, warnings, structureError: null };
}

function parseFlatRows(rows, header) {
  const assets = [];
  const warnings = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const codeValue = rows[rowIndex][header.columns.code];
    if (!codeValue && rows[rowIndex].every((cell) => !cell)) continue;
    const result = normalizeAssetCode(codeValue);
    const type = typeAliases.get(normalizeKey(rows[rowIndex][header.columns.type]));
    const nucleus = rows[rowIndex][header.columns.nucleus];

    if (result.kind !== "valid") {
      assets.push({
        invalid: true,
        code: result.code,
        rowIndex,
        columnIndex: header.columns.code,
        issue: "O identificador deve conter 5 ou 6 números.",
      });
      continue;
    }
    if (!type || !nucleus) {
      assets.push({
        invalid: true,
        code: result.code,
        rowIndex,
        columnIndex: !type ? header.columns.type : header.columns.nucleus,
        issue: !type ? "Tipo de item inválido." : "Núcleo não informado.",
      });
      continue;
    }
    if (result.padded) {
      warnings.push(
        issue(
          rowIndex,
          header.columns.code,
          `O identificador ${result.original} recebeu zero à esquerda: ${result.code}.`,
        ),
      );
    }

    const assignee = cellAt(rows, rowIndex, header.columns.assignee);
    const statusValue = cellAt(rows, rowIndex, header.columns.status);
    assets.push(
      assetCandidate({
        code: result.code,
        type,
        nucleus,
        assignee,
        rowIndex,
        columnIndex: header.columns.code,
        location: cellAt(rows, rowIndex, header.columns.location),
        serial: cellAt(rows, rowIndex, header.columns.serial),
        brandModel: cellAt(rows, rowIndex, header.columns.brandModel),
        acquiredAt: normalizeDate(cellAt(rows, rowIndex, header.columns.acquiredAt)),
        value: normalizeMoney(cellAt(rows, rowIndex, header.columns.value)),
        status: statusAliases.get(normalizeKey(statusValue)) || (assignee ? "allocated" : "available"),
        notes: cellAt(rows, rowIndex, header.columns.notes),
      }),
    );
  }
  return { assets, warnings, structureError: null };
}

function finalizeCandidates(candidates, warnings) {
  const invalid = candidates.filter((candidate) => candidate.invalid);
  const valid = candidates.filter((candidate) => !candidate.invalid);
  const byCode = new Map();
  for (const candidate of valid) {
    const group = byCode.get(candidate.code) ?? [];
    group.push(candidate);
    byCode.set(candidate.code, group);
  }

  const duplicateCodes = new Set(
    [...byCode.entries()].filter(([, group]) => group.length > 1).map(([code]) => code),
  );
  const duplicateRows = valid.filter((candidate) => duplicateCodes.has(candidate.code));
  const accepted = valid.filter((candidate) => !duplicateCodes.has(candidate.code));
  const errors = [
    ...invalid.map((candidate) =>
      issue(candidate.rowIndex, candidate.columnIndex, `${candidate.issue} Valor: ${candidate.code || "vazio"}.`),
    ),
    ...duplicateRows.map((candidate) =>
      issue(
        candidate.rowIndex,
        candidate.columnIndex,
        `O patrimônio ${candidate.code} aparece mais de uma vez e foi excluído da importação.`,
      ),
    ),
  ];
  const nuclei = buildNuclei(accepted.map((candidate) => candidate.nucleus));
  const nucleusIdByName = new Map(nuclei.map((nucleus) => [normalizeKey(nucleus.name), nucleus.id]));
  const assets = accepted.map((candidate) => ({
    code: candidate.code,
    type: candidate.type,
    nucleusId: nucleusIdByName.get(normalizeKey(candidate.nucleus)),
    assignee: candidate.assignee,
    location: candidate.location || "Não informada na planilha",
    serial: candidate.serial || "",
    brandModel: candidate.brandModel || "Não informado",
    acquiredAt: candidate.acquiredAt || "",
    value: candidate.value ?? 0,
    status: candidate.status || (candidate.assignee ? "allocated" : "available"),
    notes: candidate.notes || "Importado da planilha de patrimônios.",
  }));

  return {
    sourceFormat: "xlsx",
    totalCandidates: candidates.length,
    acceptedCount: assets.length,
    rejectedCount: errors.length,
    adjustedCount: warnings.filter((warning) => warning.message.includes("zero à esquerda")).length,
    canCommit: assets.length > 0,
    nuclei,
    assets,
    errors,
    warnings,
  };
}

function findFlatHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const keys = rows[rowIndex].map(normalizeKey);
    const columns = {
      code: findColumn(keys, ["patrimonio", "codigo", "identificador"]),
      type: findColumn(keys, ["tipo", "tipo de item", "item"]),
      nucleus: findColumn(keys, ["nucleo"]),
      assignee: findColumn(keys, ["responsavel", "colaborador(a)", "colaborador"]),
      location: findColumn(keys, ["localizacao", "local"]),
      serial: findColumn(keys, ["numero de serie", "serie"]),
      brandModel: findColumn(keys, ["marca e modelo", "modelo"]),
      acquiredAt: findColumn(keys, ["aquisicao", "data de aquisicao"]),
      value: findColumn(keys, ["valor", "valor de aquisicao"]),
      status: findColumn(keys, ["status"]),
      notes: findColumn(keys, ["observacoes", "observacao"]),
    };
    if (columns.code >= 0 && columns.type >= 0 && columns.nucleus >= 0) {
      return { rowIndex, columns };
    }
  }
  return null;
}

function assetCandidate(input) {
  return {
    invalid: false,
    code: input.code,
    type: input.type,
    nucleus: input.nucleus,
    assignee: input.assignee || "",
    rowIndex: input.rowIndex,
    columnIndex: input.columnIndex,
    location: input.location || "",
    serial: input.serial || "",
    brandModel: input.brandModel || "",
    acquiredAt: input.acquiredAt || "",
    value: input.value ?? 0,
    status: input.status || "",
    notes: input.notes || "",
  };
}

function buildNuclei(names) {
  const usedIds = new Set();
  const usedCodes = new Set();
  return [...new Map(names.map((name) => [normalizeKey(name), name])).values()].map((name) => {
    const baseId = `nuc-${slugify(name) || "importado"}`.slice(0, 60);
    const id = uniqueValue(baseId, usedIds, name, 60, false);
    const compact = slugify(name).replaceAll("-", "").toUpperCase().slice(0, 8) || "NUC";
    const code = uniqueValue(compact, usedCodes, name, 12, true);
    return {
      id,
      code,
      name,
      location: "Não informada na planilha",
      manager: "Não informado",
    };
  });
}

function uniqueValue(base, used, source, maxLength, uppercase) {
  let value = uppercase ? base.toUpperCase() : base;
  if (!used.has(value)) {
    used.add(value);
    return value;
  }
  const suffix = Math.abs(hashString(source)).toString(36).slice(0, 5);
  value = `${value.slice(0, Math.max(1, maxLength - suffix.length - 1))}-${suffix}`;
  if (uppercase) value = value.toUpperCase();
  used.add(value);
  return value;
}

function normalizeAssetCode(value) {
  const code = normalizeCell(value).replace(/\.0+$/, "");
  const key = normalizeKey(code);
  if (!code || key === "x" || key === "sem patrimonio") return { kind: "empty", code: "" };
  if (key === "pessoal") return { kind: "personal", code };
  if (/^\d{5}$/.test(code)) {
    return { kind: "valid", code: `0${code}`, original: code, padded: true };
  }
  if (/^\d{6}$/.test(code)) return { kind: "valid", code, original: code, padded: false };
  return { kind: "invalid", code };
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = normalizeCell(value);
  if (!text) return "";
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeCell(value).replace(/[^\d,.-]/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function normalizeCell(value) {
  if (value instanceof Date) return value;
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function normalizeKey(value) {
  return normalizeCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function cellAt(rows, rowIndex, columnIndex) {
  return columnIndex >= 0 ? rows[rowIndex][columnIndex] : "";
}

function findColumn(keys, aliases) {
  return keys.findIndex((key) => aliases.includes(key));
}

function issue(rowIndex, columnIndex, message) {
  return {
    row: rowIndex + 1,
    column: columnName(columnIndex),
    message,
  };
}

function columnName(columnIndex) {
  if (columnIndex < 0) return "-";
  let index = columnIndex + 1;
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function invalidStructure(message) {
  return {
    sourceFormat: "unknown",
    totalCandidates: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    adjustedCount: 0,
    canCommit: false,
    nuclei: [],
    assets: [],
    errors: [{ row: 0, column: "-", message }],
    warnings: [],
  };
}
