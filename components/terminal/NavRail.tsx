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
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: House },
  { id: "markets", label: "Markets", icon: Gauge },
  { id: "scanner", label: "Scanner", icon: ListFilter },
  { id: "news", label: "News", icon: Newspaper },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "watchlists", label: "Watchlists", icon: Star },
  { id: "stocks", label: "Stocks", icon: ChartCandlestick },
  { id: "options", label: "Options", icon: CircleDollarSign },
  { id: "portfolio", label: "Portfolio", icon: SlidersHorizontal },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "screens", label: "Saved screens", icon: Bookmark },
  { id: "settings", label: "Settings", icon: Settings },
];

interface NavRailProps {
  collapsed: boolean;
  activeId: string;
  onToggle: () => void;
  onNavigate: (item: NavItem) => void;
}

export function NavRail({ collapsed, activeId, onToggle, onNavigate }: NavRailProps) {
  return (
    <aside className={collapsed ? "nav-rail is-collapsed" : "nav-rail"}>
      <nav aria-label="Primary terminal navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeId;
          return (
            <button
              className={isActive ? "nav-item is-active" : "nav-item"}
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => onNavigate(item)}
            >
              <Icon size={16} strokeWidth={1.7} aria-hidden />
              {!collapsed && <span>{item.label}</span>}
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
