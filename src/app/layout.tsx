import type { Metadata, Viewport } from "next";
import { getPublicSiteName } from "@/lib/public-site";
import "./globals.css";

export function generateMetadata(): Metadata {
  return { title: getPublicSiteName(), description: "Independent product reviews." };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
