import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fontHeading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Clairtus | Le 1er Bot WhatsApp Tiers de Confiance en RDC",
  description:
    "Vendez et achetez en toute sécurité. Bloquez les fonds via Mobile Money, livrez en confiance et recevez vos paiements instantanément grâce à notre bot WhatsApp.",
  openGraph: {
    title: "Clairtus | Le 1er Bot WhatsApp Tiers de Confiance en RDC",
    description:
      "Vendez et achetez en toute sécurité. Bloquez les fonds via Mobile Money, livrez en confiance et recevez vos paiements instantanément grâce à notre bot WhatsApp.",
    type: "website",
    locale: "fr_CD",
    siteName: "Clairtus",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clairtus | Le 1er Bot WhatsApp Tiers de Confiance en RDC",
    description:
      "Vendez et achetez en toute sécurité avec Mobile Money et notre bot WhatsApp.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className={`min-h-full flex flex-col font-sans antialiased ${fontHeading.variable}`}>
        {children}
      </body>
    </html>
  );
}
