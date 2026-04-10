import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
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
          <div className="h-4 w-px bg-gray-200" />
          <Link
            href="/services"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Serviços
          </Link>
          <Link
            href="/contents"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Conteúdos
          </Link>
          <Link
            href="/generate"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Gerar página
          </Link>
        </nav>
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
