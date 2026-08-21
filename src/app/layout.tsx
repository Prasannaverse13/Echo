import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Echo — Show it once. Run it forever.",
  description:
    "Echo watches you do a workflow once, then re-runs it autonomously across massive datasets, in the background, 24/7. Built on Gemini and Google Cloud.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper-white text-obsidian">
        {children}
      </body>
    </html>
  );
}
