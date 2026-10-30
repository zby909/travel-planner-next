"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

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

// 将预算数字格式化为站点设置的币种。
function money(value: number, currency: string): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

// 从天数描述中提取排序用的天数，无法识别时排在最后。
function durationInDays(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// 直接展示两个人共同维护的数据库目的地，不使用浏览器本地收藏。
export function DestinationExplorer({ destinations, currency = "CNY" }: { destinations: DestinationExplorerItem[]; currency?: string }) {
  const [kind, setKind] = useState("全部");
  const [season, setSeason] = useState("全部");
  const [budget, setBudget] = useState(0);
  const [sort, setSort] = useState("recommend");
  const kindFilters = useMemo(() => [
    { label: "全部目的地", value: "全部" },
    ...[...new Set(destinations.flatMap(destination => destination.types.length ? destination.types : [destination.kind]).filter(Boolean))].sort().map(value => ({ label: value, value })),
  ], [destinations]);
  const seasonFilters = useMemo(() => [...new Set(destinations.flatMap(destination => destination.seasons))].sort(), [destinations]);
  const budgetOptions = useMemo(() => {
    const values = destinations.map(destination => destination.pickBudget).filter(value => value > 0).sort((a, b) => a - b);
    if (values.length === 0) return [];
    return [...new Set([0.25, 0.5, 0.75, 1].map(ratio => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]))];
  }, [destinations]);

  const visibleDestinations = useMemo(() => {
    const filtered = destinations.filter(destination =>
      (kind === "全部" || (destination.types.length ? destination.types : [destination.kind]).includes(kind)) &&
      (season === "全部" || destination.seasons.includes(season)) &&
      (budget === 0 || (destination.pickBudget > 0 && destination.pickBudget <= budget))
    );
    filtered.sort((a, b) => {
      if (sort === "cheap") return a.pickBudget - b.pickBudget;
      if (sort === "short") return durationInDays(a.days) - durationInDays(b.days);
      return a.rank - b.rank;
    });
    return filtered;
  }, [destinations, kind, season, budget, sort]);

  // 清空所有筛选条件并返回推荐排序。
  function resetFilters() {
    setKind("全部");
    setSeason("全部");
    setBudget(0);
    setSort("recommend");
  }

  return (
    <div className="destination-explorer">
      <div className="filter-panel">
        <div className="filter-scroll" role="group" aria-label="按旅行类型筛选">
          {kindFilters.map(option => (
            <button
              className={`filter-chip${kind === option.value ? " is-active" : ""}`}
              type="button"
              key={option.value}
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
            >{option.label}</button>
          ))}
        </div>
        <div className="filter-selects">
          <label className="select-field">
            <span className="sr-only">按季节筛选</span>
            <select value={season} onChange={event => setSeason(event.target.value)}>
              <option value="全部">不限季节</option>
              {seasonFilters.map(value => <option key={value} value={value}>{value.endsWith("季") ? value : `${value}季`}</option>)}
            </select>
          </label>
          <label className="select-field">
            <span className="sr-only">按预算筛选</span>
            <select value={budget} onChange={event => setBudget(Number(event.target.value))}>
              <option value={0}>不限预算</option>
              {budgetOptions.map(value => <option key={value} value={value}>≤ {money(value, currency)}</option>)}
            </select>
          </label>
          <label className="select-field">
            <span className="sr-only">排列顺序</span>
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="recommend">推荐优先</option>
              <option value="cheap">预算由低到高</option>
              <option value="short">天数较少优先</option>
            </select>
          </label>
        </div>
      </div>

      <div className="filter-result">
        <span>找到 {visibleDestinations.length} 个目的地</span>
        <div className="filter-result-actions">
          <button className="reset-filters" type="button" onClick={resetFilters}>重置筛选 ↗</button>
        </div>
      </div>

      {visibleDestinations.length > 0 ? (
        <div className="trip-grid" aria-live="polite">
          {visibleDestinations.map(destination => {
            const spots = destination.spots.length ? destination.spots : [destination.title, "路线详情", "旅行灵感"];
            const coverOnly = Boolean(destination.imagePath && !destination.imagePath.startsWith("/api/legacy-media/"));
            return (
              <article className="trip-card" key={destination.id}>
                <div className="mosaic">
                  {spots.slice(0, coverOnly ? 1 : 3).map((spot, index) => (
                    <Link className="mosaic-img" href={`/destinations/${destination.id}`} key={`${destination.id}-${index}`} aria-label={`查看${destination.title}：${spot}`}>
                      <Image
                        src={index === 0 && destination.imagePath ? destination.imagePath : `/api/legacy-media/images/${destination.id}-${index}.jpg`}
                        alt={`${spot}代表性景观`}
                        fill
                        unoptimized={index !== 0 || !destination.imagePath || destination.imagePath.startsWith("/api/")}
                        sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw"
                      />
                      <span>{spot} ↗</span>
                    </Link>
                  ))}
                  <span className="trip-badge">{destination.badge || destination.kind}</span>
                </div>
                <div className="trip-content">
                  <div className="trip-overline"><span>{destination.flag} {destination.style || destination.kind}</span><span>{destination.kind}</span></div>
                  <div className="trip-title-row">
                    <div>
                      <h3 className="trip-title"><Link href={`/destinations/${destination.id}`}>{destination.title}</Link></h3>
                      <p className="trip-subtitle">{destination.subtitle}</p>
                    </div>
                    <div className="trip-price"><strong>{destination.pickBudget > 0 ? money(destination.pickBudget, currency) : "待估算"}</strong><small>两人预算参考</small></div>
                  </div>
                  <p className="trip-vibe">{destination.vibe}</p>
                  <div className="trip-metadata">
                    <div className="metadata"><small>推荐季节</small><b>{destination.months}</b></div>
                    <div className="metadata"><small>建议时长</small><b>{destination.days}</b></div>
                  </div>
                  <p className="trip-spots"><b>精华景点</b> · {spots.join(" / ")}</p>
                  {destination.flightPricing && (destination.flightPricing.normalMax > 0 || destination.flightPricing.holidayMax > 0) && (
                    <div className="trip-flight-range">
                      <span>平日往返 {money(destination.flightPricing.normalMin, currency)}–{money(destination.flightPricing.normalMax, currency)}</span>
                      <span>节假日 {money(destination.flightPricing.holidayMin, currency)}–{money(destination.flightPricing.holidayMax, currency)}</span>
                    </div>
                  )}
                  <div className="trip-range"><span>两人预算区间</span><strong>{destination.maxBudget > 0 ? `${money(destination.minBudget, currency)}—${money(destination.maxBudget, currency)}` : "待估算"}</strong></div>
                  <Link className="trip-details-link" href={`/destinations/${destination.id}`}>查看完整攻略 <span>↗</span></Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="no-results">
          <strong>{destinations.length === 0 ? "我们的心愿清单还空着" : "暂时没有匹配的目的地"}</strong>
          <p>{destinations.length === 0 ? "登录后台，添加你们想一起去的第一个地方。" : "换个季节或预算，再看看有没有心动的风景。"}</p>
          {destinations.length === 0 ? <Link className="button button-dark" href="/login">登录并开始管理</Link> : <button className="button button-dark" type="button" onClick={resetFilters}>查看全部目的地</button>}
        </div>
      )}
    </div>
  );
}
