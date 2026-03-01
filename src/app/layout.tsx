import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MantineProvider, ColorSchemeScript, createTheme } from "@mantine/core";
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

export const metadata: Metadata = {
  title: "DevHub - PPT Dashboard",
  description: "Pay-Per-Task tracking for our developer team",
};

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontFamilyMonospace: 'var(--font-geist-mono), monospace',
  headings: {
    fontFamily: 'var(--font-geist-sans), sans-serif',
  },
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <ColorSchemeScript defaultColorScheme="dark" />
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          style={{ fontFamily: 'var(--font-geist-sans)' }}
        >
          <MantineProvider theme={theme} defaultColorScheme="dark">
            {children}
          </MantineProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}