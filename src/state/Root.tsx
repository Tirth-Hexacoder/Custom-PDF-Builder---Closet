import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { Store } from "./Store";

const StoreContext = createContext<Store | null>(null);

export function Root({ children }: { children: ReactNode }) {
  const store = useMemo(() => new Store(), []);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("Store is not available. Make sure Root is mounted.");
  }
  return store;
}
