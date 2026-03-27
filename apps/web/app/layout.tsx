import type { Metadata } from "next";
import { Geist_Mono, Geist } from "next/font/google";
import "./globals.css";
import { ThemeProviders } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

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
    <html lang="en" className={cn(geist.variable, geistMono.variable)}>
      <body className={cn("font-sans antialiased")}>
        <ThemeProviders>
          <Toaster richColors position="top-right" />
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProviders>
        <Analytics />
      </body>
    </html>
  );
}
