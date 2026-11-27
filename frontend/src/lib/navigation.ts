function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function scrollToPageTop(): void {
  window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior() });
}

export function revealAndFocus(
  element: HTMLElement | null,
  selector = "input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
): void {
  if (!element) return;
  element.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  element.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
}
