import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useToasts } from '../state/toast';

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info } as const;

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className="toast" data-tone={t.tone}>
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
