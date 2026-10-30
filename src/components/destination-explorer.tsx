"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { DestinationPhotoLightbox, type PhotoGallerySelection } from "@/components/destination-photo-lightbox";

export type DestinationExplorerItem = {
  id: string;
  title: string;
  subtitle: string;
  flag: string;
  imagePath: string | null;
  kind: string;
  types: string[];
  months: string;
  seasons: string[];
  days: string;
  minBudget: number;
  maxBudget: number;
  pickBudget: number;
  rank: number;
  style: string | null;
  badge: string | null;
  vibe: string;
  spots: string[];
  flightPricing: {
    route: string;
    normalMin: number;
    normalMax: number;
    holidayMin: number;
    holidayMax: number;
  } | null;
};

// 将预算格式化为站点配置的币种。
function money(value: number, currency: string): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

// 从天数描述中提取排序值，无法识别的项排在末尾。
function durationInDays(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// 按杂志目录样式展示目的地；筛选与排序都只影响当前页面。
export function DestinationExplorer({ destinations, currency = "CNY" }: { destinations: DestinationExplorerItem[]; currency?: string }) {
  const [kind, setKind] = useState("全部");
  const [season, setSeason] = useState("全部");
  const [budget, setBudget] = useState(0);
  const [sort, setSort] = useState("recommend");
  const [gallery, setGallery] = useState<PhotoGallerySelection | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const kindFilters = useMemo(() => [
    { label: "全部旅程", value: "全部" },
    ...[...new Set(destinations.flatMap(item => item.types.length ? item.types : [item.kind]).filter(Boolean))].sort().map(value => ({ label: value, value })),
  ], [destinations]);
  const seasonFilters = useMemo(() => [...new Set(destinations.flatMap(item => item.seasons))].sort(), [destinations]);
  const budgetOptions = useMemo(() => {
    const values = destinations.map(item => item.pickBudget).filter(value => value > 0).sort((a, b) => a - b);
    if (values.length === 0) return [];
    return [...new Set([0.25, 0.5, 0.75, 1].map(ratio => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]))];
  }, [destinations]);

  const visibleDestinations = useMemo(() => {
    const filtered = destinations.filter(item =>
      (kind === "全部" || (item.types.length ? item.types : [item.kind]).includes(kind)) &&
      (season === "全部" || item.seasons.includes(season)) &&
      (budget === 0 || (item.pickBudget > 0 && item.pickBudget <= budget))
    );
    filtered.sort((a, b) => {
      if (sort === "cheap") return (a.pickBudget || Number.MAX_SAFE_INTEGER) - (b.pickBudget || Number.MAX_SAFE_INTEGER);
      if (sort === "short") return durationInDays(a.days) - durationInDays(b.days);
      return a.rank - b.rank;
    });
    return filtered;
  }, [destinations, kind, season, budget, sort]);

  // 清空用户筛选并恢复数据库的原始顺序。
  function resetFilters() {
    setKind("全部");
    setSeason("全部");
    setBudget(0);
    setSort("recommend");
  }

  // 预览真实景点组图，并保存焦点位置以便关闭后回到原照片。
  function openGallery(item: DestinationExplorerItem) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGallery({
      title: item.title,
      images: item.imagePath ? [item.imagePath] : [0, 1, 2].map(index => `/api/legacy-media/images/${item.id}-${index}.jpg`),
    });
  }

  // 关闭照片灯箱后恢复键盘焦点。
  function closeGallery() {
    setGallery(null);
    window.requestAnimationFrame(() => previousFocus.current?.focus());
  }

  return (
    <div className="editorial-explorer">
      <div className="editorial-filter">
        <div className="editorial-filter-types" role="group" aria-label="按旅行类型筛选">
          {kindFilters.map(option => (
            <button key={option.value} type="button" className={kind === option.value ? "is-active" : ""} aria-pressed={kind === option.value} onClick={() => setKind(option.value)}>{option.label}</button>
          ))}
        </div>
        <div className="editorial-filter-options">
          <label><span className="sr-only">按季节筛选</span><select value={season} onChange={event => setSeason(event.target.value)}><option value="全部">所有季节</option>{seasonFilters.map(value => <option value={value} key={value}>{value.endsWith("季") ? value : `${value}季`}</option>)}</select></label>
          <label><span className="sr-only">按预算筛选</span><select value={budget} onChange={event => setBudget(Number(event.target.value))}><option value={0}>预算不限</option>{budgetOptions.map(value => <option value={value} key={value}>≤ {money(value, currency)}</option>)}</select></label>
          <label><span className="sr-only">排序方式</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="recommend">默认排序</option><option value="cheap">预算由低到高</option><option value="short">天数由少到多</option></select></label>
        </div>
      </div>
      <div className="editorial-index-meta"><span>INDEX / {String(visibleDestinations.length).padStart(2, "0")} DESTINATIONS</span><button type="button" onClick={resetFilters}>重置条件 ↺</button></div>
      {visibleDestinations.length > 0 ? (
        <div className="editorial-destination-grid" aria-live="polite">
          {visibleDestinations.map((item, index) => (
            <article className="editorial-destination" data-motion="rise" key={item.id}>
              <div className="cinematic-card-media">
                <Link className={`editorial-destination-photo cinematic-card-photo${item.imagePath ? " is-single" : ""}`} href={`/destinations/${item.id}`} aria-label={`查看${item.title}的旅行计划`}>
                <span className="cinematic-card-main">
                  <Image src={item.imagePath ?? `/api/legacy-media/images/${item.id}-0.jpg`} alt={`${item.title}的代表风景`} fill unoptimized sizes="(max-width: 700px) 70vw, 23vw" />
                </span>
                {!item.imagePath && (
                  <span className="cinematic-card-thumbnails">
                    <span><Image src={`/api/legacy-media/images/${item.id}-1.jpg`} alt={`${item.title}另一处风景`} fill unoptimized sizes="(max-width: 700px) 30vw, 11vw" /></span>
                    <span><Image src={`/api/legacy-media/images/${item.id}-2.jpg`} alt={`${item.title}的旅行影像`} fill unoptimized sizes="(max-width: 700px) 30vw, 11vw" /></span>
                  </span>
                )}
                  <span className="editorial-photo-label">TRAVEL / {String(index + 1).padStart(2, "0")}</span>
                </Link>
                <button className="cinematic-gallery-trigger" type="button" aria-label={`放大查看${item.title}的风景照片`} onClick={() => openGallery(item)}>⤢ <span>查看照片</span></button>
              </div>
              <div className="editorial-destination-copy">
                <div className="editorial-destination-kicker"><span>NO. {String(index + 1).padStart(2, "0")}</span><span>{item.flag} {item.kind}</span></div>
                <h3><Link href={`/destinations/${item.id}`}>{item.title}</Link></h3>
                <p className="editorial-destination-subtitle">{item.subtitle}</p>
                {item.vibe && <p className="editorial-destination-vibe">{item.vibe}</p>}
                <div className="editorial-destination-bottom"><span>{[item.months, item.days].filter(Boolean).join(" / ") || "等待计划"}</span><Link href={`/destinations/${item.id}`}>阅读旅程 <b aria-hidden="true">↗</b></Link></div>
                {item.pickBudget > 0 && <div className="editorial-destination-budget"><span>EST. FOR TWO</span><strong>{money(item.pickBudget, currency)}</strong></div>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="editorial-empty" data-testid="empty-destinations">
          <span>AN UNWRITTEN PAGE / 000</span>
          <h3>{destinations.length === 0 ? "我们的心愿清单，还等着第一站。" : "这一页，暂时没有符合条件的旅程。"}</h3>
          <p>{destinations.length === 0 ? "先记下一个想去的地方，再慢慢开始。" : "试着换个季节、预算或旅行类型。"}</p>
          {destinations.length === 0 ? <Link href="/login">开始写下第一站 ↗</Link> : <button type="button" onClick={resetFilters}>查看全部目的地 ↗</button>}
        </div>
      )}
      {gallery && <DestinationPhotoLightbox selection={gallery} onClose={closeGallery} />}
    </div>
  );
}