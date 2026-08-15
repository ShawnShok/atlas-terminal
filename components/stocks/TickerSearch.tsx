"use client";

import { useId, type KeyboardEvent } from "react";

import type { TickerSearchResult } from "@/types/research";

export interface TickerSearchProps {
  readonly query: string;
  readonly results: readonly TickerSearchResult[];
  readonly isOpen: boolean;
  readonly activeIndex: number;
  readonly isLoading?: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelect: (result: TickerSearchResult) => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export function TickerSearch({
  query,
  results,
  isOpen,
  activeIndex,
  isLoading = false,
  onQueryChange,
  onActiveIndexChange,
  onSelect,
  onOpenChange,
}: TickerSearchProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-input`;
  const listboxId = `${fieldId}-results`;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onOpenChange?.(true);
      onActiveIndexChange(Math.min(results.length - 1, activeIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onActiveIndexChange(Math.max(0, activeIndex - 1));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      onSelect(results[activeIndex]);
    } else if (event.key === "Escape") {
      onOpenChange?.(false);
    }
  };

  return (
    <div className="stock-ticker-search">
      <label htmlFor={inputId}>SECURITY SEARCH</label>
      <input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        value={query}
        placeholder="SYMBOL OR COMPANY"
        autoComplete="off"
        spellCheck={false}
        onFocus={() => onOpenChange?.(true)}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {isOpen ? (
        <div id={listboxId} role="listbox" className="stock-search-results">
          {isLoading ? <div className="stock-search-state">SEARCHING…</div> : results.length === 0 ? (
            <div className="stock-search-state">NO MATCHING SECURITIES</div>
          ) : results.map((result, index) => (
            <button
              type="button"
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              key={`${result.symbol}-${result.exchange ?? "unknown"}`}
              onMouseEnter={() => onActiveIndexChange(index)}
              onClick={() => onSelect(result)}
            >
              <strong>{result.symbol}</strong>
              <span>{result.name}</span>
              <small>{result.exchange ?? "—"} · {result.assetType ?? "security"}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
