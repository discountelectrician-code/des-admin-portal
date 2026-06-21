import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { 
  DollarSign, 
  Clock, 
  LogOut, 
  User, 
  MapPin, 
  Plus, 
  Check, 
  Calendar, 
  ShieldCheck, 
  FileSpreadsheet,
  TrendingUp,
  Briefcase,
  Play,
  Square,
  AlertCircle
} from 'lucide-react';
import { UserProfile } from '../types';

interface PortalProps {
  user: any;
  profileName: string;
}

// ==========================================
// 1. PAY SUBDOMAIN PORTAL
// ==========================================
export function PaySubdomainPortal({ user, profileName }: PortalProps) {
  const [payRate, setPayRate] = useState<number>(38.5);
  const [techLevel, setTechLevel] = useState<string>('Journeyman');
  const [loading, setLoading] = useState(true);
  const [reimbursementDesc, setReimbursementDesc] = useState('');
  const [reimbursementAmount, setReimbursementAmount] = useState('');
  const [reimbursementSuccess, setReimbursementSuccess] = useState(false);
  const [loggedReimbursements, setLoggedReimbursements] = useState<any[]>([]);

  // Load technician HR profile fields (Pay Rate, License Level) directly from DB
  useEffect(() => {
    async function loadHrData() {
      if (!user) return;
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          if (data.employeeProfile) {
            setPayRate(Number(data.employeeProfile.payRate) || 38.50);
            setTechLevel(data.employeeProfile.techLevel || 'Journeyman');
          }
        }
      } catch (err) {
        console.error("Error loading HR pay details", err);
      } finally {
        setLoading(false);
      }
    }
    loadHrData();
  }, [user]);

  const handleSignOut = () => signOut(auth);

  const handleClaimReimbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reimbursementDesc || !reimbursementAmount) return;

    try {
      const claimId = "claim_" + Date.now();
      await addDoc(collection(db, 'reimbursement_claims'), {
        id: claimId,
        techUid: user?.uid || 'anonymous',
        techName: profileName,
        description: reimbursementDesc,
        amount: parseFloat(reimbursementAmount) || 0,
        status: 'Pending Approved',
        createdAt: new Date().toISOString()
      });

      setLoggedReimbursements(prev => [
        {
          id: claimId,
          description: reimbursementDesc,
          amount: parseFloat(reimbursementAmount) || 0,
          status: 'Pending Approved',
          createdAt: new Date().toISOString().split('T')[0]
        },
        ...prev
      ]);
      setReimbursementDesc('');
      setReimbursementAmount('');
      setReimbursementSuccess(true);
      setTimeout(() => setReimbursementSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const simulatedChecks = [
    { id: '1092', date: '2026-06-15', hours: 40, gross: payRate * 40, tax: (payRate * 40) * 0.18, net: (payRate * 40) * 0.82 },
    { id: '1091', date: '2026-06-01', hours: 42, gross: payRate * 42, tax: (payRate * 42) * 0.18, net: (payRate * 42) * 0.82 },
    { id: '1090', date: '2026-05-15', hours: 38, gross: payRate * 38, tax: (payRate * 38) * 0.18, net: (payRate * 38) * 0.82 }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      {/* Header bar */}
      <nav className="bg-slate-950 border-b border-slate-850 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-600/30 flex items-center justify-center text-indigo-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-base tracking-tight text-slate-100">Discount Electrical</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 border border-slate-750 text-indigo-400 rounded-md">Payments Hub</span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-bold text-slate-200">{profileName}</span>
                <span className="text-[10px] font-mono text-slate-450 uppercase">{techLevel}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Banner with claims confirmation */}
        <div className="p-6 bg-gradient-to-r from-slate-950 via-slate-950 to-indigo-950/20 border border-slate-850 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase bg-emerald-600/10 border border-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Active System Credentials Validated
            </span>
            <h2 className="text-lg font-bold tracking-tight">Worker Compensation & Billing Ledger</h2>
            <p className="text-slate-400 text-xs">Verify logged pay rates, review dynamic pay check stubs, or file expense claims.</p>
          </div>
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800/80 flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-inner">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-450 block uppercase">Contractual Pay-Rate</span>
              <span className="text-lg font-black text-slate-200">${payRate?.toFixed(2)} <span className="text-xs text-slate-500 font-medium">/ Hour</span></span>
            </div>
          </div>
        </div>

        {/* Inner modules grids */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left / Center - Check ledger */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-slate-850">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-sm">Automated Paystub History Ledger</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">3 Entries logged</span>
              </div>

              <div className="overflow-x-auto pt-4">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="text-slate-455 text-slate-400 font-bold border-b border-slate-850/60 pb-2">
                      <th className="py-3 px-2">Stub ID</th>
                      <th className="py-3 px-2">Pay Period End</th>
                      <th className="py-3 px-2">Worked Hours</th>
                      <th className="py-3 px-2 text-right">Gross Pay</th>
                      <th className="py-3 px-2 text-right">Net Compensation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/40">
                    {simulatedChecks.map(stub => (
                      <tr key={stub.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 px-2 font-mono text-slate-350">{stub.id}</td>
                        <td className="py-3 px-2 text-slate-200 font-medium">{stub.date}</td>
                        <td className="py-3 px-2 text-slate-350">{stub.hours} hrs</td>
                        <td className="py-3 px-2 text-right text-slate-350">${stub.gross.toFixed(2)}</td>
                        <td className="py-3 px-2 text-right text-emerald-400 font-extrabold">${stub.net.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Travel info, dynamic estimation tools etc. */}
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center space-x-2 pb-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm">Dynamic Pay Rate Projection Calculator</h3>
              </div>
              <p className="text-slate-400 text-xs">Estimate earnings by slide scaling potential worked hours against your contractual rate of <span className="font-bold text-slate-200">${payRate}</span>.</p>
              
              <div className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Simulated Hours / Week</span>
                    <span className="text-xl font-bold">40 Hours</span>
                  </div>
                  <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Gross Projection</span>
                    <span className="text-xl font-bold text-emerald-400">${(payRate * 40).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right rail - Expense or Travel Claims modal */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center space-x-2 pb-2">
                <Check className="w-4 h-4 text-slate-400" />
                <h3 className="font-bold text-sm">File Expense Reimbursement</h3>
              </div>
              
              <form onSubmit={handleClaimReimbursement} className="space-y-3.5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block mb-1">Expense Description</label>
                  <input 
                    type="text" 
                    value={reimbursementDesc}
                    onChange={e => setReimbursementDesc(e.target.value)}
                    placeholder="e.g. Copper conduit or site transit gas fee"
                    className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-805 border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 shadow-inner h-11"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block mb-1">Cost Amount ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={reimbursementAmount}
                    onChange={e => setReimbursementAmount(e.target.value)}
                    placeholder="e.g. 142.50"
                    className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-805 border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 shadow-inner h-11"
                  />
                </div>

                {reimbursementSuccess && (
                  <div className="p-3 bg-emerald-650 bg-emerald-950 text-emerald-400 border border-emerald-900 text-[11px] rounded-lg flex items-center space-x-1.5 font-sans">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Expense reimbursement claim saved successfully.</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-indigo-650 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-11 rounded-xl transition cursor-pointer border-none flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Submit Ledger Claim</span>
                </button>
              </form>
            </div>

            {/* List logged claims */}
            {loggedReimbursements.length > 0 && (
              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-3.5 shadow-sm">
                <span className="text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider">Submitted Claims ({loggedReimbursements.length})</span>
                <div className="space-y-3.5 divide-y divide-slate-850/65">
                  {loggedReimbursements.map((claim, idx) => (
                    <div key={claim.id} className={`flex items-start justify-between text-xs pt-3.5 ${idx === 0 ? 'pt-0' : ''}`}>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-200 leading-tight">{claim.description}</p>
                        <span className="text-[10px] text-slate-500 font-mono block">{claim.createdAt}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-indigo-400 block">${claim.amount.toFixed(2)}</span>
                        <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] uppercase font-mono rounded-md inline-block">{claim.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>

      </main>
    </div>
  );
}


// ==========================================
// 2. TIMECARD SUBDOMAIN PORTAL
// ==========================================
export function TimecardSubdomainPortal({ user, profileName }: PortalProps) {
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [stopwatchSec, setStopwatchSec] = useState<number>(0);
  const [techLevel, setTechLevel] = useState<string>('Journeyman');
  const [jobNum, setJobNum] = useState('');
  const [workedHours, setWorkedHours] = useState('');
  const [workDesc, setWorkDesc] = useState('');
  const [loggedWork, setLoggedWork] = useState<any[]>([]);
  const [workSuccess, setWorkSuccess] = useState(false);

  // Read Time Clock status from localStorage for reliable state preservation on refresh
  useEffect(() => {
    const savedClockIn = localStorage.getItem(`clock_in_time_${user?.uid}`);
    if (savedClockIn) {
      setIsClockedIn(true);
      setClockInTime(savedClockIn);
      const startMs = new Date(savedClockIn).getTime();
      const diffSec = Math.floor((Date.now() - startMs) / 1000);
      setStopwatchSec(diffSec > 0 ? diffSec : 0);
    }
  }, [user]);

  // Read techLevel
  useEffect(() => {
    async function loadHrDetails() {
      if (!user) return;
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          if (data.employeeProfile) {
            setTechLevel(data.employeeProfile.techLevel || 'Journeyman');
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadHrDetails();
  }, [user]);

  // Stopwatch ticking loop
  useEffect(() => {
    let interval: any = null;
    if (isClockedIn) {
      interval = setInterval(() => {
        setStopwatchSec(prev => prev + 1);
      }, 1000);
    } else {
      setStopwatchSec(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isClockedIn]);

  const handleSignOut = () => signOut(auth);

  const handleToggleTimeClock = () => {
    if (!isClockedIn) {
      // Clock In
      const nowStr = new Date().toISOString();
      setIsClockedIn(true);
      setClockInTime(nowStr);
      setStopwatchSec(0);
      localStorage.setItem(`clock_in_time_${user?.uid}`, nowStr);
    } else {
      // Clock Out
      const endStr = new Date().toISOString();
      setIsClockedIn(false);
      localStorage.removeItem(`clock_in_time_${user?.uid}`);
      
      // Calculate logged hours
      if (clockInTime) {
        const startMs = new Date(clockInTime).getTime();
        const finalHours = Math.max(0.1, Number(((Date.now() - startMs) / 3600000).toFixed(2)));
        
        // Populate form automatically with calculated hours
        setWorkedHours(finalHours.toString());
        setWorkDesc(`Shift clocked out: started at ${new Date(clockInTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
      }
      setClockInTime(null);
    }
  };

  const handleSaveWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobNum || !workedHours || !workDesc) return;

    try {
      const logId = "log_" + Date.now();
      await addDoc(collection(db, 'work_logs'), {
        id: logId,
        techUid: user?.uid || 'anonymous',
        techName: profileName,
        jobNum: jobNum,
        hours: parseFloat(workedHours) || 0,
        description: workDesc,
        createdAt: new Date().toISOString()
      });

      setLoggedWork(prev => [
        {
          id: logId,
          jobNum: jobNum,
          hours: parseFloat(workedHours) || 0,
          description: workDesc,
          createdAt: new Date().toISOString().split('T')[0]
        },
        ...prev
      ]);
      setJobNum('');
      setWorkedHours('');
      setWorkDesc('');
      setWorkSuccess(true);
      setTimeout(() => setWorkSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const formatSec = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  const recentSiteLogs = [
    { id: '1', jobNum: 'JOB-8931', hours: 8.0, description: 'Commercial wiring installation', date: '2026-06-20' },
    { id: '2', jobNum: 'JOB-8422', hours: 4.5, description: 'Breaker box diagnostics & repair', date: '2026-06-19' },
    { id: '3', jobNum: 'JOB-7981', hours: 7.2, description: 'Generator hookups & transformer check', date: '2026-06-18' }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      <nav className="bg-slate-950 border-b border-slate-850 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-xl bg-orange-600/10 border border-orange-600/30 flex items-center justify-center text-orange-450 text-orange-500">
                <Clock className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-base tracking-tight text-slate-100">Discount Electrical</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 border border-slate-750 text-orange-400 rounded-md">Timecards</span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-bold text-slate-200">{profileName}</span>
                <span className="text-[10px] font-mono text-slate-450 uppercase">{techLevel}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-rose-450 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Banner with status and clock action */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Visual Clock */}
          <div className="lg:col-span-2 p-6 bg-slate-950 border border-slate-850 rounded-3xl flex flex-col sm:flex-row justify-between items-center gap-6 shadow-xl relative overflow-hidden">
            <div className="space-y-2 text-center sm:text-left z-10">
              <span className={`text-[10px] font-mono uppercase bg-emerald-600/10 border border-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-md inline-flex items-center gap-1`}>
                <Clock className="w-3 h-3" />
                Shift Activity Supervisor
              </span>
              <h2 className="text-xl font-bold tracking-tight">Active Duty Time Clock</h2>
              <p className="text-slate-400 text-xs">Record shift hours directly for weekly supervisor review and dispatching.</p>
              
              {isClockedIn && clockInTime && (
                <div className="pt-2 text-[11px] text-slate-400">
                  Clocked-In State started at: <span className="font-bold text-indigo-400 font-mono">{new Date(clockInTime).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center sm:items-end justify-center space-y-3 z-10">
              <div className="font-mono text-3xl font-black tracking-widest text-slate-100 bg-slate-900 px-6 py-3 border border-slate-800 rounded-2xl w-52 text-center shadow-inner">
                {formatSec(stopwatchSec)}
              </div>
              
              <button
                type="button"
                onClick={handleToggleTimeClock}
                className={`w-52 h-12 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border-none shadow-md ${
                  isClockedIn 
                    ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse' 
                    : 'bg-emerald-605 bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isClockedIn ? (
                  <>
                    <Square className="w-4 h-4 fill-white" />
                    <span>Clock Out of Duty</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Clock Into Duty</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-3xl flex flex-col justify-between shadow-xl">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-500 tracking-wider">Estimated Total Balance</span>
              <h3 className="text-2xl font-black text-slate-150">19.7 <span className="text-xs font-medium text-slate-500">hours this cycle</span></h3>
            </div>
            
            <div className="border-t border-slate-850/60 pt-4 mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-450 text-slate-400">Current Week Hours</span>
                <span className="font-bold text-slate-200">12.5 hrs</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-450 text-slate-400 font-sans">Pending Approval Log</span>
                <span className="font-bold text-orange-400 font-mono">7.2 hrs</span>
              </div>
            </div>
          </div>

        </div>

        {/* Action Grids */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Submit Work Item */}
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-sm">Register Work Log Item</h3>
            </div>

            <form onSubmit={handleSaveWorkLog} className="space-y-3.5">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 font-mono">Job Site Code #</label>
                <input 
                  type="text" 
                  value={jobNum}
                  onChange={e => setJobNum(e.target.value)}
                  placeholder="e.g. JOB-9781"
                  className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-orange-500 h-11"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 font-mono">Duration (Hours)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={workedHours}
                  onChange={e => setWorkedHours(e.target.value)}
                  placeholder="e.g. 7.5"
                  className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-orange-500 h-11"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 font-mono">Task Details / Description</label>
                <textarea 
                  value={workDesc}
                  onChange={e => setWorkDesc(e.target.value)}
                  placeholder="e.g. Hooked up LLE conduits, verified breaker connections for site"
                  rows={3}
                  className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-orange-500 resize-none"
                  required
                />
              </div>

              {workSuccess && (
                <div className="p-3 bg-emerald-950 text-emerald-400 border border-emerald-900 text-[11px] rounded-lg flex items-center space-x-1.5 font-sans">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Work card log saved successfully.</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs h-11 rounded-xl transition cursor-pointer border-none flex items-center justify-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Submit Work Entry</span>
              </button>
            </form>
          </div>

          {/* Timecards Ledger */}
          <div className="lg:col-span-2 bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-850">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                <h3 className="font-bold text-sm">Site Logs & Shift Approvals Ledger</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Past activity tracker</span>
            </div>

            <div className="divide-y divide-slate-850/40">
              
              {/* Logged state tracker */}
              {loggedWork.length > 0 && loggedWork.map(log => (
                <div key={log.id} className="py-4 flex justify-between items-start text-xs animate-in fade-in duration-300">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-orange-400 font-mono bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded text-[10px]">{log.jobNum}</span>
                      <span className="text-[10px] font-mono text-slate-500">{log.createdAt}</span>
                    </div>
                    <p className="text-slate-350 text-slate-300 mt-1">{log.description}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-slate-100">{log.hours} <span className="text-[10px] text-slate-500 font-normal">hrs</span></span>
                    <span className="block text-[9px] uppercase font-mono tracking-wider text-emerald-400 font-bold mt-1">Logged</span>
                  </div>
                </div>
              ))}

              {recentSiteLogs.map(log => (
                <div key={log.id} className="py-4 flex justify-between items-start text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[10px]">{log.jobNum}</span>
                      <span className="text-[10px] font-mono text-slate-500">{log.date}</span>
                    </div>
                    <p className="text-slate-400 mt-1">{log.description}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-slate-200">{log.hours} <span className="text-[10px] text-slate-500 font-normal">hrs</span></span>
                    <span className="block text-[9px] uppercase font-mono tracking-wider text-emerald-400 font-bold mt-1">Approved</span>
                  </div>
                </div>
              ))}

            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
