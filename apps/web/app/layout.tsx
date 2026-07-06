import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme/theme-provider";
import {
  THEME_STORAGE_KEY,
  resolveThemeMode,
  themeInjectionVars,
} from "@/lib/theme/theme-object";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Nodwin Sales CRM",
  description: "Sales CRM for Nodwin",
};

// The app is fully auth-gated and renders per-request data (every page calls
// requireUser, which reads cookies and validates env). Nothing should be
// statically prerendered — otherwise `next build` evaluates env/data access at
// build time (no secrets present) and fails. Force all routes to be dynamic.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Flash-free theming: resolve the mode server-side from the cookie the client
  // mirrors on every toggle (falls back to the seeded default "dark"), then
  // render the class AND stamp the brand vars inline so the very first paint
  // already has the correct theme + brand. See lib/theme/theme-object.ts.
  const cookieStore = await cookies();
  const mode = resolveThemeMode(cookieStore.get(THEME_STORAGE_KEY)?.value);
  const brandVars = themeInjectionVars();

  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        "font-sans",
        inter.variable,
        mode === "dark" && "dark",
      )}
      style={brandVars as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>
      </body>
    </html>
  );
}
