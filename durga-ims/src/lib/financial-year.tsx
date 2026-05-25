"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getCurrentFY } from "@/lib/fy";

interface FYContextValue {
  activeFY: string;
  setActiveFY: (fy: string) => void;
  isCurrentFY: boolean;
}

const FYContext = createContext<FYContextValue | null>(null);

export function FYProvider({ children }: { children: ReactNode }) {
  const currentFY = getCurrentFY();
  const [activeFY, setActiveFY] = useState(currentFY);

  return (
    <FYContext.Provider value={{ activeFY, setActiveFY, isCurrentFY: activeFY === currentFY }}>
      {children}
    </FYContext.Provider>
  );
}

export function useFY(): FYContextValue {
  const ctx = useContext(FYContext);
  if (!ctx) throw new Error("useFY must be used inside FYProvider");
  return ctx;
}
