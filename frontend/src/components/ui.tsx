import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
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

export function Eyebrow({ className, ...props }: EyebrowProps) {
  return <span className={classNames("eyebrow", className)} {...props} />;
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
