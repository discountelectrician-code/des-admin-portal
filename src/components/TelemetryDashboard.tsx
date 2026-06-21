/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { TrackingEvent } from '../types';
import { 
  RefreshCw, 
  Search, 
  Clock, 
  Globe, 
  User, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Activity,
  Award
} from 'lucide-react';

export default function TelemetryDashboard() {
  // Central State
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters list
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [baseDate, setBaseDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<'page_load' | 'action' | 'all'>('page_load');

  // Calculates chronological bounds of the date range selected
  const currentRange = React.useMemo(() => {
    const start = new Date(baseDate);
    const end = new Date(baseDate);

    if (viewMode === 'daily') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === 'weekly') {
      const day = start.getDay(); // 0 is Sunday
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);

      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === 'monthly') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      end.setMonth(end.getMonth() + 1);
      end.setDate(1);
      end.setHours(0, 0, 0, 0);
      end.setTime(end.getTime() - 1);
    }

    return { start, end };
  }, [viewMode, baseDate]);

  const startMs = currentRange.start.getTime();
  const endMs = currentRange.end.getTime();

  // 1. Fetch Events from Firestore (Filtered by Date Range and ordered by Timestamp descending)
  useEffect(() => {
    setLoading(true);
    const startDate = new Date(startMs);
    const endDate = new Date(endMs);

    console.log(`Loading Traffic Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const q = query(
      collection(db, 'tracking_events'),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedEvents: TrackingEvent[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Audit and Standardize Event types (page_load case-insensitivity & check type/eventType)
        const rawType = String(data.eventType || data.type || '').toLowerCase().trim();
        let standardizedType = data.eventType || data.type || 'system';
        if (
          rawType.includes('page_load') || 
          rawType.includes('pageload') || 
          rawType.includes('page-load') ||
          rawType === 'page_view' || 
          rawType === 'pageview'
        ) {
          standardizedType = 'page_load';
        }

        loadedEvents.push({
          id: docSnap.id,
          timestamp: data.timestamp,
          eventType: standardizedType,
          subdomain: data.subdomain || 'public',
          userId: data.userId || 'anonymous',
          userEmail: data.userEmail || 'anonymous',
          message: data.message || '',
          status: data.status || 'info',
          details: data.details || ''
        });
      });
      setEvents(loadedEvents);
      setLoading(false);
    }, (error) => {
      console.error("Error reading telemetry collection:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [startMs, endMs]);

  // Utility to parse out the URL path/slug from any tracking event data
  const getEventPath = (evt: TrackingEvent): string | null => {
    if ((evt as any).path) return (evt as any).path;
    if ((evt as any).url) return (evt as any).url;
    if ((evt as any).currentPath) return (evt as any).currentPath;

    if (evt.details) {
      const dStr = String(evt.details).trim();
      if (dStr.startsWith('/') || dStr.startsWith('http')) {
        return dStr;
      }
      if (dStr.startsWith('{')) {
        try {
          const parsed = JSON.parse(dStr);
          if (parsed.path) return parsed.path;
          if (parsed.url) return parsed.url;
          if (parsed.currentPath) return parsed.currentPath;
        } catch (e) {
          // Fall through
        }
      }
    }

    if (evt.message) {
      const msg = String(evt.message).trim();
      if (msg.startsWith('/')) {
        return msg.split(' ')[0];
      }
      const pageLoadMatch = msg.match(/(?:page load:?|page view:?|visited|to|at)\s+([^\s]+)/i);
      if (pageLoadMatch && pageLoadMatch[1]) {
        return pageLoadMatch[1];
      }
    }

    return null;
  };

  const normalizePath = (p: string): string => {
    let clean = p.split('?')[0].split('#')[0].trim();
    if (clean.endsWith('/') && clean.length > 1) {
      clean = clean.slice(0, -1);
    }
    return clean || '/';
  };

  // Safe Date conversion helper
  const getEventDate = (evt: TrackingEvent): Date => {
    if (evt.timestamp instanceof Timestamp) {
      return evt.timestamp.toDate();
    }
    if (evt.timestamp && typeof evt.timestamp.toDate === 'function') {
      return evt.timestamp.toDate();
    }
    return evt.timestamp ? new Date(evt.timestamp) : new Date();
  };

  const handlePrevRange = () => {
    setBaseDate(prev => {
      const next = new Date(prev);
      if (viewMode === 'daily') {
        next.setDate(next.getDate() - 1);
      } else if (viewMode === 'weekly') {
        next.setDate(next.getDate() - 7);
      } else if (viewMode === 'monthly') {
        next.setMonth(next.getMonth() - 1);
      }
      return next;
    });
  };

  const handleNextRange = () => {
    setBaseDate(prev => {
      const next = new Date(prev);
      if (viewMode === 'daily') {
        next.setDate(next.getDate() + 1);
      } else if (viewMode === 'weekly') {
        next.setDate(next.getDate() + 7);
      } else if (viewMode === 'monthly') {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    });
  };

  const formatDisplayRange = () => {
    const { start, end } = currentRange;
    const optionsMonthYear: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };

    if (viewMode === 'daily') {
      return start.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    } else if (viewMode === 'weekly') {
      const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    } else if (viewMode === 'monthly') {
      return start.toLocaleDateString(undefined, optionsMonthYear);
    }
    return '';
  };

  const formatTableTimestamp = (date: Date): string => {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  };

  // Helper to determine visitor status client-side based on historic activity sequences in memory
  const getVisitorStatus = (evt: TrackingEvent, allEvents: TrackingEvent[]): 'New' | 'Returning' | 'Visitor' => {
    const email = evt.userEmail?.toLowerCase().trim();
    const uid = evt.userId?.trim();

    if ((!email || email === 'anonymous' || email === 'guest visitor') && (!uid || uid === 'anonymous')) {
      return 'Visitor';
    }

    const evtDate = getEventDate(evt);

    const hasPrior = allEvents.some((other) => {
      if (other.id === evt.id) return false;
      const otherDate = getEventDate(other);
      if (otherDate >= evtDate) return false;

      const otherEmail = other.userEmail?.toLowerCase().trim();
      const otherUid = other.userId?.trim();

      if (email && email !== 'anonymous' && otherEmail === email) return true;
      if (uid && uid !== 'anonymous' && otherUid === uid) return true;

      return false;
    });

    return hasPrior ? 'Returning' : 'New';
  };

  // 2. Hard Filter for Public Traffic Only & Clean Paths
  const processedEvents = React.useMemo(() => {
    return events.filter(evt => {
      // Eliminate backoffice/internal subdomains absolutely
      const sub = (evt.subdomain || '').toLowerCase().trim();
      const matchesBackoffice = 
        sub === 'admin' || 
        sub === 'pay' || 
        sub === 'timecard' || 
        sub.includes('admin') || 
        sub.includes('pay') || 
        sub.includes('timecard');
      
      if (matchesBackoffice) return false;

      // Filter by requested Event Type
      if (selectedEventType === 'page_load') {
        const isLoad = evt.eventType === 'page_load' || getEventPath(evt) !== null;
        if (!isLoad) return false;
      } else if (selectedEventType === 'action') {
        const isAction = evt.eventType === 'action' || evt.message?.toLowerCase().includes('click') || evt.message?.toLowerCase().includes('submit');
        if (!isAction) return false;
      }

      // Filter by Path Search query string
      if (searchQuery.trim() !== '') {
        const term = searchQuery.toLowerCase().trim();
        const path = getEventPath(evt);
        const hasPathMatch = path && normalizePath(path).toLowerCase().includes(term);
        const hasMsgMatch = evt.message?.toLowerCase().includes(term);
        const hasUserMatch = evt.userEmail?.toLowerCase().includes(term);
        if (!hasPathMatch && !hasMsgMatch && !hasUserMatch) return false;
      }

      return true;
    });
  }, [events, selectedEventType, searchQuery]);

  // Aggregate stats: Top 10 paths visited
  const top10Paths = React.useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(evt => {
      // Exclude backoffice logs
      const sub = (evt.subdomain || '').toLowerCase().trim();
      const matchesBackoffice = 
        sub === 'admin' || 
        sub === 'pay' || 
        sub === 'timecard' || 
        sub.includes('admin') || 
        sub.includes('pay') || 
        sub.includes('timecard');
      if (matchesBackoffice) return;

      // Ensure it represents a page view
      const isLoad = evt.eventType === 'page_load' || getEventPath(evt) !== null;
      if (!isLoad) return;

      const rawPath = getEventPath(evt);
      if (rawPath) {
        const norm = normalizePath(rawPath);
        counts[norm] = (counts[norm] || 0) + 1;
      } else {
        counts['/'] = (counts['/'] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [events]);

  const totalTopViews = top10Paths.reduce((sum, item) => sum + item.count, 0);

  return (
    <div id="telemetry_seo_overhaul_grid" className="space-y-6 max-w-7xl mx-auto px-2">
      
      {/* 1. PERSISTENT CONTROL BAR FIRST */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl text-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 sticky top-0 z-20">
        
        {/* Left Side: Dynamic Date Range Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-bold">Range:</span>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
              className="bg-slate-850 border border-slate-755 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="daily">Daily View</option>
              <option value="weekly">Weekly View</option>
              <option value="monthly">Monthly View</option>
            </select>
          </div>

          <div className="flex items-center bg-slate-850 border border-slate-755 rounded-xl p-1 shrink-0">
            <button
              onClick={handlePrevRange}
              title="Previous timeframe"
              className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg transition font-extrabold cursor-pointer text-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-medium font-mono text-cyan-300 tracking-tight min-w-[120px] text-center">
              {formatDisplayRange()}
            </span>
            <button
              onClick={handleNextRange}
              title="Next timeframe"
              className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg transition font-extrabold cursor-pointer text-xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Side: Search and Event Type selectors */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 md:justify-end">
          
          {/* Path Search */}
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Page Path..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-755 bg-slate-850 text-white placeholder-slate-400 w-full focus:outline-none focus:ring-2 focus:ring-cyan-550 transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
          </div>

          {/* Event Type selection */}
          <div className="flex items-center space-x-2 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-405" />
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value as any)}
              className="bg-slate-850 border border-slate-755 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="page_load">Page Load Only</option>
              <option value="action">Actions & Submissions</option>
              <option value="all">All Ecosystem logs</option>
            </select>
          </div>

        </div>

      </div>

      {/* 2. MAIN BODY WRAP: TOP SEO PERFORMANCE GRID & DENSE STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: High Density Top Paths Overview (Top 10 SEO performance metrics) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2.5 border-b pb-3.5">
            <Globe className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm tracking-tight">Top Performing Paths</h3>
              <p className="text-[11px] text-slate-400">Total hits for public domains</p>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-xs font-mono">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-500 mb-2" />
              <span>Analyzing index metrics...</span>
            </div>
          ) : top10Paths.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-xs font-semibold">No paths recorded</p>
              <p className="text-[10px] text-slate-400/90 mt-1">Check that user events was saved correctly.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {top10Paths.map((item, index) => {
                const percent = totalTopViews > 0 ? Math.round((item.count / totalTopViews) * 100) : 0;
                return (
                  <div key={item.path} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-700 font-medium truncate max-w-[180px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100" title={item.path}>
                        {item.path}
                      </span>
                      <span className="font-mono font-bold text-slate-900 shrink-0">{item.count} views</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300" 
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: High-Density Path Traffic Table */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[500px]">
          
          <div className="bg-slate-50 border-b px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-600" />
                <span>SEO Path Live stream</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Real-time visitor hit entries for the public marketing site</p>
            </div>

            <div className="bg-slate-250 text-slate-650 font-mono text-[10px] font-bold px-2 rounded border flex items-center space-x-1 py-1">
              <span>{loading ? '...' : processedEvents.length} Logs Loaded</span>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-100/50 border-b text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-5 py-3 w-1/4">Timestamp</th>
                  <th className="px-5 py-3 w-1/2">Page Path</th>
                  <th className="px-5 py-3 w-1/4 text-center">Visitor Status</th>
                </tr>
              </thead>
              <tbody className="divide-y font-sans">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="text-center py-24 text-slate-400 font-mono text-xs">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading telemetry dataset...
                    </td>
                  </tr>
                ) : processedEvents.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-24 text-slate-450 bg-slate-50 font-medium">
                      No public paths matching filters inside this range.
                    </td>
                  </tr>
                ) : (
                  processedEvents.map((evt) => {
                    const dateObj = getEventDate(evt);
                    const pathVal = getEventPath(evt) || '/';
                    const normPath = normalizePath(pathVal);
                    const status = getVisitorStatus(evt, events);

                    // Badge theme calculations
                    let statusBadgeClass = '';
                    if (status === 'New') {
                      statusBadgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-150';
                    } else if (status === 'Returning') {
                      statusBadgeClass = 'bg-indigo-50 text-indigo-700 border border-indigo-150';
                    } else {
                      statusBadgeClass = 'bg-slate-50 text-slate-500 border border-slate-200';
                    }

                    return (
                      <tr key={evt.id} className="hover:bg-slate-50/50 transition">
                        {/* Timestamp columns */}
                        <td className="px-5 py-3 font-mono text-slate-600 flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatTableTimestamp(dateObj)}</span>
                        </td>

                        {/* Page Path columns */}
                        <td className="px-5 py-3 truncate">
                          <div className="flex items-center space-x-2 truncate">
                            <span 
                              className="font-mono font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition duration-150 cursor-pointer text-xs truncate max-w-full"
                              title={normPath}
                            >
                              {normPath}
                            </span>
                          </div>
                        </td>

                        {/* Visitor Status columns */}
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-tight uppercase ${statusBadgeClass}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

    </div>
  );
}
