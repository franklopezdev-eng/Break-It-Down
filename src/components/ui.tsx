/** Small, reusable interface primitives styled to Apple's controls. */

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';

// ── IconButton ───────────────────────────────────────────────────────────────

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'plain' | 'glass' | 'primary' | 'tinted';
  children: ReactNode;
}

export function IconButton({ label, size = 'md', tone = 'glass', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('icon-btn', `icon-btn--${size}`, `icon-btn--${tone}`, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── SegmentedControl ─────────────────────────────────────────────────────────

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange(value: T): void;
  options: readonly SegmentOption<T>[];
  label: string;
  className?: string;
  block?: boolean;
}

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  block,
}: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    // Move focus with the selection (roving tabindex).
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[(index + step + options.length) % options.length]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('segmented', block && 'segmented--block', className)}
      style={{ '--count': options.length, '--index': index } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <span className="segmented__thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          title={option.title ?? option.label}
          className="segmented__item"
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span className="segmented__label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Slider ───────────────────────────────────────────────────────────────────

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  label: string;
  valueText?: string;
  className?: string;
}

export function Slider({ value, min, max, step, onChange, label, valueText, className }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={cx('slider', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ '--pct': `${pct}%` } as CSSProperties}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

// ── Switch & setting rows ────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/** A labelled row with a switch — the iOS Settings idiom. */
export function ToggleRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}) {
  return (
    <div className="setting" data-disabled={disabled || undefined}>
      <div className="setting__text">
        <div className="setting__title">{title}</div>
        {hint && <div className="setting__hint">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  format = String,
}: {
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  label: string;
  format?(value: number): string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <IconButton label={`Decrease ${label}`} size="sm" tone="plain" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>−</span>
      </IconButton>
      <output className="stepper__value">{format(value)}</output>
      <IconButton label={`Increase ${label}`} size="sm" tone="plain" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>+</span>
      </IconButton>
    </div>
  );
}

// ── Popover ──────────────────────────────────────────────────────────────────

interface TriggerProps {
  open: boolean;
  toggle(): void;
  /** Spread onto the trigger button. */
  aria: { 'aria-haspopup': 'dialog'; 'aria-expanded': boolean };
}

interface PopoverProps {
  label: string;
  trigger(props: TriggerProps): ReactNode;
  children: ReactNode | ((api: { close(): void }) => ReactNode);
  align?: 'start' | 'end';
  placement?: 'top' | 'bottom';
  className?: string;
}

export function Popover({ label, trigger, children, align = 'end', placement = 'bottom', className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="popover-anchor" ref={root}>
      {trigger({
        open,
        toggle: () => setOpen((o) => !o),
        aria: { 'aria-haspopup': 'dialog', 'aria-expanded': open },
      })}
      {open && (
        <div role="dialog" aria-label={label} className={cx('popover', `popover--${align}`, `popover--${placement}`, className)}>
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
