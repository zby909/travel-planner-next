"use client";

import { useMemo, useState } from "react";
import { searchGeoPresets, type GeoPreset } from "@/lib/geo-presets";
import styles from "./geo-location-picker.module.css";

export type GeoValues = {
  country: string;
  province: string;
  city: string;
  latitude: string;
  longitude: string;
};

// 离线地理搜索选择器：输入城市/省份/国家即可一键填充精准坐标与地图区域标准名。
export function GeoLocationPicker({
  value,
  onChange,
  onPickPreset,
}: {
  value: GeoValues;
  onChange: (next: GeoValues) => void;
  onPickPreset?: (preset: GeoPreset) => void;
}) {
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return searchGeoPresets(query, 8);
  }, [query]);

  const hasLocation = Boolean(value.latitude && value.longitude);
  const locationSummary = [value.country, value.province, value.city].filter(Boolean).join(" · ");

  // 选中地理预设后同步写入地图区域名与中心经纬度，并清空搜索框。
  function selectPreset(preset: GeoPreset) {
    onChange({
      country: preset.country,
      province: preset.province,
      city: preset.city,
      latitude: String(preset.latitude),
      longitude: String(preset.longitude),
    });
    onPickPreset?.(preset);
    setQuery("");
  }

  // 一键清空当前坐标与行政区划映射。
  function clearLocation() {
    onChange({ country: "", province: "", city: "", latitude: "", longitude: "" });
  }

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <strong>快速点亮足迹地图（可选）</strong>
        <span>输入城市、省份或国家，自动填充标准地图区域和坐标</span>
      </div>
      <div className={styles.searchRow}>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="搜一搜：京都、杭州、大理、冰岛、新加坡、东京…"
          aria-label="搜索地图位置预设"
        />
      </div>
      {query.trim() ? (
        suggestions.length > 0 ? (
          <div className={styles.suggestions} role="listbox" aria-label="匹配的地图位置">
            {suggestions.map(preset => (
              <button
                type="button"
                key={`${preset.label}-${preset.country}-${preset.province}-${preset.city}`}
                className={styles.suggestion}
                onClick={() => selectPreset(preset)}
              >
                <span>{preset.label}</span>
                <small>{preset.region}</small>
              </button>
            ))}
          </div>
        ) : (
          <span className="muted-copy">未找到预设地名；可在下方展开手动填写坐标。</span>
        )
      ) : null}
      {hasLocation || locationSummary ? (
        <div className={styles.selected} role="status">
          <span>
            已定位：{locationSummary || "自定义坐标"}
            {hasLocation ? `（${value.latitude}, ${value.longitude}）` : ""}
          </span>
          <button type="button" className={styles.clearBtn} onClick={clearLocation}>清除定位</button>
        </div>
      ) : null}
    </div>
  );
}
