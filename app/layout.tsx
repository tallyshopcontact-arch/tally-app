import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TALLY — YouTube Packaging for Beat Producers",
  description:
    "TALLY helps beat producers package every upload for maximum YouTube discovery. Get optimized titles, descriptions, tags, and thumbnail ideas based on real niche data. $19.99/month — 7-day free trial.",
  keywords: [
    "youtube beat producer",
    "type beat SEO",
    "beat upload kit",
    "youtube music producer tool",
    "beat title optimizer",
    "youtube growth for producers",
  ],
  authors: [{ name: "TALLY", url: "https://tallyagc.com" }],
  metadataBase: new URL("https://tallyagc.com"),
  openGraph: {
    title: "TALLY — YouTube Packaging for Beat Producers",
    description:
      "Paste your beat details. Get an optimized title, description, tags, and thumbnail ideas based on what's working in your niche right now.",
    url: "https://tallyagc.com",
    siteName: "TALLY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TALLY — YouTube Packaging for Beat Producers",
    description:
      "Optimize every beat upload for YouTube discovery. Titles, descriptions, tags, and thumbnails — all based on real niche data.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0a0a0a]">{children}</body>
    </html>
  );
}
