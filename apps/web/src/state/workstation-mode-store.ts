import { create } from "zustand";

export type AppMode = "NORMAL" | "CUSTOMER_WORKSTATION";

interface WorkstationModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const STORAGE_KEY = "laundryangel.app-mode";

function loadMode(): AppMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "CUSTOMER_WORKSTATION"
      ? "CUSTOMER_WORKSTATION"
      : "NORMAL";
  } catch {
    return "NORMAL";
  }
}

export const useWorkstationModeStore = create<WorkstationModeState>((set) => ({
  mode: loadMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Continue with in-memory state if storage is unavailable.
    }

    set({ mode });
  },
}));
