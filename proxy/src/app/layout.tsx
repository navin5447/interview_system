import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Media Proctoring Module Demo",
  description: "Browser-based video and audio proctoring demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
