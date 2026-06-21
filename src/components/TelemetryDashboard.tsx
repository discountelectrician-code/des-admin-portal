/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  setDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { TrackingEvent } from '../types';
import { formatDate } from '../utils/format';
import { 
  Activity, 
  Layers, 
  RefreshCw, 
  AlertTriangle, 
  AlertOctagon, 
  CheckCircle, 
  Info, 
  Search, 
  SlidersHorizontal,
  Clock,
  Globe,
  Users,
  Target,
  MousePointerClick,
  PlusSquare,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface ActiveUserPresence {
  id: string;
  userId: string;
  userEmail: string;
  currentPath: string;
  lastActive: any; // Firestore Timestamp or date
  userAgent?: string;
}

export default function TelemetryDashboard() {
  // Central Tracking Events
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Real-Time Active Presence Radar
  const [activeUsers, setActiveUsers] = useState<ActiveUserPresence[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(true);
  
  // Filtering and Searching states
  const [timeframe, setTimeframe] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'traffic' | 'actions' | 'raw_logs'>('traffic');
  const [filterSubdomain, setFilterSubdomain] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Timestamp ticker state to force-evaluate 30s local presence rules in real time
  const [nowTick, setNowTick] = useState(Date.now());
  
  // Seed state
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);

  // Tick generator for presence evaluation
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Subscribe to Tracking Events Collection
  useEffect(() => {
    setLoading(true);
    // Fetch a large window of tracking events to perform robust timeframe aggregation
    const q = query(
      collection(db, 'tracking_events'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedEvents: TrackingEvent[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedEvents.push({
          id: docSnap.id,
          timestamp: data.timestamp,
          eventType: data.eventType || 'system',
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
  }, []);

  // 2. Subscribe to Live Presence Collection
  useEffect(() => {
    setPresenceLoading(true);
    const q = query(
      collection(db, 'live_presence'),
      orderBy('lastActive', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users: ActiveUserPresence[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        users.push({
          id: docSnap.id,
          userId: data.userId || 'anonymous',
          userEmail: data.userEmail || data.email || 'Guest Visitor',
          currentPath: data.currentPath || data.path || '/',
          lastActive: data.lastActive,
          userAgent: data.userAgent || 'Web Browser'
        });
      });
      setActiveUsers(users);
      setPresenceLoading(false);
    }, (error) => {
      console.error("Error reading live presence collections:", error);
      setPresenceLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Dynamic Path Extractor Utility
  const getEventPath = (evt: any): string | null => {
    if (evt.path) return evt.path;
    if (evt.url) return evt.url;
    if (evt.currentPath) return evt.currentPath;

    // Inspect details for exact path or JSON properties
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
          // ignore parsing fallback
        }
      }
    }

    // Parse message
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

  // Normalizes path representations (groups '/services/' and '/services' together)
  const normalizePath = (p: string): string => {
    let clean = p.split('?')[0].split('#')[0].trim();
    if (clean.endsWith('/') && clean.length > 1) {
      clean = clean.slice(0, -1);
    }
    return clean || '/';
  };

  // Timeframe start dates calculator
  const getStartDateForTimeframe = (tf: string): Date => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (tf) {
      case 'today':
        return today;
      case 'yesterday': {
        const yest = new Date(today);
        yest.setDate(yest.getDate() - 1);
        return yest;
      }
      case 'week': {
        const wk = new Date();
        wk.setDate(wk.getDate() - 7);
        return wk;
      }
      case 'month': {
        const mn = new Date();
        mn.setMonth(mn.getMonth() - 1);
        return mn;
      }
      case 'all':
      default:
        return new Date(0);
    }
  };

  // Safe Date conversion for tracking elements
  const getEventDate = (evt: TrackingEvent): Date => {
    if (evt.timestamp instanceof Timestamp) {
      return evt.timestamp.toDate();
    }
    if (evt.timestamp && typeof evt.timestamp.toDate === 'function') {
      return evt.timestamp.toDate();
    }
    return evt.timestamp ? new Date(evt.timestamp) : new Date();
  };

  // Main timeframe checker
  const isEventInTimeframe = (evt: TrackingEvent): boolean => {
    const evtDate = getEventDate(evt);
    const threshold = getStartDateForTimeframe(timeframe);
    
    if (timeframe === 'yesterday') {
      const todayStart = getStartDateForTimeframe('today');
      return evtDate >= threshold && evtDate < todayStart;
    }
    
    return evtDate >= threshold;
  };

  // Local Filter for Live Presence Radar: strict 30-seconds filter
  const activePresencesNow = activeUsers.filter(usr => {
    if (!usr.lastActive) return false;
    let actDate: Date;
    if (usr.lastActive instanceof Timestamp) {
      actDate = usr.lastActive.toDate();
    } else if (usr.lastActive && typeof usr.lastActive.toDate === 'function') {
      actDate = usr.lastActive.toDate();
    } else {
      actDate = new Date(usr.lastActive);
    }

    const secondsAgo = (nowTick - actDate.getTime()) / 1000;
    return secondsAgo >= 0 && secondsAgo <= 30;
  });

  // Filters for overall list and charts
  const filteredEventsForTimeframe = events.filter(evt => {
    // Check timeframe filter
    if (!isEventInTimeframe(evt)) return false;

    // Subdomain filter
    if (filterSubdomain !== 'all' && evt.subdomain !== filterSubdomain) return false;

    // Severity filter
    if (filterStatus !== 'all' && evt.status !== filterStatus) return false;

    // Search query constraint
    if (searchQuery.trim() !== '') {
      const term = searchQuery.toLowerCase();
      const matchSearch = 
        evt.message?.toLowerCase().includes(term) || 
        evt.userEmail?.toLowerCase().includes(term) ||
        evt.eventType?.toLowerCase().includes(term) ||
        evt.id?.toLowerCase().includes(term);
      if (!matchSearch) return false;
    }

    return true;
  });

  // Calculate high-level counters for displayed timeframe events
  const totalCount = filteredEventsForTimeframe.length;
  const errorsCount = filteredEventsForTimeframe.filter(e => e.status === 'error').length;
  const warningsCount = filteredEventsForTimeframe.filter(e => e.status === 'warning').length;
  const successCount = filteredEventsForTimeframe.filter(e => e.status === 'success').length;

  // 1. Dynamic Discovery Traffic Analytics Aggregation
  const dynamicTrafficStats = React.useMemo(() => {
    const pathCounts: Record<string, number> = {};
    
    filteredEventsForTimeframe.forEach(evt => {
      // Exclude action-only and error-only events to focus purely on content visits
      const isActionType = evt.eventType === 'action' || (evt as any).type === 'action';
      const isActionMessage = evt.message?.toLowerCase().includes('click') || evt.message?.toLowerCase().includes('button');
      if (isActionType || isActionMessage || evt.status === 'error') return;

      const matchedPath = getEventPath(evt);
      if (matchedPath) {
        const normalized = normalizePath(matchedPath);
        pathCounts[normalized] = (pathCounts[normalized] || 0) + 1;
      } else {
        // Fallback for general page logs
        if (evt.eventType === 'page_load') {
          pathCounts['/'] = (pathCounts['/'] || 0) + 1;
        }
      }
    });

    return Object.entries(pathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredEventsForTimeframe]);

  // Total Traffic view counts for percentage bars
  const totalTrafficViews = dynamicTrafficStats.reduce((sum, item) => sum + item.count, 0);

  // 2. Dynamic Discovery High-Value Action Tracking events
  const highValueActionsList = React.useMemo(() => {
    return filteredEventsForTimeframe.filter(evt => {
      const isActionType = evt.eventType === 'action' || (evt as any).type === 'action';
      const isActionMessage = evt.message?.toLowerCase().includes('click') || 
                              evt.message?.toLowerCase().includes('request service') ||
                              evt.message?.toLowerCase().includes('submit') ||
                              evt.message?.toLowerCase().includes('triggered');
      return isActionType || isActionMessage;
    });
  }, [filteredEventsForTimeframe]);

  // Aggregated Actions counts stats
  const aggregatedActionStats = React.useMemo(() => {
    const counts: Record<string, number> = {};
    highValueActionsList.forEach(evt => {
      const label = evt.message || 'Triggered Action';
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);
  }, [highValueActionsList]);

  // Subdomains split percentage counters
  const subCount = { admin: 0, pay: 0, timecard: 0, public: 0 };
  filteredEventsForTimeframe.forEach(e => {
    const sub = e.subdomain || 'public';
    if (sub in subCount) {
      subCount[sub as keyof typeof subCount]++;
    } else {
      subCount.public++;
    }
  });

  const totalSubsNum = Math.max(subCount.admin + subCount.pay + subCount.timecard + subCount.public, 1);
  const percentAdmin = Math.round((subCount.admin / totalSubsNum) * 100);
  const percentPay = Math.round((subCount.pay / totalSubsNum) * 100);
  const percentTimecard = Math.round((subCount.timecard / totalSubsNum) * 100);
  const percentPublic = Math.round((subCount.public / totalSubsNum) * 100);

  // Status icon formatter
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'error': return <AlertOctagon id="icon_err" className="w-4 h-4 text-rose-500 shrink-0" />;
      case 'warning': return <AlertTriangle id="icon_warn" className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'success': return <CheckCircle id="icon_succ" className="w-4 h-4 text-emerald-500 shrink-0" />;
      default: return <Info id="icon_info" className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  // Subdomain beautiful badge creator
  const renderSubdomainBadge = (sub: string) => {
    switch (sub) {
      case 'admin':
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-purple-50 text-purple-700 border border-purple-100">admin.des</span>;
      case 'pay':
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-sky-50 text-sky-700 border border-sky-100">pay.des</span>;
      case 'timecard':
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-teal-50 text-teal-700 border border-teal-100">timecard.des</span>;
      case 'public':
      default:
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">public.des</span>;
    }
  };

  // Seeding Auxiliary tool for instant manual telemetry verification
  const generateDemoTelemetry = async () => {
    setDemoSeeding(true);
    setDemoSuccess(false);
    try {
      const mockPaths = ['/', '/services', '/pricing', '/about', '/contact', '/services/ev-charging', '/emergency-electrician'];
      const mockActions = ['Clicked: Request Service', 'Clicked: Call Sparky Now', 'Submitted Form: Lead Form', 'Clicked: View Pricing Breakdown'];
      const mockEmails = ['customer_jack@gmail.com', 'guest_spider@yahoo.com', 'anonymous', 'sparky_fan@outlook.com', 'worker_travis@gmail.com'];
      
      const selectPath = mockPaths[Math.floor(Math.random() * mockPaths.length)];
      const selectEmail = mockEmails[Math.floor(Math.random() * mockEmails.length)];
      
      // 1. Generate fake page view
      const eventId1 = 'demo_view_' + Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'tracking_events', eventId1), {
        id: eventId1,
        timestamp: new Date(),
        eventType: 'page_load',
        subdomain: 'public',
        userId: 'anonymous',
        userEmail: selectEmail,
        message: `Page View: ${selectPath}`,
        status: 'info',
        details: selectPath
      });

      // 50% chance of triggering an action of type Action too
      if (Math.random() > 0.3) {
        const eventId2 = 'demo_act_' + Math.random().toString(36).substr(2, 9);
        const actionMsg = mockActions[Math.floor(Math.random() * mockActions.length)];
        await setDoc(doc(db, 'tracking_events', eventId2), {
          id: eventId2,
          timestamp: new Date(),
          eventType: 'action',
          subdomain: 'public',
          userId: 'anonymous',
          userEmail: selectEmail,
          message: actionMsg,
          status: 'success',
          details: selectPath
        });
      }

      // 2. Generate alive user presence heartbeat
      const randPresenceId = 'pres_' + Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'live_presence', randPresenceId), {
        id: randPresenceId,
        userId: 'demo_' + Math.floor(Math.random() * 900 + 100),
        userEmail: selectEmail,
        currentPath: selectPath,
        lastActive: new Date(),
        userAgent: 'Chrome ' + Math.floor(Math.random() * 20 + 110) + '.0 (Faux Presence)'
      });

      setDemoSuccess(true);
      setTimeout(() => setDemoSuccess(false), 2000);
    } catch (e) {
      console.error("Error seeding mock telemetry:", e);
    } finally {
      setDemoSeeding(false);
    }
  };

  return (
    <div id="telemetry_dashboard_all_wrap" className="space-y-8 max-w-7xl mx-auto px-1">
      
      {/* 1. Header Control Center Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
        
        <div className="space-y-2">
          <div className="flex items-center space-x-3 text-cyan-400">
            <Activity className="w-8 h-8 animate-pulse text-cyan-500" />
            <h1 className="text-2xl font-bold tracking-tight font-sans">Ecosystem Telemetry & Presence</h1>
          </div>
          <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
            Real-time analytics engine synchronized with the public domain and active technician modules. Filtering on-demand events and tracking customer journeys.
          </p>
        </div>

        {/* Action controls & simulator */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={generateDemoTelemetry}
            disabled={demoSeeding}
            className="flex items-center space-x-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium px-4 py-2 text-sm rounded-xl transition duration-250 shadow-md hover:shadow-lg disabled:opacity-50 active:scale-95"
          >
            {demoSeeding ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <PlusSquare className="w-4 h-4" />
            )}
            <span>{demoSeeding ? 'Broadcasting...' : 'Simulate Visitors'}</span>
          </button>
          
          {demoSuccess && (
            <span className="text-xs text-cyan-400 font-mono flex items-center animate-bounce">
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Demo data injected!
            </span>
          )}
        </div>

      </div>

      {/* 2. Real-Time Analytics & Presence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* LEFT COLUMN: LIVE PRESENCE RADAR (Strict 30s filters) */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5 h-[580px] flex flex-col">
          
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center space-x-2.5">
              <div className="relative">
                <Globe className="w-5 h-5 text-indigo-600 animate-spin [animation-duration:8s]" />
                <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
              </div>
              <div>
                <h2 className="font-bold text-slate-900 tracking-tight text-base">Live Presence Radar</h2>
                <p className="text-xs text-slate-400">Currently Active (Recent 30s)</p>
              </div>
            </div>
            
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-xs px-2.5 py-1 rounded-full font-bold flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span>
              <span>{activePresencesNow.length} Active</span>
            </div>
          </div>

          {/* Currently active users display */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans">
            {presenceLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-indigo-400" />
                Listening to web socket sockets...
              </div>
            ) : activePresencesNow.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                <Users className="w-10 h-10 text-slate-350 stroke-1 mb-2" />
                <p className="text-sm font-semibold text-slate-500">No active visitors</p>
                <p className="text-xs text-slate-400/90 mt-1 max-w-[200px]">
                  Use the **"Simulate Visitors"** button above to instantly generate active radar logs.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activePresencesNow.map((p) => {
                  let actDate: Date;
                  if (p.lastActive instanceof Timestamp) {
                    actDate = p.lastActive.toDate();
                  } else if (p.lastActive && typeof p.lastActive.toDate === 'function') {
                    actDate = p.lastActive.toDate();
                  } else {
                    actDate = new Date(p.lastActive);
                  }
                  
                  const diffSeconds = Math.max(0, Math.round((nowTick - actDate.getTime()) / 1000));
                  
                  return (
                    <div 
                      key={p.id} 
                      className="group border border-slate-100 hover:border-indigo-100 hover:bg-slate-50/50 rounded-xl p-3.5 transition-all text-xs flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <div className="truncate">
                          <span className="font-semibold text-slate-800 block truncate" title={p.userEmail}>
                            {p.userEmail}
                          </span>
                          <span className="text-[10px] text-slate-450 font-mono">UID: {p.userId.substr(0, 10)}...</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0 font-bold">
                          {diffSeconds === 0 ? 'Just now' : `${diffSeconds}s ago`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono mt-1 pt-2 border-t border-slate-50">
                        <div className="flex items-center text-slate-600 bg-slate-100/70 hover:bg-slate-100 px-2 py-0.5 rounded truncate" title="Current open path">
                          <span className="text-indigo-500 mr-1 font-bold">url:</span>
                          <span className="truncate max-w-[150px]">{p.currentPath}</span>
                        </div>
                        
                        <div className="text-[10px] text-slate-400 truncate max-w-[100px]" title={p.userAgent}>
                          {p.userAgent?.includes('Faux') ? 'Faux Simulator' : 'Public Web'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl p-3 text-[11px] text-slate-500 font-mono flex items-center justify-between border">
            <span>Radar Window size:</span>
            <span>30 Seconds</span>
          </div>

        </div>

        {/* RIGHT COLUMN: TRAFFIC STATS & ACTIONS ANALYTICS (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Real-time counters row details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <span className="text-xs text-slate-400 font-medium block">Timeframe Count</span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{loading ? '...' : totalCount}</div>
              <span className="text-[10px] text-indigo-500 font-semibold bg-indigo-50 px-2 py-0.5 rounded mt-2 inline-block capitalize">
                {timeframe} logs
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-green-500">
              <span className="text-xs text-slate-400 font-medium block">Completed Actions</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">{loading ? '...' : highValueActionsList.length}</div>
              <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-50 px-2 py-0.5 rounded mt-2 inline-block">
                Interactions Matches
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-amber-500">
              <span className="text-xs text-slate-400 font-medium block">Events Warned</span>
              <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{loading ? '...' : warningsCount}</div>
              <span className="text-[10px] text-amber-500 font-semibold bg-amber-50 px-2 py-0.5 rounded mt-2 inline-block">
                Warnings Flagged
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-rose-500">
              <span className="text-xs text-slate-400 font-medium block">Events Erred</span>
              <div className="text-2xl font-bold font-mono text-rose-600 mt-1">{loading ? '...' : errorsCount}</div>
              <span className="text-[10px] text-rose-500 font-semibold bg-rose-50 px-2 py-0.5 rounded mt-2 inline-block">
                Errors Flagged
              </span>
            </div>
          </div>

          {/* MAIN INTERACTIVE GRAPH & STATS PANEL */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[480px]">
            
            {/* Tab selection and Timeframe dropdown header */}
            <div className="bg-slate-50 border-b p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              
              {/* Tab Navigation buttons */}
              <div className="flex bg-slate-200/80 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setActiveTab('traffic')}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all ${
                    activeTab === 'traffic'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Traffic Aggregation</span>
                </button>
                <button
                  onClick={() => setActiveTab('actions')}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all ${
                    activeTab === 'actions'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Action Tracker</span>
                </button>
                <button
                  onClick={() => setActiveTab('raw_logs')}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all ${
                    activeTab === 'raw_logs'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Raw Events</span>
                </button>
              </div>

              {/* Timeframe selector dropdown */}
              <div className="flex items-center space-x-3 text-xs">
                <label className="text-slate-500 font-semibold flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Timeframe:</span>
                </label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as any)}
                  className="bg-white border rounded-lg px-3 py-1.5 font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="today">Today (Local Date)</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="week">Past Week</option>
                  <option value="month">Past Month</option>
                  <option value="all">All-Time Recorded</option>
                </select>
              </div>

            </div>

            {/* TAB CONTENT: 1. TRAFFIC AGGREGATION TABLE */}
            {activeTab === 'traffic' && (
              <div className="p-5 space-y-6 flex-1">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Historical Page Traffic Performance</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Dynamically aggregated count of visitor loads and visits across distinct page routing modules.</p>
                </div>

                {loading ? (
                  <div className="text-center py-20 text-slate-400 font-mono text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Fetching page view logs...
                  </div>
                ) : dynamicTrafficStats.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 border border-dashed rounded-xl p-8 space-y-2">
                    <Globe className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-500">No page traffic recorded in timeframe choice</p>
                    <p className="text-[11px] text-slate-400">Visitor hits must be generated or broadcasted first.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Traffic List Table */}
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="px-5 py-3">Discovered Page Path</th>
                            <th className="px-5 py-3 text-right">View Counts</th>
                            <th className="px-5 py-3">Traffic Split %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-sans">
                          {dynamicTrafficStats.map((item, idx) => {
                            const percentage = totalTrafficViews > 0 
                              ? Math.round((item.count / totalTrafficViews) * 100) 
                              : 0;
                            
                            return (
                              <tr key={item.path} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-5 py-3 font-mono font-medium text-slate-800 flex items-center space-x-2">
                                  <span className="text-slate-350 font-bold">{idx + 1}.</span>
                                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded hover:bg-slate-200 transition duration-150 cursor-pointer">{item.path}</span>
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">
                                  {item.count} views
                                </td>
                                <td className="px-5 py-3 w-1/3">
                                  <div className="flex items-center space-x-3">
                                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                      <div 
                                        className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${percentage}%` }}
                                      ></div>
                                    </div>
                                    <span className="font-mono text-[10px] text-slate-500 font-semibold w-8 text-right shrink-0">{percentage}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Small Breakdown graph details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="border rounded-xl p-4 bg-slate-50 p-4 space-y-3">
                        <span className="font-bold text-slate-700 block">Ecosystem Traffic Volume</span>
                        <div className="flex items-end justify-between font-mono">
                          <span className="text-slate-450">Filter Total Views:</span>
                          <span className="text-lg font-bold text-slate-900">{totalTrafficViews} Page views</span>
                        </div>
                      </div>
                      <div className="border rounded-xl p-4 bg-slate-50 p-4 space-y-3">
                        <span className="font-bold text-slate-700 block">Top Performer Path</span>
                        <div className="flex items-end justify-between font-mono">
                          <span className="text-slate-450">URL Endpoint:</span>
                          <span className="font-bold text-indigo-700 truncate max-w-[150px]">
                            {dynamicTrafficStats[0]?.path || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* TAB CONTENT: 2. HIGH-VALUE CUSTOMER ACTIONS TAB */}
            {activeTab === 'actions' && (
              <div className="p-5 space-y-6 flex-1">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">High-Value Action Trigger Tracking</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Separate analysis tracking customer requests, contact conversions, and button interactions.</p>
                </div>

                {loading ? (
                  <div className="text-center py-20 text-slate-400 font-mono text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                    Fetching service clicks...
                  </div>
                ) : highValueActionsList.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 border border-dashed rounded-xl p-8 space-y-2">
                    <Target className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-500">No high-value actions tracked at this timeframe</p>
                    <p className="text-[11px] text-slate-450 mt-1 max-w-sm mx-auto">
                      Actions are fired when a user actively clicks the **Request Service** button on the public page. Test it with **Simulate Visitors**!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Aggregated totals */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {aggregatedActionStats.map((item, idx) => (
                        <div key={item.action} className="border rounded-xl p-3.5 bg-slate-50 flex items-center justify-between">
                          <div className="truncate space-y-0.5">
                            <span className="text-[10px] uppercase font-mono text-slate-450 block font-bold">Action #{idx+1}</span>
                            <span className="text-xs font-semibold text-slate-800 block truncate" title={item.action}>
                              {item.action}
                            </span>
                          </div>
                          <span className="bg-emerald-100 border border-emerald-250 text-emerald-800 text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                            {item.count} clicks
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Detailed Action occurrences log */}
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="px-5 py-3">Timestamp</th>
                            <th className="px-5 py-3">Action Description</th>
                            <th className="px-5 py-3">Referrer Path</th>
                            <th className="px-5 py-3">Fired By User / Visitor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-sans">
                          {highValueActionsList.map(evt => {
                            const dateVal = getEventDate(evt);
                            
                            return (
                              <tr key={evt.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-5 py-3 font-mono font-medium text-slate-800">
                                  {dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="font-semibold text-slate-900">{evt.message}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3 font-mono text-indigo-600 font-medium">
                                  {getEventPath(evt) || '/'}
                                </td>
                                <td className="px-5 py-3 font-mono text-slate-500">
                                  {evt.userEmail}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* TAB CONTENT: 3. RAW EVENT LOGS PANEL */}
            {activeTab === 'raw_logs' && (
              <div className="p-5 space-y-6 flex-1">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Raw Telemetry Event Stream</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Unfiltered audit log of systemic state transmissions, errors, updates, and general telemetry.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-slate-50 border p-3 rounded-xl text-xs">
                  
                  {/* Subdomain selector */}
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-450 font-semibold">Subdomain:</span>
                    <select
                      value={filterSubdomain}
                      onChange={(e) => setFilterSubdomain(e.target.value)}
                      className="bg-white border rounded px-2 py-1 focus:outline-none"
                    >
                      <option value="all">All Subdomains</option>
                      <option value="public">public.des</option>
                      <option value="admin">admin.des</option>
                      <option value="pay">pay.des</option>
                      <option value="timecard">timecard.des</option>
                    </select>
                  </div>

                  {/* Status filter selection */}
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-450 font-semibold">Severity:</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-white border rounded px-2 py-1 focus:outline-none"
                    >
                      <option value="all">All Levels</option>
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                    </select>
                  </div>

                  {/* Search query input */}
                  <div className="flex items-center space-x-2 ml-auto w-full md:w-fit">
                    <div className="relative w-full">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                        className="pl-7 pr-3 py-1 text-xs rounded border border-slate-350 bg-white w-full md:w-48 focus:outline-none"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                    </div>
                  </div>

                </div>

                <div className="border rounded-xl overflow-hidden">
                  <div className="max-h-[350px] overflow-y-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b">
                        <tr>
                          <th className="px-5 py-2.5">Time</th>
                          <th className="px-5 py-2.5">Subdomain</th>
                          <th className="px-5 py-2.5">Origin User</th>
                          <th className="px-5 py-2.5">Event Message</th>
                          <th className="px-5 py-2.5">Payload Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y font-sans">
                        {loading ? (
                          <tr>
                            <td colSpan={5} className="text-center py-10 font-mono text-slate-400">
                              Streaming active database records...
                            </td>
                          </tr>
                        ) : filteredEventsForTimeframe.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-10 font-mono text-slate-400 bg-slate-50">
                              No events found matching current criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredEventsForTimeframe.map((evt) => {
                            const dateVal = getEventDate(evt);
                            return (
                              <tr key={evt.id} className="hover:bg-slate-50/50 transition">
                                <td className="px-5 py-2.5 font-mono text-slate-500">
                                  {dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="px-5 py-2.5 whitespace-nowrap">
                                  {renderSubdomainBadge(evt.subdomain)}
                                </td>
                                <td className="px-5 py-2.5 max-w-[120px] truncate font-mono text-slate-500" title={evt.userEmail}>
                                  {evt.userEmail}
                                </td>
                                <td className="px-5 py-2.5 font-semibold text-slate-800">
                                  <div className="flex items-center space-x-1.5">
                                    {renderStatusIcon(evt.status)}
                                    <span className="truncate max-w-[250px]" title={evt.message}>{evt.message}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-2.5 max-w-[150px] truncate font-mono text-slate-400" title={evt.details}>
                                  {evt.details}
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
            )}

          </div>

        </div>

      </div>

      {/* 3. SUBDOMAINS SPLIT HEALTH HEALTH SECTION */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        
        <div>
          <h2 className="font-bold text-slate-900 text-sm tracking-tight">Active Ecosystem Portals Split</h2>
          <p className="text-xs text-slate-400">Activity volume ratio comparing independent subdomain portals across the DES network.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
          
          {/* Progress bar split */}
          <div className="md:col-span-3 space-y-3.5 font-sans">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-650 mb-1">
                <span>public.discountelectricalservice.com (Public visitor traffic)</span>
                <span>{subCount.public} events ({percentPublic}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${percentPublic || 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-650 mb-1">
                <span>admin.discountelectricalservice.com (Admin oversight)</span>
                <span>{subCount.admin} events ({percentAdmin}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full transition-all duration-300" style={{ width: `${percentAdmin || 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-650 mb-1">
                <span>pay.discountelectricalservice.com (Invoice matching)</span>
                <span>{subCount.pay} events ({percentPay}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: `${percentPay || 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-650 mb-1">
                <span>timecard.discountelectricalservice.com (Technician timesheet)</span>
                <span>{subCount.timecard} events ({percentTimecard}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-teal-500 h-full rounded-full transition-all duration-300" style={{ width: `${percentTimecard || 0}%` }}></div>
              </div>
            </div>
          </div>

          {/* SVG donut chart */}
          <div className="md:col-span-1 flex flex-col items-center justify-center p-4 border border-dashed rounded-2xl bg-slate-50">
            <svg className="w-28 h-28" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {percentPublic > 0 && (
                <path
                  className="text-indigo-500"
                  strokeDasharray={`${percentPublic}, 100`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              )}
              {percentAdmin > 0 && (
                <path
                  className="text-purple-500"
                  strokeDasharray={`${percentAdmin}, 100`}
                  strokeDashoffset={`-${percentPublic}`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              )}
              {percentPay > 0 && (
                <path
                  className="text-sky-500"
                  strokeDasharray={`${percentPay}, 100`}
                  strokeDashoffset={`-${percentPublic + percentAdmin}`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              )}
              {percentTimecard > 0 && (
                <path
                  className="text-teal-500"
                  strokeDasharray={`${percentTimecard}, 100`}
                  strokeDashoffset={`-${percentPublic + percentAdmin + percentPay}`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              )}
              <text x="18" y="20" className="text-[5px] font-mono font-bold" textAnchor="middle" fill="#475569">
                Ecosystem
              </text>
            </svg>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[9px] font-mono font-semibold">
              <span className="flex items-center text-indigo-600"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1 inline-block"></span>Public</span>
              <span className="flex items-center text-purple-600"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1 inline-block"></span>Admin</span>
              <span className="flex items-center text-sky-600"><span className="w-1.5 h-1.5 rounded-full bg-sky-500 mr-1 inline-block"></span>Pay</span>
              <span className="flex items-center text-teal-600"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-1 inline-block"></span>Hours</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
