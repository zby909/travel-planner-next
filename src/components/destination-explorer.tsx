"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { DestinationPhotoLightbox, type PhotoGallerySelection } from "@/components/destination-photo-lightbox";
import { formatMoney } from "@/lib/format";
import { photoPreviewUrl } from "@/lib/media";

const SEASON_ORDER: Record<string, number> = { 春: 0, 春季: 0, 夏: 1, 夏季: 1, 秋: 2, 秋季: 2, 冬: 3, 冬季: 3 };

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
  pickBudget: number;
  currency: string;
  rank: number;
  vibe: string;
};

// 从天数描述中提取排序值，无法识别的项排在末尾。
function durationInDays(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// 按杂志目录样式展示目的地；筛选与排序都只影响当前页面。
export function DestinationExplorer({ destinations }: { destinations: DestinationExplorerItem[] }) {
  const [kind, setKind] = useState("全部");
  const [season, setSeason] = useState("全部");
  const [budget, setBudget] = useState(0);
  const [sort, setSort] = useState("recommend");
  const [gallery, setGallery] = useState<PhotoGallerySelection | null>(null);
  const kindFilters = useMemo(() => [
    { label: "全部旅程", value: "全部" },
    ...[...new Set(destinations.flatMap(item => item.types.length ? item.types : [item.kind]).filter(Boolean))].sort().map(value => ({ label: value, value })),
  ], [destinations]);
  const seasonFilters = useMemo(() =>
    [...new Set(destinations.flatMap(item => item.seasons).filter(Boolean))]
      .sort((a, b) => (SEASON_ORDER[a] ?? 99) - (SEASON_ORDER[b] ?? 99) || a.localeCompare(b, "zh-CN")),
  [destinations]);
  const currencies = [...new Set(destinations.filter(item => item.pickBudget > 0).map(item => item.currency))];
  const comparableCurrency = currencies.length === 1 ? currencies[0] : null;
  const budgetOptions = useMemo(() => {
    const values = destinations.map(item => item.pickBudget).filter(value => value > 0).sort((a, b) => a - b);
    if (values.length === 0) return [];
    return [...new Set([0.25, 0.5, 0.75, 1].map(ratio => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]))];
  }, [destinations]);

  const visibleDestinations = useMemo(() => {
    const filtered = destinations.filter(item =>
      (kind === "全部" || (item.types.length ? item.types : [item.kind]).includes(kind)) &&
      (season === "全部" || item.seasons.includes(season)) &&
      (!comparableCurrency || budget === 0 || (item.pickBudget > 0 && item.pickBudget <= budget))
    );
    filtered.sort((a, b) => {
      if (sort === "cheap" && comparableCurrency) return (a.pickBudget || Number.MAX_SAFE_INTEGER) - (b.pickBudget || Number.MAX_SAFE_INTEGER);
      if (sort === "short") return durationInDays(a.days) - durationInDays(b.days);
      return a.rank - b.rank;
    });
    return filtered;
  }, [destinations, kind, season, budget, sort, comparableCurrency]);

  // 清空用户筛选并恢复数据库的原始顺序。
  function resetFilters() {
    setKind("全部");
    setSeason("全部");
    setBudget(0);
    setSort("recommend");
  }

  // 预览真实景点组图，关闭后的焦点恢复统一交由灯箱组件处理。
  function openGallery(item: DestinationExplorerItem) {
    const encodedId = encodeURIComponent(item.id);
    setGallery({
      title: item.title,
      images: item.imagePath ? [item.imagePath] : [0, 1, 2].map(index => `/api/legacy-media/images/${encodedId}-${index}.jpg`),
    });
  }

  // 保持稳定的关闭回调引用，避免父组件重渲染导致灯箱重复重置焦点。
  const closeGallery = useCallback(() => setGallery(null), []);

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
          {comparableCurrency && <label><span className="sr-only">按预算筛选</span><select value={budget} onChange={event => setBudget(Number(event.target.value))}><option value={0}>预算不限</option>{budgetOptions.map(value => <option value={value} key={value}>≤ {formatMoney(value, comparableCurrency)}</option>)}</select></label>}
          <label><span className="sr-only">排序方式</span><select value={sort === "cheap" && !comparableCurrency ? "recommend" : sort} onChange={event => setSort(event.target.value)}><option value="recommend">默认排序</option>{comparableCurrency && <option value="cheap">预算由低到高</option>}<option value="short">天数由少到多</option></select></label>
        </div>
      </div>
      <div className="editorial-index-meta"><span role="status">{visibleDestinations.length} 个目的地</span>{(kind !== "全部" || season !== "全部" || budget !== 0 || sort !== "recommend") && <button type="button" onClick={resetFilters}>重置条件 ↺</button>}</div>
      {visibleDestinations.length > 0 ? (
        <div className="editorial-destination-grid">
          {visibleDestinations.map(item => {
            const encodedId = encodeURIComponent(item.id);
            const href = `/destinations/${encodedId}`;
            return (
            <article className="editorial-destination" key={item.id}>
              <div className="cinematic-card-media">
                <Link className={`editorial-destination-photo cinematic-card-photo${item.imagePath ? " is-single" : ""}`} href={href} aria-label={`查看${item.title}的旅行计划`}>
                <span className="cinematic-card-main">
                  <Image src={item.imagePath ? photoPreviewUrl(item.imagePath, 960) : `/api/legacy-media/images/${encodedId}-0.jpg`} alt={`${item.title}的代表风景`} fill unoptimized sizes="(max-width: 700px) 70vw, 23vw" />
                </span>
                {!item.imagePath && (
                  <span className="cinematic-card-thumbnails">
                    <span><Image src={`/api/legacy-media/images/${encodedId}-1.jpg`} alt={`${item.title}另一处风景`} fill unoptimized sizes="(max-width: 700px) 30vw, 11vw" /></span>
                    <span><Image src={`/api/legacy-media/images/${encodedId}-2.jpg`} alt={`${item.title}的旅行影像`} fill unoptimized sizes="(max-width: 700px) 30vw, 11vw" /></span>
                  </span>
                )}
                </Link>
                <button className="cinematic-gallery-trigger" type="button" aria-label={`放大查看${item.title}的风景照片`} onClick={() => openGallery(item)}>⤢ <span>查看照片</span></button>
              </div>
              <div className="editorial-destination-copy">
                <div className="editorial-destination-kicker">{item.flag} {item.kind}</div>
                <h3><Link href={href}>{item.title}</Link></h3>
                <p className="editorial-destination-subtitle">{item.subtitle}</p>
                {item.vibe && <p className="editorial-destination-vibe">{item.vibe}</p>}
                <div className="editorial-destination-bottom"><span>{[item.months, item.days].filter(Boolean).join(" / ") || "等待计划"}</span><Link href={href}>阅读旅程 <b aria-hidden="true">↗</b></Link></div>
                {item.pickBudget > 0 && <div className="editorial-destination-budget"><span>双人预算 · {item.currency}</span><strong>{formatMoney(item.pickBudget, item.currency)}</strong></div>}
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <div className="editorial-empty" data-testid="empty-destinations">
          <p>没有符合条件的目的地。</p>
          <button type="button" onClick={resetFilters}>查看全部目的地 ↗</button>
        </div>
      )}
      {gallery && <DestinationPhotoLightbox selection={gallery} onClose={closeGallery} />}
    </div>
  );
}
