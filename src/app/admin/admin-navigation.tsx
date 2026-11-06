"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type UserRole = string;

const NAV_GROUPS = [
  {
    caption: "WORKSPACE / 工作台",
    items: [{ href: "/admin", label: "工作台" }],
  },
  {
    caption: "CONTENT / 内容管理",
    items: [
      { href: "/admin/destinations", label: "想去的地方" },
      { href: "/admin/places", label: "去过的地方" },
    ],
  },
  {
    caption: "PLANNING / 旅行数据",
    items: [
      { href: "/admin/plans", label: "旅行计划与花费" },
    ],
  },
  {
    caption: "SYSTEM / 系统管理",
    items: [
      { href: "/admin/tokens", label: "AI 助手授权" },
      { href: "/admin/settings", label: "站点设置", adminOnly: true },
      { href: "/admin/users", label: "账号管理", adminOnly: true },
      { href: "/admin/restore", label: "备份恢复", adminOnly: true },
    ],
  },
  {
    caption: "ACCOUNT / 个人账户",
    items: [{ href: "/admin/account", label: "修改密码" }],
  },
] as const;

// 判断当前页面是否属于导航入口，详情页也会高亮对应模块。
function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

// 将后台导航按内容分组，并为当前页面提供明确的定位状态。
export function AdminNavigation({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="后台导航">
      {NAV_GROUPS.map(group => {
        const items = group.items.filter(item => !("adminOnly" in item) || !item.adminOnly || role === "ADMIN");
        if (items.length === 0) return null;

        return (
          <div className="admin-nav-group" key={group.caption}>
            <span className="admin-nav-caption">{group.caption}</span>
            {items.map(item => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
      <Link className="admin-mobile-public-link" href="/">查看公开页面 ↗</Link>
    </nav>
  );
}
