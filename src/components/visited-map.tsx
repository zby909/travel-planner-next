"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { normalizeMapRegionName } from "@/lib/geo-presets";
import { VISIT_GROUPS, type VisitGroup, type VisitGroupLabels } from "@/lib/place-visits";

type EChartsParams = {
  name?: string;
  data?: { name?: string; value?: unknown; placeId?: string; placeGroup?: string; note?: string };
};
type EChartsInstance = {
  setOption: (option: Record<string, unknown>, notMerge?: boolean) => void;
  resize: () => void;
  dispose: () => void;
  on: (event: string, handler: (params: EChartsParams) => void) => void;
  off: (event: string, handler: (params: EChartsParams) => void) => void;
};
type EChartsGlobal = {
  init: (element: HTMLElement, theme?: string, options?: { renderer?: string }) => EChartsInstance;
  registerMap: (name: string, map: unknown) => void;
};

type MapPlace = {
  id: string;
  name: string;
  groups: VisitGroup[];
  longitude: number | null;
  latitude: number | null;
  country: string | null;
  province: string | null;
  city: string | null;
  mapNote: string | null;
};

declare global {
  interface Window {
    echarts?: EChartsGlobal;
    TRAVEL_MAP_GEOMETRY?: {
      world?: unknown;
      china?: unknown;
      city?: unknown;
    };
  }
}

const groupColors: Record<string, string> = {
  both: "#b78254",
  her: "#8d78b6",
  mine: "#398b7f",
};

const DEFAULT_GROUP_NAMES = { both: "我们一起去过", her: "TA单独去过", mine: "我单独去过" };

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] ?? char));
}

