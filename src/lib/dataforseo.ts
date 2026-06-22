export interface SEOAreaProfilePayload {
  name: string;
  keywords: string;
  gmbName: string;
  radius: number;
  gridSize: '3x3' | '5x5' | '7x7';
  placeId?: string;
}

/**
 * Initiates a live local maps task request using DataForSEO's Google Maps SERP API.
 */
export async function runLiveHeatmapScan(areaProfile: SEOAreaProfilePayload, authKey: string): Promise<any> {
  if (!authKey) {
    throw new Error('DataForSEO Auth Key is not configured. Please open Settings and supply your Base64 Auth Key.');
  }

  // Format arguments for DataForSEO mapping
  // Note: We construct a task array as expected by the v3/serp/google/maps/task_post endpoint.
  const payload = [
    {
      keyword: areaProfile.keywords,
      location_coordinate: areaProfile.placeId || "",
      language_code: "en",
      device: "desktop",
      search_param: `radius=${areaProfile.radius}`,
      depth: areaProfile.gridSize === '3x3' ? 9 : areaProfile.gridSize === '5x5' ? 25 : 49
    }
  ];

  const response = await fetch('/api/dataforseo-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint: 'https://api.dataforseo.com/v3/serp/google/maps/task_post',
      payload: payload,
      authKey: authKey
    })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const errorText = errorJson.details || errorJson.error || `Status ${response.status}`;
    throw new Error(`DataForSEO Request failed through backend proxy: ${errorText}`);
  }

  const data = await response.json();
  return data;
}
