import { buildDashboard } from "@/lib/domain";
import { buildFilteredDashboardAnalytics, defaultDashboardFilters } from "@/lib/dashboard-filters";

// Dados de ensaio para o laboratorio de interface. Existem para desenhar e
// medir as telas internas sem sessao: nenhuma rota de autenticacao e tocada, e
// a pagina que os consome so responde em desenvolvimento.
//
// Passam pelas mesmas validacoes do estado real — patrimonio e sempre seis
// digitos, nucleo exige codigo e gestor, movimentacao exige tipo conhecido —,
// entao o que o laboratorio mostra tem a forma do que o sistema mostra.

const nuclei = [
  {
    id: "nuc-atendimento",
    name: "Atendimento ao Cliente",
    code: "ATD",
    location: "Matriz · Bloco B",
    manager: "Marina Duarte",
  },
  {
    id: "nuc-ti",
    name: "Tecnologia da Informação",
    code: "TIC",
    location: "Matriz · Bloco A",
    manager: "Rafael Antunes",
  },
  {
    id: "nuc-logistica",
    name: "Logística",
    code: "LOG",
    location: "CD Norte",
    manager: "Camila Prado",
  },
];

const collaborators = [
  { id: "col-1", name: "Wesley Hidehira", nucleusId: "nuc-atendimento" },
  { id: "col-2", name: "Marina Duarte", nucleusId: "nuc-ti" },
  { id: "col-3", name: "Rafael Antunes", nucleusId: "nuc-logistica" },
  { id: "col-4", name: "Camila Prado", nucleusId: "nuc-logistica" },
];

const tipos = ["notebook", "monitor_1", "chair", "cpu", "furniture"] as const;
const estados = ["available", "allocated", "maintenance", "discrepancy", "retired"] as const;
const modelos = [
  "Dell Latitude 5440 · i7-1355U · 16GB",
  "LG 24MK430H · 24 polegadas",
  "Cadeira Flexform Duo · apoio lombar",
  "Dell OptiPlex 7010 · i5 · 8GB",
  "Armário baixo 2 portas · 90x75cm",
];

// Volume suficiente para a tabela paginar e os agregados terem massa.
const assets = Array.from({ length: 48 }, (_, indice) => {
  const nucleo = nuclei[indice % nuclei.length];
  const responsavel = collaborators[indice % collaborators.length];
  return {
    // Patrimonio oficial: exatamente seis digitos.
    id: String(104800 + indice),
    // Sem esta data, `normalizeAsset` carimba `new Date()`. A ordenacao padrao
    // da tabela cai em `createdAt` para os ativos sem movimentacao, entao a
    // ordem das linhas passava a depender do milissegundo da construcao e o
    // laboratorio mostrava uma tela diferente a cada carga.
    createdAt: `2025-${String(1 + (indice % 12)).padStart(2, "0")}-${String(1 + (indice % 28)).padStart(2, "0")}T09:00:00.000Z`,
    type: tipos[indice % tipos.length],
    status: estados[indice % estados.length],
    nucleusId: nucleo.id,
    assignee: indice % 5 === 0 ? "" : responsavel.name,
    location: `${nucleo.location} · ${1 + (indice % 4)}º andar`,
    serial: `5CD${1000 + indice}ABCDEF`,
    brandModel: modelos[indice % modelos.length],
    acquiredAt: `2024-${String(1 + (indice % 12)).padStart(2, "0")}-14`,
    value: 1200 + indice * 137,
    notes: indice % 7 === 0
      ? "Equipamento devolvido pelo colaborador anterior; teclado substituído em manutenção preventiva."
      : "",
    movements: Array.from({ length: indice % 4 }, (_, m) => ({
      id: `mov-${indice}-${m}`,
      type: "transfer",
      at: `2026-0${1 + (m % 8)}-1${m}T14:22:00.000Z`,
      from: nuclei[(indice + m) % nuclei.length].name,
      to: nuclei[(indice + m + 1) % nuclei.length].name,
      note: "Realocação por mudança de equipe.",
      actor: "wesley.hidehira",
    })),
  };
});

const departamentos = [
  { slug: "atendimento", name: "Atendimento ao Cliente" },
  { slug: "ti", name: "Tecnologia da Informação" },
  { slug: "logistica", name: "Logística" },
];

export function dashboardDeEnsaio() {
  const base = buildDashboard(
    { revision: 42, nuclei, assets, collaborators },
    {},
    { includeFinancials: true },
  );

  const operacoes = {
    inventoryCampaigns: [],
    inventoryCampaignAssets: [],
    custodyTerms: [],
    maintenanceOrders: [],
    trackingTags: [],
    trackingEvents: [],
    assetDocuments: [],
    assetContracts: [],
    assetAccounting: [],
    assetKits: [],
    assetKitItems: [],
    reservations: [],
    reservationAssets: [],
    offboardingCases: [],
    offboardingAssets: [],
    lifecycleRequests: [],
    customFields: [],
    assetCustomValues: [],
    integrations: [],
    integrationEvents: [],
    dataSourcePolicies: [],
    reconciliationIssues: [],
    assetInspections: [],
  };

  // A analitica sai do mesmo construtor que o sistema usa, alimentado pelos
  // ativos de ensaio. Sem isto o painel cai no vazio "Indicadores em
  // processamento" e nao ha superficie para medir. Numeros inventados aqui
  // dariam um painel que nao corresponde aos dados ao lado.
  const { analytics } = buildFilteredDashboardAnalytics({
    assets: base.nucleusInventory,
    nuclei: base.nuclei,
    operations: operacoes,
    filters: { ...defaultDashboardFilters },
    now: new Date("2026-08-13T15:48:00-03:00"),
  });

  return {
    ...base,
    imports: [],
    operations: operacoes,
    analytics,
    environment: {
      activeDepartment: departamentos[0],
      departments: departamentos,
      isAdmin: true,
      isAuditor: false,
      permissions: {
        canWrite: true,
        canImport: true,
        canExport: true,
        canViewFinancialData: true,
      },
      users: [],
      accessRequests: [],
      transfers: [],
      securityEvents: [],
    },
    session: {
      authenticated: true,
      displayName: "Wesley Hidehira",
      identifier: "wesley.hidehira",
      provider: "credentials",
      source: "locked",
      signInUrl: "/login",
      signOutUrl: "/api/auth/logout",
    },
  };
}
