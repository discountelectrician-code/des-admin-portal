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
import WaitingForApprovalPage from './components/WaitingForApprovalPage';
import WaitingRoomPage from './components/WaitingRoomPage';
import { PaySubdomainPortal, TimecardSubdomainPortal } from './components/SubdomainPortals';
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
  LogOut,
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
import QuoRoutingConfig from './components/QuoRoutingConfig';
import OnboardingPage from './components/OnboardingPage';
import LeadRecovery from './components/LeadRecovery';
import SEOHeatmap from './components/SEOHeatmap';
import MigrationUtility from './components/MigrationUtility';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [userTechLevel, setUserTechLevel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'permissions' | 'payment' | 'quo_routing' | 'lead_recovery' | 'seo_heatmap' | 'migration'>('telemetry');

  // Secure Single-Page routing path tracking
  const [currentPath, setCurrentPath] = useState(window.location.pathname.toLowerCase());

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname.toLowerCase());
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Secure Onboarding route detection states (Phase 3)
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [inviteId, setInviteId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('inviteId');
    const isPathOnboard = currentPath === '/onboard' || currentPath.startsWith('/onboard');
    if (id || isPathOnboard) {
      setIsOnboarding(true);
      setInviteId(id || '');
    } else {
      setIsOnboarding(false);
      setInviteId(null);
    }
  }, [currentPath]);

  // User details & claims state loaded from Firestore
  const [userClaims, setUserClaims] = useState<{ admin: boolean; pay: boolean; timecard: boolean }>({
    admin: false,
    pay: false,
    timecard: false
  });
  const [profileName, setProfileName] = useState('New Service Agent');
  const [currentUserAccessStatus, setCurrentUserAccessStatus] = useState<'Pending' | 'Active' | 'Restricted' | null>(null);

  // Detect subdomain Category automatically from hostname
  const [hostDomain, setHostDomain] = useState<'admin' | 'pay' | 'timecard'>('admin');

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.startsWith('pay.') || hostname.includes('.pay.') || hostname.includes('pay-') || hostname.includes('pay.')) {
      setHostDomain('pay');
    } else if (hostname.startsWith('timecard.') || hostname.includes('.timecard.') || hostname.includes('timecard-') || hostname.includes('timecard.')) {
      setHostDomain('timecard');
    } else {
      setHostDomain('admin');
    }
  }, []);

  // Manual Login Form control states
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setIsInitializing(true);
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          const isMasterAdmin = currentUser.email?.toLowerCase() === 'discountelectrician@gmail.com';
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserClaims(data.claims || { admin: false, pay: false, timecard: false });
            setProfileName(data.displayName || currentUser.displayName || 'Authorized Worker');
            const techLevelVal = data.employeeProfile?.techLevel || null;
            setUserTechLevel(techLevelVal);
            
            const isOwnerOrMasterRole = techLevelVal === 'Owner' || techLevelVal === 'Master' || isMasterAdmin;
            if (isOwnerOrMasterRole) {
              setCurrentUserAccessStatus('Active');
            } else {
              setCurrentUserAccessStatus(data.accessStatus || data.employeeProfile?.accessStatus || 'Pending');
            }
          } else {
            // Check if it matches master admin
            const defaultClaims = {
              admin: isMasterAdmin,
              pay: isMasterAdmin,
              timecard: true
            };
            setUserClaims(defaultClaims);
            setProfileName(currentUser.displayName || (isMasterAdmin ? 'Chief Administrator' : 'Authorized Worker'));
            setCurrentUserAccessStatus(isMasterAdmin ? 'Active' : 'Pending');
            setUserTechLevel(isMasterAdmin ? 'Master' : null);
            
            // Seed a Firestore document for this authenticated agent
            await setDoc(doc(db, 'users', currentUser.uid), {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || (isMasterAdmin ? 'Chief Administrator' : 'Authorized Worker'),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              claims: defaultClaims,
              accessStatus: isMasterAdmin ? 'Active' : 'Pending'
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
          setCurrentUserAccessStatus(isMasterAdmin ? 'Active' : 'Pending');
          setUserTechLevel(isMasterAdmin ? 'Master' : null);
        }
      } else {
        setUserClaims({ admin: false, pay: false, timecard: false });
        setProfileName('');
        setCurrentUserAccessStatus(null);
        setUserTechLevel(null);
      }
      setIsInitializing(false);
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
      // Standard worker sign in
      await signInWithEmailAndPassword(auth, targetEmail, password);
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
  if (isInitializing || loading) {
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

  // Intercept for Welcome / Pending Approval Page (Waiting Room) - Public route
  const isPathWelcome = currentPath === '/welcome' || currentPath === '/pending-approval';
  if (isPathWelcome) {
    return <WaitingRoomPage />;
  }

  // Intercept for Secure Automated Onboarding Page (Phase 3)
  if (isOnboarding) {
    return (
      <OnboardingPage 
        inviteId={inviteId || ''} 
        onComplete={() => {
          setIsOnboarding(false);
          setInviteId(null);
          window.location.href = '/welcome';
        }} 
      />
    );
  }

  // Strict Guarding on Admin Portal (Central Router Root Guard)
  // If we are evaluating the 'admin' portal namespace, check if user lacks Admin claim OR isn't Active.
  // Instantly blocks standard technicians and redirects them to the Waiting Room.
  const isSeekingAdmin = hostDomain === 'admin';
  const hasAdminRights = userClaims.admin || 
                         user?.email?.toLowerCase() === 'discountelectrician@gmail.com' ||
                         userTechLevel === 'Master' ||
                         userTechLevel === 'Owner';
  const isProfileActive = currentUserAccessStatus === 'Active';

  if (user && isSeekingAdmin && (!hasAdminRights || !isProfileActive)) {
    if (currentPath !== '/welcome' && currentPath !== '/pending-approval') {
      window.history.pushState({}, '', '/welcome');
      setTimeout(() => {
        setCurrentPath('/welcome');
      }, 0);
    }
    return <WaitingRoomPage />;
  }

  // Enforcement Checks: If user is logged in on a subdomain and is not Active, deny and show WaitingForApprovalPage
  if (user && hostDomain !== 'admin' && currentUserAccessStatus !== 'Active') {
    return (
      <WaitingForApprovalPage 
        accessStatus={currentUserAccessStatus || 'Pending'} 
        userEmail={user.email || ''} 
        userName={profileName} 
      />
    );
  }

  // Active Subdomain Apps routing
  if (user && hostDomain === 'pay' && currentUserAccessStatus === 'Active') {
    return <PaySubdomainPortal user={user} profileName={profileName} />;
  }

  if (user && hostDomain === 'timecard' && currentUserAccessStatus === 'Active') {
    return <TimecardSubdomainPortal user={user} profileName={profileName} />;
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
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                Discount Electrical
              </h2>
              <p className="text-xs text-slate-550 font-mono font-bold uppercase tracking-widest text-[#4F46E5] bg-indigo-50/80 px-2 py-1 rounded-md inline-block">
                {hostDomain === 'pay' ? 'Worker Payments Portal' : hostDomain === 'timecard' ? 'Technician Timecards Gate' : 'Central Administrative Gate'}
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
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm tracking-tight rounded-xl shadow-lg hover:shadow-indigo-100 transition duration-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
              >
                {isRegistering ? 'Already in registry? Sign In' : 'Register a new employee profile'}
              </button>
            </div>

          </div>
        </main>
      ) : (
        /* PORTAL AUTHENTICATED ACCESS STATE (Default / Admin console) */
        <main className="flex-1 max-w-7xl w-full mx-auto px-1.5 sm:px-6 lg:px-8 pt-8 pb-24 md:pb-8 space-y-8">
          
          {/* Render Core Component tab */}
          {activeTab === 'telemetry' ? (
            <TelemetryDashboard />
          ) : activeTab === 'seo_heatmap' ? (
            <SEOHeatmap />
          ) : activeTab === 'permissions' ? (
            <PermissionsManager />
          ) : activeTab === 'payment' ? (
            <PaymentSettings />
          ) : activeTab === 'lead_recovery' ? (
            <LeadRecovery />
          ) : activeTab === 'migration' ? (
            <MigrationUtility />
          ) : (
            <QuoRoutingConfig />
          )}

        </main>
      )}

    </div>
  );
}
