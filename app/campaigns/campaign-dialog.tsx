"use client";

import { useEffect, useRef } from "react";

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
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="campaign-dialog-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
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
