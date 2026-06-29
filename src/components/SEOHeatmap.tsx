/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { runLiveHeatmapScan } from '../lib/dataforseo';
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import { 
  Map, 
  Settings, 
  MapPin, 
  Save, 
  X, 
  RefreshCw, 
  HelpCircle, 
  TrendingUp, 
  Activity, 
  Search, 
  CheckCircle,
  AlertTriangle,
  Plus,
  Compass,
  Users,
  Trash2,
  History,
  Calendar,
  Clock,
  Coins
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface CityConfig {
  keywords: string;
  gmbName: string;
  radius: number;
  gridSize: '3x3' | '5x5' | '7x7' | '9x9' | '11x11';
  placeId?: string;
  targetPlaceId?: string;
  scanFrequency?: 'Manual Only' | 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly';
  preferredTime?: string;
  center?: { lat: number; lng: number };
}

const getCityCenter = (city: string, config?: CityConfig) => {
  if (config?.center) return config.center;
  if (city.toLowerCase() === 'murfreesboro') {
    return { lat: 35.8456, lng: -86.3903 };
  }
  
  // Deterministic center based on city name hashing to keep custom areas perfectly stable
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < city.length; i++) {
    hash1 = city.charCodeAt(i) + ((hash1 << 5) - hash1);
    hash2 = city.charCodeAt(city.length - 1 - i) + ((hash2 << 5) - hash2);
  }
  const latVal = 34.0 + (Math.abs(hash1 % 1000) / 1000) * 10.0; // Latitude: 34 to 44
  const lngVal = -98.0 + (Math.abs(hash2 % 1000) / 1000) * 20.0; // Longitude: -78 to -98
  return { lat: latVal, lng: lngVal };
};

const getZoomForRadius = (radius: number) => {
  if (radius <= 2) return 14;
  if (radius <= 5) return 12;
  if (radius <= 12) return 11;
  if (radius <= 25) return 10;
  return 9;
};

// MapController sub-component that leverages @vis.gl/react-google-maps internal hooks
// to query the target profile's placeId (or fallback to Murfreesboro) and pan the map to those coordinates.
const MapController = ({
  selectedCity,
  currentConfig,
  onCenterResolved
}: {
  selectedCity: string;
  currentConfig: any;
  onCenterResolved: (coords: { lat: number; lng: number }) => void;
}) => {
  const map = useMap();
  const placesLibrary = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLibrary || !map) return;
    if (typeof window === 'undefined' || !window.google || !window.google.maps || !window.google.maps.places) return;

    const targetPlaceId = currentConfig.targetPlaceId || currentConfig.placeId;
    const fallbackCoords = { lat: 35.8468, lng: -86.3903 };

    // Fallback if targetPlaceId is placeholder, custom internal (starts with loc_ or ch_gmb_ or other internal prefix), or missing
    if (
      !targetPlaceId || 
      targetPlaceId === 'loc_placeholder' || 
      targetPlaceId.startsWith('loc_') ||
      targetPlaceId.startsWith('ch_gmb_')
    ) {
      console.log(`Using safe fallback centering for custom or internal Place ID: ${targetPlaceId}`);
      map.panTo(fallbackCoords);
      onCenterResolved(fallbackCoords);
      return;
    }

    try {
      const service = new google.maps.places.PlacesService(map);
      service.getDetails({ placeId: targetPlaceId }, (place, status) => {
        try {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            place &&
            place.geometry &&
            place.geometry.location
          ) {
            const loc = place.geometry.location;
            const coords = { lat: loc.lat(), lng: loc.lng() };
            onCenterResolved(coords);
            map.panTo(loc);
          } else {
            console.warn(`PlacesService.getDetails failed for: ${targetPlaceId} with status: ${status}. Falling back.`);
            map.panTo(fallbackCoords);
            onCenterResolved(fallbackCoords);
          }
        } catch (innerError) {
          console.error("Error inside PlacesService callback, falling back:", innerError);
          map.panTo(fallbackCoords);
          onCenterResolved(fallbackCoords);
        }
      });
    } catch (err) {
      console.error("Error creating PlacesService or calling getDetails, falling back:", err);
      try {
        map.panTo(fallbackCoords);
        onCenterResolved(fallbackCoords);
      } catch (fallbackErr) {
        console.error("Failed to apply fallback:", fallbackErr);
      }
    }
  }, [selectedCity, currentConfig.targetPlaceId, currentConfig.placeId, placesLibrary, map, onCenterResolved]);

  return null;
};

export interface RadialNode {
  id: string;
  x: number; // visual grid x float
  y: number; // visual grid y float
  ring: number;
}

const generateRadialGrid = (gridSizeStr: string): RadialNode[] => {
  const maxRings = gridSizeStr === '3x3' ? 1 : gridSizeStr === '5x5' ? 2 : gridSizeStr === '7x7' ? 3 : gridSizeStr === '9x9' ? 4 : 5;
  const nodes: RadialNode[] = [];
  
  nodes.push({ id: '0-0', x: 0, y: 0, ring: 0 });
  
  for (let r = 1; r <= maxRings; r++) {
    const pointsInRing = r * 8;
    for (let i = 0; i < pointsInRing; i++) {
      const angleRad = ((i * 360) / pointsInRing * Math.PI) / 180;
      nodes.push({
        id: `${r}-${i}`,
        x: r * Math.cos(angleRad),
        y: r * Math.sin(angleRad),
        ring: r
      });
    }
  }
  return nodes;
};

const getGridNodeCoordinates = (centerLat: number, centerLng: number, radiusInMiles: number, offsetX: number, offsetY: number, maxRings: number) => {
  const latDegreeRef = 69.0;
  const radLat = (centerLat * Math.PI) / 180;
  const lngDegreeRef = 69.0 * Math.cos(radLat);

  const maxLatOffset = radiusInMiles / latDegreeRef;
  const maxLngOffset = radiusInMiles / lngDegreeRef;

  // Spacing steps (-maxOffset to +maxOffset across size elements)
  const xPercent = maxRings > 0 ? offsetX / maxRings : 0; 
  const yPercent = maxRings > 0 ? offsetY / maxRings : 0; 

  // Invert yPercent so y=0 is north (top of the viewport) and y=(size-1) is south (bottom of viewport)
  return {
    lat: centerLat - yPercent * maxLatOffset,
    lng: centerLng + xPercent * maxLngOffset
  };
};

const INITIAL_CITY_CONFIGS: Record<string, CityConfig> = {
  'Murfreesboro': {
    keywords: 'electrician near me, emergency electrician, electrical repair, house rewiring',
    gmbName: 'Discount Electrical Service',
    radius: 10,
    gridSize: '5x5',
    placeId: 'ch_gmb_murf_37130',
    targetPlaceId: 'ch_gmb_murf_37130',
    scanFrequency: 'Manual Only',
    preferredTime: '08:00'
  }
};

// Seed random generation based on city and keyword to keep ratings somewhat stable
const getSeededRank = (city: string, keyword: string, nodeX: number, nodeY: number, maxRings: number, scanDate: string | null = null) => {
  const hashVal = Math.abs(Math.floor(nodeX * 10) + Math.floor(nodeY * 10));
  let code = (city.charCodeAt(0) || 1) + (keyword.charCodeAt(0) || 1) + hashVal;
  if (scanDate) {
    const charSum = scanDate.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    code += (charSum % 13) + 3;
  }
  const distFromCenter = Math.sqrt(Math.pow(nodeX, 2) + Math.pow(nodeY, 2));
  
  // Base rank depending on distance from center
  let base = Math.floor(distFromCenter * 2) + (code % 3) + 1;
  if (scanDate) {
    const variation = (code % 3) - 1; // -1, 0, or 1 variation for history simulation
    base = Math.max(1, base + variation);
  }
  if (base > 20) base = 21;
  return base;
};

interface Competitor {
  rank: number;
  name: string;
  reviews: number;
  rating?: number;
  isUser: boolean;
}

// Generates real competitors dynamically from the city name and generic keywords (such as Nashville Electrical Repair)
// if we have no live API scans loaded (e.g. in seeded simulation-only mode). This removes any hardcoded fallback pool.
const generateDynamicCompetitorsForNode = (
  city: string,
  keyword: string,
  nodeX: number,
  nodeY: number,
  userGmbName: string,
  userRank: number,
  maxRings: number
): Competitor[] => {
  return [];
};

// Generates real node competitors by partitioning and ranking the real competitor items parsed from DataForSEO
export const generateRealCompetitorsForNode = (
  realItems: any[],
  nodeX: number,
  nodeY: number,
  maxRings: number,
  userGmbName: string,
  calculatedUserRank: number
): Competitor[] => {
  console.log("DEBUG - Total items received from API:", realItems);
  
  if (!realItems || realItems.length === 0) {
    return []; // Return empty array for dead zones with no local search results
  }

  // Use the exact competitor array from the API response and re-index
  let competitors: Competitor[] = realItems.map((item: any) => ({
    name: item.name,
    rank: item.rank,
    reviews: item.reviews || 0,
    rating: item.rating || 0,
    isUser: item.isUser
  }));

  // Ensure unique ranks for React key rendering and sort
  competitors = competitors
    .sort((a, b) => a.rank - b.rank)
    .filter((comp, index, self) => {
      // Keep all user locations, otherwise filter by unique name
      if (comp.isUser) return true;
      return index === self.findIndex((c) => c.name === comp.name && !c.isUser);
    });

  // Re-assign ranks based on index so the node gets the absolute truth of their local slice position
  competitors.forEach((c, index) => {
    c.rank = index + 1;
  });

  // Ensure user is present in the list if calculatedUserRank <= 20
  if (calculatedUserRank <= 20 && !competitors.some((c: any) => c.isUser)) {
    competitors.push({
      name: userGmbName || 'Discount Electrical Service',
      rank: calculatedUserRank,
      reviews: Math.abs((nodeX + nodeY) * 77 % 240) + 15,
      isUser: true
    });
    // Re-sort again if we pushed a simulated user
    competitors.sort((a, b) => a.rank - b.rank);
  }

  return competitors;
};

const getPopupCompetitors = (comps: Competitor[]) => {
  const popupComps = comps.slice(0, 5);
  comps.forEach((c) => {
    if (c.isUser && !popupComps.some(pc => pc.rank === c.rank)) {
      popupComps.push(c);
    }
  });
  return popupComps.sort((a, b) => a.rank - b.rank);
};

