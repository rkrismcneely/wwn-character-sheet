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
import "./character-responsive-polish.css";
import "./character-compact-field-polish.css";
import "./footer-drawer-polish.css";
import { ThemeProvider } from "./theme-provider";
import { SiteFooter } from "./site-footer";
import { MapUiRuntime } from "./map-ui-runtime";
import { MapTokenDragGhostRuntime } from "./map-token-drag-ghost-runtime";

export const metadata: Metadata = {
  title: "Tales Without End - An Interactive Worlds Without Number Character Folio",
  description: "A complete editable character folio for Worlds Without Number.",
  icons: { icon: "/assets/tales-without-end-logo.svg" },
  openGraph: {
    title: "Tales Without End - An Interactive Worlds Without Number Character Folio",
    description: "A complete editable character folio for Worlds Without Number.",
    images: [{ url: "/assets/tales-without-end-social-card.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var saved=localStorage.getItem('twe-theme');var theme=saved==='dark'||saved==='light'?saved:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light';}})();`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <ThemeProvider>
          <div className="site-shell">
            <main className="site-shell-main">{children}</main>
            <SiteFooter />
          </div>
          <MapUiRuntime />
          <MapTokenDragGhostRuntime />
        </ThemeProvider>
      </body>
    </html>
  );
}
