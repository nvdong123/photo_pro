import { useState } from "react";
import { apiClient } from "../lib/api-client";

export interface SearchResult {
  media_id: string;
  similarity: number;
  thumb_url: string;
  shoot_date: string;
  photographer_code: string;
  album_code: string | null;
}

export type QuickDatePreset = "today" | "3days" | "7days" | "30days";

export function getQuickDateRange(preset: QuickDatePreset): { date_from: string; date_to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const offsets: Record<QuickDatePreset, number> = { today: 0, "3days": 3, "7days": 7, "30days": 30 };
  const from = new Date(today);
  from.setDate(from.getDate() - offsets[preset]);
  return { date_from: fmt(from), date_to: fmt(today) };
}

export function useFaceSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (
    image: File | Blob,
    filters?: {
      shoot_date?: string;
      date_from?: string;
      date_to?: string;
      album_id?: string;
    },
  ) => {
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("image", image, "selfie.jpg");
    if (filters?.shoot_date) form.append("shoot_date", filters.shoot_date);
    if (filters?.date_from)  form.append("date_from",  filters.date_from);
    if (filters?.date_to)    form.append("date_to",    filters.date_to);
    if (filters?.album_id)   form.append("album_id",   filters.album_id);
    try {
      const data = await apiClient.postForm<{
        results: SearchResult[];
        total: number;
      }>("/api/v1/search/face", form);
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tìm được ảnh");
    } finally {
      setLoading(false);
    }
  };

  return { results, loading, error, search };
}
