import { ColorSchemeScript, createTheme, MantineProvider } from "@mantine/core";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { siteConfig } from "@/lib/config";
import { buildSocialMetadata, getSocialBaseUrl } from "@/lib/social-previews";
import "@mantine/core/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rootSocialMetadata = buildSocialMetadata("/");

export const metadata: Metadata = {
  ...rootSocialMetadata,
  metadataBase: new URL(getSocialBaseUrl()),
  applicationName: siteConfig.appName,
  title: {
    default: `${siteConfig.name} ${siteConfig.appName}`,
    template: `%s | ${siteConfig.appName}`,
  },
  category: "developer operations",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/icons/devhub-icon-192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: "/icons/devhub-icon-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/devhub-logomark.svg",
        color: "#228be6",
      },
    ],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: siteConfig.appName,
    statusBarStyle: "black-translucent",
  },
};

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), monospace",
  headings: {
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
          <Toaster theme="dark" richColors />
        </MantineProvider>
      </body>
    </html>
  );
}
