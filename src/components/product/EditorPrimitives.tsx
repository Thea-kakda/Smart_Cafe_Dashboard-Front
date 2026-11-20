/**
 * Shared, accessible form primitives for the product editor sections
 * (Slice 4A §9/§14). They exist so every field in the editor gets the same
 * label/announcement behaviour instead of each tab inventing its own:
 *
 *  - the control is always associated to its `<label>` by id, so clicking the
 *    label and screen-reader announcement both work;
 *  - an error is referenced with `aria-describedby` and announced with
 *    `aria-invalid`, and never conveyed by colour alone (the message is text);
 *  - a help line is likewise wired through `aria-describedby`, so it is read
 *    with the control rather than being visual-only decoration;
 *  - banners carry `role="status"` / `role="alert"` so asynchronous results
 *    (a save finishing, a conflict arriving) are announced without moving focus.
 */
import React, { useId } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export const CONTROL_CLASS =
  'w-full rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-white dark:bg-[#201D19] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40 disabled:opacity-60';

export interface FieldProps {
  label: string;
  /** Operator-facing help text; rendered and announced, never colour-only. */
  hint?: string;
  error?: string;
  /** Marks the label with a visible asterisk plus a screen-reader equivalent. */
  required?: boolean;
  children: (ids: { id: string; describedBy?: string }) => React.ReactNode;
}

/**
 * Label + control + error + hint wrapper. The caller receives the generated ids
 * and must spread them onto the real control, which keeps the association
 * explicit rather than relying on nesting order.
 */
export const Field: React.FC<FieldProps> = ({ label, hint, error, required, children }) => {
  const base = useId();
  const id = `${base}-input`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-[#C48A56]"> *</span>
            <span className="sr-only"> required</span>
          </>
        )}
      </label>
      {children({ id, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-[11px] font-semibold text-[#DC2626]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
};

export interface BannerProps {
  tone: 'ok' | 'warn' | 'bad' | 'info';
  text: string;
  /** `alert` for a failure that needs attention, `status` for a result. */
  role?: 'status' | 'alert';
  onDismiss?: () => void;
  dismissLabel?: string;
}

const TONE_CLASS: Record<BannerProps['tone'], string> = {
  ok: 'border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]',
  warn: 'border-[#B45309]/30 bg-[#B45309]/10 text-[#B45309]',
  bad: 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]',
  info: 'border-[#C48A56]/30 bg-[#C48A56]/10 text-[#8A5A2B] dark:text-[#D4A87A]',
};

export const Banner: React.FC<BannerProps> = ({ tone, text, role = 'status', onDismiss, dismissLabel }) => (
  <div
    role={role}
    aria-live={role === 'alert' ? 'assertive' : 'polite'}
    className={`flex items-start justify-between gap-2 rounded-xl border p-3 text-xs font-semibold ${TONE_CLASS[tone]}`}
  >
    <span className="flex items-start gap-2">
      {tone === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        : tone === 'info' ? <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
          : <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />}
      {text}
    </span>
    {onDismiss && (
      <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="shrink-0 font-bold hover:underline">
        ✕
      </button>
    )}
  </div>
);

/** Section container with a real heading, so the tab panel has structure. */
export const SectionCard: React.FC<{ title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title, description, actions, children,
}) => (
  <section className="space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
      <div>
        <h4 className="text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{title}</h4>
        {description && <p className="text-xs text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
    {children}
  </section>
);

/**
 * A checkbox as a real labelled control (the native input carries the
 * accessible name, so the whole line is clickable and keyboard-reachable).
 */
export const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}> = ({ label, checked, onChange, disabled, hint }) => {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={`flex items-center gap-2 text-xs font-semibold cursor-pointer ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-[#C48A56] h-4 w-4"
        />
        {label}
      </label>
      {hint && <p className="text-[11px] text-[#6E5E4F] dark:text-[#A89D94] pl-6">{hint}</p>}
    </div>
  );
};

/**
 * A caption for a composite control (an upload widget, a schedule grid) where
 * no single input can own the label. Using a `<label htmlFor>` there would
 * point at nothing, so this renders a real text caption plus a labelled group.
 */
export const GroupLabel: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="space-y-1">
      <span id={id} className="block text-xs font-semibold text-[#1C1A19] dark:text-[#F5F3F0]">{text}</span>
      {children}
    </div>
  );
};

/** A read-only value that must still be announced as such (not a fake input). */
export const StaticValue: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#F7F5F2] dark:bg-[#26221F] px-3 py-2">
    <span className="block text-[10px] uppercase tracking-wide text-[#8C7C6B]">{label}</span>
    <span className="block text-sm font-bold text-[#1C1A19] dark:text-[#F5F3F0]">{value}</span>
    {hint && <span className="block text-[11px] text-[#6E5E4F] dark:text-[#A89D94] mt-0.5">{hint}</span>}
  </div>
);
