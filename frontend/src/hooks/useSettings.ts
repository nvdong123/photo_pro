import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function applyColorToDOM(cssVar: string, hex: string) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
  document.documentElement.style.setProperty(cssVar, hex);
  const hsl = hexToHSL(hex);
  document.documentElement.style.setProperty(`${cssVar}-light`, `hsl(${hsl.h}, 30%, 95%)`);
  document.documentElement.style.setProperty(`${cssVar}-dark`,  `hsl(${hsl.h}, ${hsl.s}%, 20%)`);
}

export function useSettings() {
  const { data: rawSettings, refetch, loading, error } = useAsync(() =>
    apiClient.get<Array<{ key: string; value: string }>>("/api/v1/admin/settings"),
  );

  // Convert array to Record for easy lookup
  const settings: Record<string, string> | null = rawSettings
    ? Object.fromEntries(rawSettings.map((s) => [s.key, s.value]))
    : null;

  const update = async (key: string, value: string) => {
    await apiClient.patch("/api/v1/admin/settings", { key, value });
    await refetch();
    if (key === "primary_color") applyColorToDOM("--primary", value);
    if (key === "accent_color")  applyColorToDOM("--accent",  value);
  };

  return { settings, loading, error, update, refetch, applyColorToDOM };
}
