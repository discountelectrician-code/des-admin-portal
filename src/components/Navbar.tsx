/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserClaims } from '../types';
import { 
  Zap, 
  Activity, 
  Users, 
  LogOut, 
  Key, 
  ShieldCheck, 
  User as UserIcon,
  HelpCircle,
  CreditCard,
  Phone,
  MessageSquare,
  Map
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'telemetry' | 'permissions' | 'payment' | 'quo_routing' | 'lead_recovery' | 'seo_heatmap';
  setActiveTab: (tab: 'telemetry' | 'permissions' | 'payment' | 'quo_routing' | 'lead_recovery' | 'seo_heatmap') => void;
  currentUser: User | null;
}

export default function Navbar({ activeTab, setActiveTab, currentUser }: NavbarProps) {
  const [activeClaims, setActiveClaims] = useState<UserClaims>({ admin: false, pay: false, timecard: false });
  const [userProfileName, setUserProfileName] = useState('New Service Agent');

  useEffect(() => {
    if (!currentUser) return;

    // Fetch user profile from firestore to extract claims details
    const fetchClaims = async () => {
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.claims) {
            setActiveClaims(data.claims);
          }
          if (data.displayName) {
            setUserProfileName(data.displayName);
          }
        } else {
          // If bootstrapped admin email matches, mock true
          if (currentUser.email === 'discountelectrician@gmail.com') {
            setActiveClaims({ admin: true, pay: true, timecard: true });
            setUserProfileName("Bootstrapped Chief Admin");
          }
        }
      } catch (err) {
        console.warn("Could not fetch claims via Firestore snapshot, using fallback:", err);
        if (currentUser.email === 'discountelectrician@gmail.com') {
          setActiveClaims({ admin: true, pay: true, timecard: true });
          setUserProfileName("Bootstrapped Chief Admin");
        }
      }
    };

    fetchClaims();
    // Refresh periodically
    const interval = setInterval(fetchClaims, 6000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header id="app_navbar" className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo Brand */}
          <div className="flex items-center select-none">
            <img 
              src="/discount-electrical-service-logo.svg" 
              alt="Discount Electrical Service Logo" 
              className="w-8 h-8 object-contain mr-2 shrink-0 transition-transform duration-300 hover:scale-105" 
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col justify-center">
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white font-sans leading-tight">
                Discount Electrical Service
              </h1>
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-cyan-400 leading-none">
                Admin Portal
              </span>
            </div>
          </div>

          {/* Navigation Controls */}
          {currentUser && (
            <nav className="hidden md:flex space-x-1 font-sans text-sm">
              <button
                onClick={() => setActiveTab('telemetry')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'telemetry' 
                    ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-350 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Live Telemetry Panel</span>
              </button>

              <button
                onClick={() => setActiveTab('seo_heatmap')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'seo_heatmap' 
                    ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-350 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <Map className="w-4 h-4" />
                <span>SEO Heatmap</span>
              </button>

              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'permissions' 
                    ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-350 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Employee Control Panel</span>
              </button>

              <button
                onClick={() => setActiveTab('payment')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'payment' 
                    ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-350 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Payment Settings</span>
              </button>

              <button
                onClick={() => setActiveTab('lead_recovery')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'lead_recovery' 
                    ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-350 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Lead Recovery</span>
              </button>

              {activeClaims.admin && (
                <button
                  onClick={() => setActiveTab('quo_routing')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
                    activeTab === 'quo_routing' 
                      ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' 
                      : 'text-slate-350 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <Phone className="w-4 h-4" />
                  <span>Quo Outbound Routing</span>
                </button>
              )}
            </nav>
          )}

          {/* User Status Bar */}
          <div className="flex items-center space-x-4">
            {currentUser ? (
              <div id="logged_user_gadget" className="flex items-center space-x-3 text-xs bg-slate-850 p-1.5 px-3 rounded-lg border border-slate-800">
                <div className="hidden sm:block text-right">
                  <div className="font-bold text-slate-100 text-[11px] font-sans pr-1">{userProfileName}</div>
                  <div className="text-[10px] font-mono text-slate-450">{currentUser.email}</div>
                </div>

                <div className="bg-slate-850 border border-slate-700 p-1.5 rounded-full text-slate-300 relative">
                  <UserIcon className="w-4 h-4" />
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-slate-900"></span>
                </div>

                <button 
                  onClick={handleSignOut}
                  title="Sign Out Account"
                  className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-rose-400 border border-slate-700 transition flex items-center justify-center font-semibold font-sans text-xs gap-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-mono">SECURE AUTH TUNNEL ACTIVE</span>
              </div>
            )}
          </div>

        </div>

        {/* Mobile Fixed Bottom Navigation Bar */}
        {currentUser && (
          <div className="md:hidden fixed bottom-0 left-0 w-full bg-slate-950 border-t border-slate-800 py-2.5 px-1.5 z-50 shadow-2xl flex justify-around items-center pb-safe" id="mobile-fixed-bottom-nav">
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex flex-col items-center justify-center space-y-1 flex-1 transition cursor-pointer border-none bg-transparent ${
                activeTab === 'telemetry' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-5 h-5" />
              <span className="text-[9px] tracking-tight text-center truncate w-full">Telemetry</span>
            </button>
            <button
              onClick={() => setActiveTab('seo_heatmap')}
              className={`flex flex-col items-center justify-center space-y-1 flex-1 transition cursor-pointer border-none bg-transparent ${
                activeTab === 'seo_heatmap' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Map className="w-5 h-5" />
              <span className="text-[9px] tracking-tight text-center truncate w-full">SEO Heatmap</span>
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`flex flex-col items-center justify-center space-y-1 flex-1 transition cursor-pointer border-none bg-transparent ${
                activeTab === 'permissions' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[9px] tracking-tight text-center truncate w-full">Employees</span>
            </button>
            <button
              onClick={() => setActiveTab('payment')}
              className={`flex flex-col items-center justify-center space-y-1 flex-1 transition cursor-pointer border-none bg-transparent ${
                activeTab === 'payment' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-[9px] tracking-tight text-center truncate w-full">Payment</span>
            </button>
            <button
              onClick={() => setActiveTab('lead_recovery')}
              className={`flex flex-col items-center justify-center space-y-1 flex-1 transition cursor-pointer border-none bg-transparent ${
                activeTab === 'lead_recovery' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-[9px] tracking-tight text-center truncate w-full">Recovery</span>
            </button>
            {activeClaims.admin && (
              <button
                onClick={() => setActiveTab('quo_routing')}
                className={`flex flex-col items-center justify-center space-y-1 flex-1 transition cursor-pointer border-none bg-transparent ${
                  activeTab === 'quo_routing' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Phone className="w-5 h-5" />
                <span className="text-[9px] tracking-tight text-center truncate w-full">Routing</span>
              </button>
            )}
          </div>
        )}

      </div>
    </header>
  );
}
