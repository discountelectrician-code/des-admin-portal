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
  addDoc, 
  serverTimestamp,
  doc,
  setDoc,
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TrackingEvent } from '../types';
import { formatDate } from '../utils/format';
import { 
  Activity, 
  ShieldCheck, 
  Plus, 
  Layers, 
  RefreshCw, 
  AlertTriangle, 
  AlertOctagon, 
  CheckCircle, 
  Info, 
  Search, 
  SlidersHorizontal 
} from 'lucide-react';

export default function TelemetryDashboard() {
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubdomain, setFilterSubdomain] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Subscribe to tracking_events
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'tracking_events'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedEvents: TrackingEvent[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedEvents.push({
          id: docSnap.id,
          timestamp: data.timestamp,
          eventType: data.eventType,
          subdomain: data.subdomain,
          userId: data.userId,
          userEmail: data.userEmail,
          message: data.message,
          status: data.status,
          details: data.details || ''
        });
      });
      setEvents(loadedEvents);
      setLoading(false);
    }, (error) => {
      console.error("Error reading telemetry collection, check custom claims:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filters calculation
  const filteredEvents = events.filter(evt => {
    const isPageLoad = (evt.message && (
                        evt.message.toLowerCase().includes('page load') || 
                        evt.message.toLowerCase().includes('discountelectricalservice.com')
                       )) || 
                       evt.eventType === 'page_load' || 
                       evt.eventType === 'page_loads';
                       
    const isRequestService = (evt.message && (
                             evt.message.toLowerCase().includes('request service')
                             )) || 
                             evt.eventType === 'request_service' || 
                             evt.eventType === 'request_services';

    if (!isPageLoad && !isRequestService) {
      return false;
    }

    // Search query constraint
    const searchLower = searchQuery.toLowerCase();
    const matchSearch = searchQuery === '' || 
      evt.message.toLowerCase().includes(searchLower) || 
      evt.userEmail.toLowerCase().includes(searchLower) ||
      evt.id.toLowerCase().includes(searchLower);

    return matchSearch;
  });

  // Calculate stats
  const totalCount = filteredEvents.length;
  const errorsCount = filteredEvents.filter(e => e.status === 'error').length;
  const warningsCount = filteredEvents.filter(e => e.status === 'warning').length;
  const successCount = filteredEvents.filter(e => e.status === 'success').length;

  // Pie chart calculation (Subdomains)
  const subCount = { admin: 0, pay: 0, timecard: 0 };
  filteredEvents.forEach(e => {
    if (e.subdomain in subCount) {
      subCount[e.subdomain]++;
    }
  });

  const maxSub = Math.max(subCount.admin, subCount.pay, subCount.timecard, 1);
  const percentAdmin = Math.round((subCount.admin / (totalCount || 1)) * 100);
  const percentPay = Math.round((subCount.pay / (totalCount || 1)) * 100);
  const percentTimecard = Math.round((subCount.timecard / (totalCount || 1)) * 100);

  // Status icon maker
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'error': return <AlertOctagon id="icon_err" className="w-4 h-4 text-rose-500" />;
      case 'warning': return <AlertTriangle id="icon_warn" className="w-4 h-4 text-amber-500" />;
      case 'success': return <CheckCircle id="icon_succ" className="w-4 h-4 text-emerald-500" />;
      default: return <Info id="icon_info" className="w-4 h-4 text-blue-500" />;
    }
  };

  // Subdomain badge
  const renderSubdomainBadge = (sub: string) => {
    switch (sub) {
      case 'admin':
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-purple-100 text-purple-700 border border-purple-200">admin.<span className="hidden sm:inline">discountelectrical...</span></span>;
      case 'pay':
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-sky-100 text-sky-700 border border-sky-200">pay.<span className="hidden sm:inline">discountelectrical...</span></span>;
      case 'timecard':
        return <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-teal-100 text-teal-700 border border-teal-200">timecard.<span className="hidden sm:inline">discountelectrical...</span></span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-100 text-slate-700">{sub}</span>;
    }
  };

  return (
    <div id="telemetry_dashboard_view" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* LEFT COLUMN: Controls & Create Test Telemetry */}
      <div className="space-y-6 lg:col-span-1">
        
        {/* Module Header card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white">
          <div className="flex items-center space-x-3 text-emerald-400 mb-3">
            <Activity className="w-6 h-6 animate-pulse" />
            <h2 className="text-xl font-bold tracking-tight font-sans">Live Telemetry System</h2>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Real-time server-side tracking collection syncing telemetry updates across the Discount Electrical Service subnet.
          </p>
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-500">
            <span>Collection: tracking_events</span>
            <span className="flex items-center text-emerald-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-2"></span>
              Live Sync
            </span>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Real-time Telemetry Display Charts & Lists (2 Units wide) */}
      <div className="space-y-6 lg:col-span-2">
        
        {/* Live Counters Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 font-medium">Logged Counts</span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{loading ? '...' : totalCount}</div>
            <span className="text-[10px] text-indigo-500 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded mt-2 inline-block">Active window</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-rose-500">
            <span className="text-xs text-slate-400 font-medium font-sans">Logged Errors</span>
            <div className="text-2xl font-bold font-mono text-rose-600 mt-1">{loading ? '...' : errorsCount}</div>
            <span className="text-[10px] text-rose-500 font-semibold bg-rose-50 px-1.5 py-0.5 rounded mt-2 inline-block">System Faults</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-amber-500">
            <span className="text-xs text-slate-400 font-medium font-sans">Logged Warnings</span>
            <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{loading ? '...' : warningsCount}</div>
            <span className="text-[10px] text-amber-500 font-semibold bg-amber-50 px-1.5 py-0.5 rounded mt-2 inline-block">Warnings Flags</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-emerald-500">
            <span className="text-xs text-slate-400 font-medium font-sans">Logged Success</span>
            <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">{loading ? '...' : successCount}</div>
            <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded mt-2 inline-block">Completed Hooks</span>
          </div>
        </div>

        {/* Visual Analytics - SVG Chart */}
        <div className="bg-white border border-slate-250 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex justify-between items-center">
            <span>Visual Analytics Graph</span>
            <span className="text-xs text-slate-500 font-mono">Subdomains Breakdown</span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* SVG Visual graph */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5 font-sans">
                <span>adminPortal</span>
                <span>{subCount.admin} events ({percentAdmin}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${percentAdmin || 0}%` }}></div>
              </div>

              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5 font-sans">
                <span>paySubdomain</span>
                <span>{subCount.pay} events ({percentPay}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
                <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${percentPay || 0}%` }}></div>
              </div>

              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5 font-sans">
                <span>timecardSubdomain</span>
                <span>{subCount.timecard} events ({percentTimecard}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
                <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${percentTimecard || 0}%` }}></div>
              </div>
            </div>

            {/* Custom SVG ring chart */}
            <div className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50">
              <svg className="w-32 h-32" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* Admin slice */}
                {percentAdmin > 0 && (
                  <path
                    className="text-purple-500"
                    strokeDasharray={`${percentAdmin}, 100`}
                    strokeWidth="5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
                {/* Pay slice starts after Admin */}
                {percentPay > 0 && (
                  <path
                    className="text-sky-500"
                    strokeDasharray={`${percentPay}, 100`}
                    strokeDashoffset={`-${percentAdmin}`}
                    strokeWidth="5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
                {/* Timecard slice starts after Admin + Pay */}
                {percentTimecard > 0 && (
                  <path
                    className="text-teal-500"
                    strokeDasharray={`${percentTimecard}, 100`}
                    strokeDashoffset={`-${percentAdmin + percentPay}`}
                    strokeWidth="5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
                
                <text x="18" y="20.5" className="text-[5px] font-mono font-bold text-center" textAnchor="middle" fill="#334155">
                  DES SUB
                </text>
              </svg>
              <div className="flex space-x-3 mt-3 text-[10px] font-mono">
                <span className="flex items-center text-purple-600"><span className="w-2, h-2 rounded-full bg-purple-500 mr-1 inline-block"></span>Admin</span>
                <span className="flex items-center text-sky-600"><span className="w-2, h-2 rounded-full bg-sky-500 mr-1 inline-block"></span>Pay</span>
                <span className="flex items-center text-teal-600"><span className="w-2, h-2 rounded-full bg-teal-500 mr-1 inline-block"></span>Timecard</span>
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Filter & Table list */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 space-y-4">
            
            {/* Nav & search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-800 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Live Event Stream</span>
              </h3>
              
              <div className="relative">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Query message, UserUID or Email..."
                  className="pl-8 pr-4 py-1.5 text-xs rounded-lg border border-slate-350 bg-slate-50 w-full sm:w-64 focus:outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <div className="flex items-center space-x-1.5 text-slate-400 font-medium">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Filters:</span>
              </div>

              {/* Subdomain Filter */}
              <div className="flex rounded-md border border-slate-200 overflow-hidden">
                <button 
                  onClick={() => setFilterSubdomain('all')} 
                  className={`px-3 py-1 font-medium leading-none ${filterSubdomain === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  All Subdomains
                </button>
                <button 
                  onClick={() => setFilterSubdomain('admin')} 
                  className={`px-3 py-1 font-medium leading-none ${filterSubdomain === 'admin' ? 'bg-purple-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  Admin Only
                </button>
                <button 
                  onClick={() => setFilterSubdomain('pay')} 
                  className={`px-3 py-1 font-medium leading-none ${filterSubdomain === 'pay' ? 'bg-sky-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  Pay Only
                </button>
                <button 
                  onClick={() => setFilterSubdomain('timecard')} 
                  className={`px-3 py-1 font-medium leading-none ${filterSubdomain === 'timecard' ? 'bg-teal-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  Timecard Only
                </button>
              </div>

              {/* Severity Filter */}
              <div className="flex rounded-md border border-slate-200 overflow-hidden">
                <button 
                  onClick={() => setFilterStatus('all')} 
                  className={`px-3 py-1 font-medium leading-none ${filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}
                >
                  All Status
                </button>
                <button 
                  onClick={() => setFilterStatus('error')} 
                  className={`px-3 py-1 font-medium leading-none ${filterStatus === 'error' ? 'bg-rose-650 text-white' : 'bg-slate-50 text-slate-600'}`}
                >
                  Errors
                </button>
                <button 
                  onClick={() => setFilterStatus('warning')} 
                  className={`px-3 py-1 font-medium leading-none ${filterStatus === 'warning' ? 'bg-amber-650 text-white' : 'bg-slate-50 text-slate-600'}`}
                >
                  Warnings
                </button>
              </div>

            </div>

          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Timestamp/Origin</th>
                  <th className="px-5 py-3">Application</th>
                  <th className="px-5 py-3">User UID / Email</th>
                  <th className="px-5 py-3">Log Message</th>
                  <th className="px-5 py-3">Payload Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 font-mono text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                      Streaming active database records...
                    </td>
                  </tr>
                ) : filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 font-mono text-slate-450 bg-slate-50">
                      No matching log events found in active window. Try generating an event on the left!
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((evt) => {
                    const dateVal = evt.timestamp instanceof Timestamp 
                      ? evt.timestamp.toDate() 
                      : evt.timestamp ? new Date(evt.timestamp) : new Date();
                    
                    return (
                      <tr key={evt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 space-y-0.5">
                          <div className="font-mono font-medium text-slate-800">
                            {dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {formatDate(dateVal)}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 space-y-1">
                          {renderSubdomainBadge(evt.subdomain)}
                          <div className="text-[10px] font-mono font-semibold text-slate-450 uppercase">{evt.eventType}</div>
                        </td>
                        <td className="px-5 py-3.5 font-mono max-w-[150px] truncate space-y-0.5">
                          <div className="text-slate-700 font-semibold truncate leading-none" title={evt.userEmail}>{evt.userEmail}</div>
                          <div className="text-[10px] text-slate-400 leading-none truncate">UID: {evt.userId}</div>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          <div className="flex items-center space-x-2">
                            <span>{renderStatusIcon(evt.status)}</span>
                            <span>{evt.message}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[10px] text-slate-400 max-w-[200px] truncate">
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

    </div>
  );
}
