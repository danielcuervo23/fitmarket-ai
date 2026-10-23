import type { NavTab } from "./components/BottomNav";

/** Single place that defines every URL in the app. */
export const ROUTES = {
  splash: "/",
  welcome: "/welcome",
  login: "/login",
  register: "/register",
  setup: {
    profile: "/setup/profile",
    goals: "/setup/goals",
    budget: "/setup/budget",
    supermarkets: "/setup/supermarkets",
    dietary: "/setup/dietary",
    generating: "/setup/generating",
  },
  app: {
    dashboard: "/app/dashboard",
    menu: "/app/menu",
    market: "/app/market",
    chat: "/app/chat",
    settings: "/app/settings",
    history: "/app/history",
  },
} as const;

export function tabToPath(tab: NavTab): string {
  switch (tab) {
    case "dashboard":
      return ROUTES.app.dashboard;
    case "menu":
      return ROUTES.app.menu;
    case "market":
      return ROUTES.app.market;
    case "profile":
      return ROUTES.app.settings;
  }
}
