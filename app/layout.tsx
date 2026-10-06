import type { Metadata } from "next";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
import "@fontsource/jost/700.css";
import "./globals.css";
import "./app-header.css";
import "./character-creation-review.css";
import "./map-performance.css";
import "./map-layout-polish.css";
import "./map-tab-dock-polish.css";
import "./drawer-accessibility.css";
import "./character-responsive-polish.css";
import "./character-compact-field-polish.css";
import "./footer-drawer-polish.css";
import "./spell-casting-controls.css";
import { ThemeProvider } from "./theme-provider";
import { SiteFooter } from "./site-footer";
import { MapUiRuntime } from "./map-ui-runtime";
import { MapTokenDragGhostRuntime } from "./map-token-drag-ghost-runtime";
import { ErrorReporterRuntime } from "./error-reporter-runtime";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: "Tales Without End - An Interactive Worlds Without Number Character Folio",
  description: "Create, manage, and share Worlds Without Number characters in a polished interactive folio.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Tales Without End",
    description: "Create, manage, and share Worlds Without Number characters in a polished interactive folio.",
    type: "website",
    url: "/",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const theme = localStorage.getItem("wwn-display-theme"); document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light"; document.documentElement.style.colorScheme = document.documentElement.dataset.theme; } catch { document.documentElement.dataset.theme = "light"; }`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ErrorReporterRuntime />
          <MapUiRuntime />
          <MapTokenDragGhostRuntime />
          <div className="site-shell">
            <div className="site-main">{children}</div>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
