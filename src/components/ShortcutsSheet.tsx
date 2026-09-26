import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SHORTCUT_GROUPS } from '../lib/shortcuts';
import { setShortcutsOpen, useUI } from '../state/ui';
import { IconButton } from './ui';

/** A modal sheet listing every keyboard shortcut. */
export function ShortcutsSheet() {
  const open = useUI((s) => s.shortcutsOpen);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="scrim" onPointerDown={(event) => event.target === event.currentTarget && setShortcutsOpen(false)}>
      <div
        ref={sheet}
        className="sheet glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
      >
        <header className="sheet__head">
          <h2 id="shortcuts-title" className="t-title2">
            Keyboard Shortcuts
          </h2>
          <IconButton label="Close" size="sm" tone="glass" onClick={() => setShortcutsOpen(false)}>
            <X size={16} strokeWidth={2.4} />
          </IconButton>
        </header>
        <div className="sheet__body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcuts">
              <h3 className="popover__heading">{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.label} className="shortcut">
                    <dt>{item.label}</dt>
                    <dd>
                      {item.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
