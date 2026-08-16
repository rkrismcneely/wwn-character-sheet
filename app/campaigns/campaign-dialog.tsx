"use client";

import { useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function CampaignDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialogElement = dialog.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (!dialogElement) return;
    const dialogNode = dialogElement;

    const focusableElements = () => Array.from(
      dialogNode.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter(element => element.getAttribute("aria-hidden") !== "true");

    if (!dialogNode.contains(document.activeElement)) {
      const preferredFocus = dialogNode.querySelector<HTMLElement>("[autofocus]")
        ?? focusableElements()[0]
        ?? closeButton.current;
      preferredFocus?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        closeButton.current?.focus();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogNode.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="campaign-dialog-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialog}
        className="campaign-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-dialog-title"
        aria-describedby={description ? "campaign-dialog-description" : undefined}
      >
        <header>
          <div>
            <p className="campaign-kicker">THE COMPANY ARCHIVE</p>
            <h2 id="campaign-dialog-title">{title}</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="campaign-dialog-close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </header>
        {description && <p id="campaign-dialog-description" className="campaign-dialog-description">{description}</p>}
        {children}
      </section>
    </div>
  );
}
