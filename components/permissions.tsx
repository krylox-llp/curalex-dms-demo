"use client";

import { createContext, useContext } from "react";
import type { Permission } from "@/lib/roles";

const PermissionsContext = createContext<readonly Permission[]>([]);

/** Makes the signed-in user's permissions available to client components (set by AppShell). */
export function PermissionsProvider({ permissions, children }: { permissions: readonly Permission[]; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

/** True when the current user has the permission. UI only; the database enforces it regardless. */
export function useCan(permission: Permission) {
  return useContext(PermissionsContext).includes(permission);
}
