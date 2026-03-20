import { useAsync } from "./useAsync";

export interface PublicBundle {
  id: string;
  name: string;
  photo_count: number;
  price: number;
  is_active: boolean;
  is_popular: boolean;
  sort_order: number;
}

const MOCK_BUNDLES: PublicBundle[] = [
  { id: "mock-1", name: "Gói 1 ảnh",  photo_count: 1, price: 20000,  is_active: true, is_popular: false, sort_order: 0 },
  { id: "mock-3", name: "Gói 3 ảnh",  photo_count: 3, price: 50000,  is_active: true, is_popular: true,  sort_order: 1 },
  { id: "mock-8", name: "Gói 8 ảnh",  photo_count: 8, price: 100000, is_active: true, is_popular: false, sort_order: 2 },
];

async function fetchPublicBundles(): Promise<PublicBundle[]> {
  const res = await fetch("/api/v1/bundles");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) throw new Error("Invalid response");
  return json.data as PublicBundle[];
}

export function usePublicBundles() {
  const { data, loading, error } = useAsync(fetchPublicBundles);

  const bundles: PublicBundle[] =
    error || !data
      ? MOCK_BUNDLES
      : data
          .filter((b) => b.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.photo_count - b.photo_count);

  return { bundles, loading, usingFallback: !!error };
}
