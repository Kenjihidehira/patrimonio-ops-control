"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchDashboard } from "./api";
import type { Dashboard, InventoryFilters } from "./types";

const DASHBOARD_REFRESH_INTERVAL_MS = 10_000;
const ACTIVITY_REFRESH_COOLDOWN_MS = 1_500;
const SCANNER_CHARACTER_TIMEOUT_MS = 100;
const SCANNER_BUFFER_TIMEOUT_MS = 250;
const SCANNABLE_IDENTIFIER_PATTERN = /^(?:\d{6}|S[A-Z0-9]{5})$/;

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

export function useDashboard(filters: InventoryFilters) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const lastActivityAt = useRef(0);

  const refresh = useCallback(async (
    options: {
      quiet?: boolean;
      background?: boolean;
      filters?: InventoryFilters;
    } = {},
  ): Promise<Dashboard | null> => {
    const requestId = ++requestSequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    try {
      const next = await fetchDashboard(options.filters ?? filters, controller.signal);
      if (requestId !== requestSequence.current) return null;
      setDashboard((current) => (
        options.background && current?.revision === next.revision ? current : next
      ));
      setLastSyncAt(new Date());
      return next;
    } catch (cause) {
      if (controller.signal.aborted) return null;
      const message = cause instanceof Error
        ? cause.message
        : "Não foi possível carregar o controle patrimonial.";
      if (!options.background) setError(message);
      return null;
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh({ quiet: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      activeRequest.current?.abort();
    };
  }, [filters.search, filters.type, filters.status, filters.nucleus, filters.sort, refresh]);

  useEffect(() => {
    const synchronize = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastActivityAt.current < ACTIVITY_REFRESH_COOLDOWN_MS) return;
      lastActivityAt.current = now;
      void refresh({ quiet: true, background: true });
    };
    const timer = window.setInterval(synchronize, DASHBOARD_REFRESH_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") synchronize();
    };
    window.addEventListener("focus", synchronize);
    window.addEventListener("online", synchronize);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("online", synchronize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  return { dashboard, loading, error, lastSyncAt, refresh };
}

export function useTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });

  const setTheme = useCallback((next: "light" | "dark") => {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    document.cookie = `patrimonio_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}

export type ScannerState = "ready" | "reading" | "success" | "error";

export function useBarcodeScanner(
  onScan: (identifier: string) => Promise<void>,
) {
  const [state, setState] = useState<ScannerState>("ready");
  const [label, setLabel] = useState("Leitor pronto");
  const onScanRef = useRef(onScan);
  const stateTimer = useRef<number | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const updateState = useCallback((nextState: ScannerState, nextLabel: string) => {
    if (stateTimer.current !== null) window.clearTimeout(stateTimer.current);
    setState(nextState);
    setLabel(nextLabel);
    if (nextState !== "ready") {
      stateTimer.current = window.setTimeout(() => {
        setState("ready");
        setLabel("Leitor pronto");
      }, 3_000);
    }
  }, []);

  useEffect(() => {
    let buffer = "";
    let lastCharacterAt = 0;
    let resetTimer: number | null = null;

    const reset = () => {
      buffer = "";
      lastCharacterAt = 0;
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = null;
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) return;

      const target = event.target;
      const isSearchInput = target instanceof HTMLElement
        && target.matches("[data-inventory-search]");
      const isEditable = target instanceof HTMLElement
        && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      if (isEditable && !isSearchInput) {
        reset();
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const identifier = normalizeScannedIdentifier(buffer);
        reset();
        if (!identifier) return;
        event.preventDefault();
        updateState("reading", "Consultando código");
        void onScanRef.current(identifier);
        return;
      }

      if (event.key.length !== 1) return;
      const now = performance.now();
      if (now - lastCharacterAt > SCANNER_CHARACTER_TIMEOUT_MS) buffer = "";
      buffer += event.key;
      lastCharacterAt = now;
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(reset, SCANNER_BUFFER_TIMEOUT_MS);
      if (!isSearchInput) event.preventDefault();
    };

    document.addEventListener("keydown", handleKeydown, true);
    return () => {
      document.removeEventListener("keydown", handleKeydown, true);
      reset();
    };
  }, [updateState]);

  useEffect(() => () => {
    if (stateTimer.current !== null) window.clearTimeout(stateTimer.current);
  }, []);

  return { state, label, updateState };
}

export function normalizeScannedIdentifier(value: string): string | null {
  const normalized = value.trim().replace(/^#/, "").toUpperCase();
  return SCANNABLE_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}
