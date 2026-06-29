export interface SEOAreaProfilePayload {
  name: string;
  keywords: string;
  gmbName: string;
  radius: number;
  gridSize: '3x3' | '5x5' | '7x7';
  placeId?: string;
  coordinates?: {lat: number, lng: number}[];
}

/**
 * Initiates a live local maps task request using DataForSEO's Google Maps SERP API.
 */
export async function runLiveHeatmapScan(areaProfile: SEOAreaProfilePayload, authKey: string): Promise<any> {
  if (!authKey) {
    throw new Error('DataForSEO Auth Key is not configured. Please open Settings and supply your Base64 Auth Key.');
  }

  // Format arguments for DataForSEO mapping
  let tasksPayload: any[] = [];
  
  if (areaProfile.coordinates && areaProfile.coordinates.length > 0) {
    tasksPayload = areaProfile.coordinates.map(coord => ({
      keyword: areaProfile.keywords,
      location_coordinate: `${coord.lat},${coord.lng},17z`,
      language_code: "en",
      device: "mobile",
      search_param: `radius=${areaProfile.radius}`,
      depth: 10
    }));
  } else {
    // Fallback if no coordinates provided, though we should always provide them now
    tasksPayload = [
      {
        keyword: areaProfile.keywords,
        location_coordinate: areaProfile.placeId ? areaProfile.placeId : "",
        language_code: "en",
        device: "mobile",
        search_param: `radius=${areaProfile.radius}`,
        depth: 10
      }
    ];
  }

  // DataForSEO 'live' endpoints strictly only accept a maximum of 1 task per POST request
  const results: any[] = [];
  const BATCH_SIZE = 5;
  const DELAY_MS = 1000;

  const fetchTaskWithRetry = async (task: any, retries = 1): Promise<any> => {
    try {
      const response = await fetch('/api/dataforseo-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endpoint: 'https://api.dataforseo.com/v3/serp/google/maps/live/advanced',
          payload: [task], // Array with exactly ONE task object
          authKey: authKey
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const errorText = errorJson.details || errorJson.error || `Status ${response.status}`;
        console.warn(`DataForSEO Request failed through backend proxy: ${errorText}`);
        
        if (errorText.includes('40000') && retries > 0) {
          console.log(`Retrying task due to 40000 error...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchTaskWithRetry(task, retries - 1);
        }

        return { tasks: [{ result: [] }] };
      }

      const json = await response.json();
      
      if (json && json.tasks && json.tasks.length > 0) {
        // Check for 40000 task status code inside 200 response
        const has40000 = json.tasks.some((t: any) => t.status_code === 40000 || t.status_code === 40001);
        if (has40000 && retries > 0) {
          console.log(`Retrying task due to 40000 status code in task...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchTaskWithRetry(task, retries - 1);
        }

        json.tasks = json.tasks.map((t: any) => {
          if (t.status_code === 40102 || !t.result) {
            t.result = []; 
          }
          return t;
        });
      }
      
      return json;
    } catch (error) {
      console.warn(`Fetch exception for task:`, error);
      return { tasks: [{ result: [] }] };
    }
  };

  // Process the coordinates in smaller batches
  for (let i = 0; i < tasksPayload.length; i += BATCH_SIZE) {
    const batch = tasksPayload.slice(i, i + BATCH_SIZE);
    const fetchPromises = batch.map(task => fetchTaskWithRetry(task));
    const batchResults = await Promise.all(fetchPromises);
    results.push(...batchResults);

    if (i + BATCH_SIZE < tasksPayload.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Aggregate the returned results back into a single array to pass to the frontend UI state
  const aggregatedData = {
    tasks: [] as any[]
  };

  for (const res of results) {
    if (res && res.tasks && Array.isArray(res.tasks)) {
      aggregatedData.tasks.push(...res.tasks);
    }
  }

  return aggregatedData;
}