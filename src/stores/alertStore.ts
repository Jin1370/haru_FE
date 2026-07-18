import { create } from 'zustand';
import type { AlertCardVariant } from '@/components/ui/AlertCard';

// AlertSpec mirrors the surface area of `Alert.alert(title, msg, [cancel, action])`
// so call sites can be migrated one-to-one.
export type AlertSpecVariant = AlertCardVariant;

export interface AlertSpec {
  id: string;
  variant: AlertSpecVariant;
  title: string;
  message?: string;
  /** Primary button label. Defaults to `common.ok` resolved by AlertHost. */
  confirmText?: string;
  /** When set, a secondary cancel button is rendered with this label. */
  cancelText?: string;
  /**
   * Render an X (close) button at the card's top-right that dismisses the
   * alert (fires onCancel). Use as a lightweight alternative to a labelled
   * cancel button — e.g. a single-CTA prompt the user can simply close.
   */
  closable?: boolean;
  /** Renders the primary button in the error/danger color. */
  destructive?: boolean;
  /** Stack actions vertically (primary on top) instead of side-by-side. */
  stackedActions?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertState {
  queue: AlertSpec[];
  show: (spec: Omit<AlertSpec, 'id'>) => string;
  dismiss: (id?: string) => void;
  clear: () => void;
}

let nextId = 0;

export const useAlertStore = create<AlertState>((set) => ({
  queue: [],
  show: (spec) => {
    const id = String(++nextId);
    set((s) => ({ queue: [...s.queue, { ...spec, id }] }));
    return id;
  },
  dismiss: (id) =>
    set((s) => {
      if (s.queue.length === 0) return s;
      if (!id) return { queue: s.queue.slice(1) };
      return { queue: s.queue.filter((a) => a.id !== id) };
    }),
  clear: () => set({ queue: [] }),
}));

// Imperative helper for non-component contexts (services, async catch blocks).
// Components can also use the store hook directly.
export const showAlert = (spec: Omit<AlertSpec, 'id'>): string =>
  useAlertStore.getState().show(spec);
