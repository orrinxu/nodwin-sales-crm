import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme/theme-provider";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Nodwin Sales CRM",
  description: "Sales CRM for Nodwin",
};

// The app is fully auth-gated and renders per-request data (every page calls
// requireUser, which reads cookies and validates env). Nothing should be
// statically prerendered — otherwise `next build` evaluates env/data access at
// build time (no secrets present) and fails. Force all routes to be dynamic.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>
      </body>
    </html>
  );
}
