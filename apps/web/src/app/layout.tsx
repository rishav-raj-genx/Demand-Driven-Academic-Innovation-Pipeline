import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineSyncProvider } from "@/components/pwa/OfflineSyncProvider";

export const metadata: Metadata = {
  title: "SIH26043 - Demand-Driven Academic Innovation Pipeline",
  description:
    "Bridging academic research and industrial enterprise demand through automated matching and PLM execution.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <OfflineSyncProvider>{children}</OfflineSyncProvider>
      </body>
    </html>
  );
}
