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

// 将预算数字格式化为站点配置的币种。
function money(value: number, currency: string): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

// 提取行程天数用于排序，未填写的行程排在后面。
function durationInDays(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// 以旅行明信片展示真实目的地数据，筛选条件保留在本地，不改写数据库。
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
      if (sort === "cheap") return (a.pickBudget || Number.MAX_SAFE_INTEGER) - (b.pickBudget || Number.MAX_SAFE_INTEGER);
      if (sort === "short") return durationInDays(a.days) - durationInDays(b.days);
      return a.rank - b.rank;
    });
    return filtered;
  }, [destinations, kind, season, budget, sort]);

  // 清除筛选条件，恢复数据库的展示顺序。
  function resetFilters() {
    setKind("全部");
    setSeason("全部");
    setBudget(0);
    setSort("recommend");
  }

  return (
    <div className="destination-explorer journal-explorer">
      <div className="journal-filter-bar">
        <div className="journal-filter-types" role="group" aria-label="按旅行类型筛选">
          {kindFilters.map(option => (
            <button
              key={option.value}
              className={`journal-filter-chip${kind === option.value ? " is-active" : ""}`}
              type="button"
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
            >{option.label}</button>
          ))}
        </div>
        <div className="journal-filter-selects">
          <label><span className="sr-only">按季节筛选</span>
            <select value={season} onChange={event => setSeason(event.target.value)}>
              <option value="全部">全部季节</option>
              {seasonFilters.map(value => <option key={value} value={value}>{value.endsWith("季") ? value : `${value}季`}</option>)}
            </select>
          </label>
          <label><span className="sr-only">按预算筛选</span>
            <select value={budget} onChange={event => setBudget(Number(event.target.value))}>
              <option value={0}>预算不限</option>
              {budgetOptions.map(value => <option key={value} value={value}>≤ {money(value, currency)}</option>)}
            </select>
          </label>
          <label><span className="sr-only">排序方式</span>
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="recommend">默认顺序</option>
              <option value="cheap">预算从低到高</option>
              <option value="short">天数从少到多</option>
            </select>
          </label>
        </div>
      </div>
      <div className="journal-results">
        <span>{String(visibleDestinations.length).padStart(2, "0")} PLACES TO DREAM ABOUT</span>
        <button type="button" onClick={resetFilters}>清除筛选 ↺</button>
      </div>

      {visibleDestinations.length > 0 ? (
        <div className="journal-card-grid" aria-live="polite">
          {visibleDestinations.map((destination, index) => (
            <article className="journal-destination-card" key={destination.id}>
              <Link className="journal-card-image" href={`/destinations/${destination.id}`} aria-label={`查看${destination.title}旅行详情`}>
                <Image
                  src={destination.imagePath ?? `/api/legacy-media/images/${destination.id}-0.jpg`}
                  alt={`${destination.title}目的地封面`}
                  fill
                  unoptimized
                  sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                />
                <span className="journal-card-index">{String(index + 1).padStart(2, "0")} / {String(visibleDestinations.length).padStart(2, "0")}</span>
                <span className="journal-card-open" aria-hidden="true">↗</span>
                <span className="journal-card-image-title">{destination.months || "想去看看"}</span>
              </Link>
              <div className="journal-card-content">
                <p className="journal-card-overline">{destination.flag} {destination.kind} <span>{destination.badge || destination.style || "TRAVEL NOTES"}</span></p>
                <div className="journal-card-title-row">
                  <div><h3><Link href={`/destinations/${destination.id}`}>{destination.title}</Link></h3><p>{destination.subtitle}</p></div>
                  {destination.pickBudget > 0 && <span className="journal-card-budget">{money(destination.pickBudget, currency)}<small>两人参考预算</small></span>}
                </div>
                {destination.vibe && <p className="journal-card-vibe">{destination.vibe}</p>}
                <div className="journal-card-bottom">
                  <span>{[destination.months, destination.days].filter(Boolean).join(" · ") || "待规划"}</span>
                  <Link href={`/destinations/${destination.id}`}>查看这段旅程 <span aria-hidden="true">↗</span></Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="journal-empty-state">
          <span aria-hidden="true">✳</span>
          <h3>{destinations.length === 0 ? "我们的心愿清单，还等着第一站。" : "暂时没有符合条件的目的地。"}</h3>
          <p>{destinations.length === 0 ? "从一个想去的地方开始，慢慢把它写满吧。" : "换一个季节或预算，也许会遇见新的心动。"}</p>
          {destinations.length === 0 ? <Link href="/login">去添加一个目的地 ↗</Link> : <button type="button" onClick={resetFilters}>查看全部目的地 ↗</button>}
        </div>
      )}
    </div>
  );
}
