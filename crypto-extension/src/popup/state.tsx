import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Account, Settings, WalletStatus } from "../shared/messages";
import { call, onUiEvent } from "./api";

export interface AppState {
  status: WalletStatus;
  accounts: Account[];
  selectedIndex: number;
  settings: Settings;
  pendingApprovals: number;
}

interface Ctx {
  state: AppState | null;
  account: Account | undefined;
  refresh: () => Promise<void>;
}

const StateCtx = createContext<Ctx>({ state: null, account: undefined, refresh: async () => {} });
export const useApp = () => useContext(StateCtx);

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const refresh = useCallback(async () => setState(await call<AppState>("getState")), []);
  useEffect(() => {
    refresh();
    return onUiEvent(() => refresh());
  }, [refresh]);

  // Apply the theme setting.
  useEffect(() => {
    const pref = state?.settings.theme ?? "system";
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme = pref === "system" ? (mq.matches ? "dark" : "light") : pref);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [state?.settings.theme]);

  const account = state?.accounts.find((a) => a.index === state.selectedIndex) ?? state?.accounts[0];
  return <StateCtx.Provider value={{ state, account, refresh }}>{children}</StateCtx.Provider>;
}

/* ------------------------------ tiny router ------------------------------ */

export interface Route {
  name: string;
  params?: Record<string, any>;
}

const RouterCtx = createContext<{ route: Route; go: (r: Route) => void; back: () => void }>({
  route: { name: "home" },
  go: () => {},
  back: () => {},
});
export const useRouter = () => useContext(RouterCtx);

export function RouterProvider({ initial, children }: { initial: Route; children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const go = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((r: Route) => setStack([r]), []);
  const route = stack[stack.length - 1];
  return <RouterCtx.Provider value={{ route, go: (r) => (r.params?.replace ? reset(r) : go(r)), back }}>{children}</RouterCtx.Provider>;
}
