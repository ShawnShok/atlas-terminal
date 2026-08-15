import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { BRAND } from "@/lib/brand";
import "./globals.css";
import "@/components/charts/charts.css";
import "@/components/stocks/stocks.css";
import "@/components/research/research.css";

const title = `${BRAND.productName} — ${BRAND.descriptor}`;
const description = "A private, keyboard-first research terminal for U.S. equities, options, news, and corporate catalysts.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title,
    description,
    applicationName: BRAND.productName,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: BRAND.productName, images: [{ url: imageUrl, width: 1733, height: 907, alt: `${BRAND.productName} private financial research interface` }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07090c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
