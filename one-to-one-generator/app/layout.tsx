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

const title = "One-to-One Partner Matcher for BNI Chapters | ClearSky Digital";
const description =
  "Drop in your chapter roster and get this week's one-to-one pairs, with repeats avoided. Your roster stays in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL("https://apps.cscloud.digital"),
  title,
  description,
  alternates: { canonical: "/chaptertools" },
  openGraph: {
    title,
    description,
    url: "/chaptertools",
    siteName: "ClearSky Digital",
    type: "website",
  },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
