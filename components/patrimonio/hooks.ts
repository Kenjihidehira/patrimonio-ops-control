"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError, fetchDashboard } from "./api";
import type { Dashboard, InventoryFilters } from "./types";

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;
const ACTIVITY_REFRESH_COOLDOWN_MS = 1_500;
const SCANNER_CHARACTER_TIMEOUT_MS = 100;
const SCANNER_BUFFER_TIMEOUT_MS = 250;
const SCANNABLE_IDENTIFIER_PATTERN = /^(?:\d{1,10}(?:\.\d{1,6})?|S[A-Z0-9]{5})$/;
const THEME_COVER_DURATION_MS = 100;
const THEME_COLOR_SETTLE_MS = 90;
const THEME_REVEAL_DURATION_MS = 120;
const THEME_CLEANUP_BUFFER_MS = 24;

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

export function useDashboard(
  filters: InventoryFilters,
  departmentSlug: string | null,
) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const dashboardRef = useRef<Dashboard | null>(null);
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
      if (!options.background) setLoading(true);
      const next = await fetchDashboard(
        options.filters ?? filters,
        departmentSlug,
        controller.signal,
        options.background ? dashboardRef.current?.revision ?? null : null,
      );
      if (requestId !== requestSequence.current) return null;
      if (!next) {
        setLastSyncAt(new Date());
        return dashboardRef.current;
      }
      dashboardRef.current = next;
      setDashboard(next);
      setLastSyncAt(new Date());
      return next;
    } catch (cause) {
      if (controller.signal.aborted) return null;
      if (cause instanceof ApiError && cause.status === 401 && cause.signInUrl) {
        dashboardRef.current = null;
        setDashboard(null);
        window.location.replace(cause.signInUrl);
        return null;
      }
      const message = cause instanceof Error
        ? cause.message
        : "Não foi possível carregar o controle patrimonial.";
      if (!options.background) setError(message);
      return null;
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [departmentSlug, filters]);

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
  const themeTransitionActive = useRef(false);
  const themeTransitionTimers = useRef<number[]>([]);
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => () => {
    for (const timer of themeTransitionTimers.current) window.clearTimeout(timer);
    const root = document.documentElement;
    root.classList.remove(
      "theme-transition-active",
      "theme-transition-covered",
      "theme-transition-revealing",
    );
  }, []);

  const setTheme = useCallback((next: "light" | "dark") => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const applyTheme = () => {
      root.dataset.theme = next;
      root.style.colorScheme = next;
      document.cookie = `patrimonio_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      setThemeState(next);
    };

    if (reduceMotion) {
      applyTheme();
      return;
    }

    if (themeTransitionActive.current) return;
    themeTransitionActive.current = true;
    root.classList.add("theme-transition-active");
    void root.offsetWidth;
    root.classList.add("theme-transition-covered");

    const coverTimer = window.setTimeout(() => {
      applyTheme();

      const colorTimer = window.setTimeout(() => {
        root.classList.add("theme-transition-revealing");
        root.classList.remove("theme-transition-covered");

        const revealTimer = window.setTimeout(() => {
          root.classList.remove("theme-transition-active", "theme-transition-revealing");
          themeTransitionActive.current = false;
          themeTransitionTimers.current = [];
        }, THEME_REVEAL_DURATION_MS + THEME_CLEANUP_BUFFER_MS);

        themeTransitionTimers.current.push(revealTimer);
      }, THEME_COLOR_SETTLE_MS);

      themeTransitionTimers.current.push(colorTimer);
    }, THEME_COVER_DURATION_MS);

    themeTransitionTimers.current = [coverTimer];
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
