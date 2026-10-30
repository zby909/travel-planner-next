import type { Metadata } from "next";
import "./globals.css";
import "./homepage.css";
export const metadata: Metadata = {
  title: "旅行档案｜目的地、行程与足迹管理",
  description: "管理旅行目的地、预算、行程、到访足迹和旅行记忆。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
