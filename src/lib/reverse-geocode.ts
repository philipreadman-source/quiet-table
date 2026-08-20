/** Reverse-geocode coordinates to a short place label via Nominatim (OSM). */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: Record<string, string | undefined>;
      display_name?: string;
    };
    const address = data.address ?? {};
    const place = address.suburb ?? address.neighbourhood ?? address.city ?? address.town;
    return place ?? data.display_name ?? null;
  } catch {
    return null;
  }
}
