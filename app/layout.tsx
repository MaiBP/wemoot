import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeMoot | Organiza tu fútbol",
  description: "Asistente inteligente para organizar eventos de fútbol.",
};

export const viewport: Viewport = {
  themeColor: "#000300",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
