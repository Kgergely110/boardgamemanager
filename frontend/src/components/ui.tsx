import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useId } from "react";
import { Link, type LinkProps } from "react-router-dom";

type ButtonVariant = "primary" | "quiet" | "danger" | "finish";
type FeedbackTone = "error" | "success" | "info";

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant, ...props }: ButtonProps) {
  const variantClass = variant ? `button button--${variant}` : undefined;
  return <button className={classNames(variantClass, className)} {...props} />;
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
}

export function ButtonLink({ className, variant, ...props }: ButtonLinkProps) {
  const variantClass = variant ? `button button--${variant}` : undefined;
  return <Link className={classNames(variantClass, className)} {...props} />;
}

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "div" | "section";
}

export function Panel({ as: Element = "div", className, ...props }: PanelProps) {
  return <Element className={classNames("ui-panel", className)} {...props} />;
}

export interface EyebrowProps extends HTMLAttributes<HTMLSpanElement> {}

function sentenceCaseLabel(value: string): string {
  if (value !== value.toLocaleUpperCase()) return value;
  const lower = value.toLocaleLowerCase();
  const normalized = lower.replace(/^(\p{L})/u, (letter) => letter.toLocaleUpperCase());
  return normalized.replace(/\b(api|pdf|rpg|url)\b/gi, (acronym) => acronym.toLocaleUpperCase());
}

export function Eyebrow({ children, className, ...props }: EyebrowProps) {
  const label = typeof children === "string" ? sentenceCaseLabel(children) : children;
  return <span className={classNames("eyebrow", className)} {...props}>{label}</span>;
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "small";
  tone?: "default" | "muted";
}

export function Text({ as: Element = "p", className, tone = "default", ...props }: TextProps) {
  return <Element className={classNames("ui-text", `ui-text--${tone}`, className)} {...props} />;
}

export interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

export function Field({ className, label, hint, children, ...props }: FieldProps) {
  return (
    <label className={classNames("ui-field", className)} {...props}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-note">{hint}</span>}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return <input className={classNames("ui-control", className)} {...props} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, ...props }: SelectProps) {
  return <select className={classNames("ui-control", className)} {...props} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={classNames("ui-control", className)} {...props} />;
}

export interface ConfirmationDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  error?: string;
  onDismissError?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  destructive = true,
  error,
  onDismissError,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      className="confirmation-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirmation-dialog"
        role="alertdialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {error && (
          <div className="confirmation-dialog__error" role="alert">
            <span>{error}</span>
            {onDismissError && (
              <Button className="confirmation-dialog__dismiss" onClick={onDismissError} type="button">
                Dismiss
              </Button>
            )}
          </div>
        )}
        <div className="confirmation-dialog__actions">
          <Button autoFocus className="button button--quiet" disabled={busy} onClick={onCancel} type="button">
            {cancelLabel}
          </Button>
          <Button
            className={`button ${destructive ? "button--danger" : "button--primary"}`}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

export interface ListProps extends HTMLAttributes<HTMLElement> {
  as?: "ol" | "ul";
}

export function List({ as: Element = "ul", className, ...props }: ListProps) {
  return <Element className={classNames("ui-list", className)} {...props} />;
}

export interface FeedbackMessageProps {
  message: string;
  tone?: FeedbackTone;
  onDismiss: () => void;
  onRetry?: () => void;
  className?: string;
  retryLabel?: string;
}

export function FeedbackMessage({
  message,
  tone = "error",
  onDismiss,
  onRetry,
  className,
  retryLabel = "Try again",
}: FeedbackMessageProps) {
  return (
    <div
      className={classNames("feedback-message", `feedback-message--${tone}`, className)}
      role={tone === "error" ? "alert" : "status"}
    >
      <span>{message}</span>
      <div className="feedback-message__actions">
        {onRetry && (
          <Button className="feedback-message__action" onClick={onRetry} type="button">
            {retryLabel}
          </Button>
        )}
        <Button
          aria-label="Dismiss message"
          className="feedback-message__action"
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
