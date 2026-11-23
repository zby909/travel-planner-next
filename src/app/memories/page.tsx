import { permanentRedirect } from "next/navigation";

// 旧故事入口统一回到新的旅行足迹目录，避免收藏链接失效。
export default function MemoriesRedirect(): never {
  permanentRedirect("/visited");
}
