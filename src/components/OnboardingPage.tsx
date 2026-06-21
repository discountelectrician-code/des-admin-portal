import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  updateProfile 
} from 'firebase/auth';
import { db, auth } from '../firebase';
import { 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle, 
  User, 
  Mail, 
  Lock, 
  LockOpen,
  Chrome, 
  Briefcase, 
  DollarSign, 
  Calendar,
  AlertTriangle 
} from 'lucide-react';

interface OnboardingPageProps {
  inviteId: string;
  onComplete: () => void;
}

export default function OnboardingPage({ inviteId, onComplete }: OnboardingPageProps) {
  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState<any | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sign up fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    async function validateInvite() {
      try {
        setLoading(true);
        setValidationError(null);

        if (!inviteId) {
          setValidationError('Onboarding invite identifier is missing.');
          setLoading(false);
          return;
        }

        const inviteRef = doc(db, 'invites', inviteId);
        const inviteSnap = await getDoc(inviteRef);

        if (!inviteSnap.exists()) {
          setValidationError('The requested onboarding invitation was not found in our registries.');
          setLoading(false);
          return;
        }

        const data = inviteSnap.data();

        // 1. Check if claimed
        if (data.status === 'claimed') {
          window.location.href = '/welcome';
          return;
        }

        // 2. Check 48 hour expiration (48 * 60 * 60 * 1000 = 172,800,000 ms)
        const createdAt = data.createdAt ? data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt) : null;
        if (createdAt) {
          const expirationTime = createdAt.getTime() + 172800000;
          if (Date.now() > expirationTime) {
            setValidationError('This secure invitation link expired after the 48-hour deadline.');
            setLoading(false);
            return;
          }
        }

        setInviteData(data);
        setEmail(data.email || '');
      } catch (err: any) {
        console.error('[Onboard Verification] Failed:', err);
        setValidationError(`Failed to parse invitation details: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    validateInvite();
  }, [inviteId]);

  // Handle building the official user document & claiming the ticket
  const finalizeUserOnboarding = async (userRecord: any, userEmail: string) => {
    try {
      // 1. Claim the invite
      const inviteRef = doc(db, 'invites', inviteId);
      await updateDoc(inviteRef, {
        status: 'claimed',
        claimedAt: serverTimestamp(),
        claimedByUid: userRecord.uid
      });

      // 2. Provision the database entity in /users
      const userDocRef = doc(db, 'users', userRecord.uid);
      
      const onboardingPayload = {
        uid: userRecord.uid,
        email: userEmail.toLowerCase().trim(),
        displayName: inviteData.name || userRecord.displayName || 'Technician',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        claims: inviteData.claims || {
          admin: false,
          pay: false,
          timecard: true // fallback default
        },
        employeeProfile: {
          hireDate: inviteData.hireDate || new Date().toISOString().split('T')[0],
          payRate: parseFloat(inviteData.payRate || '0'),
          techLevel: inviteData.role || 'Apprentice',
          homeAddress: inviteData.homeAddress || '',
          cellPhone: inviteData.cellPhone || '',
          driversLicense: inviteData.driversLicense || '',
          photoUrl: inviteData.photoUrl || userRecord.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(inviteData.name)}`,
          ext: {
            onboardedBy: inviteData.ext?.onboardedBy || 'Invitation Framework',
            lastAuditCheck: new Date().toISOString(),
            certifications: [],
            emergencyContacts: []
          }
        }
      };

      await setDoc(userDocRef, onboardingPayload);

      // Log success tracking event
      try {
        const eventId = "log_" + Date.now();
        await setDoc(doc(db, 'tracking_events', eventId), {
          id: eventId,
          timestamp: serverTimestamp(),
          eventType: 'auth',
          subdomain: 'admin',
          userId: userRecord.uid,
          userEmail: userEmail,
          message: `Technician self-onboard claimed successfully for: ${inviteData.name} - Assigned claims: ${JSON.stringify(inviteData.claims || {})}`,
          status: 'success'
        });
      } catch (logErr) {
        console.warn('Logging alert failed:', logErr);
      }

      // Redirect strictly to the public waiting room page
      window.location.href = '/welcome';
    } catch (err: any) {
      console.error('[Onboard Finalize] Failed to write database entries:', err);
      setAuthError(`Authentication was successful, but database profile creation failed: ${err.message}`);
    }
  };

  // Sign up with Locked Email & Password
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (password.length < 6) {
      setAuthError('Your chosen secure password must be at least 6 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setAuthError('The passwords specified do not match each other.');
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update Auth record's display name
      await updateProfile(userCredential.user, {
        displayName: inviteData.name,
        photoURL: inviteData.photoUrl || null
      });

      await finalizeUserOnboarding(userCredential.user, email);
    } catch (err: any) {
      console.error('[Email Onboard Error] Sign up failure:', err);
      setAuthError(err.message || 'Failed creating user authentication token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign up with Google Auth Popup
  const handleGoogleSignUp = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      // Ensure the logged in Google Email matches the invited Email to prevent claiming with different emails
      const targetEmail = googleUser.email || '';
      console.log(`[Google Auth Claims Match] Verified email: ${targetEmail}`);

      await finalizeUserOnboarding(googleUser, targetEmail || email || inviteData.email);
    } catch (err: any) {
      console.error('[Google Onboard Error] Sign up failure:', err);
      setAuthError(err.message || 'Google Auth Popup closed or cancelled by worker.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans selection:bg-indigo-500">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto text-indigo-400" />
          <p className="text-sm text-slate-400 font-mono tracking-wide">Evaluating secure invitation signatures...</p>
        </div>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white font-sans selection:bg-indigo-500">
        <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-in fade-in duration-350">
          <div className="mx-auto w-16 h-16 bg-rose-500/10 text-rose-400 flex items-center justify-center rounded-2xl border border-rose-500/20 shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">Onboarding Link Expired</h2>
            <p className="text-xs text-rose-400 font-medium font-sans leading-relaxed bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
              {validationError}
            </p>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Please contact the office administrator to dispatch a fresh invitation ticket link to your technician email registry.
          </p>

          <button
            onClick={() => window.location.href = '/'}
            className="w-full py-3 h-12 bg-slate-805 hover:bg-slate-800 text-slate-300 font-bold text-xs tracking-tight rounded-xl border border-slate-800 transition duration-300 cursor-pointer"
          >
            Go to Main Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex items-center justify-center p-4 sm:p-6 selection:bg-indigo-500">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in duration-350">
        
        {/* Profile Card Header */}
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-20 h-20 rounded-full overflow-hidden border-2 border-indigo-500 bg-slate-800 flex items-center justify-center shadow-lg">
            {inviteData.photoUrl ? (
              <img 
                src={inviteData.photoUrl} 
                alt={inviteData.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-10 h-10 text-slate-400" />
            )}
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-400 block font-mono">Workspace Activation</span>
            <h2 className="text-xl font-extrabold tracking-tight">{inviteData.name}</h2>
            <p className="text-xs text-slate-400">Discount Electrical Team Member</p>
          </div>
        </div>

        {authError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs rounded-xl flex gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Action Panel: Credentials Form or Social Register */}
        <div className="space-y-5">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleGoogleSignUp}
            className="w-full h-12 flex items-center justify-center space-x-2.5 rounded-xl text-xs font-bold bg-white text-slate-900 hover:bg-slate-50 border-none transition duration-200 cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
          >
            <Chrome className="w-4 h-4" />
            <span>Accept with Google Authentication</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Or create login password</span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          <form onSubmit={handleEmailSignUp} className="space-y-4">
            
            {/* Preferred Email Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-indigo-400 font-mono tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                <span>Preferred Email Address</span>
              </label>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your preferred email (e.g. michael@example.com)"
                className="w-full text-xs font-mono text-slate-200 bg-slate-900 border border-slate-850 hover:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 outline-none transition"
              />
            </div>

            {/* Choose password */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-indigo-400 font-mono tracking-wider flex items-center gap-1.5">
                <LockOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>Select New Login Password</span>
              </label>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Choose a password (Min 6 chars)"
                className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-850 hover:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 outline-none transition font-sans"
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-indigo-400 font-mono tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Confirm Secret Password</span>
              </label>
              <input 
                type="password" 
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full text-xs text-slate-200 bg-slate-900 border border-slate-850 hover:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 outline-none transition font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg border-none hover:shadow transition duration-200 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>Onboarding...</span>
                </>
              ) : (
                <span>Complete Account Setup</span>
              )}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed text-center font-sans">
          This secure link can only be used once and automatically claims the onboarding profile for security reasons.
        </p>

      </div>
    </div>
  );
}
