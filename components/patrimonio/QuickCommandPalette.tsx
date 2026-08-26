"use client";

import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ViewId } from "./types";

export type QuickCommandIcon = ViewId | "scan" | "refresh" | "create" | "import" | "export";

export type QuickCommand = {
  id: string;
  label: string;
  description: string;
  group: "Navegação" | "Ações";
  icon: QuickCommandIcon;
  keywords?: string;
  onSelect: () => void;
};

export function QuickCommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: QuickCommand[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredCommands = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return commands;
    return commands.filter((command) => normalizeSearch([
      command.label,
      command.description,
      command.group,
      command.keywords,
    ].filter(Boolean).join(" ")).includes(normalizedQuery));
  }, [commands, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActiveIndex(0);
      dialog.showModal();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [onClose]);

  const run = (command: QuickCommand) => {
    onClose();
    command.onSelect();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => filteredCommands.length ? (current + 1) % filteredCommands.length : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => filteredCommands.length ? (current - 1 + filteredCommands.length) % filteredCommands.length : 0);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, filteredCommands.length - 1));
      return;
    }
    if (event.key === "Enter") {
      const command = filteredCommands[activeIndex];
      if (!command) return;
      event.preventDefault();
      run(command);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="quick-command-dialog"
      aria-labelledby="quick-command-title"
    >
      <div className="quick-command-surface">
        <header className="quick-command-header">
          <span className="quick-command-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <label className="sr-only" htmlFor="quick-command-search" id="quick-command-title">
            Comandos rápidos
          </label>
          <input
            ref={inputRef}
            id="quick-command-search"
            type="search"
            autoComplete="off"
            placeholder="Buscar módulo ou ação…"
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="quick-command-results"
            aria-activedescendant={filteredCommands[activeIndex] ? `quick-command-${filteredCommands[activeIndex].id}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <kbd>Esc</kbd>
        </header>

        <div
          className="quick-command-results"
          id="quick-command-results"
          role="listbox"
          aria-label="Resultados dos comandos"
        >
          {filteredCommands.length ? filteredCommands.map((command, index) => (
            <button
              key={command.id}
              id={`quick-command-${command.id}`}
              className={`quick-command-item ${activeIndex === index ? "is-active" : ""}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              onMouseMove={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => run(command)}
            >
              <span className="quick-command-icon"><QuickCommandGlyph icon={command.icon} /></span>
              <span className="quick-command-copy">
                <strong>{command.label}</strong>
                <small>{command.description}</small>
              </span>
              <span className="quick-command-group">{command.group}</span>
              <span className="quick-command-arrow" aria-hidden="true">↵</span>
            </button>
          )) : (
            <div className="quick-command-empty" role="status">
              <strong>Nenhum comando encontrado</strong>
              <span>Tente o nome de um módulo ou de uma ação.</span>
            </div>
          )}
        </div>

        <footer className="quick-command-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> fechar</span>
        </footer>
      </div>
    </dialog>
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function QuickCommandGlyph({ icon }: { icon: QuickCommandIcon }) {
  if (icon === "create") {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  if (icon === "scan") {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M7 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  if (icon === "refresh") {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M19 8V4m0 0h-4m4 0-3.2 3.2A7 7 0 1 0 18.4 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (icon === "import" || icon === "export") {
    const importing = icon === "import";
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d={importing ? "M12 4v12m0 0-4-4m4 4 4-4" : "M12 17V5m0 0-4 4m4-4 4 4"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  if (icon === "dashboard") {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 19V9m5 10V5m6 14v-7m5 7V8M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  if (icon === "inventory") {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" /><rect x="14" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" /><rect x="4" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" /><rect x="14" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="7" r="1.8" fill="currentColor" /><circle cx="16" cy="12" r="1.8" fill="currentColor" /><circle cx="10" cy="17" r="1.8" fill="currentColor" /></svg>;
}
