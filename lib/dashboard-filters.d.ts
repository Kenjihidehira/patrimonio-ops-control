import type {
  AnalyticsSnapshot,
  Asset,
  AssetStatus,
  AssetType,
  Dashboard,
  OperationsData,
} from "../components/patrimonio/types";

export type DashboardFilters = {
  nucleus: string;
  type: AssetType | "all";
  status: AssetStatus | "all";
  source: "all" | "sabium" | "local";
};

export const defaultDashboardFilters: Readonly<DashboardFilters>;

export function hasDashboardFilters(filters: DashboardFilters): boolean;

export function buildFilteredDashboardAnalytics(input: {
  assets?: Asset[];
  nuclei?: Dashboard["nuclei"];
  operations?: Partial<OperationsData>;
  filters?: DashboardFilters;
  now?: Date;
}): {
  selectedCount: number;
  analytics: AnalyticsSnapshot;
};
