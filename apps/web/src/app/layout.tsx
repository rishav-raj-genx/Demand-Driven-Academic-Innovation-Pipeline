import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIH26043 - Demand-Driven Academic Innovation Pipeline",
  description: "Bridging academic research and industrial enterprise demand through automated matching and PLM execution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
