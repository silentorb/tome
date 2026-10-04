import { createContext, useContext, type ReactNode } from "react";
import type { Registry } from "imp-registry";

export type CreateRegistry = () => Registry;

const ImpFlowRegistryContext = createContext<CreateRegistry | null>(null);

export function ImpFlowRegistryProvider({
  createRegistry,
  children,
}: {
  createRegistry: CreateRegistry;
  children: ReactNode;
}) {
  return (
    <ImpFlowRegistryContext.Provider value={createRegistry}>
      {children}
    </ImpFlowRegistryContext.Provider>
  );
}

export function useCreateRegistry(): CreateRegistry {
  const createRegistry = useContext(ImpFlowRegistryContext);
  if (!createRegistry) {
    throw new Error("ImpFlowEditor: createRegistry is required (missing ImpFlowRegistryProvider)");
  }
  return createRegistry;
}
