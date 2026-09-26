import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
}

export const useToasts = create<ToastState>(() => ({ toasts: [] }));

let nextId = 1;

export function toast(message: string, tone: ToastTone = 'info', durationMs = 3600): void {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
  window.setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id: number): void {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
