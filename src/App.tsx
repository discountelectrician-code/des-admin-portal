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
  updatePassword,
  GoogleAuthProvider,
  signInWithPopup,
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
  Unlock,
  AlertCircle, 
  ArrowRight, 
  Mail, 
  LockKeyhole, 
  UserPlus, 
  LogIn, 
  Sparkles,
  RefreshCw,
  LayoutDashboard,
  Users,
  ExternalLink,
  ShieldAlert,
  CreditCard,
  Eye,
  EyeOff
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

  // User details & claims state loaded from Firestore
  const [userClaims, setUserClaims] = useState<{ admin: boolean; pay: boolean; timecard: boolean }>({
    admin: false,
    pay: false,
    timecard: false
  });
  const [profileName, setProfileName] = useState('New Service Agent');

  // Interactive simulation overlays state
  const [activeSimulation, setActiveSimulation] = useState<'pay' | 'timecard' | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Manual Login Form control states
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Clock-in timer effect
  useEffect(() => {
    let timerInterval: any;
    if (clockedIn) {
      timerInterval = setInterval(() => {
        setTimeElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setTimeElapsed(0);
    }
    return () => clearInterval(timerInterval);
  }, [clockedIn]);

  // Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserClaims(data.claims || { admin: false, pay: false, timecard: false });
            setProfileName(data.displayName || currentUser.displayName || 'Authorized Worker');
          } else {
            // Check if it matches master admin
            const isMasterAdmin = currentUser.email?.toLowerCase() === 'discountelectrician@gmail.com';
            const defaultClaims = {
              admin: isMasterAdmin,
              pay: isMasterAdmin,
              timecard: true
            };
            setUserClaims(defaultClaims);
            setProfileName(currentUser.displayName || (isMasterAdmin ? 'Chief Administrator' : 'Authorized Worker'));
            
            // Seed a Firestore document for this authenticated agent
            await setDoc(doc(db, 'users', currentUser.uid), {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || (isMasterAdmin ? 'Chief Administrator' : 'Authorized Worker'),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              claims: defaultClaims
            });
          }
        } catch (err) {
          console.error("Error setting up user session snapshot:", err);
          const isMasterAdmin = currentUser.email?.toLowerCase() === 'discountelectrician@gmail.com';
          setUserClaims({
            admin: isMasterAdmin,
            pay: isMasterAdmin,
            timecard: true
          });
          setProfileName(isMasterAdmin ? 'Chief Administrator' : 'Authorized Worker');
        }
      } else {
        setUserClaims({ admin: false, pay: false, timecard: false });
        setProfileName('');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. Manual Log In handler
  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Please fill out security credentials email and password.');
      return;
    }

    setAuthError('');
    setAuthLoading(true);
    const targetEmail = email.trim().toLowerCase();

    try {
      if (targetEmail === 'discountelectrician@gmail.com' && password === 'Funfun11#') {
        // Master admin login using direct master password 'Funfun11#'
        try {
          await signInWithEmailAndPassword(auth, targetEmail, 'Funfun11#');
        } catch (err: any) {
          console.warn("Main login failed, trying legacy migrating credentials...", err.message);
          let migrated = false;

          // Attempt 'discount123'
          try {
            const cred = await signInWithEmailAndPassword(auth, targetEmail, 'discount123');
            await updatePassword(cred.user, 'Funfun11#');
            migrated = true;
            console.log("Successfully updated admin password to target 'Funfun11#' from 'discount123'!");
          } catch (migrateErr) {
            // Attempt 'discount111'
            try {
              const cred = await signInWithEmailAndPassword(auth, targetEmail, 'discount111');
              await updatePassword(cred.user, 'Funfun11#');
              migrated = true;
              console.log("Successfully updated admin password to target 'Funfun11#' from 'discount111'!");
            } catch (migrateErrLast) {
              console.warn("No legacy fallback password aligned. Creating master administrator credentials afresh.");
            }
          }

          if (!migrated) {
            // If the user does not exist in Auth, create it afresh
            try {
              const cred = await createUserWithEmailAndPassword(auth, targetEmail, 'Funfun11#');
              await updateProfile(cred.user, { displayName: 'Chief Administrator' });
              await setDoc(doc(db, 'users', cred.user.uid), {
                uid: cred.user.uid,
                email: targetEmail,
                displayName: 'Chief Administrator',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                claims: { admin: true, pay: true, timecard: true }
              });
              console.log("Created master administrator credentials cleanly.");
            } catch (regErr: any) {
              throw new Error(`Master Admin setup failed: ${regErr.message}`);
            }
          }
        }
      } else {
        // Standard worker sign in
        await signInWithEmailAndPassword(auth, targetEmail, password);
      }
    } catch (err: any) {
      console.error("Authentication error:", err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('Authentication failed. Check your password credentials.');
      } else if (err.code === 'auth/user-not-found') {
        setAuthError('No profile matches this email. Register an account.');
      } else {
        setAuthError(err.message || 'Login failed. Verify specifications.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Google Authentication sign-in handler
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const isMasterAdmin = googleUser.email?.toLowerCase() === 'discountelectrician@gmail.com';
      const userRef = doc(db, 'users', googleUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const defaultClaims = {
          admin: isMasterAdmin,
          pay: isMasterAdmin,
          timecard: true
        };
        await setDoc(userRef, {
          uid: googleUser.uid,
          email: googleUser.email || '',
          displayName: googleUser.displayName || 'Authorized Worker',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          claims: defaultClaims
        });
        setUserClaims(defaultClaims);
      } else {
        const existingClaims = userSnap.data().claims || { admin: false, pay: false, timecard: false };
        if (isMasterAdmin && (!existingClaims.admin || !existingClaims.pay || !existingClaims.timecard)) {
          const updatedClaims = { admin: true, pay: true, timecard: true };
          await setDoc(userRef, { claims: updatedClaims }, { merge: true });
          setUserClaims(updatedClaims);
        } else {
          setUserClaims(existingClaims);
        }
      }
    } catch (err: any) {
      console.error("Google authentication error:", err);
      if (err.code === 'auth/popup-blocked' || err.message?.includes('popup')) {
        setAuthError('Popup blocker blocked browser login window. Please allow popups.');
      } else {
        setAuthError(err.message || 'Google Authentication failed. Try again.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // 3. Manual Sign-Up/Registration handler
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) {
      setAuthError('Please input your name, email, and security key password.');
      return;
    }

    setAuthError('');
    setAuthLoading(true);
    const targetEmail = email.trim().toLowerCase();

    try {
      const isMasterAdmin = targetEmail === 'discountelectrician@gmail.com';
      const defaultClaims = {
        admin: isMasterAdmin,
        pay: isMasterAdmin,
        timecard: true
      };

      const userCredential = await createUserWithEmailAndPassword(auth, targetEmail, password);
      const newUser = userCredential.user;

      await updateProfile(newUser, { displayName: displayName.trim() });

      await setDoc(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: targetEmail,
        displayName: displayName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        claims: defaultClaims
      });

      console.log("Successfully registered employee user profile.");
    } catch (err: any) {
      console.error("Manual profile registration failed:", err);
      setAuthError(err.message || 'Registration failed. Try entering a longer security password.');
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

      {/* LOGIN PANEL (If user session is null) */}
      {!user ? (
        <main className="flex-1 max-w-md w-full mx-auto px-4 py-16 flex flex-col justify-center">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xl space-y-6">
            
            {/* Logo Heading */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-slate-900 text-amber-400 flex items-center justify-center rounded-2xl shadow-lg border border-slate-800">
                <LockKeyhole className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Discount Electrical</h2>
              <p className="text-xs text-slate-500 font-mono font-bold uppercase tracking-widest">
                Central Administrative Gate
              </p>
            </div>

            {/* Configured Admin Credentials Notice */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600 leading-relaxed space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1 font-mono text-[10px] uppercase">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                Master Admin Portal Credentials
              </div>
              <div><span className="font-bold">Email:</span> discountelectrician@gmail.com</div>
              <div><span className="font-bold">Key Passcode:</span> Funfun11#</div>
              <p className="text-[10px] text-slate-400 pt-1 border-t mt-1 leading-snug">
                Enter these credentials below to log in as the chief administrator with full central authorization claims.
              </p>
            </div>

            {/* Error alerts */}
            {authError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-sans leading-tight">{authError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={isRegistering ? handleSignUp : handleLogIn} className="space-y-4">
              {isRegistering && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide font-mono">Full Name</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="John Doe" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 rounded-xl text-sm transition font-sans"
                      required
                    />
                    <UserPlus className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide font-mono">Email Address</label>
                <div className="relative">
                  <input 
                    type="email" 
                    placeholder="name@discountelectrical.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 rounded-xl text-sm transition font-sans"
                    required
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide font-mono">Password</label>
                </div>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 rounded-xl text-sm transition font-sans"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-hidden transition-colors p-0.5 rounded cursor-pointer z-10 flex items-center justify-center"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-sm tracking-tight rounded-xl shadow-lg hover:shadow-indigo-100 transition duration-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{isRegistering ? 'Register Employee Access' : 'Unlock Central Router'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Google Sign-In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-250 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition duration-300 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.253-3.133C18.29 1.554 15.539.8 12.24.8c-6.19 0-11.2 5.01-11.2 11.2s5.01 11.2 11.2 11.2c6.46 0 10.76-4.524 10.76-10.938 0-.742-.08-1.303-.177-1.977H12.24z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>

            {/* Toggle Registration View */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setAuthError('');
                  setIsRegistering(!isRegistering);
                }}
                className="text-xs font-bold text-indigo-650 hover:text-indigo-800 transition cursor-pointer"
              >
                {isRegistering ? 'Already in registry? Sign In' : 'Register a new employee profile'}
              </button>
            </div>

          </div>
        </main>
      ) : (
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

          {/* Central Enterprise App & Subdomain Router */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-indigo-600">
                <LayoutDashboard className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider font-mono">Central Enterprise Access Center</span>
              </div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Enterprise Subdomain Router</h2>
              <p className="text-xs text-slate-500">
                This resides as the Master Module controlling access tokens and claims. Direct access route to other modules is unlocked when corresponding claims are active on your profile.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Admin */}
              <div className="bg-slate-50/50 border border-slate-200 p-4.5 rounded-xl flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">admin.discountelectricalservice.com</span>
                    {userClaims.admin ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-green-150 text-green-700 border border-green-200">
                        ACTIVE CHANNEL
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        RESTRICTED
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    Central Admin Console
                  </h3>
                  <p className="text-xs text-slate-500 font-sans leading-relaxed">
                    Set permissions/claims, review operations live feeds, synchronize historical archives.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className="w-full text-center py-1.5 border border-purple-200 hover:bg-purple-50 text-purple-700 font-bold text-xs rounded-lg transition mt-auto flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  Configure Permissions
                </button>
              </div>

              {/* Card 2: Pay Module */}
              <div className="bg-slate-50/50 border border-slate-200 p-4.5 rounded-xl flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">pay.discountelectricalservice.com</span>
                    {userClaims.pay ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-green-150 text-green-700 border border-green-200">
                        UNLOCKED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-400 border border-slate-200">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-sky-600" />
                    Pay & Payroll Module
                  </h3>
                  <p className="text-xs text-slate-500 font-sans leading-relaxed">
                    Access Stripe payment terminals, field wages tables, and client billing registers.
                  </p>
                </div>
                {userClaims.pay ? (
                  <button
                    onClick={() => setActiveSimulation('pay')}
                    className="w-full text-center py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-lg transition mt-auto flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Launch Pay Module
                  </button>
                ) : (
                  <div className="py-2.5 px-3 bg-slate-100 rounded-lg text-[10px] text-slate-500 font-mono flex items-center gap-1 justify-center">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Requires claim.pay. (Activate below)</span>
                  </div>
                )}
              </div>

              {/* Card 3: Timecard */}
              <div className="bg-slate-50/50 border border-slate-200 p-4.5 rounded-xl flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">timecard.discountelectricalservice.com</span>
                    {userClaims.timecard ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-green-150 text-green-700 border border-green-200">
                        UNLOCKED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-400 border border-slate-200">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-teal-600" />
                    Time Card & Timesheet Suite
                  </h3>
                  <p className="text-xs text-slate-500 font-sans leading-relaxed">
                    Field technicians clock-in portal, smart work duration trackers, and activity reports.
                  </p>
                </div>
                {userClaims.timecard ? (
                  <button
                    onClick={() => setActiveSimulation('timecard')}
                    className="w-full text-center py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg transition mt-auto flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Open Timecard Portal
                  </button>
                ) : (
                  <div className="py-2.5 px-3 bg-slate-100 rounded-lg text-[10px] text-slate-500 font-mono flex items-center gap-1 justify-center">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Requires claim.timecard. (Activate below)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick tab cards for Mobile/Desktop fallback */}
          <div className="flex md:hidden bg-white p-1 rounded-xl border border-slate-200 shadow-xs max-w-[440px] mx-auto text-[10px] font-bold">
            <button 
              onClick={() => setActiveTab('telemetry')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'telemetry' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500'}`}
            >
              Telemetry
            </button>
            <button 
              onClick={() => setActiveTab('permissions')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'permissions' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500'}`}
            >
              Permissions
            </button>
            <button 
              onClick={() => setActiveTab('payment')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'payment' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500'}`}
            >
              Payment
            </button>
            <button 
              onClick={() => setActiveTab('historical_sync')}
              className={`flex-1 py-1.5 rounded-lg text-center ${activeTab === 'historical_sync' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500'}`}
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

          {/* Interactive Simulation Overlays */}
          {activeSimulation === 'pay' && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center z-50 p-4">
              <div className="bg-white border rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
                <div className="bg-sky-600 text-white p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    <div>
                      <h3 className="text-base font-bold">pay.discountelectricalservice.com</h3>
                      <p className="text-[10px] text-sky-100 font-mono">AUTHORIZED GATE SESSION ACTIVE</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveSimulation(null)}
                    className="text-white hover:text-sky-200 text-lg font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="p-4 bg-sky-50 text-sky-900 border border-sky-200 rounded-xl space-y-2">
                    <div className="text-xs font-bold uppercase font-mono text-sky-700">Worker Pay Terminal</div>
                    <div className="text-2xl font-extrabold">$48.50 / hr</div>
                    <p className="text-xs text-sky-850 leading-relaxed">
                      Current wage metrics verified for <span className="font-bold">{profileName}</span>. Financial logs stream securely through secure central claims tokens.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 border rounded-lg bg-slate-50">
                      <div className="text-slate-400 font-mono text-[9px] uppercase">Base Payroll Period</div>
                      <div className="font-bold mt-1 text-slate-700">Weekly - Wed Net 7</div>
                    </div>
                    <div className="p-3 border rounded-lg bg-slate-50">
                      <div className="text-slate-400 font-mono text-[9px] uppercase">Stripe API Status</div>
                      <div className="font-bold mt-1 text-emerald-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Operational
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    This simulated sub-portal demonstrates full secure validation of the <span className="font-bold font-mono text-slate-800 bg-slate-100 px-1 rounded">pay</span> custom claim token emitted from the Central Master Applet.
                  </p>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
                  <button 
                    onClick={() => setActiveSimulation(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Close Simulation
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSimulation === 'timecard' && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center z-50 p-4">
              <div className="bg-white border rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
                <div className="bg-teal-600 text-white p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    <div>
                      <h3 className="text-base font-bold">timecard.discountelectricalservice.com</h3>
                      <p className="text-[10px] text-teal-100 font-mono">SECURE LIVE CLOCK-IN SUITE</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveSimulation(null)}
                    className="text-white hover:text-teal-200 text-lg font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="text-center space-y-2 p-6 border border-dashed rounded-xl bg-slate-50/50">
                    <div className="text-xs font-bold text-slate-500 uppercase font-mono tracking-wider">Shift Controls</div>
                    {clockedIn ? (
                      <div className="space-y-2">
                        <div className="text-3xl font-extrabold text-teal-650 font-mono animate-pulse">
                          {Math.floor(timeElapsed / 60)}m {timeElapsed % 60}s
                        </div>
                        <p className="text-xs text-slate-500">
                          Active Jobsite Shift started at {clockInTime}.
                        </p>
                        <button
                          onClick={() => {
                            setClockedIn(false);
                            setClockInTime(null);
                          }}
                          className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                        >
                          Clock Out Shift
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-2xl font-bold text-slate-350">OFF CLOCK</div>
                        <p className="text-xs text-slate-500">
                          Not currently clocked into an electrical service unit.
                        </p>
                        <button
                          onClick={() => {
                            setClockedIn(true);
                            setClockInTime(new Date().toLocaleTimeString());
                          }}
                          className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Clock In Live Shift
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed text-center">
                    This interactive sub-portal validates worker <span className="font-bold font-mono text-slate-800 bg-slate-100 px-1 rounded">timecard</span> tokens. Changes synchronize live to the supervisor's telemetry pool.
                  </p>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
                  <button 
                    onClick={() => setActiveSimulation(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Close Simulation
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
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
