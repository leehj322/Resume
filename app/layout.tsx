import type { Metadata } from "next";
import { fontVariables } from "@/_app/fonts";
import "@/_app/styles/globals.css";

export const metadata: Metadata = {
  title: "Resume",
  description: "Resume",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
