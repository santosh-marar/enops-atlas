import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProviders } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "enops.dev",
  description:
    "Enops.dev is a AI-powered IDE to design, visualize, and optimize database schemas and schemas exploration tool. It uses AI model to generate schemas from natural language, and then visualize and explore and export the schema using ai into Prisma, Drizzle, and DBML.",
  keywords:
    "AI, Schema, Visualization, Exploration, Postgres, Drizzle, Prisma, DBML, xyflow, enops, enops.dev, enops.dev.com",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProviders>
          <Toaster richColors position="top-right" />
          {children}
        </ThemeProviders>
        <Analytics />
      </body>
    </html>
  );
}
