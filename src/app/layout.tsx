import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Besorah · Organic Video Lab",
  description: "Laboratório de conteúdo orgânico com agentes, HeyGen e Remotion.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
