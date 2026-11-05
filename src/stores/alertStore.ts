import { create } from 'zustand';
import type { AlertCardVariant } from '@/components/ui/AlertCard';

// AlertSpec mirrors the surface area of `Alert.alert(title, msg, [cancel, action])`
// so call sites can be migrated one-to-one.
export type AlertSpecVariant = AlertCardVariant;

export interface AlertSpec {
  id: string;
  variant: AlertSpecVariant;
  /** 생략하면 본문만 보여준다 (AlertCard 참고). */
  title?: string;
  message?: string;
  /** Primary button label. Defaults to `common.ok` resolved by AlertHost. */
  confirmText?: string;
  /** When set, a secondary cancel button is rendered with this label. */
  cancelText?: string;
  /** 본문에서 분홍색으로 강조할 부분. */
  messageHighlight?: string;
  /** 본문 아래에 별사탕 아이콘과 함께 표시할 차감 개수. */
  starCost?: number;
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
