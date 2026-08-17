import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Presell OS",
  description: "English-first affiliate presell factory. Same URL for ads and visitors.",
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
