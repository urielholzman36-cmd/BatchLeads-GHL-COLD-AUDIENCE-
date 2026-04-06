import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "VO360 Outreach",
  description: "Lead outreach for home remodeling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-gray-900">
              VO360 Outreach
            </Link>
            <Link
              href="/log"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Send Log
            </Link>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
