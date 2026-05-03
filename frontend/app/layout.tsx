import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "@/contexts/auth-context";
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
  title: "DMS — Document Management System",
  description: "Upload, organize, and share documents in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              fontSize: "14px",
              padding: "12px 16px",
              borderRadius: "8px",
              fontWeight: 500,
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            },
            success: {
              style: { background: "#10b981", color: "white" },
              iconTheme: { primary: "white", secondary: "#10b981" },
            },
            error: {
              duration: 5000,
              style: { background: "#ef4444", color: "white" },
              iconTheme: { primary: "white", secondary: "#ef4444" },
            },
          }}
        />
      </body>
    </html>
  );
}
