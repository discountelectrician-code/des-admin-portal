/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { 
  Phone, 
  Save, 
  RefreshCw, 
  Sliders, 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  Database, 
  Key, 
  ShieldAlert,
  Server,
  HelpCircle,
  Code
} from 'lucide-react';

interface QuoNumber {
  id: string;
  phoneNumber?: string;
  number?: string;
  phone?: string;
  name?: string;
  friendlyName?: string;
  label?: string;
  [key: string]: any;
}

export default function QuoRoutingConfig() {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'sync'>('matrix');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Configuration Fields
  const [quoApiKey, setQuoApiKey] = useState('');
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false);
  
  // Numbers Registry
  const [phoneNumbers, setPhoneNumbers] = useState<QuoNumber[]>([]);
  const [registryUpdatedAt, setRegistryUpdatedAt] = useState<string | null>(null);

  // Selected Routing State
  const [customerNumberId, setCustomerNumberId] = useState('');
  const [techNotificationNumberId, setTechNotificationNumberId] = useState('');
  const [configUpdatedAt, setConfigUpdatedAt] = useState<string | null>(null);

  // Expanded JSON state for the synced numbers inspector
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('[Quo Config] Auth state changed. currentUser:', currentUser?.email);
      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      // 1. Verify administrative privileges
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const adminCheck = userData.claims?.admin === true || currentUser.email === 'discountelectrician@gmail.com';
          console.log('[Quo Config] Resolved admin claim:', adminCheck);
          setIsAdmin(adminCheck);
        } else if (currentUser.email === 'discountelectrician@gmail.com') {
          console.log('[Quo Config] Resolved admin claim (fallback): true');
          setIsAdmin(true);
        } else {
          console.log('[Quo Config] Resolved admin claim: false');
          setIsAdmin(false);
        }
      } catch (err) {
        console.warn("[Quo Config] Error resolving administrative identity claim:", err);
        if (currentUser.email === 'discountelectrician@gmail.com') {
          setIsAdmin(true);
        }
      }

      // 2. Fetch Quo config for custom API key
      try {
        const quoConfigSnap = await getDoc(doc(db, 'settings', 'quo_config'));
        if (quoConfigSnap.exists()) {
          const data = quoConfigSnap.data();
          if (data.apiKey) {
            setQuoApiKey(data.apiKey);
            setHasCustomApiKey(true);
          }
        }
      } catch (err) {
        console.warn("[Quo Config] Could not read Quo configuration:", err);
      }

      // 3. Fetch phone number registry data
      try {
        const registrySnap = await getDoc(doc(db, 'settings', 'quo_number_registry'));
        if (registrySnap.exists()) {
          const data = registrySnap.data();
          const rawNumbersList = data.numbers || data.registry || [];
          const numbersList = rawNumbersList.map((num: any) => {
            if (num && num.data && typeof num.data === 'object') {
              return {
                ...num,
                ...num.data,
                id: num.data.id || num.id
              };
            }
            return num;
          });
          setPhoneNumbers(numbersList);
          if (data.updatedAt) {
            setRegistryUpdatedAt(data.updatedAt.toDate ? data.updatedAt.toDate().toLocaleString() : new Date(data.updatedAt).toLocaleString());
          }
        }
      } catch (err) {
        console.warn("[Quo Config] Could not read phone number registry details:", err);
      }

      // 4. Fetch communications routing config
      try {
        const commConfigSnap = await getDoc(doc(db, 'settings', 'communications_config'));
        if (commConfigSnap.exists()) {
          const data = commConfigSnap.data();
          if (data.main_office) {
            setCustomerNumberId(data.main_office.customerNumberId || '');
            setTechNotificationNumberId(data.main_office.techNotificationNumberId || '');
          }
          if (data.updatedAt) {
            setConfigUpdatedAt(data.updatedAt.toDate ? data.updatedAt.toDate().toLocaleString() : new Date(data.updatedAt).toLocaleString());
          }
        }
      } catch (err) {
        console.warn("[Quo Config] Could not read communications config:", err);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getEffectiveApiKey = () => {
    return quoApiKey.trim() || 'o10vIQ4KoW0RRNxO5ydVfdkYYg9IxVyn';
  };

  // Helper to extract a friendly moniker label
  const getMonikerStr = (num: QuoNumber) => {
    const rawNum = num.formattedNumber || num.phoneNumber || num.number || num.phone || num.id;
    const name = num.name || num.friendlyName || num.label || 'Unnamed Link';
    return `${name} (${rawNum})`;
  };

  // 1. Sync custom credentials input to firestore
  const handleSaveApiKey = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await setDoc(doc(db, 'settings', 'quo_config'), {
        apiKey: quoApiKey.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setHasCustomApiKey(!!quoApiKey.trim());
      setSuccessMessage('Quo API keys updated successfully!');
    } catch (err: any) {
      console.error("Failed saving credentials:", err);
      setErrorMessage(`Failed to save credential settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Robust fetch helper supporting multiple auth strategies (headers and query params) to avoid 401 errors
  const robustFetch = async (url: string, key: string) => {
    // Strategy 1: Headers with Authorization Bearer and common alternate api-key keys
    console.log(`[Quo Sync] robustFetch: Strategy 1 (multi-headers) for ${url}`);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'x-api-key': key,
          'X-API-KEY': key,
          'X-API-Key': key,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) return res;
      console.log(`[Quo Sync] Strategy 1 returned status ${res.status}`);

      // Strategy 2: Query param ?api_key=
      const separator = url.includes('?') ? '&' : '?';
      console.log(`[Quo Sync] robustFetch: Strategy 2 (?api_key=) for ${url}`);
      const res2 = await fetch(`${url}${separator}api_key=${key}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res2.ok) return res2;
      console.log(`[Quo Sync] Strategy 2 returned status ${res2.status}`);

      // Strategy 3: Query param ?key=
      console.log(`[Quo Sync] robustFetch: Strategy 3 (?key=) for ${url}`);
      const res3 = await fetch(`${url}${separator}key=${key}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res3.ok) return res3;
      console.log(`[Quo Sync] Strategy 3 returned status ${res3.status}`);

      // Strategy 4: Query param ?apiKey=
      console.log(`[Quo Sync] robustFetch: Strategy 4 (?apiKey=) for ${url}`);
      const res4 = await fetch(`${url}${separator}apiKey=${key}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res4.ok) return res4;
      console.log(`[Quo Sync] Strategy 4 returned status ${res4.status}`);

      // Strategy 5: Raw Authorization header (no Bearer)
      console.log(`[Quo Sync] robustFetch: Strategy 5 (raw Authorization) for ${url}`);
      const res5 = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': key,
          'Content-Type': 'application/json'
        }
      });
      if (res5.ok) return res5;
      console.log(`[Quo Sync] Strategy 5 returned status ${res5.status}`);

      // Return the most informative failing response
      return res;
    } catch (e: any) {
      console.error('[Quo Sync] robustFetch exception:', e);
      throw e;
    }
  };

  // 2. Fetch and synchronize phone numbers registry from Quo API
  const handleSyncPhoneNumbers = async () => {
    console.log('[Quo Sync] Function handleSyncPhoneNumbers triggered.');
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(false);

    if (!isAdmin) {
      const msg = 'Admin authorization check failed: Current user does not possess administrative privileges to perform this sync.';
      console.error(`[Quo Sync] ${msg}. auth.currentUser:`, auth.currentUser?.email);
      setSyncError(msg);
      setSyncing(false);
      return;
    }

    const activeKey = getEffectiveApiKey();
    console.log('[Quo Sync] Utilizing API Token ending in:', activeKey ? `...${activeKey.slice(-6)}` : 'NULL');

    try {
      console.log('[Quo Sync] Step A: Fetching from GET https://api.quo.com/v1/phone-numbers');
      const response = await robustFetch('https://api.quo.com/v1/phone-numbers', activeKey);

      console.log(`[Quo Sync] Base list API returned status code: ${response.status}`);
      if (!response.ok) {
        throw new Error(`Authentication or connection failed (HTTP Status: ${response.status})`);
      }

      const listData = await response.json();
      console.log('[Quo Sync] Raw list data fetched:', listData);
      
      // Dynamic array extraction helper
      let ids: string[] = [];
      if (Array.isArray(listData)) {
        ids = listData.map((item: any) => {
          if (typeof item === 'string') return item;
          return item.id || item.phoneNumberId || item.numberId || item.phoneNumber;
        });
      } else if (listData && typeof listData === 'object') {
        const arrayKey = Object.keys(listData).find(key => Array.isArray(listData[key]));
        if (arrayKey) {
          ids = listData[arrayKey].map((item: any) => {
            if (typeof item === 'string') return item;
            return item.id || item.phoneNumberId || item.numberId || item.phoneNumber;
          });
        } else if (listData.id) {
          ids = [listData.id];
        }
      }

      ids = ids.filter(Boolean);
      console.log('[Quo Sync] Parsed Phone Number IDs list:', ids);

      if (ids.length === 0) {
        throw new Error('Sync executed successfully, but Quo returned an empty list of active phone number units.');
      }

      // Step B: Loop through every ID in the list to fetch full response sequentially with delay
      console.log('[Quo Sync] Step B: Requesting detailed metadata for each phone number ID dynamically sequentially...');
      const fullResponses: any[] = [];
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (i > 0) {
          console.log(`[Quo Sync] Rate limiting: delaying 200ms before requesting ID ${id}...`);
          await delay(200);
        }

        try {
          console.log(`[Quo Sync] Requesting GET https://api.quo.com/v1/phone-numbers/${id}`);
          const detailRes = await robustFetch(`https://api.quo.com/v1/phone-numbers/${id}`, activeKey);

          console.log(`[Quo Sync] Detailed endpoint status for ID ${id}: ${detailRes.status}`);
          if (!detailRes.ok) {
            console.warn(`[Quo Sync] Skipping phone number ID ${id} due to non-OK response: HTTP status ${detailRes.status}`);
            continue;
          }

          const dataBytes = await detailRes.json();
          console.log(`[Quo Sync] Loaded details for ID ${id}:`, dataBytes);
          
          let finalItem: any = { id };
          if (dataBytes && typeof dataBytes === 'object') {
            if (dataBytes.data && typeof dataBytes.data === 'object') {
              // Flatten the nested data object
              finalItem = {
                ...dataBytes,
                ...dataBytes.data,
                id: dataBytes.data.id || dataBytes.id || id
              };
            } else {
              finalItem = {
                ...dataBytes,
                id: dataBytes.id || id
              };
            }
          }
          console.log(`[Quo Sync] Processed/Flattened item details for ID ${id}:`, finalItem);
          fullResponses.push(finalItem);
        } catch (itemErr: any) {
          console.error(`[Quo Sync] Skipping phone number ID ${id} due to exception:`, itemErr);
        }
      }

      console.log('[Quo Sync] Successfully compiled details payloads list:', fullResponses);

      // Step C: Save full response array to firestore settings/quo_number_registry
      console.log('[Quo Sync] Saving compiled payloads list to Firestore settings/quo_number_registry...');
      await setDoc(doc(db, 'settings', 'quo_number_registry'), {
        numbers: fullResponses,
        updatedAt: serverTimestamp()
      });
      console.log('[Quo Sync] Document updated successfully inside Firestore settings/quo_number_registry');

      setPhoneNumbers(fullResponses);
      setRegistryUpdatedAt(new Date().toLocaleString());
      setSyncSuccess(true);
    } catch (err: any) {
      console.error("[Quo Sync] Synchronizer execution failed:", err);
      setSyncError(`Sync Error: ${err.message}`);
    } finally {
      setSyncing(false);
      console.log('[Quo Sync] Sync flow finished.');
    }
  };

  // 3. Save selected numbers mapping to Firestore communications_config
  const handleSaveRoutingMatrix = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await setDoc(doc(db, 'settings', 'communications_config'), {
        main_office: {
          customerNumberId,
          techNotificationNumberId
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      setConfigUpdatedAt(new Date().toLocaleString());
      setSuccessMessage('Routing matrix specifications successfully locked to communication nodes.');
    } catch (err: any) {
      console.error("Communications registry save error:", err);
      setErrorMessage(`Failed saving routing configurations: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-600 flex items-center justify-center rounded-2xl border border-rose-100">
          <ShieldAlert className="w-8 h-8 text-rose-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Authorization Required</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            You do not possess administrative permissions required to retrieve or write credentials to the central telemetry routing matrix.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Intro Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-extrabold tracking-tight">Quo Telephony Routing Manager</h2>
          </div>
          <p className="text-xs text-slate-400">
            Configure automated outbound communications lines and live phone synchronizations natively via Quo API endpoints.
          </p>
        </div>
        <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl self-start md:self-auto border border-slate-700">
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`flex items-center space-x-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              activeSubTab === 'matrix' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Routing Matrix</span>
          </button>
          <button
            onClick={() => setActiveSubTab('sync')}
            className={`flex items-center space-x-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              activeSubTab === 'sync' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Sync & API Keys</span>
          </button>
        </div>
      </div>

      {/* Main Alerts */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-150 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {activeSubTab === 'matrix' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Routing Matrix */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Communications Routing Matrix</h3>
                <p className="text-[11px] text-slate-500 font-sans">
                  Bind specific customer and tech-notification lines to the central Main Office nodes.
                </p>
              </div>
              <Database className="w-5 h-5 text-indigo-600" />
            </div>

            <div className="space-y-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Main Office Configuration</span>
              
              <div className="space-y-4">
                {/* Dropdown: Customer Texting Line */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Customer Texting Line</label>
                  <select
                    value={customerNumberId}
                    onChange={(e) => setCustomerNumberId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-sans outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- Assign Customer Communication Line --</option>
                    {phoneNumbers.map((num) => (
                      <option key={`cust-${num.id}`} value={num.id}>
                        {getMonikerStr(num)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown: Technician Notification Line */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Technician Notification Line</label>
                  <select
                    value={techNotificationNumberId}
                    onChange={(e) => setTechNotificationNumberId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-sans outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- Assign Technician Routing Line --</option>
                    {phoneNumbers.map((num) => (
                      <option key={`tech-${num.id}`} value={num.id}>
                        {getMonikerStr(num)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Save Action for Matrix */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-mono">
                {configUpdatedAt ? `Config Locked: ${configUpdatedAt}` : 'Unsaved Matrix Configurations'}
              </span>
              <button
                onClick={handleSaveRoutingMatrix}
                disabled={saving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Routing Configuration</span>
              </button>
            </div>
          </div>

          {/* Connected Registry Status Panel */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-500" />
              Active Synced Lines
            </h3>
            
            {phoneNumbers.length === 0 ? (
              <div className="py-6 text-center space-y-2 border border-dashed border-slate-200 rounded-2xl">
                <p className="text-xs text-slate-400 px-4">
                  No synced telemetry numbers detected inside the workspace's Firestore registry.
                </p>
                <button
                  onClick={() => setActiveSubTab('sync')}
                  className="text-[11px] text-indigo-600 font-bold hover:underline"
                >
                  Configure and Sync Now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
                  Registry State ({phoneNumbers.length} Nodes)
                </span>
                
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {phoneNumbers.map((num) => {
                    const isConfiguredCust = customerNumberId === num.id;
                    const isConfiguredTech = techNotificationNumberId === num.id;
                    return (
                      <div key={`status-${num.id}`} className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1.5">
                        <div className="flex items-start justify-between">
                          <span className="font-bold text-slate-800 text-[11px] block truncate max-w-[140px]">
                            {num.name || num.friendlyName || num.label || 'Unnamed Link'}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-100 rounded px-1.5">
                            {num.id}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {num.formattedNumber || num.phoneNumber || num.number || num.phone || 'No phone'}
                        </div>
                        
                        {(isConfiguredCust || isConfiguredTech) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {isConfiguredCust && (
                              <span className="text-[8px] font-bold font-mono bg-indigo-50 text-indigo-600 border border-indigo-150 rounded px-1.5 truncate">
                                MAPS: CUSTOMER
                              </span>
                            )}
                            {isConfiguredTech && (
                              <span className="text-[8px] font-bold font-mono bg-teal-50 text-teal-600 border border-teal-150 rounded px-1.5 truncate">
                                MAPS: TECH-NOTIFICATION
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="text-[10px] text-slate-400 font-mono flex justify-between pt-2 border-t border-slate-100">
                  <span>Last database sync:</span>
                  <span className="font-bold text-slate-600">{registryUpdatedAt || 'Never'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* SYNC AND API KEYS PANEL */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Synchronizer Credentials Setting */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6 self-start">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-indigo-600" />
              API Key Credentials
            </h3>
            
            <p className="text-xs text-slate-500 leading-relaxed font-sans">
              Set your production Quo Access Key below. If left blank, the portal safely defaults to the temporary integration testing key.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Quo API Access Token</label>
              <input
                type="text"
                value={quoApiKey}
                onChange={(e) => setQuoApiKey(e.target.value)}
                placeholder="o10vIQ4KoW0RRNxO5ydVfdkYYg9IxVyn"
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-mono focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <p className="text-[10px] text-slate-400 font-sans leading-normal">
                {hasCustomApiKey ? '✓ Active custom token saved in Firestore' : 'ℹ Currently operating with integration fallback credentials'}
              </p>
            </div>

            <button
              onClick={handleSaveApiKey}
              disabled={saving}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Save Credentials</span>
            </button>
          </div>

          {/* Sync Trigger and Future Proof Inspector Card */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Phone Registry Sync Telemetry</h3>
                <p className="text-[11px] text-slate-500 font-sans">
                  Trigger raw database polling to retrieve phone details from Quo API endpoints and populate the local matrix selector.
                </p>
              </div>
              <button
                onClick={handleSyncPhoneNumbers}
                disabled={syncing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Synchronizing Logs...' : 'Sync Active Numbers'}</span>
              </button>
            </div>

            {syncSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-150 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Sync concluded successfully. Full API response nodes saved to settings/quo_number_registry.</span>
              </div>
            )}

            {syncError && (
              <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span>{syncError}</span>
              </div>
            )}

            <div className="space-y-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Future-Proof Payload Inspector</span>
              
              {phoneNumbers.length === 0 ? (
                <p className="text-center py-12 text-xs text-slate-400 max-w-md mx-auto">
                  Registry is currently empty. Run phone index synchronization to inspect the complete payload returns.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 grid grid-cols-3 p-3 text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">
                    <span className="col-span-1 pl-1">Line Moniker</span>
                    <span className="col-span-1">Quo ID</span>
                    <span className="col-span-1 text-right pr-1">Action</span>
                  </div>
                  
                  <div className="divide-y divide-slate-150 max-h-[320px] overflow-y-auto">
                    {phoneNumbers.map((num) => (
                      <div key={`inspector-${num.id}`} className="space-y-2">
                        <div className="grid grid-cols-3 p-3 items-center text-xs">
                          <span className="col-span-1 font-bold text-slate-700 pl-1 truncate">
                            {num.name || num.friendlyName || num.label || 'Unnamed'}
                          </span>
                          <span className="col-span-1 font-mono text-slate-500">
                            {num.id}
                          </span>
                          <span className="col-span-1 text-right pr-1">
                            <button
                              onClick={() => setExpandedRow(expandedRow === num.id ? null : num.id)}
                              className="text-[10px] font-bold text-indigo-600 leading-none bg-indigo-50/80 hover:bg-indigo-50 p-1.5 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Code className="w-3 h-3" />
                              <span>{expandedRow === num.id ? 'Hide API JSON' : 'Inspect JSON Payload'}</span>
                            </button>
                          </span>
                        </div>
                        
                        {expandedRow === num.id && (
                          <div className="p-4 bg-slate-900 text-indigo-300 font-mono text-[10px] border-t border-slate-700 leading-relaxed overflow-x-auto mx-3 mb-3 rounded-xl border border-slate-800">
                            <pre className="whitespace-pre-wrap">{JSON.stringify(num, null, 2)}</pre>
                            <div className="mt-2 text-[8px] text-slate-400 text-right uppercase tracking-widest font-bold">
                              Direct DB Payload Stream
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
