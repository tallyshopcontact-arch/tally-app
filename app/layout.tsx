import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for hero headlines + score numerals only (see globals.css --font-display).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "TALLY — Your Upload Kit for Every Beat",
  description:
    "Name your beat, pick the artists you hear on it, and get your Upload Kit — the title, tags, and packaging that's winning on YouTube right now. Free Upload Kit, no signup required.",
  keywords: [
    "type beat upload kit",
    "youtube beat producer",
    "type beat SEO",
    "youtube music producer tool",
    "beat title optimizer",
    "youtube growth for producers",
  ],
  authors: [{ name: "TALLY", url: "https://tallyagc.com" }],
  metadataBase: new URL("https://tallyagc.com"),
  openGraph: {
    title: "TALLY — Your Upload Kit for Every Beat",
    description:
      "Name it, pick the artists you hear on it, and get your Upload Kit — the title, tags, and packaging that's winning in that lane right now.",
    url: "https://tallyagc.com",
    siteName: "TALLY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TALLY — Your Upload Kit for Every Beat",
    description:
      "Free Upload Kit: the title, tags, and packaging that's winning in your lane right now — based on real YouTube data.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0a0a0a]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