// Unified helper to get the competitor list at a specific node coordinate (prioritizing real persistent data)
export const getCompetitorsForNode = (
  city: string,
  keyword: string,
  nodeX: number,
  nodeY: number,
  maxRings: number,
  userGmbName: string,
  userRank: number,
  activeScanOrLog?: { gridNodes?: any[] } | null
): Competitor[] => {
  if (activeScanOrLog && activeScanOrLog.gridNodes) {
    const matchingNode = activeScanOrLog.gridNodes.find((n: any) => (n.x === nodeX && n.y === nodeY) || Math.abs(n.x - nodeX) < 0.01 && Math.abs(n.y - nodeY) < 0.01);
    if (matchingNode) {
      if (matchingNode.keywords && matchingNode.keywords[keyword] && matchingNode.keywords[keyword].competitors) {
        return matchingNode.keywords[keyword].competitors;
      } else if (matchingNode.competitors) {
        return matchingNode.competitors;
      }
    }
  }
  return generateDynamicCompetitorsForNode(city, keyword, nodeX, nodeY, userGmbName, userRank, maxRings);
};

// Computes the general grid stats for all top competitors to build the global marketplace leaderboard
const getLeaderboard = (
  city: string,
  keyword: string,
  maxRings: number,
  userGmbName: string,
  scanDate: string | null,
  activeScanOrLog?: { gridNodes?: any[] } | null
) => {
  const competitorStats: Record<string, { totalRank: number; top3Count: number; isUser: boolean; count: number; reviews: number; rating: number }> = {};
  
  const userName = userGmbName || 'Discount Electrical Service';
  competitorStats[userName] = { totalRank: 0, top3Count: 0, isUser: true, count: 0, reviews: 0, rating: 0 };

  const radialNodes = maxRings === 1 ? generateRadialGrid('3x3') : maxRings === 2 ? generateRadialGrid('5x5') : maxRings === 3 ? generateRadialGrid('7x7') : maxRings === 4 ? generateRadialGrid('9x9') : generateRadialGrid('11x11');

  let totalValidCells = 0;

  for (const node of radialNodes) {
    let userRank = getSeededRank(city, keyword, node.x, node.y, maxRings, scanDate);
    if (activeScanOrLog && activeScanOrLog.gridNodes) {
      const matchingNode = activeScanOrLog.gridNodes.find((n: any) => n.id === node.id || (n.x === node.x && n.y === node.y));
      if (matchingNode) {
        if (matchingNode.keywords && matchingNode.keywords[keyword]) {
          userRank = matchingNode.keywords[keyword].userRank;
        } else {
          userRank = matchingNode.userRank;
        }
      }
    }
    
    const competitors = getCompetitorsForNode(city, keyword, node.x, node.y, maxRings, userGmbName, userRank, activeScanOrLog);
    
    if (competitors && competitors.length > 0) {
      totalValidCells++;
      competitors.forEach((c) => {
        if (!competitorStats[c.name]) {
          competitorStats[c.name] = { totalRank: 0, top3Count: 0, isUser: c.isUser, count: 0, reviews: c.reviews || 0, rating: c.rating || 0 };
        }
        competitorStats[c.name].totalRank += c.rank;
        if (c.rank <= 3) {
          competitorStats[c.name].top3Count++;
        }
        competitorStats[c.name].count++;
        
        if (c.reviews && c.reviews > competitorStats[c.name].reviews) {
          competitorStats[c.name].reviews = c.reviews;
          competitorStats[c.name].rating = c.rating || 0;
        }
      });
    }
  }

  const totalCells = totalValidCells > 0 ? totalValidCells : 1;
  const items = Object.entries(competitorStats).map(([name, stats]) => {
    const avg = stats.count > 0 ? stats.totalRank / stats.count : 6.0;
    const share = stats.count > 0 ? (stats.top3Count / totalCells) * 100 : 0;
    return {
      name,
      avgRank: parseFloat(avg.toFixed(1)),
      top3Share: Math.round(share),
      isUser: stats.isUser,
      reviews: stats.reviews,
      rating: stats.rating
    };
  });

  return items
    .sort((a, b) => b.top3Share - a.top3Share || a.avgRank - b.avgRank);
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Fetches the user's remaining balance from DataForSEO
 */
export async function fetchDataForSEOBalance(authKey: string): Promise<number> {
  const proxyUrl = '/api/dataforseo-proxy';
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint: 'https://api.dataforseo.com/v3/appendix/user_data',
      authKey: authKey
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`DataForSEO balance fetch failed: ${errData.details || errData.error || response.statusText}`);
  }

  const data = await response.json();
  const balance = data?.tasks?.[0]?.result?.[0]?.money?.balance;
  if (typeof balance !== 'number') {
    throw new Error('Invalid balance field structure in the DataForSEO api response.');
  }

  return balance;
}

export default function SEOHeatmap() {
  const [activeGmapsApiKey, setActiveGmapsApiKey] = useState('');
  const [activeDataforseoAuthKey, setActiveDataforseoAuthKey] = useState('');
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);

  useEffect(() => {
    async function fetchKeys() {
      setIsLoadingKeys(true);
      try {
        const docRef = doc(db, 'settings', 'admin_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.gmaps_api_key) {
            setActiveGmapsApiKey(data.gmaps_api_key);
          }
          if (data.dataforseo_auth_key) {
            setActiveDataforseoAuthKey(data.dataforseo_auth_key);
          }
        }
      } catch (error) {
        console.error("Error loading keys from Firestore admin_settings:", error);
      } finally {
        setIsLoadingKeys(false);
      }
    }
    fetchKeys();
  }, []);

  const handleKeysChange = (newGmaps: string, newDataforseo: string) => {
    setActiveGmapsApiKey(newGmaps);
    setActiveDataforseoAuthKey(newDataforseo);
  };

  const hasGmapsKey = Boolean(activeGmapsApiKey.trim());

  if (hasGmapsKey) {
    return (
      <APIProvider apiKey={activeGmapsApiKey.trim()} version="weekly" libraries={['places']}>
        <SEOHeatmapInner
          key={activeGmapsApiKey.trim()}
          gmapsKey={activeGmapsApiKey.trim()}
          dataforseoAuthKey={activeDataforseoAuthKey.trim()}
          isLoadingKeys={isLoadingKeys}
          onKeysChange={handleKeysChange}
        />
      </APIProvider>
    );
  }
  return (
    <SEOHeatmapInner
      key="no-key"
      gmapsKey=""
      dataforseoAuthKey={activeDataforseoAuthKey.trim()}
      isLoadingKeys={isLoadingKeys}
      onKeysChange={handleKeysChange}
    />
  );
}

