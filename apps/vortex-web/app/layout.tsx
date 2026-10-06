import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vortex AI",
  description: "Multi-model agent workspace for reasoning, files, tools and FPL intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
