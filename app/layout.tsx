import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
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
  title: "TALLY — Which Artists Should Your Next Beat Target?",
  description:
    "Describe your beat. TALLY tells you which artists to attach it to, how to title it, and which lanes small channels are actually winning on YouTube right now. Free Lane Check, no signup required.",
  keywords: [
    "type beat lane check",
    "youtube beat producer",
    "type beat SEO",
    "youtube music producer tool",
    "beat title optimizer",
    "youtube growth for producers",
  ],
  authors: [{ name: "TALLY", url: "https://tallyagc.com" }],
  metadataBase: new URL("https://tallyagc.com"),
  openGraph: {
    title: "TALLY — Which Artists Should Your Next Beat Target?",
    description:
      "Tell us what your beat sounds like. We'll tell you which artists to attach it to, how to title it, and which lanes small channels are actually winning right now.",
    url: "https://tallyagc.com",
    siteName: "TALLY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TALLY — Which Artists Should Your Next Beat Target?",
    description:
      "Free Lane Check: which artists to target, how to title it, and who's winning that lane right now — based on real YouTube data.",
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
      <body className="min-h-full flex flex-col bg-[#0a0a0a]">{children}</body>
    </html>
  );
}
