import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "下一站，和你去看世界｜私人旅行规划",
  description: "记录我们去过的地方，比较未来旅行目的地、机票样本和双人预算。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
