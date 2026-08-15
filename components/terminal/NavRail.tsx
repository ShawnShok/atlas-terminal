"use client";

import {
  Bell,
  Bookmark,
  CalendarDays,
  ChartCandlestick,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  House,
  ListFilter,
  Newspaper,
  PanelLeftClose,
  Settings,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  phase: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: House, phase: 1 },
  { id: "markets", label: "Markets", icon: Gauge, phase: 2 },
  { id: "scanner", label: "Scanner", icon: ListFilter, phase: 6 },
  { id: "news", label: "News", icon: Newspaper, phase: 3 },
  { id: "events", label: "Events", icon: CalendarDays, phase: 4 },
  { id: "watchlists", label: "Watchlists", icon: Star, phase: 2 },
  { id: "stocks", label: "Stocks", icon: ChartCandlestick, phase: 2 },
  { id: "options", label: "Options", icon: CircleDollarSign, phase: 5 },
  { id: "portfolio", label: "Portfolio", icon: SlidersHorizontal, phase: 8 },
  { id: "alerts", label: "Alerts", icon: Bell, phase: 8 },
  { id: "screens", label: "Saved screens", icon: Bookmark, phase: 6 },
  { id: "settings", label: "Settings", icon: Settings, phase: 8 },
];

interface NavRailProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (item: NavItem) => void;
}

export function NavRail({ collapsed, onToggle, onNavigate }: NavRailProps) {
  return (
    <aside className={collapsed ? "nav-rail is-collapsed" : "nav-rail"}>
      <nav aria-label="Primary terminal navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === "home";
          return (
            <button
              className={isActive ? "nav-item is-active" : "nav-item"}
              key={item.id}
              type="button"
              title={`${item.label}${item.phase > 1 ? ` · Phase ${item.phase}` : ""}`}
              onClick={() => onNavigate(item)}
            >
              <Icon size={16} strokeWidth={1.7} aria-hidden />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.phase > 1 && <small>P{item.phase}</small>}
            </button>
          );
        })}
      </nav>
      <button
        className="nav-collapse"
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      >
        {collapsed ? <ChevronRight size={15} /> : <PanelLeftClose size={15} />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
