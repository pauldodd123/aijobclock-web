import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfairDisplay = Playfair_Display({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "700", "900"] });
const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://aijobclock.com"),
  title: { default: "AI Job Clock", template: "%s | AI Job Clock" },
  description:
    "Real-time AI job displacement tracker. See how automation is reshaping the global workforce across technology, finance, healthcare, manufacturing, and more.",
  alternates: {
    types: {
      "application/rss+xml": "/api/rss",
    },
  },
  openGraph: {
    siteName: "AI Job Clock",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AI Job Clock" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>{children}</QueryProvider>
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
