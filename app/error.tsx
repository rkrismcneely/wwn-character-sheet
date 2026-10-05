"use client";

import { useEffect } from "react";
import { reportClientError } from "./error-reporter-runtime";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError("react-boundary", error);
  }, [error]);

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "1.5rem" }}>
      <h1>Something went wrong</h1>
      <p>
        Tales Without End hit an unexpected problem. Your character and campaign data were not included in the error report.
      </p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
