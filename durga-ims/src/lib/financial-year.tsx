"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getCurrentFY } from "@/lib/fy";

const SESSION_KEY = "durga-ims-active-fy";
const FY_PATTERN = /^\d{4}-\d{4}$/;

interface FYContextValue {
  activeFY: string;
  setActiveFY: (fy: string) => void;
  isCurrentFY: boolean;
}

const FYContext = createContext<FYContextValue | null>(null);

export function FYProvider({ children }: { children: ReactNode }) {
  const currentFY = getCurrentFY();
  const [activeFY, setActiveFY] = useState(currentFY);

  // Restore from sessionStorage after hydration (tab-scoped; resets on new tab/close)
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && FY_PATTERN.test(stored)) setActiveFY(stored);
  }, []);

  // Persist every change to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, activeFY);
  }, [activeFY]);

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
