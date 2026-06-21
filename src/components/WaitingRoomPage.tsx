import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  CheckCircle, 
  LogOut, 
  RefreshCw,
  Clock,
  ShieldCheck,
  Phone
} from 'lucide-react';

export default function WaitingRoomPage() {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
      // Redirect to home/login
      window.location.href = '/';
    } catch (err) {
      console.error("Sign out failed:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleCheckStatus = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-950 border border-slate-850 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300" id="waiting-room-card">
        
        {/* Success Icon Badge */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-indigo-500 opacity-10 animate-pulse" />
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
        </div>

        {/* Text Area */}
        <div className="space-y-3">
          <span className="text-[10px] uppercase font-mono font-bold tracking-widest block text-indigo-400">
            Discount Electrical • Automated Onboarding
          </span>
          <h2 className="text-xl font-extrabold tracking-tight font-sans">
            Account Setup Complete!
          </h2>
          
          <div className="text-slate-450 text-xs leading-relaxed max-w-sm mx-auto space-y-3 font-sans">
            <p className="text-slate-300">
              Welcome to <span className="font-bold text-slate-100">Discount Electrical</span>! Your account setup is complete.
            </p>
            
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-850 text-left space-y-2.5 text-slate-300">
              <div className="flex gap-2 items-start text-[11px] leading-relaxed">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Management is currently reviewing your profile.</span>
              </div>
              <div className="flex gap-2 items-start text-[11px] leading-relaxed">
                <Phone className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>You will receive a text message with your access link once your permissions are granted.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            id="btn-check-portal-status"
            onClick={handleCheckStatus}
            className="w-full py-3 h-12 bg-indigo-650 hover:bg-indigo-755 hover:bg-indigo-700 text-white font-bold text-xs tracking-tight rounded-xl shadow-lg hover:shadow-indigo-500/10 transition flex items-center justify-center gap-1.5 cursor-pointer border-none"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Go to Login / Check Portal Status</span>
          </button>

          {auth.currentUser && (
            <button
              type="button"
              id="btn-onboard-logout"
              onClick={handleSignOut}
              disabled={loggingOut}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 hover:text-rose-400 border border-slate-800 text-slate-400 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loggingOut ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-450" />
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>Logout Session</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Footer info lock */}
        <p className="text-[9px] text-slate-500 font-sans tracking-wide">
          Discount Electrical Service Co. • Secure Portal Ingress Routing
        </p>

      </div>
    </div>
  );
}
