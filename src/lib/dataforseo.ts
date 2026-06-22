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
export async function runLiveHeatmapScan(areaProfile: SEOAreaProfilePayload): Promise<any> {
  const authKey = localStorage.getItem('dataforseo_auth_key');
  if (!authKey) {
    throw new Error('DataForSEO Auth Key is not configured. Please open Settings and supply your Base64 Auth Key.');
  }

  // Define target endpoint
  const url = 'https://api.dataforseo.com/v3/serp/google/maps/task_post';

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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DataForSEO Request failed: Status ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}
