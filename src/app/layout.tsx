import type { Metadata } from "next";
import "./globals.css";
import "./homepage.css";
import "./journal.css";
import "./studio.css";
import "./cinematic.css";
import "./motion.css";
export const metadata: Metadata = {
  title: "下一站｜两个人的旅行手记",
  description: "记录去过的地方，也收藏未来想一起去的风景。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
