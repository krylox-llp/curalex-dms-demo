import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Inter: neutral grotesk with tabular figures; the closest open alternative to the
// commercial NB International used on vaadin.com.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute URLs for link previews (opengraph-image.jpg / twitter-image.jpg in this folder).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://dms.krylox.ai"),
  title: "CuraLex - DMS",
  description: "Document sharing for pharma manufacturers and exporters",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
