import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chapter leadership roster | BNI 1-to-1 Matcher",
  description: "Leadership-only roster update for the chapter's 1-to-1 match.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: undefined },
  openGraph: null,
  twitter: null,
};

export default function LeadershipLayout({ children }: { children: React.ReactNode }) {
  return children;
}
