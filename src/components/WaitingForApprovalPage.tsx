import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  ShieldAlert, 
  Hourglass, 
  LogOut, 
  RefreshCw,
  AlertOctagon,
  Users
} from 'lucide-react';

interface WaitingForApprovalPageProps {
  accessStatus: 'Pending' | 'Restricted' | string;
  userEmail: string;
  userName: string;
}

export default function WaitingForApprovalPage({ accessStatus, userEmail, userName }: WaitingForApprovalPageProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
    } catch (err) {
      console.error("Sign out fail:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleCheckStatus = () => {
    window.location.reload();
  };

  const isRestricted = accessStatus.toLowerCase() === 'restricted';

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-950 border border-slate-850 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        
        {/* Animated Accent Icon Grid */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className={`absolute inset-0 rounded-2xl opacity-10 animate-pulse ${isRestricted ? 'bg-rose-500' : 'bg-amber-500'}`} />
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 shadow-inner ${
            isRestricted 
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            {isRestricted ? <AlertOctagon className="w-8 h-8" /> : <Hourglass className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />}
          </div>
        </div>

        {/* Text descriptions */}
        <div className="space-y-2">
          <span className={`text-[10px] sm:text-[11px] uppercase font-mono font-bold tracking-widest block ${isRestricted ? 'text-rose-400' : 'text-amber-400'}`}>
            Discount Electrical Access Registry
          </span>
          <h2 className="text-xl font-extrabold tracking-tight">
            {isRestricted ? 'Access Status: Restricted' : 'Waiting for Approval'}
          </h2>
          <div className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto space-y-3 font-sans">
            <p>
              Hi <span className="font-bold text-slate-200">{userName}</span> ({userEmail}), your account onboarding registration has succeeded, but active clearance credentials are required.
            </p>
            <p className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] leading-relaxed text-left text-slate-350">
              {isRestricted 
                ? 'Your access to subdomains and general services has been manually restricted by the chief office manager. Please contact admin support directly for policy clearances.'
                : 'Your access status is currently Pending. Once the central administrator verifies your file credentials and toggles your status to Active, full service is unlocked.'
              }
            </p>
          </div>
        </div>

        {/* Access buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleCheckStatus}
            className="w-full py-3 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs tracking-tight rounded-xl shadow-lg hover:shadow-indigo-500/10 transition flex items-center justify-center gap-1.5 cursor-pointer border-none"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh Approval Status</span>
          </button>

          <button
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
        </div>

        {/* Footer Credit line */}
        <p className="text-[10px] text-slate-500 font-sans">
          Discount Electrical Service Co. • Secure Portal Ingress Routing
        </p>

      </div>
    </div>
  );
}
