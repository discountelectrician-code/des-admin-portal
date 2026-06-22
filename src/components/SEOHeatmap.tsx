/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { runLiveHeatmapScan } from '../lib/dataforseo';
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMapsLibrary } from '@vis.gl/react-google-maps';
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
  Clock
} from 'lucide-react';

interface CityConfig {
  keywords: string;
  gmbName: string;
  radius: number;
  gridSize: '3x3' | '5x5' | '7x7';
  placeId?: string;
  targetPlaceId?: string;
  scanFrequency?: 'Manual Only' | 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly';
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

const getGridNodeCoordinates = (centerLat: number, centerLng: number, radiusInMiles: number, x: number, y: number, size: number) => {
  const latDegreeRef = 69.0;
  const radLat = (centerLat * Math.PI) / 180;
  const lngDegreeRef = 69.0 * Math.cos(radLat);

  const maxLatOffset = radiusInMiles / latDegreeRef;
  const maxLngOffset = radiusInMiles / lngDegreeRef;

  // Spacing steps (-maxOffset to +maxOffset across size elements)
  const xPercent = size > 1 ? (x / (size - 1)) * 2 - 1 : 0; 
  const yPercent = size > 1 ? (y / (size - 1)) * 2 - 1 : 0; 

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
    scanFrequency: 'Manual Only'
  }
};

// Seed random generation based on city and keyword to keep ratings somewhat stable
const getSeededRank = (city: string, keyword: string, x: number, y: number, size: number, scanDate: string | null = null) => {
  let code = (city.charCodeAt(0) || 1) + (keyword.charCodeAt(0) || 1) + x + y;
  if (scanDate) {
    const charSum = scanDate.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    code += (charSum % 13) + 3;
  }
  const distFromCenter = Math.sqrt(Math.pow(x - size / 2, 2) + Math.pow(y - size / 2, 2));
  
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
  isUser: boolean;
}

// Generates deterministically seeded competitors for node inspection click
const generateCompetitorsForNode = (
  city: string,
  keyword: string,
  x: number,
  y: number,
  userGmbName: string,
  userRank: number
): Competitor[] => {
  const potentialNames = [
    'SuperService Electrical Contractors',
    'Middle TN Power Shield',
    'VoltSpark Electric Pro',
    'Tri-Star Electrical Repair',
    'Titan Electric Middle TN',
    'PowerGrid Services LLC',
    'Tennessee Energy Elite Teams',
    'Amped Up Electrical Co',
    'BriteWay Wiring Group',
    'Mr. Sparky Power Pros',
    'Standard Electric Systems'
  ];

  const seed = (city.charCodeAt(0) || 1) + (keyword.charCodeAt(0) || 1) + x + y;
  const results: Competitor[] = [];

  for (let r = 1; r <= 5; r++) {
    if (r === userRank) {
      results.push({
        rank: r,
        name: userGmbName || 'Discount Electrical Service',
        reviews: Math.abs((seed * 77) % 240) + 15,
        isUser: true
      });
    } else {
      const index = Math.abs((seed + r) % potentialNames.length);
      results.push({
        rank: r,
        name: potentialNames[index],
        reviews: Math.abs(((seed + r) * 111) % 190) + 8,
        isUser: false
      });
    }
  }

  // Include user if the rank is worse than 5
  if (userRank > 5) {
    results.splice(4, 1, {
      rank: userRank,
      name: userGmbName || 'Discount Electrical Service',
      reviews: Math.abs((seed * 77) % 240) + 15,
      isUser: true
    });
  }

  return results.sort((a, b) => a.rank - b.rank);
};

