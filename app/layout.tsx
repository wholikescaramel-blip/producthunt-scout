import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProductHunt Partnership Scout",
  description: "Ranked outreach list of new Product Hunt launches from the last 7 days.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