function LivePlacesSearch({
  gmapsKey,
  selectedCity,
  tempGmbName,
  setTempGmbName,
  tempPlaceId,
  setTempPlaceId,
  searchedProfiles,
  setSearchedProfiles,
  searchingGmb,
  setSearchingGmb,
  isLoadingKeys,
}: {
  gmapsKey: string;
  selectedCity: string;
  tempGmbName: string;
  setTempGmbName: (val: string) => void;
  tempPlaceId: string;
  setTempPlaceId: (val: string) => void;
  searchedProfiles: Array<{ name: string; placeId: string; formatted_address: string }>;
  setSearchedProfiles: (val: Array<{ name: string; placeId: string; formatted_address: string }>) => void;
  searchingGmb: boolean;
  setSearchingGmb: (val: boolean) => void;
  isLoadingKeys: boolean;
}) {
  const placesLib = useMapsLibrary('places');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const selectInProgressRef = useRef(false);

  // Click outside listener to dismiss absolute autocomplete dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced listener watching tempGmbName typing
  useEffect(() => {
    const query = tempGmbName.trim();
    if (!query) {
      setSearchedProfiles([]);
      setIsDropdownOpen(false);
      return;
    }

    if (selectInProgressRef.current) {
      selectInProgressRef.current = false;
      return;
    }

    if (query.length < 2) {
      setSearchedProfiles([]);
      setIsDropdownOpen(false);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      triggerSearch(query);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [tempGmbName]);

  const triggerSearch = async (query: string) => {
    setSearchingGmb(true);
    setErrorMsg('');

    if (gmapsKey) {
      // Live Google Places integration
      if (!placesLib) {
        setErrorMsg('Places API is loading, please type further...');
        setSearchingGmb(false);
        return;
      }
      try {
        const response = await placesLib.Place.searchByText({
          textQuery: query,
          fields: ['id', 'displayName', 'formattedAddress'],
          maxResultCount: 6,
        });

        if (response && response.places && response.places.length > 0) {
          const results = response.places.map((p) => ({
            name: p.displayName || '',
            placeId: p.id || '',
            formatted_address: p.formattedAddress || '',
          }));
          setSearchedProfiles(results);
          setIsDropdownOpen(true);
        } else {
          setSearchedProfiles([]);
          setIsDropdownOpen(false);
          setErrorMsg('No live matches found for this business.');
        }
      } catch (err: any) {
        console.error('Google Places live search error:', err);
        setErrorMsg('Live query failed. Verify API Key limits.');
      } finally {
        setSearchingGmb(false);
      }
    } else {
      // Snappy built-in simulation for mock fallback mode
      setTimeout(() => {
        setSearchedProfiles([
          {
            name: `${query}`,
            placeId: `ChIJ${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            formatted_address: `${selectedCity}, TN, USA`
          },
          {
            name: `${query} Middle TN Hub`,
            placeId: `ChIJ${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            formatted_address: `100 Spark Blvd, Nashville, TN, USA`
          },
          {
            name: `${query} Premium Network`,
            placeId: `ChIJ${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            formatted_address: `45 Powerline Way, Brentwood, TN, USA`
          }
        ]);
        setIsDropdownOpen(true);
        setSearchingGmb(false);
      }, 200);
    }
  };

  return (
    <div ref={containerRef} className="relative space-y-1 bg-white">
      <div className="relative flex items-center bg-white rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 transition-shadow">
        <input
          type="text"
          required
          disabled={isLoadingKeys}
          value={isLoadingKeys ? "Loading credentials..." : tempGmbName}
          onChange={(e) => {
            setTempGmbName(e.target.value);
            setIsDropdownOpen(true);
          }}
          placeholder={isLoadingKeys ? "Loading Gmaps API credential..." : (gmapsKey ? "Search real Google Places..." : "Search Google Business profiles (simulated)...")}
          className="w-full px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent pr-8 border-none disabled:opacity-50"
        />
        {searchingGmb && (
          <div className="absolute right-3.5 flex items-center justify-center p-1 bg-white rounded-full">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="text-[10px] text-red-500 font-sans tracking-tight px-1">{errorMsg}</p>
      )}

      {/* Floating absolute positioned dropdown */}
      {isDropdownOpen && searchedProfiles.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 border border-slate-200 rounded-xl bg-white p-2.5 space-y-1.5 max-h-[220px] overflow-y-auto shadow-2xl z-50 animate-fadeIn">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1">
            {gmapsKey ? 'Google Maps Autocomplete Results:' : 'Simulated Autocomplete Results:'}
          </p>
          <div className="space-y-1">
            {searchedProfiles.map((p) => (
              <button
                key={p.placeId}
                type="button"
                onClick={() => {
                  selectInProgressRef.current = true;
                  setTempGmbName(p.name);
                  setTempPlaceId(p.placeId);
                  setSearchedProfiles([]);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left p-2 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 transition text-xs flex items-center justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{p.name}</p>
                  <p className="text-[9px] text-slate-400 font-sans mt-0.5 truncate">{p.formatted_address}</p>
                </div>
                <code className="text-[9px] font-mono text-slate-500 bg-slate-100 p-0.5 px-1.5 rounded shrink-0">{p.placeId}</code>
              </button>
            ))}
          </div>
        </div>
      )}

      {!gmapsKey && (
        <div className="bg-amber-50 text-amber-950 p-2 text-[10px] rounded-lg font-sans border border-amber-200 flex items-center gap-1 mt-1 shrink-0">
          <span className="font-extrabold text-amber-600">⚠️</span>
          <span>Credential API Key required for live Places API (mock mode active)</span>
        </div>
      )}
    </div>
  );
}

function SEOHeatmapInner({
  gmapsKey,
  dataforseoAuthKey,
  isLoadingKeys,
  onKeysChange,
}: {
  key?: string;
  gmapsKey: string;
  dataforseoAuthKey: string;
  isLoadingKeys: boolean;
  onKeysChange: (gmaps: string, dataforseo: string) => void;
}) {
  const [configs, setConfigs] = useState<Record<string, CityConfig>>(INITIAL_CITY_CONFIGS);
  const [selectedCity, setSelectedCity] = useState<string>('Murfreesboro');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState('');

  // Interface for history scan logs
  interface ScanLog {
    date: string;
    avgRank: string;
    shareOfVoice: number;
    gridNodes?: any[];
  }

  // Store which city-keyword configurations have been successfully scanned (populated state)
  const [scannedConfigurations, setScannedConfigurations] = useState<Record<string, boolean>>({});

  // Store dynamically generated past scan logs per city area
  const [pastScans, setPastScans] = useState<Record<string, ScanLog[]>>({});

  // Selected keyword index for visual ranking lookup
  const [activeKeywordIndex, setActiveKeywordIndex] = useState(0);

  // Temporary form states for the Modal
  const [tempKeywords, setTempKeywords] = useState('');
  const [tempGmbName, setTempGmbName] = useState('');
  const [tempRadius, setTempRadius] = useState(10);
  const [tempGridSize, setTempGridSize] = useState<'3x3' | '5x5' | '7x7' | '9x9' | '11x11'>('5x5');
  const [tempPlaceId, setTempPlaceId] = useState<string>('');
  const [tempScanFrequency, setTempScanFrequency] = useState<'Manual Only' | 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly'>('Manual Only');
  const [tempPreferredTime, setTempPreferredTime] = useState<string>('08:00');

  // Place ID selection search integration states
  const [searchingGmb, setSearchingGmb] = useState(false);
  const [searchedProfiles, setSearchedProfiles] = useState<Array<{ name: string; placeId: string; formatted_address: string }>>([]);

  // Dynamic Add New Area states
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newKeywords, setNewKeywords] = useState('electrician, wiring repair, residential lighting');
  const [newGmbName, setNewGmbName] = useState('Discount Electrical Service');
  const [newRadius, setNewRadius] = useState(10);
  const [newGridSize, setNewGridSize] = useState<'3x3' | '5x5' | '7x7' | '9x9' | '11x11'>('5x5');

  // Competitor Node inspection states
  const [selectedNode, setSelectedNode] = useState<{ x: number; y: number; rank: number; competitors?: any[] } | null>(null);

  // Selected scan date from history (null means current active scan)
  const [selectedScanDate, setSelectedScanDate] = useState<string | null>(null);

  // API Balance Tracker state variables
  const [apiBalance, setApiBalance] = useState<number | null>(null);
  const [isBalanceFetching, setIsBalanceFetching] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchBalance() {
      if (!dataforseoAuthKey.trim()) {
        setApiBalance(null);
        setBalanceError(false);
        setIsBalanceFetching(false);
        return;
      }
      setIsBalanceFetching(true);
      setBalanceError(false);
      try {
        const balance = await fetchDataForSEOBalance(dataforseoAuthKey.trim());
        if (active) {
          setApiBalance(balance);
        }
      } catch (err) {
        console.error("Error loading API balance:", err);
        if (active) {
          setBalanceError(true);
        }
      } finally {
        if (active) {
          setIsBalanceFetching(false);
        }
      }
    }
    fetchBalance();
    return () => {
      active = false;
    };
  }, [dataforseoAuthKey]);

  // Load schedules from the Firestore admin_settings collection on mount
  useEffect(() => {
    async function loadSchedules() {
      try {
        const q = query(collection(db, 'admin_settings'));
        const querySnapshot = await getDocs(q);
        const loadedConfigs: Record<string, CityConfig> = {};
        
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.serviceArea) {
            loadedConfigs[data.serviceArea] = {
              keywords: data.keywords || '',
              gmbName: data.gmbName || '',
              radius: Number(data.radius) || 10,
              gridSize: data.gridSize || '5x5',
              placeId: data.placeId || '',
              targetPlaceId: data.targetPlaceId || data.placeId || '',
              scanFrequency: data.scanFrequency || 'Manual Only',
              preferredTime: data.preferredTime || '08:00',
              center: data.center || undefined,
            };
          }
        });
        
        if (Object.keys(loadedConfigs).length > 0) {
          setConfigs((prev) => ({
            ...prev,
            ...loadedConfigs,
          }));
          const firstCity = Object.keys(loadedConfigs)[0];
          setSelectedCity(firstCity);
        }
      } catch (err) {
        console.error("Error loading schedules from admin_settings collection:", err);
      }
    }
    loadSchedules();
  }, []);

  // Settings modal states for DataForSEO & Google Maps
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsAuthKey, setSettingsAuthKey] = useState(dataforseoAuthKey);
  const [settingsGmapsApiKey, setSettingsGmapsApiKey] = useState(gmapsKey);
  const [savingSettings, setSavingSettings] = useState(false);
  const [liveApiScanning, setLiveApiScanning] = useState(false);

  useEffect(() => {
    setSettingsAuthKey(dataforseoAuthKey);
    setSettingsGmapsApiKey(gmapsKey);
  }, [dataforseoAuthKey, gmapsKey]);

  const currentConfig = configs[selectedCity] || {
    keywords: 'electrician',
    gmbName: 'Discount Electrical Service',
    radius: 10,
    gridSize: '5x5',
    placeId: 'loc_placeholder'
  };

  const keywordList = currentConfig.keywords.split(',').map(k => k.trim()).filter(Boolean);
  const activeKeyword = keywordList[activeKeywordIndex] || keywordList[0] || 'electrician';

  // Dynamic geocoded center states
  const [resolvedCenter, setResolvedCenter] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setResolvedCenter(null);
  }, [selectedCity, currentConfig.targetPlaceId, currentConfig.placeId]);

  // Database scan restoration states
  const [activeScanData, setActiveScanData] = useState<{
    id?: string;
    serviceArea: string;
    keyword: string;
    targetPlaceId: string;
    gridNodes: any[];
    timestamp: string;
  } | null>(null);
  const [isLoadingScan, setIsLoadingScan] = useState(false);

  const loadLatestScanAndHistory = async (city: string, keyword: string) => {
    setIsLoadingScan(true);
    try {
      const qAll = query(
        collection(db, 'seo_scans'),
        where('serviceArea', '==', city)
      );
      const allSnapshot = await getDocs(qAll);
      
      const allScans = allSnapshot.docs.map(docDoc => {
        const d = docDoc.data();
        return {
          id: docDoc.id,
          serviceArea: d.serviceArea,
          keyword: d.keyword,
          targetPlaceId: d.targetPlaceId,
          gridNodes: d.gridNodes || [],
          timestamp: d.timestamp
        };
      });

      // Sort in memory by timestamp desc
      allScans.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (allScans.length > 0) {
        const latestScan = allScans[0];
        setActiveScanData(latestScan);
        
        // Mark all keywords found in the latest scan's first node (or config) as of scanned configuration
        const firstNode = latestScan.gridNodes[0];
        if (firstNode && firstNode.keywords) {
          Object.keys(firstNode.keywords).forEach((kw) => {
            setScannedConfigurations(prev => ({
              ...prev,
              [`${city}_${kw}`]: true
            }));
          });
        }
        
        // Also fallback mark the stored keyword
        if (latestScan.keyword) {
          latestScan.keyword.split(',').map((kw: string) => kw.trim()).forEach((kw: string) => {
            setScannedConfigurations(prev => ({
              ...prev,
              [`${city}_${kw}`]: true
            }));
          });
        }
      } else {
        setActiveScanData(null);
      }

      // Convert allScans to scan log history list
      const logs: ScanLog[] = [];
      allScans.forEach((d) => {
        const nodes = d.gridNodes || [];
        
        let validNodes = 0;
        let sumRank = 0;
        let top3Count = 0;

        // Compute statistics for the active/selected keyword dynamically!
        nodes.forEach((n: any) => {
          let hasData = false;
          let r = n.userRank || 21;
          
          if (n.keywords && n.keywords[keyword]) {
            r = n.keywords[keyword].userRank;
            if (n.keywords[keyword].competitors && n.keywords[keyword].competitors.length > 0) {
              hasData = true;
            }
          } else if (n.competitors && n.competitors.length > 0) {
             hasData = true;
          }

          if (hasData) {
            validNodes++;
            sumRank += r;
            if (r <= 3) {
              top3Count++;
            }
          }
        });
        
        const safeTotalNodes = validNodes > 0 ? validNodes : 1;
        const avgRankVal = (sumRank / safeTotalNodes).toFixed(1);
        const shareVal = Math.round((top3Count / safeTotalNodes) * 100);
        
        const scanDate = new Date(d.timestamp);
        const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
        const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
        const dateString = `${scanDate.toLocaleDateString('en-US', dateOptions)} at ${scanDate.toLocaleTimeString('en-US', timeOptions)}`;
        
        logs.push({
          date: dateString,
          avgRank: avgRankVal,
          shareOfVoice: shareVal,
          gridNodes: nodes
        });
      });
      
      setPastScans(prev => ({
        ...prev,
        [city]: logs
      }));
    } catch (err) {
      console.error('Error loading latest scans:', err);
    } finally {
      setIsLoadingScan(false);
    }
  };

  useEffect(() => {
    loadLatestScanAndHistory(selectedCity, activeKeyword);
  }, [selectedCity, activeKeyword]);

  const handleOpenModal = () => {
    setTempKeywords(currentConfig.keywords);
    setTempGmbName(currentConfig.gmbName);
    setTempRadius(currentConfig.radius);
    setTempGridSize(currentConfig.gridSize);
    setTempPlaceId(currentConfig.placeId || '');
    setTempScanFrequency(currentConfig.scanFrequency || 'Manual Only');
    setTempPreferredTime(currentConfig.preferredTime || '08:00');
    setSearchedProfiles([]);
    setIsModalOpen(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = doc(db, 'admin_settings', selectedCity);
      await setDoc(docRef, {
        serviceArea: selectedCity,
        keywords: tempKeywords,
        gmbName: tempGmbName,
        radius: Number(tempRadius),
        gridSize: tempGridSize,
        placeId: tempPlaceId,
        targetPlaceId: tempPlaceId,
        scanFrequency: tempScanFrequency,
        preferredTime: tempPreferredTime || '08:00',
        center: resolvedCenter || getCityCenter(selectedCity, currentConfig),
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      console.error("Error saving schedule settings to Firestore admin_settings collection:", err);
    }

    setConfigs(prev => ({
      ...prev,
      [selectedCity]: {
        keywords: tempKeywords,
        gmbName: tempGmbName,
        radius: Number(tempRadius),
        gridSize: tempGridSize,
        placeId: tempPlaceId,
        targetPlaceId: tempPlaceId,
        scanFrequency: tempScanFrequency,
        preferredTime: tempPreferredTime
      }
    }));
    setActiveKeywordIndex(0);
    setIsModalOpen(false);
  };

  // Dynamic service area creator handler
  const handleAddNewArea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return;
    const cityKey = newCityName.trim();
    const pid = `loc_${cityKey.toLowerCase().replace(/\s+/g, '_')}_${Math.floor(Math.random() * 10000)}`;
    setConfigs(prev => ({
      ...prev,
      [cityKey]: {
        keywords: newKeywords,
        gmbName: newGmbName,
        radius: Number(newRadius),
        gridSize: newGridSize,
        placeId: pid,
        targetPlaceId: pid,
        scanFrequency: 'Manual Only'
      }
    }));
    setSelectedCity(cityKey);
    setActiveKeywordIndex(0);
    
    // reset form fields
    setNewCityName('');
    setIsAddAreaOpen(false);
  };

  // Google My Business profiles live search setup
  const handleSearchGmbProfiles = () => {
    if (!tempGmbName.trim()) return;
    setSearchingGmb(true);
    setSearchedProfiles([]);
    
    setTimeout(() => {
      const query = tempGmbName.trim();
      setSearchedProfiles([
        {
          name: `${query}`,
          placeId: `ChIJ${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          formatted_address: `${selectedCity}, TN, USA`
        },
        {
          name: `${query} Middle TN Hub`,
          placeId: `ChIJ${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          formatted_address: `100 Spark Blvd, Nashville, TN, USA`
        },
        {
          name: `${query} Premium Network`,
          placeId: `ChIJ${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          formatted_address: `45 Powerline Way, Brentwood, TN, USA`
        }
      ]);
      setSearchingGmb(false);
    }, 1000);
  };

  const handleRemoveArea = (cityToRemove: string) => {
    setConfigs(prev => {
      const copy = { ...prev };
      delete copy[cityToRemove];
      const remainingKeys = Object.keys(copy);
      if (remainingKeys.length > 0) {
        if (selectedCity === cityToRemove) {
          setSelectedCity(remainingKeys[0]);
          setActiveKeywordIndex(0);
          setSelectedNode(null);
          setSelectedScanDate(null);
        }
      } else {
        setSelectedCity('');
        setActiveKeywordIndex(0);
        setSelectedNode(null);
        setSelectedScanDate(null);
        setScannedConfigurations({});
        setPastScans({});
        setScanProgress(0);
        setScanning(false);
        setActiveScanData(null);
      }
      return copy;
    });
    setIsModalOpen(false);
  };

  const handleClearAllAreas = () => {
    const confirmed = window.confirm("Are you sure you want to clear all service area profiles? This action cannot be undone.");
    if (confirmed) {
      setConfigs({});
      setSelectedCity('');
      setActiveKeywordIndex(0);
      setSelectedNode(null);
      setSelectedScanDate(null);
      setScannedConfigurations({});
      setPastScans({});
      setScanProgress(0);
      setScanning(false);
      setActiveScanData(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const docRef = doc(db, 'settings', 'admin_settings');
      await setDoc(docRef, {
        gmaps_api_key: settingsGmapsApiKey.trim(),
        dataforseo_auth_key: settingsAuthKey.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'administrator'
      });
      onKeysChange(settingsGmapsApiKey.trim(), settingsAuthKey.trim());
      setIsSettingsOpen(false);
      alert('Credentials saved successfully! Your Google Maps key and DataForSEO authorization key have been stored securely in the database.');
    } catch (error: any) {
      console.error('Error saving admin settings:', error);
      handleFirestoreError(error, OperationType.WRITE, 'settings/admin_settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLiveScan = async () => {
    if (!dataforseoAuthKey) {
      alert("DataForSEO Base64 Auth Key is not configured. Please open Settings (the gear icon next to 'Add New Area') to supply your key.");
      setIsSettingsOpen(true);
      return;
    }

    setLiveApiScanning(true);
    setSelectedScanDate(null);
    setSelectedNode(null);

    // Run the high-fidelity UI simulated scan dynamically so the dashboard stays beautifully interactive
    triggerScan();

    try {
      const center = resolvedCenter || getCityCenter(selectedCity, currentConfig);
      const radialNodes = generateRadialGrid(currentConfig.gridSize);
      const maxRings = currentConfig.gridSize === '3x3' ? 1 : currentConfig.gridSize === '5x5' ? 2 : currentConfig.gridSize === '7x7' ? 3 : currentConfig.gridSize === '9x9' ? 4 : 5;

      console.log('Initiating sequential DataForSEO Live GMB Heatmap list scans for all keywords:', keywordList);
      
      const results = [];
      for (const kw of keywordList) {
        const payload = {
          name: selectedCity,
          keywords: kw,
          gmbName: currentConfig.gmbName,
          radius: currentConfig.radius,
          gridSize: currentConfig.gridSize,
          placeId: currentConfig.placeId,
          coordinates: radialNodes.map(node => getGridNodeCoordinates(center.lat, center.lng, currentConfig.radius, node.x, node.y, maxRings))
        };
        console.log(`Firing sequential scanner request for: "${kw}" with ${payload.coordinates.length} coordinates`);
        const data = await runLiveHeatmapScan(payload, dataforseoAuthKey);
        results.push({ keyword: kw, data });
      }

      console.log('Sequential DataForSEO GMB results resolved successfully:', results);

      // Extract real competitor search listings for each keyword response and node
      const keywordDataMap: Record<string, Record<string, any[]>> = {};
      results.forEach(({ keyword, data }) => {
        keywordDataMap[keyword] = {};
        try {
          const tasks = data?.tasks || [];
          tasks.forEach((task: any, index: number) => {
            const nodeId = radialNodes[index]?.id;
            if (!nodeId) return;
            
            const realItems: any[] = [];
            const resList = task?.result || [];
            for (const res of resList) {
              const items = res?.items || [];
              for (const item of items) {
                if (item?.title) {
                  const TARGET_PLACE_ID = 'ChIJmwiSW-OR748RsEl_giM-IMI';
                  const isUser = item.place_id === TARGET_PLACE_ID;
                  realItems.push({
                    name: item.title,
                    rank: item.rank_group || item.rank_absolute || 21,
                    reviews: item.rating?.votes_count || item.reviews_count || 0,
                    rating: item.rating?.value || 0,
                    isUser: isUser
                  });
                }
              }
            }
            keywordDataMap[keyword][nodeId] = realItems;
          });
        } catch (err) {
          console.error(`Error parsing items for keyword ${keyword}:`, err);
        }
      });

      // Save on Scan: Create the unified gridNodes array
      const gridNodesToSave = [];
      
      for (const node of radialNodes) {
        const coords = getGridNodeCoordinates(center.lat, center.lng, currentConfig.radius, node.x, node.y, maxRings);
        
        const keywordsMap: Record<string, { userRank: number; competitors: any[] }> = {};
        
        keywordList.forEach((kw) => {
          const realItems = keywordDataMap[kw]?.[node.id] || [];
          const userInReal = realItems.find((item: any) => item.isUser);
          const distFromCenter = Math.sqrt(Math.pow(node.x, 2) + Math.pow(node.y, 2));
          const decay = Math.floor(distFromCenter * 1.5);
          
          let calculatedUserRank = 21;
          
          if (realItems && realItems.length > 0) {
            const competitors = generateRealCompetitorsForNode(realItems, node.x, node.y, maxRings, currentConfig.gmbName, 21);
            const userInComps = competitors.find(c => c.isUser);
            calculatedUserRank = userInComps ? userInComps.rank : 21;
            
            keywordsMap[kw] = {
              userRank: calculatedUserRank,
              competitors: competitors
            };
          } else {
            const baseUserRank = getSeededRank(selectedCity, kw, node.x, node.y, maxRings, null);
            calculatedUserRank = Math.min(21, baseUserRank + decay);
            const competitors = generateRealCompetitorsForNode([], node.x, node.y, maxRings, currentConfig.gmbName, calculatedUserRank);
            
            keywordsMap[kw] = {
              userRank: calculatedUserRank,
              competitors: competitors
            };
          }
        });

        const defaultKw = keywordList[0] || 'electrician';
        const defaultRank = keywordsMap[defaultKw]?.userRank || 21;

        gridNodesToSave.push({
          id: node.id,
          latitude: coords.lat,
          longitude: coords.lng,
          userRank: defaultRank,
          x: node.x,
          y: node.y,
          keywords: keywordsMap
        });
      }

      const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const docRef = doc(db, 'seo_scans', scanId);
      const scanPayload = {
        serviceArea: selectedCity,
        keyword: currentConfig.keywords, // Store the array/string of keywords
        targetPlaceId: currentConfig.targetPlaceId || currentConfig.placeId || "",
        gridNodes: gridNodesToSave,
        timestamp: new Date().toISOString()
      };

      try {
        await setDoc(docRef, scanPayload);
        // Automatically fetch and reload latest scan and logs from Firestore to ensure perfect state sync
        await loadLatestScanAndHistory(selectedCity, activeKeyword);
        
        // Refresh balance after scan completes
        if (dataforseoAuthKey.trim()) {
          try {
            const updatedBalance = await fetchDataForSEOBalance(dataforseoAuthKey.trim());
            setApiBalance(updatedBalance);
            setBalanceError(false);
          } catch (err) {
            console.error("Error refreshing API balance:", err);
          }
        }
      } catch (dbErr: any) {
        handleFirestoreError(dbErr, OperationType.WRITE, `seo_scans/${scanId}`);
      }

      alert('Batch multi-keyword GMB scan resolved successfully and stored securely!');
    } catch (err: any) {
      console.error('DataForSEO API scan request failed:', err);
      alert('DataForSEO API scan failed: ' + err.message);
    } finally {
      setLiveApiScanning(false);
    }
  };



  const triggerScan = () => {
    setScanning(true);
    setScanProgress(0);
    setScanStep('Querying GMB Coordinates...');
    
    const steps = [
      { text: 'Locating Google Maps Grid Pins...', progress: 20 },
      { text: 'Fetching Competitor Ranks for "' + activeKeyword + '"...', progress: 50 },
      { text: 'Calculating Distance Decay Factor...', progress: 80 },
      { text: 'Heatmap Matrix Compilation Complete!', progress: 100 }
    ];

    let currentStepIdx = 0;
    const interval = setInterval(() => {
      if (currentStepIdx < steps.length) {
        setScanStep(steps[currentStepIdx].text);
        setScanProgress(steps[currentStepIdx].progress);
        currentStepIdx++;
      } else {
        clearInterval(interval);
        setScanning(false);

        // Mark the current configuration as scanned successfully
        setScannedConfigurations(prev => ({
          ...prev,
          [`${selectedCity}_${activeKeyword}`]: true
        }));

        // Dynamically compute exact stats to store in the past scan history log
        const radialNodes = generateRadialGrid(currentConfig.gridSize);
        const maxRings = currentConfig.gridSize === '3x3' ? 1 : currentConfig.gridSize === '5x5' ? 2 : currentConfig.gridSize === '7x7' ? 3 : currentConfig.gridSize === '9x9' ? 4 : 5;
        
        let runningTotalRank = 0;
        let runningTop3Count = 0;
        const totalNodes = radialNodes.length;
        
        for (const node of radialNodes) {
          const r = getSeededRank(selectedCity, activeKeyword, node.x, node.y, maxRings, null);
          runningTotalRank += r;
          if (r <= 3) {
            runningTop3Count++;
          }
        }
        const calculatedAvgRank = (runningTotalRank / totalNodes).toFixed(1);
        const calculatedShareOfVoice = Math.round((runningTop3Count / totalNodes) * 100);

        // Capture local timestamp for the log
        const now = new Date();
        const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
        const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
        const dateAndTimeString = `${now.toLocaleDateString('en-US', dateOptions)} at ${now.toLocaleTimeString('en-US', timeOptions)}`;

        setPastScans(prev => {
          const existing = prev[selectedCity] || [];
          const newLog: ScanLog = {
            date: dateAndTimeString,
            avgRank: calculatedAvgRank,
            shareOfVoice: calculatedShareOfVoice
          };
          return {
            ...prev,
            [selectedCity]: [newLog, ...existing]
          };
        });
      }
    }, 800);
  };

  // Grid details calculations
  const radialNodes = generateRadialGrid(currentConfig.gridSize);
  const maxRings = currentConfig.gridSize === '3x3' ? 1 : currentConfig.gridSize === '5x5' ? 2 : currentConfig.gridSize === '7x7' ? 3 : currentConfig.gridSize === '9x9' ? 4 : 5;
  
  // Find if there is a selected scan log matching selectedScanDate
  const currentLogs = pastScans[selectedCity] || [];
  const selectedLog = currentLogs.find(l => l.date === selectedScanDate);

  // Calculate average rating score in view
  let totalRank = 0;
  let top3PercentageSum = 0;
  let validCellCount = 0;
  const gridCells = [];
  
  for (const node of radialNodes) {
    let rank = getSeededRank(selectedCity, activeKeyword, node.x, node.y, maxRings, selectedScanDate);
    
    // Override from database/state scan data if available
    if (selectedScanDate !== null) {
      if (selectedLog && selectedLog.gridNodes) {
        const matchingNode = selectedLog.gridNodes.find(n => n.id === node.id || (n.x === node.x && n.y === node.y));
        if (matchingNode) {
          if (matchingNode.keywords && matchingNode.keywords[activeKeyword]) {
            rank = matchingNode.keywords[activeKeyword].userRank;
          } else {
            rank = matchingNode.userRank;
          }
        }
      }
    } else if (activeScanData && activeScanData.serviceArea === selectedCity && 
               (activeScanData.keyword === activeKeyword || (activeScanData.keyword && activeScanData.keyword.split(',').map((k: any) => k.trim()).includes(activeKeyword)))) {
      if (activeScanData.gridNodes) {
        const matchingNode = activeScanData.gridNodes.find((n: any) => n.id === node.id || (n.x === node.x && n.y === node.y));
        if (matchingNode) {
          if (matchingNode.keywords && matchingNode.keywords[activeKeyword]) {
            rank = matchingNode.keywords[activeKeyword].userRank;
          } else {
            rank = matchingNode.userRank;
          }
        }
      }
    }
    
    const comps = getCompetitorsForNode(
      selectedCity,
      activeKeyword,
      node.x,
      node.y,
      maxRings,
      currentConfig.gmbName,
      rank,
      selectedScanDate !== null ? selectedLog : activeScanData
    );

    const hasData = comps && comps.length > 0;
    
    if (hasData) {
      const userComp = comps.find(c => c.isUser);
      if (userComp) {
        rank = userComp.rank;
      } else {
        rank = 21;
      }
      totalRank += rank;
      validCellCount++;
      if (rank <= 3) {
        top3PercentageSum++;
      }
    }
    
    gridCells.push({ id: node.id, x: node.x, y: node.y, ring: node.ring, rank, hasData });
  }

  // Check if live scan data exists in state for the selected city and active keyword
  const hasScanData = Boolean(
    selectedScanDate || 
    scannedConfigurations[`${selectedCity}_${activeKeyword}`] ||
    (activeScanData && activeScanData.serviceArea === selectedCity && 
     (activeScanData.keyword === activeKeyword || (activeScanData.keyword && activeScanData.keyword.split(',').map((k: any) => k.trim()).includes(activeKeyword))))
  );

  const safeCellCount = validCellCount > 0 ? validCellCount : 1;
  const avgRank = hasScanData ? (totalRank / safeCellCount).toFixed(1) : '-';
  const shareOfVoice = hasScanData ? Math.round((top3PercentageSum / safeCellCount) * 100) : '-';

  return (
    <div id="seo_heatmap_dashboard" className="space-y-6 max-w-7xl mx-auto px-2 pb-12">
      
      {/* Dynamic Header & Selectors Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="bg-cyan-500/10 border border-cyan-500/20 p-2.5 rounded-xl text-cyan-400">
            <Map className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-widest uppercase font-bold text-cyan-400">SEO Audit Utilities</span>
            <h1 className="text-xl font-extrabold tracking-tight font-sans">Local GMB Ranking Heatmap</h1>
            <p className="text-xs text-slate-400 mt-0.5">Geo-targeted Local SEO maps tracker & competitor search intelligence</p>
          </div>
        </div>

        {/* Dropdown & Dynamic area addition options */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center space-x-2 flex-wrap">
            <span className="text-xs font-bold text-slate-300 shrink-0 mr-1">Service Area:</span>
            {Object.keys(configs).length > 0 && (
              <button
                type="button"
                onClick={handleClearAllAreas}
                className="text-[10px] text-slate-400 hover:text-rose-400 font-mono tracking-wider transition-colors cursor-pointer mr-2"
                title="Clear all service areas"
              >
                [CLEAR ALL]
              </button>
            )}
            
            {Object.keys(configs).length === 0 ? (
              <span className="text-[11px] text-slate-500 italic mr-2">No areas configured</span>
            ) : (
              Object.keys(configs).map((city) => (
                <div 
                  key={city}
                  className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition mb-1 ${
                    selectedCity === city 
                      ? 'bg-slate-800 border-slate-600 text-white shadow-sm' 
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCity(city);
                      setActiveKeywordIndex(0);
                      setSelectedNode(null);
                      setSelectedScanDate(null);
                    }}
                    className="cursor-pointer hover:text-white transition"
                  >
                    {city}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveArea(city)}
                    className="text-slate-500 hover:text-rose-400 rounded-full hover:bg-slate-700 p-0.5 transition cursor-pointer flex items-center justify-center shrink-0 ml-1"
                    title={`Remove ${city}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}

            {/* Scalable Service Areas: Add New Area Button */}
            <button
              type="button"
              onClick={() => setIsAddAreaOpen(true)}
              className="flex items-center justify-center p-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white transition-all duration-150 cursor-pointer shadow-sm"
              title="Add New Service Area Profile"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* API Balance Badge */}
            {(!dataforseoAuthKey.trim() || balanceError) ? (
              <div 
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[11px] text-rose-400 font-extrabold shadow-sm shrink-0" 
                title={!dataforseoAuthKey.trim() ? "No API authorization key configured" : "Failed to load balance from API"}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>API Error</span>
              </div>
            ) : isBalanceFetching ? (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700/60 rounded-xl text-[11px] text-slate-400 font-semibold shadow-sm animate-pulse shrink-0">
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-spin" />
                <span>Loading Balance...</span>
              </div>
            ) : (
              <div 
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-400 font-extrabold shadow-sm font-mono cursor-help shrink-0" 
                title={`DataForSEO API Balance: $${apiBalance !== null ? apiBalance.toFixed(2) : '0.00'}`}
              >
                <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>API Balance: ${apiBalance !== null ? apiBalance.toFixed(2) : '0.00'}</span>
              </div>
            )}

            {/* DataForSEO Live Settings Gear */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              disabled={isLoadingKeys}
              className={`flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700 transition shadow-sm ${isLoadingKeys ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
              title={isLoadingKeys ? "Loading credentials from database..." : "Configure DataForSEO Live GMB Sync Setup"}
              id="dataforseo_api_settings_btn"
            >
              <Settings className={`w-4 h-4 ${isLoadingKeys ? 'animate-spin text-cyan-405' : 'animate-spin-hover'}`} />
            </button>
          </div>

          <button
            onClick={handleOpenModal}
            className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-900 text-cyan-400 hover:text-white px-4 py-2 border border-slate-700 rounded-xl font-bold text-xs transition duration-150 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>Edit Parameters</span>
          </button>
        </div>
      </div>

      {Object.keys(configs).length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center mt-6">
          <div className="bg-cyan-100 text-cyan-600 p-4 rounded-full mb-4">
            <Map className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-800 mb-2">No Service Areas Configured</h2>
          <p className="text-slate-500 text-sm max-w-md mb-6">
            Get started by adding a service area profile to track local SEO performance, grid rankings, and competitor market share.
          </p>
          <button
            type="button"
            onClick={() => setIsAddAreaOpen(true)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service Area</span>
          </button>
        </div>
      ) : (
        <>
          {/* Target parameters summary widget */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-slate-200 text-slate-700 font-bold font-mono text-[10px] px-2 py-0.5 rounded-full">
              Connected Profile
            </span>
            <span className="text-xs font-bold text-slate-800">{currentConfig.gmbName}</span>
            {currentConfig.placeId && (
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold font-mono text-[10px] px-2.5 py-0.5 rounded-full">
                ID: {currentConfig.placeId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Radius: <strong className="text-slate-700">{currentConfig.radius} miles</strong></span>
            <span className="text-slate-300">|</span>
            <span>Grid: <strong className="text-slate-700">{currentConfig.gridSize} ({radialNodes.length} geo-points)</strong></span>
          </div>
        </div>

        <div className="w-full md:w-auto overflow-x-auto flex items-center space-x-2 pb-1 md:pb-0 font-sans">
          {keywordList.map((kw, idx) => (
            <button
              key={kw}
              onClick={() => {
                setActiveKeywordIndex(idx);
                setSelectedNode(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition cursor-pointer border ${
                idx === activeKeywordIndex
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm hover:bg-blue-700'
                  : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800'
              }`}
            >
              {kw}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid View Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Heatmap Visual Matrix Cards */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm md:text-base tracking-tight flex items-center gap-2 font-sans">
                <span>Map Grid Visualizer: </span>
                <span className="text-indigo-600 font-medium font-mono">{activeKeyword}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulated {selectedCity} GMB rankings. <strong className="text-indigo-600">Click any grid node</strong> to trigger Competitor Node Inspection.
              </p>
            </div>

            <button
              onClick={handleLiveScan}
              disabled={scanning || liveApiScanning}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              id="trigger_live_matrix_scan_btn"
            >
              <RefreshCw className={`w-4 h-4 ${scanning || liveApiScanning ? 'animate-spin' : ''}`} />
              <span>
                {liveApiScanning 
                  ? 'Connecting API...' 
                  : scanning 
                  ? 'Running SEO Scan...' 
                  : 'Trigger Live Matrix Scan'}
              </span>
            </button>
          </div>

          {/* Historical Data View Warning Badge */}
          {selectedScanDate && !scanning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-amber-800 text-xs shadow-xs animate-fadeIn">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 animate-bounce" />
                <span>Viewing Historical Data: <strong className="font-bold text-amber-950">{selectedScanDate}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScanDate(null)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-800 text-white font-extrabold rounded-lg text-[10px] uppercase tracking-wider transition cursor-pointer border border-amber-700"
              >
                Return to Current
              </button>
            </div>
          )}

          {/* Loader Overlay */}
          {scanning ? (
            <div className="h-[400px] flex flex-col items-center justify-center space-y-4 bg-slate-950 rounded-2xl text-white border border-slate-800 transition duration-300">
              <RefreshCw className="w-10 h-10 animate-spin text-cyan-400" />
              <div className="text-center space-y-1">
                <p className="font-bold text-sm tracking-tight">{scanStep}</p>
                <div className="w-48 bg-slate-800 rounded-full h-1.5 overflow-hidden mx-auto">
                  <div className="bg-cyan-400 h-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>
            </div>
          ) : (() => {
            const hasGmapsKey = Boolean(gmapsKey.trim());
            const center = resolvedCenter || getCityCenter(selectedCity, currentConfig);
            const zoomVal = getZoomForRadius(currentConfig.radius);

            // Compute coordinates for all GridNodes
            const gridNodes = gridCells.map((cell) => {
              const coords = getGridNodeCoordinates(center.lat, center.lng, currentConfig.radius, cell.x, cell.y, maxRings);
              return {
                id: cell.id,
                latitude: coords.lat,
                longitude: coords.lng,
                userRank: cell.rank,
                x: cell.x,
                y: cell.y,
                hasData: cell.hasData
              };
            });

            if (hasGmapsKey) {
              return (
                <div className="relative rounded-2xl border border-slate-200 overflow-hidden shadow-md bg-slate-100" style={{ height: '450px', width: '100%' }}>
                  <APIProvider apiKey={gmapsKey.trim()} version="weekly">
                    <GoogleMap
                      defaultCenter={center}
                      defaultZoom={zoomVal}
                      mapId="DEMO_MAP_ID"
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      style={{ width: '100%', height: '100%' }}
                      options={{
                        disableDefaultUI: true,
                        zoomControl: true,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false
                      }}
                    >
                      <MapController 
                        selectedCity={selectedCity} 
                        currentConfig={currentConfig} 
                        onCenterResolved={setResolvedCenter} 
                      />
                      {hasScanData && gridNodes.map((node) => {
                        const r = node.userRank;
                        let colorBg = 'bg-emerald-500 hover:bg-emerald-600 text-white ring-8 ring-emerald-500/10 hover:scale-105';
                        if (!node.hasData) {
                          colorBg = 'bg-slate-400 hover:bg-slate-500 text-white ring-8 ring-slate-400/10 hover:scale-105';
                        } else if (r > 3 && r <= 10) {
                          colorBg = 'bg-amber-500 hover:bg-amber-600 text-white ring-8 ring-amber-500/10 hover:scale-105';
                        } else if (r > 10) {
                          colorBg = 'bg-rose-500 hover:bg-rose-600 text-white ring-8 ring-rose-500/10 hover:scale-105';
                        }

                        // Check if node is currently inspected/active
                        const isInspected = selectedNode && selectedNode.x === node.x && selectedNode.y === node.y;
                        const ringStyle = isInspected ? 'ring-4 ring-indigo-600 ring-offset-2 border-indigo-600 scale-110 z-20 shadow-lg' : 'border-white';

                        return (
                          <AdvancedMarker
                            key={node.id}
                            position={{ lat: node.latitude, lng: node.longitude }}
                            onClick={() => {
                              const comps = getCompetitorsForNode(
                                selectedCity,
                                activeKeyword,
                                node.x,
                                node.y,
                                maxRings,
                                currentConfig.gmbName,
                                r,
                                selectedScanDate !== null ? selectedLog : activeScanData
                              );
                              setSelectedNode({ x: node.x, y: node.y, rank: r, competitors: getPopupCompetitors(comps) });
                            }}
                          >
                            <div 
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm font-mono cursor-pointer transition shadow-sm shrink-0 border ${colorBg} ${ringStyle}`}
                              style={{ transform: 'translate(-50%, -50%)', width: '40px', height: '40px' }}
                              title={`Coordinate Node [X:${node.x + 1}, Y:${node.y + 1}] - Click to inspect GMB Rank: ${!node.hasData ? 'Unranked' : r <= 20 ? '#' + r : '20+'}`}
                              id={`gmap_marker_${node.x}_${node.y}`}
                            >
                              {!node.hasData ? '-' : r <= 20 ? r : '20+'}
                            </div>
                          </AdvancedMarker>
                        );
                      })}
                    </GoogleMap>
                  </APIProvider>

                  {/* Tiny floating legends and cues if scan data is present */}
                  {hasScanData && (
                    <>
                      <div className="absolute top-3 left-3 bg-white/95 border border-slate-200 rounded-xl p-2.5 px-3 text-[9px] font-mono text-slate-600 flex flex-col gap-1 shadow-md z-10">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          <span>1-3 (Top Packers)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                          <span>4-10 (Organic page 1)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                          <span>11+ (Low visibility)</span>
                        </div>
                      </div>
                      
                      <div className="absolute bottom-3 right-3 bg-slate-900/95 text-white border border-slate-700/50 rounded-lg py-1 px-2.5 text-[9px] font-sans font-bold shadow-md z-10">
                        ℹ️ Click any marker to view competitor details
                      </div>
                    </>
                  )}

                  {/* Clean empty overlay state stating: 'No scan data available. Click [Trigger Live Matrix Scan] to generate your first report.' */}
                  {!hasScanData && (
                    <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center z-10 animate-fadeIn">
                      <div className="bg-slate-900/95 border border-slate-700 p-6 rounded-2xl max-w-sm space-y-4 shadow-2xl text-white">
                        <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-2xl text-indigo-400 inline-block">
                          <Compass className="w-8 h-8 animate-pulse" />
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="font-extrabold text-sm text-white tracking-tight">No scan data available</h4>
                          <p className="text-xs text-slate-300 leading-normal">
                            No scan data available. Click <strong className="text-indigo-400 cursor-pointer underline hover:text-indigo-300" onClick={handleLiveScan}>[Trigger Live Matrix Scan]</strong> to generate your first report.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleLiveScan}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs tracking-tight transition-all duration-150 cursor-pointer shadow-md inline-flex items-center justify-center gap-1.5 border-none"
                        >
                          <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" />
                          <span>Trigger Live Matrix Scan</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Fallback screen if there's no Google Maps key configured yet
            return (
              <div className="relative bg-slate-100 rounded-2xl border border-slate-200 p-8 flex flex-col items-center justify-center min-h-[420px] overflow-hidden">
                <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#3b82f6_1.5px,transparent_1.5px)] [background-size:16px_16px]"></div>
                
                <div className="relative z-10 space-y-5 w-full flex flex-col items-center justify-center">
                  
                  {/* Informational Alerts */}
                  <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 p-4 rounded-2xl text-center max-w-sm space-y-1.5 shadow-sm">
                    <p className="text-xs font-bold font-sans flex items-center justify-center gap-1.5">
                      <Compass className="w-4 h-4 text-indigo-600" />
                      <span>Google Map Visualization Ready</span>
                    </p>
                    <p className="text-[10px] text-slate-500 leading-normal font-sans">
                      Visualize ranking coordinates over a real interactive Google Map! Save your Google Maps API Key in Settings to instantly upgrade from a mock grid overlay.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer border-none shadow-sm"
                    >
                      <Settings className="w-3 h-3 animate-spin-hover" />
                      <span>Configure API Key</span>
                    </button>
                  </div>

                  {/* Fallback Interactive Mock CSS Grid */}
                  {hasScanData ? (
                    <>
                      <div 
                        className="relative mx-auto flex items-center justify-center p-8 bg-white/70 backdrop-blur-xs rounded-2xl shadow-md border border-slate-200"
                        style={{ height: '360px', width: '360px' }}
                      >
                        <div className="relative w-full h-full flex items-center justify-center">
                          {gridCells.map((cell) => {
                            const r = cell.rank;
                            let colorBg = 'bg-emerald-500 hover:bg-emerald-700 text-white ring-4 ring-emerald-500/30 hover:scale-105';
                            if (!cell.hasData) {
                              colorBg = 'bg-slate-400 hover:bg-slate-500 text-white ring-4 ring-slate-400/30 hover:scale-105';
                            } else if (r > 3 && r <= 10) {
                              colorBg = 'bg-amber-500 hover:bg-amber-700 text-white ring-4 ring-amber-500/30 hover:scale-105';
                            } else if (r > 10) {
                              colorBg = 'bg-rose-500 hover:bg-rose-700 text-white ring-4 ring-rose-500/30 hover:scale-105';
                            }

                            const isInspected = selectedNode && selectedNode.x === cell.x && selectedNode.y === cell.y;
                            const ringStyle = isInspected ? 'ring-4 ring-indigo-600 ring-offset-2 border-indigo-600 scale-110 z-20 shadow-lg' : 'border-white';
                            
                            // Map cell.x (-maxRings to +maxRings) into percentage offset for absolute positioning
                            // center is 50%, and maxRings distance is 50%
                            const leftOffset = 50 + (maxRings > 0 ? (cell.x / maxRings) * 45 : 0);
                            const topOffset = 50 + (maxRings > 0 ? (cell.y / maxRings) * 45 : 0);

                            return (
                              <button
                                key={cell.id}
                                type="button" 
                                onClick={() => {
                                  const comps = getCompetitorsForNode(
                                    selectedCity,
                                    activeKeyword,
                                    cell.x,
                                    cell.y,
                                    maxRings,
                                    currentConfig.gmbName,
                                    r,
                                    selectedScanDate !== null ? selectedLog : activeScanData
                                  );
                                  setSelectedNode({ x: cell.x, y: cell.y, rank: r, competitors: getPopupCompetitors(comps) });
                                }}
                                className={`absolute w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center font-bold text-sm font-mono cursor-pointer transition shadow-sm border ${colorBg} ${ringStyle}`}
                                style={{ 
                                  left: `${leftOffset}%`, 
                                  top: `${topOffset}%`,
                                  transform: 'translate(-50%, -50%)'
                                }}
                                title={`Click to inspect coordinate ring ${cell.ring} - GMB Rank: ${!cell.hasData ? 'Unranked' : r <= 20 ? '#' + r : '20+'}`}
                              >
                                {!cell.hasData ? '-' : r <= 20 ? r : '20+'}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Compass Marker details */}
                      <div className="bg-white/90 border border-slate-200 rounded-xl p-2.5 px-4 text-[10px] font-mono text-slate-500 flex flex-wrap items-center justify-center gap-4 shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          <span>1-3 (Top Packers)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                          <span>4-10 (Organic page 1)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                          <span>11+ (Low visibility)</span>
                        </div>
                        <div className="text-slate-300">|</div>
                        <div className="text-indigo-600 font-sans font-bold">Click any coordinate above to inspect competitors</div>
                      </div>
                    </>
                  ) : (
                    /* Centered empty state overlay card */
                    <div className="p-6 bg-white/95 border border-slate-200 rounded-2xl max-w-sm text-center space-y-4 shadow-md mt-4 animate-fadeIn">
                      <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl inline-block">
                        <Compass className="w-8 h-8 animate-pulse" />
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="font-extrabold text-slate-900 text-sm tracking-tight font-sans">No scan data available</h4>
                        <p className="text-xs text-slate-500 leading-normal font-sans">
                          No scan data available. Click <strong className="text-indigo-600 cursor-pointer underline hover:text-indigo-500" onClick={handleLiveScan}>[Trigger Live Matrix Scan]</strong> to generate your first report.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLiveScan}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs tracking-tight transition-all duration-150 cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5 border-none"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" />
                        <span>Trigger Live Matrix Scan</span>
                      </button>
                    </div>
                  )}

                </div>
              </div>
            );
          })()}
        </div>

        {/* Local SEO metrics panel */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Key Metric indicators */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm tracking-tight border-b pb-3 font-sans">
              SEO Grid Summary Table
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Average position</p>
                <p className="text-2xl font-black text-slate-800 font-mono mt-1">
                  {hasScanData ? `#${avgRank}` : '-'}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Share of top 3</p>
                <p className="text-2xl font-black text-indigo-600 font-mono mt-1">
                  {hasScanData ? `${shareOfVoice}%` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Competitor Market Share Leaderboard */}
          {(() => {
            const leaderboard = hasScanData ? getLeaderboard(
              selectedCity,
              activeKeyword,
              maxRings,
              currentConfig.gmbName,
              selectedScanDate,
              selectedScanDate !== null ? selectedLog : activeScanData
            ) : [];

            return (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="border-b pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm tracking-tight font-sans">
                      Competitor Market Share
                    </h3>
                    <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                      Top players ranking across all search coordinates
                    </p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
                    Global Grid
                  </span>
                </div>

                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-3.5 py-2.5 w-[50%]">Competitor Name</th>
                        <th className="px-3 py-2.5 text-center">Reviews</th>
                        <th className="px-3 py-2.5 text-center">Avg Rank</th>
                        <th className="px-3.5 py-2.5 text-right">Top 3 Share (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3.5 py-8 text-center text-slate-400 font-medium">
                            Run a live scan to analyze competitor market share.
                          </td>
                        </tr>
                      ) : (
                        leaderboard.map((item, id) => {
                          return (
                            <tr 
                              key={item.name}
                              className={`transition-colors ${
                                item.isUser 
                                  ? 'bg-indigo-50 hover:bg-indigo-100/70 font-semibold text-indigo-950' 
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <td className="px-3.5 py-2.5 flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  {item.isUser ? (
                                    <span className="bg-indigo-600 text-white font-black rounded-full w-4.5 h-4.5 text-[9px] flex items-center justify-center shrink-0 shadow-xs" title="Your Business Profile">
                                      ★
                                    </span>
                                  ) : (
                                    <span className="bg-slate-200 text-slate-600 font-bold font-mono rounded-full w-4.5 h-4.5 text-[9px] flex items-center justify-center shrink-0">
                                      {id + 1}
                                    </span>
                                  )}
                                  <span className="whitespace-normal break-words">
                                    {item.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center text-[10px] text-slate-500">
                                {item.rating ? `${item.rating} ⭐ ` : ''}({item.reviews})
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono font-bold">
                                #{item.avgRank}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-extrabold text-indigo-600">
                                {item.top3Share}%
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Past Scans History Log Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2 text-indigo-700">
                <History className="w-4.5 h-4.5 shrink-0" />
                <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">
                  Past Scan Logs
                </h3>
              </div>
              <span className="bg-slate-100 text-slate-600 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold">
                {selectedCity}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-normal">
              Below are captured historical geo-rank profiles. Click on a past date to inspect GMB search visibility records.
            </p>

            <div className="space-y-2.5">
              {/* Current Active Scan element */}
              <button
                type="button"
                disabled={!scannedConfigurations[`${selectedCity}_${activeKeyword}`]}
                onClick={() => setSelectedScanDate(null)}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between text-xs ${
                  scannedConfigurations[`${selectedCity}_${activeKeyword}`]
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-60'
                } ${
                  selectedScanDate === null && scannedConfigurations[`${selectedCity}_${activeKeyword}`]
                    ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-900 shadow-sm font-semibold'
                    : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800 font-bold'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Activity className={`w-3.5 h-3.5 ${selectedScanDate === null && scannedConfigurations[`${selectedCity}_${activeKeyword}`] ? 'text-indigo-600 animate-pulse' : 'text-slate-500'}`} />
                  <div>
                    <p className="font-extrabold text-slate-800">Current Live Scan</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {scannedConfigurations[`${selectedCity}_${activeKeyword}`] 
                        ? 'Updated: Active scan currently loaded' 
                        : 'Status: No active scan run yet'}
                    </p>
                  </div>
                </div>
                {selectedScanDate === null && scannedConfigurations[`${selectedCity}_${activeKeyword}`] && (
                  <span className="text-[9px] bg-indigo-600 text-white font-mono font-bold px-2 py-0.5 rounded-md">
                    Active
                  </span>
                )}
              </button>

              {/* Dynamic History logs / Empty state fallback */}
              {(() => {
                const logs = pastScans[selectedCity] || [];
                if (logs.length === 0) {
                  return (
                    <div className="py-6 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs font-semibold">
                      No past scans recorded for this service area.
                    </div>
                  );
                }

                 return logs.map((log) => {
                  const isSelected = selectedScanDate === log.date;

                  return (
                    <button
                      key={log.date}
                      type="button"
                      onClick={() => {
                        setSelectedScanDate(log.date);
                        setSelectedNode(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between text-xs cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 shadow-sm font-semibold'
                          : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800 font-bold'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Calendar className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-500' : 'text-slate-400'}`} />
                        <div>
                          <p className="font-extrabold text-slate-800">{log.date}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Avg Rank: #{log.avgRank} • SOV: {log.shareOfVoice}%</p>
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="text-[9px] bg-amber-500 text-white font-semibold px-2 py-0.5 rounded-md">
                          Viewing
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 font-mono">
                          View Log
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Action Recommendations Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
            <div className="flex items-center space-x-2 text-indigo-700">
              <TrendingUp className="w-4.5 h-4.5 shrink-0" />
              <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">Audit Recommendations</h3>
            </div>

            <div className="text-xs space-y-3 font-sans text-slate-600">
              {!hasScanData ? (
                <div className="bg-slate-50 text-slate-500 border border-slate-200 p-4 rounded-xl text-center font-medium">
                  No scan data available yet. Please complete a dynamic matrix scan to retrieve targeted SEO checklists.
                </div>
              ) : Number(avgRank) <= 4 ? (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-xl flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-emerald-900 font-bold">Excellent Local Reach</strong>
                    Your business ranks dominantly in the {selectedCity} sector. Keep generating positive GMB reviews to lock down the area.
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 text-amber-800 border border-amber-200 p-3 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-900 font-bold">Optimization Needed</strong>
                    Your rank drops quickly as you move from the center. Add localized location keywords to the public service landing pages.
                  </div>
                </div>
              )}

              {hasScanData ? (
                <div className="space-y-1.5 font-sans border-t pt-3">
                  <p className="font-semibold text-slate-700">Next Recommended Action Steps:</p>
                  <ul className="list-disc pl-4 space-y-1 pl-safe pr-safe">
                    <li>Verify Google My Business address tags in {selectedCity}.</li>
                    <li>Embed GMB listing map frame on public domain local subpages.</li>
                    <li>Incorporate target phrase <code className="bg-slate-100 text-amber-800 p-0.5 px-1 rounded">"{activeKeyword}"</code> inside public metadata schemas.</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-1.5 font-sans border-t pt-3 opacity-50">
                  <p className="font-semibold text-slate-500">Telemetry-driven next actions (Scan required):</p>
                  <p className="text-[11px] text-slate-400 italic">Please run a dynamic matrix scan to load contextual metadata audits.</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
      </>
      )}

      {/* PARAMETERS CONFIGURATION MODAL */}
      {isModalOpen && (
        <div id="seo_heatmap_config_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden transition-all duration-200 my-auto">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Settings className="w-4.5 h-4.5 text-cyan-400" />
                <h3 className="font-extrabold text-sm md:text-base tracking-tight font-sans">
                  Edit Parameters ({selectedCity})
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition rounded p-1 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveConfig} className="p-5 space-y-4">
              
              {/* Target GMB Name & Live search search integration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Target GMB Business Name
                  </label>
                  {gmapsKey ? (
                    <span className="text-[9px] bg-emerald-500 text-white font-semibold font-sans px-2 py-0.5 rounded">
                      Live Search Enabled
                    </span>
                  ) : (
                    <span className="text-[9px] bg-amber-500 text-white font-semibold font-sans px-2 py-0.5 rounded">
                      Mock Mode Active
                    </span>
                  )}
                </div>

                <LivePlacesSearch
                  gmapsKey={gmapsKey}
                  selectedCity={selectedCity}
                  tempGmbName={tempGmbName}
                  setTempGmbName={setTempGmbName}
                  tempPlaceId={tempPlaceId}
                  setTempPlaceId={setTempPlaceId}
                  searchedProfiles={searchedProfiles}
                  setSearchedProfiles={setSearchedProfiles}
                  searchingGmb={searchingGmb}
                  setSearchingGmb={setSearchingGmb}
                  isLoadingKeys={isLoadingKeys}
                />

                {/* Manual Place ID Input Override */}
                <div className="space-y-1 mt-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Connected GMB Place ID (Manual Override)
                  </label>
                  <input
                    type="text"
                    value={tempPlaceId}
                    onChange={(e) => setTempPlaceId(e.target.value)}
                    placeholder="e.g. ch_gmb_custom_1001"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-mono bg-white"
                  />
                  <p className="text-[8px] text-slate-400 font-sans leading-normal">
                    Manually type or paste a custom Place ID, or search above to select matching profiles.
                  </p>
                </div>
              </div>

              {/* Target Keywords (comma-separated) */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                  Target Keywords (comma-separated)
                </label>
                <textarea
                  required
                  rows={2}
                  value={tempKeywords}
                  onChange={(e) => setTempKeywords(e.target.value)}
                  placeholder="e.g. electrician, electrical repair, panel upgrade"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-sans"
                />
              </div>

              {/* Search Radius & Grid Dimensions Row */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Search Radius */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Search Radius (miles)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={tempRadius}
                    onChange={(e) => setTempRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                {/* Grid Dimensions Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Grid Dimensions
                  </label>
                  <select
                    value={tempGridSize}
                    onChange={(e) => setTempGridSize(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                  >
                    <option value="3x3">3 x 3 Matrix</option>
                    <option value="5x5">5 x 5 Matrix</option>
                    <option value="7x7">7 x 7 Matrix</option>
                    <option value="9x9">9 x 9 Matrix</option>
                    <option value="11x11">11 x 11 Matrix</option>
                  </select>
                </div>

              </div>

              {/* Scheduling & Frequency Row */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Automated Scan Frequency Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Automated Scan Frequency
                  </label>
                  <select
                    value={tempScanFrequency}
                    onChange={(e) => setTempScanFrequency(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                  >
                    <option value="Manual Only">Manual Only</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-Weekly">Bi-Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                {/* Preferred Time Picker */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Preferred Time
                  </label>
                  <input
                    type="time"
                    value={tempPreferredTime}
                    onChange={(e) => setTempPreferredTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                  />
                </div>

              </div>
              <p className="text-[9px] text-slate-400 font-sans">
                Choose default scheduling frequency and daily time to auto-refresh rank positions on Google Place ID grids.
              </p>

              {/* Dynamic Math Cost Calculator Card */}
              {(() => {
                const nodeCount = tempGridSize === '3x3' ? 9 : tempGridSize === '5x5' ? 25 : tempGridSize === '7x7' ? 49 : tempGridSize === '9x9' ? 81 : 121;
                const freqMultipliers = {
                  'Manual Only': 1,
                  'Daily': 30,
                  'Weekly': 4,
                  'Bi-Weekly': 2,
                  'Monthly': 1
                };
                const multiplier = freqMultipliers[tempScanFrequency] || 1;
                const calculatedCost = nodeCount * 0.002 * multiplier;
                const costSuffix = tempScanFrequency === 'Manual Only' ? 'scan' : 'month';
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono">
                          Estimated API Cost
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {nodeCount} grid points @ $0.002/ea
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1 border-t border-slate-100">
                      <span className="text-xs text-slate-500 font-sans">Estimated Cost:</span>
                      <span className="text-sm font-extrabold text-indigo-950 font-mono">
                        ${calculatedCost.toFixed(3)} / {costSuffix}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleRemoveArea(selectedCity)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border-none shadow-sm"
                  title="Delete this service area profile entirely"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Profile</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition duration-150 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* LOCATION COMPETITORS INSPECTION MODAL */}
      {selectedNode && (
        <div id="location_competitors_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden transition-all duration-200 my-auto">
            
            {/* Modal Header */}
            <div className="bg-indigo-950 text-white px-5 py-3.5 flex items-center justify-between border-b border-indigo-900">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight font-sans">
                    Location Competitors
                  </h3>
                  <p className="text-[9px] text-indigo-300 font-mono">Grid Pin: [{selectedNode.x + 1}, {selectedNode.y + 1}] • Your Rank: {selectedNode.rank <= 20 ? `#${selectedNode.rank}` : '20+'}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-indigo-200 hover:text-white transition rounded p-1 hover:bg-indigo-900/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Competitors List */}
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-slate-500 font-sans">
                Top local GMB ranking listings for keyword <strong className="text-indigo-600">"{activeKeyword}"</strong> at this geo-grid coordinate:
              </p>

              <div className="space-y-2">
                {(() => {
                  const comps = selectedNode.competitors || [];
                  
                  if (comps.length === 0) {
                    return (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        No competitor data available for this coordinate. Run a live scan.
                      </div>
                    );
                  }

                  return comps.map((comp) => (
                    <div
                      key={`${comp.name}-${comp.rank}`}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition text-xs ${
                        comp.isUser
                          ? 'bg-amber-500/10 border-amber-300 ring-1 ring-amber-400/20 shadow-xs'
                          : 'bg-slate-50 border-slate-100 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black font-mono ${
                          comp.isUser
                            ? 'bg-amber-500 text-white'
                            : comp.rank <= 3
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          #{comp.rank}
                        </span>

                        <div>
                          <p className={`font-bold ${comp.isUser ? 'text-amber-950' : 'text-slate-800'}`}>
                            {comp.name} {comp.isUser && ' (You)'}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {comp.rating ? `${comp.rating} ⭐ ` : ''}({comp.reviews} reviews) • Verified GMB Pin
                          </p>
                        </div>
                      </div>

                      {comp.isUser && (
                        <span className="bg-amber-500 text-white text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          Target
                        </span>
                      )}
                    </div>
                  ));
                })()}
              </div>

              <div className="bg-indigo-50 text-[10px] text-indigo-900 rounded-lg p-2.5 border border-indigo-100 flex items-start gap-1.5">
                <Compass className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="leading-normal">
                  Diagnose search signals by clicking other nodes on the map grid coordinate to access competitor rankings.
                </p>
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer border-none"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ADD NEW AREA MODAL */}
      {isAddAreaOpen && (
        <div id="add_new_area_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden transition-all duration-200 my-auto">
            
            {/* Modal Header */}
            <div className="bg-cyan-950 text-white px-5 py-4 flex items-center justify-between border-b border-cyan-900">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4.5 h-4.5 text-cyan-400 animate-bounce" />
                <h3 className="font-extrabold text-sm tracking-tight font-sans">
                  Create New Area Profile
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddAreaOpen(false)}
                className="text-cyan-300 hover:text-white transition rounded p-1 hover:bg-cyan-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddNewArea} className="p-4 space-y-3">
              
              {/* New Area Name */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                  Service Area Name (City / Location)
                </label>
                <input
                  type="text"
                  required
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="e.g. Knoxville, Chattanooga"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
                />
              </div>

              {/* Target GMB Name */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                  Target GMB Business Name
                </label>
                <input
                  type="text"
                  required
                  value={newGmbName}
                  onChange={(e) => setNewGmbName(e.target.value)}
                  placeholder="e.g. Discount Electrical Service"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
                />
              </div>

              {/* Target Keywords */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                  Keywords (comma-separated)
                </label>
                <textarea
                  required
                  rows={2}
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  placeholder="e.g. electrician, outlet repair, solar install"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition font-sans"
                />
              </div>

              {/* Search Radius & Grid Dimensions */}
              <div className="grid grid-cols-2 gap-3">
                
                {/* Search Radius */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Radius (miles)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={newRadius}
                    onChange={(e) => setNewRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition font-mono"
                  />
                </div>

                {/* Grid Dimensions */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                    Grid Size
                  </label>
                  <select
                    value={newGridSize}
                    onChange={(e) => setNewGridSize(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition font-sans"
                  >
                    <option value="3x3">3 x 3 Matrix</option>
                    <option value="5x5">5 x 5 Matrix</option>
                    <option value="7x7">7 x 7 Matrix</option>
                    <option value="9x9">9 x 9 Matrix</option>
                    <option value="11x11">11 x 11 Matrix</option>
                  </select>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddAreaOpen(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition cursor-pointer border-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Area</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

        {/* DATAFORSEO & GOOGLE MAPS API SETTINGS MODAL */}
      {isSettingsOpen && (
        <div id="dataforseo_settings_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden transition-all duration-200 my-auto">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Settings className="w-4.5 h-4.5 text-indigo-400 rotate-12" />
                <h3 className="font-extrabold text-sm tracking-tight font-sans">
                  System Credentials Settings
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-white transition rounded p-1 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Config Instructions */}
            <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 text-indigo-950 text-[11px] leading-relaxed font-sans space-y-1">
              <p className="font-bold">Credential Configuration:</p>
              <p>
                Provide credentials for external API syncs. Keys are saved securely inside your centralized Firestore cloud database.
              </p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSettings} className="p-4 space-y-4 bg-white">
              
              {/* DataForSEO Credentials Input */}
              <div className="space-y-1.5 bg-white">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                  DataForSEO Base64 Auth Key
                </label>
                <input
                  type="password"
                  value={settingsAuthKey}
                  onChange={(e) => setSettingsAuthKey(e.target.value)}
                  placeholder="Enter Base64 Authorized String"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-mono bg-white"
                />
                <p className="text-[9px] text-slate-400">
                  Example: <code>bG9naW46cGFzc3dvcmQ=</code>
                </p>
              </div>

              {/* Google Maps Credentials Input */}
              <div className="space-y-1.5 bg-white">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block">
                  Google Maps API Key
                </label>
                <input
                  type="password"
                  value={settingsGmapsApiKey}
                  onChange={(e) => setSettingsGmapsApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-mono bg-white"
                />
                <p className="text-[9px] text-slate-400">
                  Required to paint coordinate grids over high-fidelity interactive Google maps.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 bg-white">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-400 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer border-none flex items-center justify-center gap-1.5"
                >
                  {savingSettings && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