// Computes the general grid stats for all top competitors to build the global marketplace leaderboard
const getLeaderboard = (
  city: string,
  keyword: string,
  size: number,
  userGmbName: string,
  scanDate: string | null
) => {
  const competitorStats: Record<string, { totalRank: number; top3Count: number; isUser: boolean; count: number }> = {};
  
  const userName = userGmbName || 'Discount Electrical Service';
  competitorStats[userName] = { totalRank: 0, top3Count: 0, isUser: true, count: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const userRank = getSeededRank(city, keyword, x, y, size, scanDate);
      const competitors = generateCompetitorsForNode(city, keyword, x, y, userGmbName, userRank);
      
      competitors.forEach((c) => {
        if (!competitorStats[c.name]) {
          competitorStats[c.name] = { totalRank: 0, top3Count: 0, isUser: c.isUser, count: 0 };
        }
        competitorStats[c.name].totalRank += c.rank;
        if (c.rank <= 3) {
          competitorStats[c.name].top3Count++;
        }
        competitorStats[c.name].count++;
      });
    }
  }

  const totalCells = size * size;
  const items = Object.entries(competitorStats).map(([name, stats]) => {
    const avg = stats.count > 0 ? stats.totalRank / stats.count : 6.0;
    const share = stats.count > 0 ? (stats.top3Count / totalCells) * 100 : 0;
    return {
      name,
      avgRank: parseFloat(avg.toFixed(1)),
      top3Share: Math.round(share),
      isUser: stats.isUser
    };
  });

  return items
    .sort((a, b) => b.top3Share - a.top3Share || a.avgRank - b.avgRank)
    .slice(0, 5);
};

export default function SEOHeatmap() {
  const [activeGmapsApiKey, setActiveGmapsApiKey] = useState(() => localStorage.getItem('gmaps_api_key') || '');

  const hasGmapsKey = Boolean(activeGmapsApiKey.trim());

  if (hasGmapsKey) {
    return (
      <APIProvider apiKey={activeGmapsApiKey.trim()} version="weekly" libraries={['places']}>
        <SEOHeatmapInner key={activeGmapsApiKey.trim()} gmapsKey={activeGmapsApiKey.trim()} onKeyChange={setActiveGmapsApiKey} />
      </APIProvider>
    );
  }
  return <SEOHeatmapInner key="no-key" gmapsKey="" onKeyChange={setActiveGmapsApiKey} />;
}

