import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import LogoutButton from "./_components/LogoutButton";
import { GenerationProvider } from "./_components/GenerationProvider";
import { FloatingGenerationStatus } from "./_components/FloatingGenerationStatus";
import SiteSelector from "./_components/SiteSelector";
import SiteAwareNavLinks from "./_components/SiteAwareNavLinks";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BIB SEO Engine",
  description: "Motor de geração programática de páginas SEO",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={`${geistSans.variable} h-full antialiased`}>
      <body className="h-full flex flex-col bg-white text-gray-800" suppressHydrationWarning>
        <nav className="shrink-0 bg-white border-b border-gray-200 px-6 h-14 flex items-center gap-6">
          <span className="font-semibold text-gray-900 text-sm tracking-tight">BIB SEO Engine</span>
          <Suspense fallback={null}>
            <SiteSelector />
            <SiteAwareNavLinks />
          </Suspense>
          <LogoutButton />
        </nav>
        <GenerationProvider>
          <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
          <FloatingGenerationStatus />
        </GenerationProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
