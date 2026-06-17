/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  User 
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  Zap, 
  Wrench, 
  Compass, 
  ShieldCheck, 
  Lock, 
  AlertCircle, 
  ArrowRight, 
  Mail, 
  LockKeyhole, 
  UserPlus, 
  LogIn, 
  Sparkles,
  RefreshCw,
  LayoutDashboard,
  Users
} from 'lucide-react';
import Navbar from './components/Navbar';
import TelemetryDashboard from './components/TelemetryDashboard';
import PermissionsManager from './components/PermissionsManager';
import PaymentSettings from './components/PaymentSettings';
import HistoricalSync from './components/HistoricalSync';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'permissions' | 'payment' | 'historical_sync'>('telemetry');
  
  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const isAdminEmail = currentUser.email?.toLowerCase() === 'discountelectrician@gmail.com';
        if (isAdminEmail) {
          setUser(currentUser);
        } else {
          try {
            await auth.signOut();
          } catch (err) {
            console.error('Sign out error:', err);
          }
          setAuthError('Unauthorized access. Only the designated administrator is permitted.');
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Handle Log In
  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setAuthError('');
    setAuthLoading(true);
    const targetEmail = email.trim().toLowerCase();
    
    try {
      const isChiefAdmin = targetEmail === 'discountelectrician@gmail.com';
      if (!isChiefAdmin) {
        setAuthError('Unauthorized access. Only the designated administrator is permitted.');
        setAuthLoading(false);
        return;
      }

      await signInWithEmailAndPassword(auth, targetEmail, password);
    } catch (err: any) {
      console.error(err);
      
      // Auto-create designated administrator account if correct credentials are provided but user registration is not yet in Auth
      if (
        (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.message?.includes('user-not-found') || err.message?.includes('invalid-credential')) &&
        targetEmail === 'discountelectrician@gmail.com' &&
        password === 'discount123'
      ) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, targetEmail, password);
          const newUser = userCredential.user;
          await updateProfile(newUser, { displayName: 'Chief Administrator' });
          
          await setDoc(doc(db, 'users', newUser.uid), {
            uid: newUser.uid,
            email: targetEmail,
            displayName: 'Chief Administrator',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            claims: {
              admin: true,
              pay: true,
              timecard: true
            }
          });
        } catch (createErr: any) {
          setAuthError(`Admin registration backup failed: ${createErr.message}`);
        }
      } else {
        setAuthError('Validation failed. Verify email and password.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Account Creation / Firestore Profile registration
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) {
      setAuthError('Please fill in all registration parameters.');
      return;
    }

    setAuthError('');
    setAuthLoading(true);
    const targetEmail = email.trim().toLowerCase();

    // Only allow registering the designated administrator email for security reasons
    if (targetEmail !== 'discountelectrician@gmail.com') {
      setAuthError('Unauthorized registration: Only the designated administrator email (discountelectrician@gmail.com) is permitted.');
      setAuthLoading(false);
      return;
    }

    try {
      // 1. Create Auth Account
      const userCredential = await createUserWithEmailAndPassword(auth, targetEmail, password);
      const newUser = userCredential.user;

      // 2. Assign Name profile
      await updateProfile(newUser, { displayName: displayName.trim() });

      // 3. Register user profile inside Firestore with initial claims structure.
      const userClaims = {
        admin: true,
        pay: true,
        timecard: true
      };

      await setDoc(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: targetEmail,
        displayName: displayName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        claims: userClaims
      });

    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Registration failed. Try a longer password.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Main Loading Shell
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="bg-white border rounded-2xl shadow-md p-8 flex flex-col items-center max-w-sm text-center">
          <Zap className="w-10 h-10 text-amber-500 animate-bounce mb-3" />
          <h2 className="text-sm font-semibold font-mono text-slate-800">DISCOUNT ELECTRICAL</h2>
          <p className="text-xs text-slate-400 mt-1">Establishing Secure Pipeline Interface...</p>
          <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      
      {/* Dynamic Header */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={user} />

      {user ? (
        /* PORTAL AUTHENTICATED ACCESS STATE */
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          
          {/* Collapsible Architecture Explainer Guide */}
          {activeTab === 'telemetry' && (
            <div className="bg-[#1E293B] text-[#94A3B8] p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between border border-slate-800">
              <div className="space-y-1 mb-4 md:mb-0 max-w-3xl">
                <div className="flex items-center space-x-2 text-amber-400 font-sans">
                  <Wrench className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Subdomain Ecosystem Mapping</span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">Modular Sub-Application Routing Integration</h2>
                <p className="text-xs leading-relaxed">
                  All apps in the Discount Electrical Service network share this central Firebase database but target separate client namespaces. Users must log in via this central Auth registry and have their custom Claims configured under the <span className="text-slate-100 font-mono font-bold bg-slate-800 px-1 py-0.5 rounded">users</span> directory to unlock each respective app module structure.
                </p>
              </div>
              
              <div className="flex flex-wrap gap-2 text-xs font-mono font-bold">
                <a href="#telemetry" onClick={() => setActiveTab('telemetry')} className="bg-[#334155] border border-slate-700 hover:border-slate-500 text-slate-200 px-3.5 py-2 rounded-xl transition flex items-center space-x-1">
                  <span>View Admin Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
                <a href="#permissions" onClick={() => setActiveTab('permissions')} className="bg-[#334155] border border-slate-700 hover:border-slate-500 text-slate-200 px-3.5 py-2 rounded-xl transition flex items-center space-x-1">
                  <span>View Identity Manager</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Quick tab cards for Mobile/Desktop fallback */}
          <div className="flex md:hidden bg-white p-1 rounded-xl border border-slate-200 shadow-sm max-w-[440px] mx-auto text-[10px] font-bold">
            <button 
              onClick={() => setActiveTab('telemetry')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'telemetry' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Telemetry
            </button>
            <button 
              onClick={() => setActiveTab('permissions')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'permissions' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Permissions
            </button>
            <button 
              onClick={() => setActiveTab('payment')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'payment' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Payment
            </button>
            <button 
              onClick={() => setActiveTab('historical_sync')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'historical_sync' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Sync
            </button>
          </div>

          {/* Render Core Component tab */}
          {activeTab === 'telemetry' ? (
            <TelemetryDashboard />
          ) : activeTab === 'permissions' ? (
            <PermissionsManager />
          ) : activeTab === 'payment' ? (
            <PaymentSettings />
          ) : (
            <HistoricalSync />
          )}

        </main>
      ) : (
        /* PORTAL PUBLIC LOGIN/REGISTRATION STATE */
        <div className="flex-grow flex items-center justify-center p-4 py-16 bg-[#F1F5F9] relative overflow-hidden">
          
          {/* Subtle electric background decorations */}
          <div className="absolute top-20 left-20 w-64 h-64 bg-amber-200/20 blur-3xl rounded-full"></div>
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-indigo-200/20 blur-3xl rounded-full"></div>

          <div className="max-w-md w-full bg-white border border-slate-250 shadow-2xl rounded-2xl overflow-hidden relative z-10 transition-all duration-305">
            
            {/* Header Branding */}
            <div className="bg-slate-900 p-8 text-center text-white relative">
              <div className="inline-flex bg-amber-500 text-slate-900 p-3 rounded-2xl shadow-lg mb-4">
                <Zap className="w-6 h-6 fill-slate-900 animate-pulse" />
              </div>
              <h2 className="text-xl font-extrabold tracking-tight font-sans">DISCOUNT ELECTRICAL</h2>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-mono">Central Administrative Gate</p>
              
              <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-indigo-500 to-teal-500"></div>
            </div>

            <div className="p-8">
              {authError && (
                <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={isRegistering ? handleSignUp : handleLogIn} className="space-y-4">
                {isRegistering && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Full Employee Name</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g., Albert Jones"
                        required
                        className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 outline-none bg-slate-50 focus:bg-white focus:border-indigo-500 transition"
                      />
                      <Compass className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Company Email</label>
                  <div className="relative">
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g., tech.albert@discountelectrical.com"
                      required
                      className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 outline-none bg-slate-50 focus:bg-white focus:border-indigo-500 transition"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Security Key (Password)</label>
                  <div className="relative">
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 outline-none bg-slate-50 focus:bg-white focus:border-indigo-500 transition"
                    />
                    <LockKeyhole className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={authLoading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
                >
                  {authLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : isRegistering ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Register Account profile</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Unlock Portal Access</span>
                    </>
                  )}
                </button>
              </form>

              {/* Login/Register Toggle option */}
              <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs">
                {isRegistering ? (
                  <p className="text-slate-500">
                    Existing field worker or technician?{' '}
                    <button 
                      type="button" 
                      onClick={() => { setIsRegistering(false); setAuthError(''); }}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      Login here
                    </button>
                  </p>
                ) : (
                  <p className="text-slate-500">
                    Need central employee credentials?{' '}
                    <button 
                      type="button" 
                      onClick={() => { setIsRegistering(true); setAuthError(''); }}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      Create account
                    </button>
                  </p>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Persistent Footer */}
      <footer id="app_footer" className="bg-slate-900 border-t border-slate-800 text-slate-450 py-6 text-center text-xs">
        <div className="max-w-7xl mx-auto px-4 font-mono">
          <p>© 2026 Discount Electrical Service Inc. All systems operational.</p>
          <p className="text-[10px] text-slate-600 mt-1">
            Protected by attribute-based custom claim token validation pipelines.
          </p>
        </div>
      </footer>

    </div>
  );
}
