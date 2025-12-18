import React from "react";
import "./globals.css";

export const metadata = {
  icons: "/icon.svg",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="container py-6">{children}</div>
      </body>
    </html>
  );
}