function loadScript(src: string, isReady: () => boolean): Promise<void> {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const selector = `script[data-map-src="${src}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);
    if (existing?.dataset.loaded === "true") existing.remove();
    else if (existing) {
      existing.addEventListener("load", () => {
        if (isReady()) resolve();
        else {
          existing.remove();
          reject(new Error(`地图资源未正确初始化：${src}`));
        }
      }, { once: true });
      existing.addEventListener("error", () => {
        existing.remove();
        reject(new Error(`加载失败：${src}`));
      }, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.mapSrc = src;
    script.onload = () => {
      if (!isReady()) {
        script.remove();
        reject(new Error(`地图资源未正确初始化：${src}`));
        return;
      }
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`加载失败：${src}`));
    };
    document.body.appendChild(script);
  });
}

// 展示可按成员筛选的地图，并将数据库分组映射为站点自定义名称。
export function VisitedMap({ places, groupLabels = DEFAULT_GROUP_NAMES }: { places: MapPlace[]; groupLabels?: VisitGroupLabels }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const registeredMapsRef = useRef<Set<string>>(new Set());
  const lastModeRef = useRef<string | null>(null);
  const [nearby, setNearby] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"world" | "china" | "city">("china");
  const [group, setGroup] = useState<"all" | VisitGroup>("all");

  // 地图进入附近视口后再加载离线资源，优先呈现照片目录与时间轴。
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNearby(true);
      observer.disconnect();
    }, { rootMargin: "480px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearby) return;
    let cancelled = false;
    Promise.all([
      loadScript("/maps/echarts.min.js", () => Boolean(window.echarts)),
      loadScript("/maps/map-geo-data.js", () => Boolean(window.TRAVEL_MAP_GEOMETRY?.china)),
    ])
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "地图资源加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [nearby]);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.echarts) return;
    const chart = window.echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(containerRef.current);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      chart.dispose();
      chartRef.current = null;
      lastModeRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    const chart = chartRef.current;
    const geometry = window.TRAVEL_MAP_GEOMETRY;
    if (!ready || !chart || !geometry) return;

    const mapName = mode === "world" ? "travelWorld" : mode === "china" ? "travelChina" : "travelCity";
    const mapData = mode === "world" ? geometry.world : mode === "china" ? geometry.china : geometry.city;
    if (!mapData) return;
    if (!registeredMapsRef.current.has(mapName)) {
      window.echarts?.registerMap(mapName, mapData);
      registeredMapsRef.current.add(mapName);
    }

    const visible = places.filter((place) => group === "all" || place.groups.includes(group));
    const regionName = (place: MapPlace) =>
      normalizeMapRegionName(mode, mode === "world" ? place.country : mode === "china" ? place.province : place.city);
    const groupedRegions = new Map<string, MapPlace[]>();
    for (const place of visible) {
      const name = regionName(place);
      if (!name) continue;
      const list = groupedRegions.get(name) ?? [];
      list.push(place);
      groupedRegions.set(name, list);
    }

    const regions = [...groupedRegions.entries()].map(([name, members]) => {
      const groupName = group === "all" ? VISIT_GROUPS.find(key => members.some(item => item.groups.includes(key))) : group;
      return {
        name,
        itemStyle: { areaColor: groupName ? groupColors[groupName] : "#8b9282", borderColor: "#f6ead8", borderWidth: 1.1 },
        emphasis: { itemStyle: { areaColor: "#e6b98d" }, label: { show: false } },
      };
    });

    const points = visible
      .filter((place) => place.longitude !== null && place.latitude !== null)
      .map((place) => ({
        name: place.name,
        placeId: place.id,
        value: [place.longitude, place.latitude],
        itemStyle: { color: groupColors[group === "all" ? place.groups[0] : group] ?? "#687368" },
        placeGroup: place.groups.map(key => groupLabels[key]).join(" · ") || "已到访",
        note: place.mapNote ?? "区域高亮表示有到访记录，不代表游遍整个区域。",
      }));

    // 点击地图上的地点后，直接进入对应地点的独立详情页。
    const handlePointClick = (params: EChartsParams) => {
      const placeId = params.data?.placeId;
      if (!placeId) return;
      router.push(`/visited/${encodeURIComponent(placeId)}`);
    };
    chart.on("click", handlePointClick);

    const tooltipFormatter = (rawParams: unknown) => {
      const params = rawParams as EChartsParams;
      const item = params.data;
      if (item?.value) {
        return `<strong>${escapeHtml(item.name ?? params.name)}</strong><br/>${escapeHtml(item.placeGroup ?? "已到访")}<br/><small>${escapeHtml(item.note)}</small><br/><small>点击地图点，查看这个地方的手记和相册</small>`;
      }
      const name = String(params.name ?? "");
      const matched = groupedRegions.get(name) ?? [];
      return `<strong>${escapeHtml(name)}</strong><br/>${matched.map((entry) => escapeHtml(entry.name)).join("、") || "行政区域"}<br/><small>区域内有到访记录，不代表整个区域都已游览</small>`;
    };

    const isModeChange = lastModeRef.current !== mode;
    lastModeRef.current = mode;

    if (isModeChange) {
      chart.setOption({
        animationDuration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350,
        tooltip: { trigger: "item", formatter: tooltipFormatter },
        geo: {
          map: mapName,
          roam: true,
          zoom: mode === "world" ? 1.05 : 1,
          center: mode === "world" ? [112, 29] : undefined,
          scaleLimit: { min: 0.7, max: 8 },
          itemStyle: { areaColor: "#e9e5da", borderColor: "#c7c4b8", borderWidth: 0.7 },
          emphasis: { itemStyle: { areaColor: "#d8c3a6" }, label: { show: false } },
          regions,
        },
        series: [
          {
            name: "旅行足迹",
            type: "scatter",
            coordinateSystem: "geo",
            symbolSize: mode === "world" ? 10 : 8,
            data: points,
            emphasis: { scale: 1.45 },
          },
        ],
      }, true);
    } else {
      // 仅切换同行人筛选时增量更新高亮、散点与悬浮提示，保留用户当前的缩放和平移位置。
      chart.setOption({
        tooltip: { formatter: tooltipFormatter },
        geo: { regions },
        series: [{ name: "旅行足迹", data: points }],
      }, false);
    }
    return () => chart.off("click", handlePointClick);
  }, [ready, mode, group, places, groupLabels, router]);

  return (
    <section className="map-card" aria-label="互动旅行足迹地图">
      <div className="map-toolbar">
        <div className="map-controls">
          <div className="segmented" role="group" aria-label="地图层级">
            {(["world", "china", "city"] as const).map((item) => (
              <button key={item} type="button" className={mode === item ? "active" : ""} aria-pressed={mode === item} onClick={() => setMode(item)}>
                {item === "world" ? "国家" : item === "china" ? "省份" : "城市"}
              </button>
            ))}
          </div>
          <select aria-label="筛选到访人" value={group} onChange={(event) => setGroup(event.target.value as typeof group)}>
            <option value="all">所有足迹</option>
            <option value="both">{groupLabels.both}</option>
            <option value="her">{groupLabels.her}</option>
            <option value="mine">{groupLabels.mine}</option>
          </select>
        </div>
        <div className="map-legend" aria-label="地图颜色图例">
          {VISIT_GROUPS.map(key => (
            <span key={key}><i aria-hidden="true" style={{ background: groupColors[key] }} />{groupLabels[key]}</span>
          ))}
        </div>
      </div>
      {loadError ? (
        <div className="map-fallback" role="alert">地图暂时无法加载。<a href="#place-atlas">浏览地点目录 ↑</a></div>
      ) : nearby && !ready ? (
        <div className="map-fallback">正在加载离线地图资源…</div>
      ) : null}
      {!loadError ? <div ref={containerRef} className="map-canvas" role="img" aria-label="可缩放的国家、省份和城市足迹地图" /> : null}
      <p className="map-caption">地图填色代表该行政区域内存在到访记录，不代表整片区域都已探索。可滚轮缩放、拖动地图。</p>
    </section>
  );
}
