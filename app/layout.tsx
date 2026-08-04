import type { Metadata } from "next";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
import "@fontsource/jost/700.css";
import "./globals.css";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: "Tales Without End | Worlds Without Number Character Sheet",
  description: "An interactive Worlds Without Number character folio.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Tales Without End",
    description: "An interactive Worlds Without Number character folio.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
