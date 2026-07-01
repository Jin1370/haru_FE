import { create } from 'zustand';

interface CatState {
  celebrating: boolean;
  celebrate: () => void;
  reset: () => void;
}

export const useCatStore = create<CatState>((set) => ({
  celebrating: false,
  celebrate: () => set({ celebrating: true }),
  reset: () => set({ celebrating: false }),
}));
