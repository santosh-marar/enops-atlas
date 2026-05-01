import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { ThemeProviders } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "enops.dev",
  description:
    "Enops.dev is a AI-powered platform to design, visualize, optimize, and export database schemas. It uses AI model to generate schemas from natural language, and then visualize and explore and export the schema using ai into Prisma, Drizzle, and DBML.",
  keywords:
    "AI, Schema, Visualization, Exploration, Postgres, Drizzle, Prisma, DBML, xyflow, enops, enops.dev, enops.dev.com",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={cn(geist.variable, geistMono.variable)} lang="en">
      <body className={cn("font-sans antialiased")}>
        <ThemeProviders>
          <Toaster position="top-right" richColors />
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProviders>
        <Analytics />
      </body>
    </html>
  );
}
