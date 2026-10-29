"use client";

import { useEffect, useRef, useState } from "react";

type EChartsParams = {
  name?: string;
  data?: { name?: string; value?: unknown; placeGroup?: string; note?: string };
};
type EChartsInstance = {
  setOption: (option: Record<string, unknown>, notMerge?: boolean) => void;
  resize: () => void;
  dispose: () => void;
};
type EChartsGlobal = {
  init: (element: HTMLElement, theme?: string, options?: { renderer?: string }) => EChartsInstance;
  registerMap: (name: string, map: unknown) => void;
};

type Group = "both" | "her" | "mine" | string;
type MapPlace = {
  id: string;
  name: string;
  group: Group;
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

const groupNames: Record<string, string> = {
  both: "我们都去过",
  her: "王颖单独去过",
  mine: "我单独去过",
};

function loadScript(src: string, isReady: () => boolean): Promise<void> {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const selector = `script[data-map-src="${src}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`加载失败：${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.mapSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`加载失败：${src}`));
    document.body.appendChild(script);
  });
}

export function VisitedMap({ places }: { places: MapPlace[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"world" | "china" | "city">("china");
  const [group, setGroup] = useState<"all" | "both" | "her" | "mine">("all");

  useEffect(() => {
    let cancelled = false;
    loadScript("/maps/echarts.min.js", () => Boolean(window.echarts))
      .then(() => loadScript("/maps/map-geo-data.js", () => Boolean(window.TRAVEL_MAP_GEOMETRY?.china)))
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "地图资源加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.echarts) return;
    const chart = window.echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    const chart = chartRef.current;
    const geometry = window.TRAVEL_MAP_GEOMETRY;
    if (!ready || !chart || !geometry) return;

    const mapName = mode === "world" ? "travelWorld" : mode === "china" ? "travelChina" : "travelCity";
    const mapData = mode === "world" ? geometry.world : mode === "china" ? geometry.china : geometry.city;
    if (!mapData) return;
    window.echarts?.registerMap(mapName, mapData);

    const visible = places.filter((place) => group === "all" || place.group === group);
    const regionName = (place: MapPlace) =>
      mode === "world" ? place.country : mode === "china" ? place.province : place.city;
    const groupedRegions = new Map<string, MapPlace[]>();
    for (const place of visible) {
      const name = regionName(place);
      if (!name) continue;
      const list = groupedRegions.get(name) ?? [];
      list.push(place);
      groupedRegions.set(name, list);
    }

    const regions = [...groupedRegions.entries()].map(([name, members]) => {
      const groupName = members.some((item) => item.group === "both")
        ? "both"
        : members.some((item) => item.group === "her")
          ? "her"
          : "mine";
      return {
        name,
        itemStyle: { areaColor: groupColors[groupName], borderColor: "#f6ead8", borderWidth: 1.1 },
        emphasis: { itemStyle: { areaColor: "#e6b98d" }, label: { show: false } },
      };
    });

    const points = visible
      .filter((place) => place.longitude !== null && place.latitude !== null)
      .map((place) => ({
        name: place.name,
        value: [place.longitude, place.latitude],
        itemStyle: { color: groupColors[place.group] ?? groupColors.both },
        placeGroup: groupNames[place.group] ?? "已到访",
        note: place.mapNote ?? "区域高亮表示有到访记录，不代表游遍整个区域。",
      }));

    chart.setOption({
      animationDuration: 350,
      tooltip: {
        trigger: "item",
        formatter: (rawParams: unknown) => {
          const params = rawParams as EChartsParams;
          const item = params.data;
          if (item?.value) {
            return `<strong>${String(item.name ?? params.name ?? "")}</strong><br/>${String(item.placeGroup ?? "已到访")}<br/><small>${String(item.note ?? "")}</small>`;
          }
          const name = String(params.name ?? "");
          const matched = groupedRegions.get(name) ?? [];
          return `<strong>${name}</strong><br/>${matched.map((item) => item.name).join("、") || "行政区域"}<br/><small>区域内有到访记录，不代表整个区域都已游览</small>`;
        },
      },
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
  }, [ready, mode, group, places]);

  return (
    <section className="map-card" aria-label="互动旅行足迹地图">
      <div className="map-toolbar">
        <div>
          <p className="eyebrow">OUR TRAVEL ATLAS</p>
          <h2>去过的地方，在地图上亮起来。</h2>
        </div>
        <div className="map-controls">
          <div className="segmented" aria-label="地图层级">
            {(["world", "china", "city"] as const).map((item) => (
              <button key={item} type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
                {item === "world" ? "国家" : item === "china" ? "省份" : "城市"}
              </button>
            ))}
          </div>
          <select aria-label="筛选到访人" value={group} onChange={(event) => setGroup(event.target.value as typeof group)}>
            <option value="all">所有足迹</option>
            <option value="both">我们都去过</option>
            <option value="her">王颖单独去过</option>
            <option value="mine">我单独去过</option>
          </select>
        </div>
      </div>
      {loadError ? (
        <div className="map-fallback">地图暂时无法加载：{loadError}。下方地点列表仍可正常浏览。</div>
      ) : !ready ? (
        <div className="map-fallback">正在加载离线地图资源…</div>
      ) : null}
      <div ref={containerRef} className="map-canvas" role="img" aria-label="可缩放的国家、省份和城市足迹地图" />
      <p className="map-caption">地图填色代表该行政区域内存在到访记录，不代表整片区域都已探索。可滚轮缩放、拖动地图。</p>
    </section>
  );
}