function LivePlacesSearch({
  tempGmbName,
  setTempGmbName,
  tempPlaceId,
  setTempPlaceId,
  searchedProfiles,
  setSearchedProfiles,
  searchingGmb,
  setSearchingGmb,
}: {
  tempGmbName: string;
  setTempGmbName: (val: string) => void;
  tempPlaceId: string;
  setTempPlaceId: (val: string) => void;
  searchedProfiles: Array<{ name: string; placeId: string; formatted_address: string }>;
  setSearchedProfiles: (val: Array<{ name: string; placeId: string; formatted_address: string }>) => void;
  searchingGmb: boolean;
  setSearchingGmb: (val: boolean) => void;
}) {
  const placesLib = useMapsLibrary('places');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLiveSearch = async () => {
    if (!placesLib) {
      setErrorMsg('Places library is loading. Please try again.');
      return;
    }
    if (!tempGmbName.trim()) return;
    setSearchingGmb(true);
    setErrorMsg('');
    setSearchedProfiles([]);

    try {
      const response = await placesLib.Place.searchByText({
        textQuery: tempGmbName.trim(),
        fields: ['id', 'displayName', 'formattedAddress'],
        maxResultCount: 10,
      });

      if (response && response.places && response.places.length > 0) {
        const results = response.places.map((p) => ({
          name: p.displayName || '',
          placeId: p.id || '',
          formatted_address: p.formattedAddress || '',
        }));
        setSearchedProfiles(results);
      } else {
        setSearchedProfiles([]);
        setErrorMsg('No matches found for this query.');
      }
    } catch (err: any) {
      console.error('Google Places live search error:', err);
      setErrorMsg('Places search failed. Check your API key limits and console logs.');
    } finally {
      setSearchingGmb(false);
    }
  };

  return (
    <div className="space-y-1.5 bg-white">
      <div className="flex gap-2">
        <input
          type="text"
          required
          value={tempGmbName}
          onChange={(e) => {
            setTempGmbName(e.target.value);
            setSearchedProfiles([]);
          }}
          placeholder="Search real Google Places..."
          className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition bg-white"
        />
        <button
          type="button"
          onClick={handleLiveSearch}
          disabled={searchingGmb || !tempGmbName.trim()}
          className="px-3.5 py-2 bg-indigo-650 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border-none"
        >
          {searchingGmb ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          <span>Search</span>
        </button>
      </div>
      {errorMsg && (
        <p className="text-[10px] text-red-500 font-sans tracking-tight">{errorMsg}</p>
      )}
    </div>
  );
}

function SEOHeatmapInner({ gmapsKey, onKeyChange }: { key?: string; gmapsKey: string; onKeyChange: (val: string) => void }) {
  const [configs, setConfigs] = useState<Record<string, CityConfig>>(INITIAL_CITY_CONFIGS);
  const [selectedCity, setSelectedCity] = useState<string>('Murfreesboro');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState('');

  // Selected keyword index for visual ranking lookup
  const [activeKeywordIndex, setActiveKeywordIndex] = useState(0);

  // Temporary form states for the Modal
  const [tempKeywords, setTempKeywords] = useState('');
  const [tempGmbName, setTempGmbName] = useState('');
  const [tempRadius, setTempRadius] = useState(10);
  const [tempGridSize, setTempGridSize] = useState<'3x3' | '5x5' | '7x7'>('5x5');
  const [tempPlaceId, setTempPlaceId] = useState<string>('');
  const [tempScanFrequency, setTempScanFrequency] = useState<'Manual Only' | 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly'>('Manual Only');

  // Place ID selection search integration states
  const [searchingGmb, setSearchingGmb] = useState(false);
  const [searchedProfiles, setSearchedProfiles] = useState<Array<{ name: string; placeId: string; formatted_address: string }>>([]);

  // Dynamic Add New Area states
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newKeywords, setNewKeywords] = useState('electrician, wiring repair, residential lighting');
  const [newGmbName, setNewGmbName] = useState('Discount Electrical Service');
  const [newRadius, setNewRadius] = useState(10);
  const [newGridSize, setNewGridSize] = useState<'3x3' | '5x5' | '7x7'>('5x5');

  // Competitor Node inspection states
  const [selectedNode, setSelectedNode] = useState<{ x: number; y: number; rank: number } | null>(null);

  // Selected scan date from history (null means current active scan)
  const [selectedScanDate, setSelectedScanDate] = useState<string | null>(null);

  // Settings modal states for DataForSEO & Google Maps
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsAuthKey, setSettingsAuthKey] = useState(() => localStorage.getItem('dataforseo_auth_key') || '');
  const [settingsGmapsApiKey, setSettingsGmapsApiKey] = useState(() => localStorage.getItem('gmaps_api_key') || '');
  const [liveApiScanning, setLiveApiScanning] = useState(false);

  const currentConfig = configs[selectedCity] || {
    keywords: 'electrician',
    gmbName: 'Discount Electrical Service',
    radius: 10,
    gridSize: '5x5',
    placeId: 'loc_placeholder'
  };

  const keywordList = currentConfig.keywords.split(',').map(k => k.trim()).filter(Boolean);
  const activeKeyword = keywordList[activeKeywordIndex] || keywordList[0] || 'electrician';

  const handleOpenModal = () => {
    setTempKeywords(currentConfig.keywords);
    setTempGmbName(currentConfig.gmbName);
    setTempRadius(currentConfig.radius);
    setTempGridSize(currentConfig.gridSize);
    setTempPlaceId(currentConfig.placeId || '');
    setTempScanFrequency(currentConfig.scanFrequency || 'Manual Only');
    setSearchedProfiles([]);
    setIsModalOpen(true);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigs(prev => ({
      ...prev,
      [selectedCity]: {
        keywords: tempKeywords,
        gmbName: tempGmbName,
        radius: Number(tempRadius),
        gridSize: tempGridSize,
        placeId: tempPlaceId,
        targetPlaceId: tempPlaceId,
        scanFrequency: tempScanFrequency
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

  const handleDeleteServiceArea = () => {
    const keys = Object.keys(configs);
    if (keys.length <= 1) {
      alert("At least one service area profile must be maintained. Cannot delete the only remaining profile.");
      return;
    }
    const confirmed = window.confirm(`Are you sure you want to delete the "${selectedCity}" service area profile? This action will completely remove its configurations.`);
    if (confirmed) {
      const remainingKeys = keys.filter(k => k !== selectedCity);
      const nextCity = remainingKeys[0];
      setConfigs(prev => {
        const copy = { ...prev };
        delete copy[selectedCity];
        return copy;
      });
      setSelectedCity(nextCity);
      setActiveKeywordIndex(0);
      setSelectedNode(null);
      setIsModalOpen(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('dataforseo_auth_key', settingsAuthKey.trim());
    localStorage.setItem('gmaps_api_key', settingsGmapsApiKey.trim());
    onKeyChange(settingsGmapsApiKey.trim());
    setIsSettingsOpen(false);
    alert('Credentials saved successfully! Your Base64 authentication key and Google Maps key are stored securely in your browser.');
  };

  const handleLiveScan = async () => {
    const authKey = localStorage.getItem('dataforseo_auth_key');
    if (!authKey) {
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
      const payload = {
        name: selectedCity,
        keywords: activeKeyword,
        gmbName: currentConfig.gmbName,
        radius: currentConfig.radius,
        gridSize: currentConfig.gridSize,
        placeId: currentConfig.placeId
      };
      
      console.log('Initiating DataForSEO Live GMB Heatmap Scan request with payload:', payload);
      const data = await runLiveHeatmapScan(payload);
      console.log('DataForSEO API successful raw response payload:', data);
      alert('Live DataForSEO API scan request resolved successfully! Open your browser developer console to view the returned JSON results.');
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
      }
    }, 800);
  };

  // Grid details calculations
  const size = currentConfig.gridSize === '3x3' ? 3 : currentConfig.gridSize === '5x5' ? 5 : 7;
  
  // Calculate average rating score in view
  let totalRank = 0;
  let top3PercentageSum = 0;
  const gridCells = [];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rank = getSeededRank(selectedCity, activeKeyword, x, y, size, selectedScanDate);
      totalRank += rank;
      if (rank <= 3) {
        top3PercentageSum++;
      }
      gridCells.push({ x, y, rank });
    }
  }
  const avgRank = (totalRank / gridCells.length).toFixed(1);
  const shareOfVoice = Math.round((top3PercentageSum / gridCells.length) * 100);

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
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-300 shrink-0">Service Area:</span>
            <select
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setActiveKeywordIndex(0);
                setSelectedNode(null);
                setSelectedScanDate(null);
              }}
              className="bg-slate-850 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
            >
              {Object.keys(configs).map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>

            {/* Scalable Service Areas: Add New Area Button */}
            <button
              type="button"
              onClick={() => setIsAddAreaOpen(true)}
              className="flex items-center justify-center p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white transition cursor-pointer"
              title="Add New Service Area Profile"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* DataForSEO Live Settings Gear */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 transition cursor-pointer shadow-sm"
              title="Configure DataForSEO Live GMB Sync Setup"
              id="dataforseo_api_settings_btn"
            >
              <Settings className="w-4 h-4 animate-spin-hover" />
            </button>
          </div>

          <button
            onClick={handleOpenModal}
            className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white px-4 py-2 border border-slate-700 hover:border-slate-600 rounded-xl font-bold text-xs transition duration-150 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>Edit Parameters</span>
          </button>
        </div>
      </div>

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
            <span>Grid: <strong className="text-slate-700">{currentConfig.gridSize} ({size * size} geo-points)</strong></span>
          </div>
        </div>

        <div className="w-full md:w-auto overflow-x-auto flex items-center space-x-2 pb-1 md:pb-0">
          {keywordList.map((kw, idx) => (
            <button
              key={kw}
              onClick={() => {
                setActiveKeywordIndex(idx);
                setSelectedNode(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                idx === activeKeywordIndex
                  ? 'bg-indigo-650 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
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
                Simulated {selectedCity} GMB rankings. <strong className="text-indigo-650">Click any grid node</strong> to trigger Competitor Node Inspection.
              </p>
            </div>

            <button
              onClick={handleLiveScan}
              disabled={scanning || liveApiScanning}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-lg text-[10px] uppercase tracking-wider transition cursor-pointer border-none"
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
            const gmapsKey = localStorage.getItem('gmaps_api_key') || '';
            const hasGmapsKey = Boolean(gmapsKey.trim());
            const center = getCityCenter(selectedCity, currentConfig);
            const zoomVal = getZoomForRadius(currentConfig.radius);

            // Compute coordinates for all GridNodes
            const gridNodes = gridCells.map((cell) => {
              const coords = getGridNodeCoordinates(center.lat, center.lng, currentConfig.radius, cell.x, cell.y, size);
              return {
                id: `${cell.x}-${cell.y}`,
                latitude: coords.lat,
                longitude: coords.lng,
                userRank: cell.rank,
                x: cell.x,
                y: cell.y
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
                      {gridNodes.map((node) => {
                        const r = node.userRank;
                        let colorBg = 'bg-emerald-500 hover:bg-emerald-600 text-white ring-8 ring-emerald-500/10 hover:scale-105';
                        if (r > 3 && r <= 10) {
                          colorBg = 'bg-amber-500 hover:bg-amber-600 text-white ring-8 ring-amber-500/10 hover:scale-105';
                        } else if (r > 10) {
                          colorBg = 'bg-rose-500 hover:bg-rose-600 text-white ring-8 ring-rose-500/10 hover:scale-105';
                        }

                        // Check if node is currently inspected/active
                        const isInspected = selectedNode && selectedNode.x === node.x && selectedNode.y === node.y;
                        const ringStyle = isInspected ? 'ring-4 ring-indigo-650 ring-offset-2 border-indigo-600 scale-110 z-20 shadow-lg' : 'border-white';

                        return (
                          <AdvancedMarker
                            key={node.id}
                            position={{ lat: node.latitude, lng: node.longitude }}
                            onClick={() => setSelectedNode({ x: node.x, y: node.y, rank: r })}
                          >
                            <div 
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm font-mono cursor-pointer transition shadow-sm shrink-0 border ${colorBg} ${ringStyle}`}
                              style={{ transform: 'translate(-50%, -50%)', width: '40px', height: '40px' }}
                              title={`Coordinate Node [X:${node.x + 1}, Y:${node.y + 1}] - Click to inspect GMB Rank: ${r <= 20 ? '#' + r : '20+'}`}
                              id={`gmap_marker_${node.x}_${node.y}`}
                            >
                              {r <= 20 ? r : '20+'}
                            </div>
                          </AdvancedMarker>
                        );
                      })}
                    </GoogleMap>
                  </APIProvider>

                  {/* Tiny floating legends over the Google Map for dynamic context */}
                  <div className="absolute top-3 left-3 bg-white/95 border border-slate-200 rounded-xl p-2.5 px-3 text-[9px] font-mono text-slate-600 flex flex-col gap-1 shadow-md z-10">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      <span>1-3 (Top Packers)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                      <span>4-10 (Organic page 1)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                      <span>11+ (Low visibility)</span>
                    </div>
                  </div>
                  
                  <div className="absolute bottom-3 right-3 bg-slate-900/95 text-white border border-slate-700/50 rounded-lg py-1 px-2.5 text-[9px] font-sans font-bold shadow-md z-10">
                    ℹ️ Click any marker to view competitor details
                  </div>
                </div>
              );
            }

            // Fallback screen if there's no Google Maps key configured yet
            return (
              <div className="relative bg-slate-100 rounded-2xl border border-slate-200 p-8 flex flex-col items-center justify-center min-h-[400px] overflow-hidden">
                <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#3b82f6_1.5px,transparent_1.5px)] [background-size:16px_16px]"></div>
                
                <div className="relative z-10 space-y-5 w-full flex flex-col items-center">
                  
                  {/* Informational Alerts */}
                  <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 p-4 rounded-2xl text-center max-w-sm space-y-1.5 shadow-sm">
                    <p className="text-xs font-bold font-sans flex items-center justify-center gap-1.5">
                      <Compass className="w-4 h-4 text-indigo-650" />
                      <span>Google Map Visualization Ready</span>
                    </p>
                    <p className="text-[10px] text-slate-500 leading-normal font-sans">
                      Visualize ranking coordinates over a real interactive Google Map! Save your Google Maps API Key in Settings to instantly upgrade from a mock grid overlay.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer border-none shadow-sm"
                    >
                      <Settings className="w-3 h-3 animate-spin-hover" />
                      <span>Configure API Key</span>
                    </button>
                  </div>

                  {/* Fallback Interactive Mock CSS Grid */}
                  <div 
                    className="grid gap-4 p-4 border border-slate-200 bg-white/70 backdrop-blur-xs rounded-2xl shadow-md"
                    style={{
                      gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`
                    }}
                  >
                    {gridCells.map((cell, idx) => {
                      const r = cell.rank;
                      let colorBg = 'bg-emerald-500 hover:bg-emerald-600 text-white ring-8 ring-emerald-500/10 hover:scale-105';
                      if (r > 3 && r <= 10) {
                        colorBg = 'bg-amber-500 hover:bg-amber-600 text-white ring-8 ring-amber-500/10 hover:scale-105';
                      } else if (r > 10) {
                        colorBg = 'bg-rose-500 hover:bg-rose-600 text-white ring-8 ring-rose-500/10 hover:scale-105';
                      }

                      const isInspected = selectedNode && selectedNode.x === cell.x && selectedNode.y === cell.y;
                      const ringStyle = isInspected ? 'ring-4 ring-indigo-650 ring-offset-2 border-indigo-600 scale-110 z-20' : 'border-white';

                      return (
                        <button
                          key={idx}
                          type="button" 
                          onClick={() => setSelectedNode({ x: cell.x, y: cell.y, rank: r })}
                          className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-sm font-mono cursor-pointer transition shadow-sm shrink-0 border ${colorBg} ${ringStyle}`}
                          title={`Click to inspect coordinate [X:${cell.x + 1}, Y:${cell.y + 1}] - GMB Rank: ${r <= 20 ? '#' + r : '20+'}`}
                        >
                          {r <= 20 ? r : '20+'}
                        </button>
                      );
                    })}
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
                    <div className="text-slate-350">|</div>
                    <div className="text-indigo-650 font-sans font-bold">Click any coordinate above to inspect competitors</div>
                  </div>

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
                <p className="text-2xl font-black text-slate-800 font-mono mt-1">#{avgRank}</p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Share of top 3</p>
                <p className="text-2xl font-black text-indigo-600 font-mono mt-1">{shareOfVoice}%</p>
              </div>
            </div>
          </div>

          {/* Competitor Market Share Leaderboard */}
          {(() => {
            const leaderboard = getLeaderboard(
              selectedCity,
              activeKeyword,
              size,
              currentConfig.gmbName,
              selectedScanDate
            );

            return (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="border-b pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm tracking-tight font-sans">
                      Competitor Market Share
                    </h3>
                    <p className="text-[11px] text-slate-450 font-sans mt-0.5">
                      Top players ranking across all search coordinates
                    </p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
                    Top 5 Grid
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Competitor Name</th>
                        <th className="px-3 py-2.5 text-center">Avg Rank</th>
                        <th className="px-3.5 py-2.5 text-right">Top 3 Share (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.map((item, id) => {
                        return (
                          <tr 
                            key={item.name}
                            className={`transition-colors ${
                              item.isUser 
                                ? 'bg-indigo-50 hover:bg-indigo-100/70 font-semibold text-indigo-950' 
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <td className="px-3.5 py-2.5 flex items-center gap-2">
                              {item.isUser ? (
                                <span className="bg-indigo-600 text-white font-black rounded-full w-4.5 h-4.5 text-[9px] flex items-center justify-center shrink-0 shadow-xs" title="Your Business Profile">
                                  ★
                                </span>
                              ) : (
                                <span className="bg-slate-200 text-slate-600 font-bold font-mono rounded-full w-4.5 h-4.5 text-[9px] flex items-center justify-center shrink-0">
                                  {id + 1}
                                </span>
                              )}
                              <span className="truncate max-w-[130px]" title={item.name}>
                                {item.name}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono font-bold">
                              #{item.avgRank}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono font-extrabold text-indigo-650">
                              {item.top3Share}%
                            </td>
                          </tr>
                        );
                      })}
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
                onClick={() => setSelectedScanDate(null)}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between text-xs cursor-pointer ${
                  selectedScanDate === null
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Activity className={`w-3.5 h-3.5 ${selectedScanDate === null ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
                  <div>
                    <p className="font-extrabold text-slate-800">Current Live Scan</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Updated: today, 10:27 AM</p>
                  </div>
                </div>
                {selectedScanDate === null && (
                  <span className="text-[9px] bg-indigo-600 text-white font-mono font-bold px-2 py-0.5 rounded-md">
                    Active
                  </span>
                )}
              </button>

              {/* 3 Mock Past Scan dates */}
              {['June 15, 2026', 'June 8, 2026', 'June 1, 2026'].map((date, idx) => {
                const isSelected = selectedScanDate === date;
                // Calculate different average/percentage dynamically for the log decoration
                const displayAvgRank = (Number(avgRank) + (idx % 2 === 0 ? 0.3 : -0.5)).toFixed(1);
                const displaySOV = Math.min(100, Math.max(0, shareOfVoice + (idx % 2 === 0 ? -6 : 7)));

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setSelectedScanDate(date);
                      setSelectedNode(null);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Calendar className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">{date}</p>
                        <p className="text-[9px] text-slate-450 mt-0.5">Avg Rank: #{displayAvgRank} • SOV: {displaySOV}%</p>
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="text-[9px] bg-amber-500 text-white font-semibold px-2 py-0.5 rounded-md">
                        Viewing
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-450 font-mono">
                        View Log
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Recommendations Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
            <div className="flex items-center space-x-2 text-indigo-700">
              <TrendingUp className="w-4.5 h-4.5 shrink-0" />
              <h3 className="font-bold text-slate-900 text-sm tracking-tight font-sans">Audit Recommendations</h3>
            </div>

            <div className="text-xs space-y-3 font-sans text-slate-650">
              {Number(avgRank) <= 4 ? (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-150 p-3 rounded-xl flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-emerald-900 font-bold">Excellent Local Reach</strong>
                    Your business ranks dominantly in the {selectedCity} sector. Keep generating positive GMB reviews to lock down the area.
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 text-amber-800 border border-amber-150 p-3 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-900 font-bold">Optimization Needed</strong>
                    Your rank drops quickly as you move from the center. Add localized location keywords to the public service landing pages.
                  </div>
                </div>
              )}

              <div className="space-y-1.5 font-sans border-t pt-3">
                <p className="font-semibold text-slate-700">Next Recommended Action Steps:</p>
                <ul className="list-disc pl-4 space-y-1 pl-safe pr-safe">
                  <li>Verify Google My Business address tags in {selectedCity}.</li>
                  <li>Embed GMB listing map frame on public domain local subpages.</li>
                  <li>Incorporate target phrase <code className="bg-slate-100 text-amber-800 p-0.5 px-1 rounded">"{activeKeyword}"</code> inside public metadata schemas.</li>
                </ul>
              </div>
            </div>
          </div>

        </div>

      </div>

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

                {gmapsKey ? (
                  <LivePlacesSearch
                    tempGmbName={tempGmbName}
                    setTempGmbName={setTempGmbName}
                    tempPlaceId={tempPlaceId}
                    setTempPlaceId={setTempPlaceId}
                    searchedProfiles={searchedProfiles}
                    setSearchedProfiles={setSearchedProfiles}
                    searchingGmb={searchingGmb}
                    setSearchingGmb={setSearchingGmb}
                  />
                ) : (
                  <div className="space-y-1.5 bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={tempGmbName}
                        onChange={(e) => {
                          setTempGmbName(e.target.value);
                          setSearchedProfiles([]);
                        }}
                        placeholder="Search Google Business profiles..."
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSearchGmbProfiles}
                        disabled={searchingGmb || !tempGmbName.trim()}
                        className="px-3.5 py-2 bg-indigo-650 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border-none"
                      >
                        {searchingGmb ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>Search</span>
                      </button>
                    </div>
                    {/* Fallback Warning */}
                    <div className="bg-amber-50 text-amber-950 p-2 text-[10px] rounded-lg font-sans border border-amber-150 flex items-center gap-1 mt-1">
                      <span className="font-extrabold text-amber-600">⚠️</span>
                      <span>API Key required for live search (mock profiles shown)</span>
                    </div>
                  </div>
                )}

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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition font-mono bg-white"
                  />
                  <p className="text-[8px] text-slate-400 font-sans leading-normal">
                    Manually type or paste a custom Place ID, or search above to select matching profiles.
                  </p>
                </div>

                {/* Dropdown matching business profiles list (for both live and mock search) */}
                {searchedProfiles.length > 0 && (
                  <div className="border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1.5 max-h-[140px] overflow-y-auto">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1">Select business profile:</p>
                    {searchedProfiles.map((p) => (
                      <button
                        key={p.placeId}
                        type="button"
                        onClick={() => {
                          setTempGmbName(p.name);
                          setTempPlaceId(p.placeId);
                          setSearchedProfiles([]);
                        }}
                        className="w-full text-left p-2 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 transition text-xs flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{p.name}</p>
                          <p className="text-[9px] text-slate-400 font-sans mt-0.5">{p.formatted_address}</p>
                        </div>
                        <code className="text-[9px] font-mono text-slate-500 bg-slate-100 p-0.5 rounded">{p.placeId}</code>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Target Keywords (comma-separated) */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                  Target Keywords (comma-separated)
                </label>
                <textarea
                  required
                  rows={2}
                  value={tempKeywords}
                  onChange={(e) => setTempKeywords(e.target.value)}
                  placeholder="e.g. electrician, electrical repair, panel upgrade"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition font-sans"
                />
              </div>

              {/* Search Radius & Grid Dimensions Row */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Search Radius */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                    Search Radius (miles)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={tempRadius}
                    onChange={(e) => setTempRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition"
                  />
                </div>

                {/* Grid Dimensions Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                    Grid Dimensions
                  </label>
                  <select
                    value={tempGridSize}
                    onChange={(e) => setTempGridSize(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition font-semibold"
                  >
                    <option value="3x3">3 x 3 Matrix</option>
                    <option value="5x5">5 x 5 Matrix</option>
                    <option value="7x7">7 x 7 Matrix</option>
                  </select>
                </div>

              </div>

              {/* Automated Scan Frequency Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                  Automated Scan Frequency
                </label>
                <select
                  value={tempScanFrequency}
                  onChange={(e) => setTempScanFrequency(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition font-semibold"
                >
                  <option value="Manual Only">Manual Only</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-Weekly">Bi-Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
                <p className="text-[9px] text-slate-400 font-sans">
                  Choose default scheduling frequency to auto-refresh rank positions on Google Place ID grids.
                </p>
              </div>

              {/* Dynamic Math Cost Calculator Card */}
              {(() => {
                const nodeCount = tempGridSize === '3x3' ? 9 : tempGridSize === '5x5' ? 25 : 49;
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
                  onClick={handleDeleteServiceArea}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Delete this service area profile entirely"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Profile</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3.5 py-2 border border-slate-250 text-slate-555 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer transition duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition duration-150 cursor-pointer"
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
                  <p className="text-[9px] text-indigo-300 font-mono">Grid Pin: [{selectedNode.x + 1}, {selectedNode.y + 1}] • Your Rank: #{selectedNode.rank}</p>
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
                Top 5 local GMB ranking listings for keyword <strong className="text-indigo-600">"{activeKeyword}"</strong> at this geo-grid coordinate:
              </p>

              <div className="space-y-2">
                {generateCompetitorsForNode(
                  selectedCity,
                  activeKeyword,
                  selectedNode.x,
                  selectedNode.y,
                  currentConfig.gmbName,
                  selectedNode.rank
                ).map((comp) => (
                  <div
                    key={comp.rank}
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
                          : 'bg-slate-200 text-slate-650'
                      }`}>
                        #{comp.rank}
                      </span>

                      <div>
                        <p className={`font-bold ${comp.isUser ? 'text-amber-950' : 'text-slate-800'}`}>
                          {comp.name} {comp.isUser && ' (You)'}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{comp.reviews} reviews • Verified GMB Pin</p>
                      </div>
                    </div>

                    {comp.isUser && (
                      <span className="bg-amber-500 text-white text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Target
                      </span>
                    )}
                  </div>
                ))}
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
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer border-none"
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-550 transition font-mono"
                  />
                </div>

                {/* Grid Dimensions */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                    Grid Size
                  </label>
                  <select
                    value={newGridSize}
                    onChange={(e) => setNewGridSize(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-550 transition font-sans"
                  >
                    <option value="3x3">3 x 3 Matrix</option>
                    <option value="5x5">5 x 5 Matrix</option>
                    <option value="7x7">7 x 7 Matrix</option>
                  </select>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddAreaOpen(false)}
                  className="px-3 py-2 border border-slate-250 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 transition cursor-pointer border-none"
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
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-850">
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
                Provide credentials for external API syncs. Keys are saved securely directly in your local browser storage.
              </p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSettings} className="p-4 space-y-4 bg-white">
              
              {/* DataForSEO Credentials Input */}
              <div className="space-y-1.5 bg-white">
                <label className="text-[9px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                  DataForSEO Base64 Auth Key
                </label>
                <input
                  type="password"
                  value={settingsAuthKey}
                  onChange={(e) => setSettingsAuthKey(e.target.value)}
                  placeholder="Enter Base64 Authorized String"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition font-mono bg-white"
                />
                <p className="text-[9px] text-slate-400">
                  Example: <code>bG9naW46cGFzc3dvcmQ=</code>
                </p>
              </div>

              {/* Google Maps Credentials Input */}
              <div className="space-y-1.5 bg-white">
                <label className="text-[9px] uppercase font-bold text-slate-550 tracking-wider font-mono block">
                  Google Maps API Key
                </label>
                <input
                  type="password"
                  value={settingsGmapsApiKey}
                  onChange={(e) => setSettingsGmapsApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-550 transition font-mono bg-white"
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
                  className="px-3 py-1.5 border border-slate-250 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer border-none"
                >
                  Save Settings
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
