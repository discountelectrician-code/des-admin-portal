/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  CreditCard, 
  CheckCircle, 
  AlertCircle, 
  Save, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw 
} from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export default function PaymentSettings() {
  const [provider, setProvider] = useState<'stripe' | 'square'>('stripe');
  const [dbProvider, setDbProvider] = useState<'stripe' | 'square' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [squareAppId, setSquareAppId] = useState('');
  const [squareAccessToken, setSquareAccessToken] = useState('');
  const [squareLocationId, setSquareLocationId] = useState('');

  const [hasStripeSecretKey, setHasStripeSecretKey] = useState(false);
  const [hasSquareAppId, setHasSquareAppId] = useState(false);
  const [hasSquareAccessToken, setHasSquareAccessToken] = useState(false);
  const [hasSquareLocationId, setHasSquareLocationId] = useState(false);

  // Firestore error handler following standard integration guidelines
  function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  // Fetch central claims and existing payment_config
  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      setErrorMessage(null);
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        setLoading(false);
        return;
      }

      // 1. Check if user is chief admin or has admin claims
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setIsAdmin(userData.claims?.admin === true || currentUser.email === 'discountelectrician@gmail.com');
        } else if (currentUser.email === 'discountelectrician@gmail.com') {
          setIsAdmin(true);
        }
      } catch (err) {
        console.warn("Could not load user claims profile:", err);
        if (currentUser.email === 'discountelectrician@gmail.com') {
          setIsAdmin(true);
        }
      }

      // 2. Fetch payment setting config
      const docPath = 'settings/payment_config';
      try {
        const configDocRef = doc(db, 'settings', 'payment_config');
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.provider === 'stripe' || data.provider === 'square') {
            setProvider(data.provider);
            setDbProvider(data.provider);
          }
          setHasStripeSecretKey(!!data.stripeSecretKey);
          setHasSquareAppId(!!data.squareAppId);
          setHasSquareAccessToken(!!data.squareAccessToken);
          setHasSquareLocationId(!!data.squareLocationId);

          if (data.stripeSecretKey) setStripeSecretKey(data.stripeSecretKey);
          if (data.squareAppId) setSquareAppId(data.squareAppId);
          if (data.squareAccessToken) setSquareAccessToken(data.squareAccessToken);
          if (data.squareLocationId) setSquareLocationId(data.squareLocationId);
        }
      } catch (err) {
        // Log in compliant error details format but do not crash the view for unauthorized readers
        console.info("Info loading payment config schema: User may not have loaded database defaults yet.", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Submit and save configuration options to Firestore
  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setErrorMessage(null);

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMessage("Please log in to manage administrative portal settings.");
      setSaving(false);
      return;
    }

    const docPath = 'settings/payment_config';
    try {
      const configDocRef = doc(db, 'settings', 'payment_config');
      
      const payload: any = {
        provider: provider,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email || currentUser.uid
      };

      if (stripeSecretKey.trim()) {
        payload.stripeSecretKey = stripeSecretKey.trim();
      }
      if (squareAppId.trim()) {
        payload.squareAppId = squareAppId.trim();
      }
      if (squareAccessToken.trim()) {
        payload.squareAccessToken = squareAccessToken.trim();
      }
      if (squareLocationId.trim()) {
        payload.squareLocationId = squareLocationId.trim();
      }

      await setDoc(configDocRef, payload, { merge: true });

      setDbProvider(provider);
      if (stripeSecretKey.trim()) setHasStripeSecretKey(true);
      if (squareAppId.trim()) setHasSquareAppId(true);
      if (squareAccessToken.trim()) setHasSquareAccessToken(true);
      if (squareLocationId.trim()) setHasSquareLocationId(true);

      // Clear fields after saving to prevent re-display
      setStripeSecretKey('');
      setSquareAppId('');
      setSquareAccessToken('');
      setSquareLocationId('');

      setSuccess(true);
      
      // Auto-hide success badge after 4 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 4000);

    } catch (err: any) {
      // Throw formatted error compliant with standard Firestore Integration Skill guidelines
      try {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      } catch (formattedErr: any) {
        let msg = "Database Access Denied by Security Rules.";
        if (err.message && err.message.includes("permission-denied")) {
          msg = "Security Rules Violation: You must possess custom 'admin' claims to edit the payment gateway configuration.";
        } else {
          msg = err.message || msg;
        }
        setErrorMessage(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl shadow-md p-12 flex flex-col items-center justify-center text-center">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-sm font-semibold font-mono text-slate-705">Loading system settings...</p>
        <p className="text-xs text-slate-400 mt-1">Retrieving payment provider profile</p>
      </div>
    );
  }

  return (
    <div id="payment_settings_view" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* LEFT COLUMN: Educational & Gateway Info */}
      <div className="space-y-6 lg:col-span-1">
        {/* Informative Warning box */}
        {!isAdmin && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-250 text-amber-800 flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider block font-sans">Read-Only Mode</span>
              <p className="text-[11px] leading-relaxed">
                Your account is currently in preview/read-only mode. Only users matching the <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[9px]">admin</code> security claim can save changes to this component.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Interactive Control Radio Toggles & Action */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white border border-slate-250 shadow-sm rounded-xl p-6">
          <div className="border-b border-slate-100 pb-4 mb-6 flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="font-bold text-slate-800 text-lg font-sans">Gateway Settings Panel</h3>
              <p className="text-xs text-slate-400 font-sans">Configure which external payment processor checkout forms target.</p>
            </div>
            {dbProvider && (
              <span className="text-[10px] uppercase font-mono font-bold bg-slate-900 text-cyan-400 border border-slate-800 px-2.5 py-1 rounded-lg">
                Active: {dbProvider}
              </span>
            )}
          </div>

          {/* Success messages and Alerts feedback row */}
          {success && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-250 text-emerald-800 text-xs flex items-center space-x-3 animate-fade-in">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <div>
                <span className="font-bold block font-sans">Settings Saved Successfully!</span>
                <span className="text-emerald-600">The Firestore config document was updated. Changes take effect instantly.</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-220 text-rose-800 text-xs flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block font-sans">Failed to Save Configuration</span>
                <span className="text-rose-650 leading-relaxed block">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Selective Dropdown or Radio Toggle */}
          <div className="space-y-6">
            <div>
              <label htmlFor="active-provider-select" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono mb-2">
                Active Payment Provider (Toggle)
              </label>
              <select
                id="active-provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'stripe' | 'square')}
                className="w-full max-w-xs bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg p-2.5 font-medium focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="stripe">Stripe Payments</option>
                <option value="square">Square Commerce</option>
              </select>
            </div>

            <div className="space-y-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Select Payment Provider (Visual Cards)</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* STRIPE OPTION */}
                <div 
                  onClick={() => setProvider('stripe')}
                  className={`border rounded-2xl p-5 cursor-pointer flex flex-col justify-between transition-all select-none h-44 ${
                    provider === 'stripe' 
                      ? 'border-indigo-600 bg-indigo-50/10 shadow-sm ring-1 ring-indigo-600' 
                      : 'border-slate-200 hover:border-slate-350 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="bg-slate-900 text-white p-2.5 rounded-xl font-bold tracking-tight text-xs">
                      stripe
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      provider === 'stripe' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                    }`}>
                      {provider === 'stripe' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 text-sm block">Stripe Gateway API</span>
                    <p className="text-[11px] text-slate-500 leading-normal font-sans">
                      Enable standard direct card checkouts, digital wallets (Apple/Google Pay), and international secure bank payments.
                    </p>
                  </div>
                </div>

                {/* SQUARE OPTION */}
                <div 
                  onClick={() => setProvider('square')}
                  className={`border rounded-2xl p-5 cursor-pointer flex flex-col justify-between transition-all select-none h-44 ${
                    provider === 'square' 
                      ? 'border-indigo-600 bg-indigo-50/10 shadow-sm ring-1 ring-indigo-600' 
                      : 'border-slate-200 hover:border-slate-350 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="bg-slate-900 text-white p-2.5 rounded-xl font-bold tracking-tight text-xs">
                      square
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      provider === 'square' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                    }`}>
                      {provider === 'square' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 text-sm block">Square Commerce API</span>
                    <p className="text-[11px] text-slate-500 leading-normal font-sans">
                      Integrate in-person Reader terminals, invoice billing syncs, and simple field service transaction workflows natively.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* SECURE API CREDENTIALS FORM */}
            <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono mb-2">Secure API Credentials (Unmasked Layout)</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stripe Key */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Stripe Secret Key</span>
                    {hasStripeSecretKey && (
                      <span className="text-[10px] font-semibold text-emerald-600 font-sans">✓ Configured in Firestore</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={stripeSecretKey}
                    onChange={(e) => setStripeSecretKey(e.target.value)}
                    placeholder="sk_live_..."
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-mono focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    disabled={!isAdmin}
                  />
                </div>

                {/* Square App ID */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Square Application ID</span>
                    {hasSquareAppId && (
                      <span className="text-[10px] font-semibold text-emerald-600 font-sans font-sans">✓ Configured</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={squareAppId}
                    onChange={(e) => setSquareAppId(e.target.value)}
                    placeholder="sq-app-id-..."
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-mono focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    disabled={!isAdmin}
                  />
                </div>

                {/* Square Access Token */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Square Access Token</span>
                    {hasSquareAccessToken && (
                      <span className="text-[10px] font-semibold text-emerald-600 font-sans font-sans">✓ Configured</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={squareAccessToken}
                    onChange={(e) => setSquareAccessToken(e.target.value)}
                    placeholder="EAAA..."
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-mono focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    disabled={!isAdmin}
                  />
                </div>

                {/* Square Location ID */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Square Location ID</span>
                    {hasSquareLocationId && (
                      <span className="text-[10px] font-semibold text-emerald-600 font-sans font-sans">✓ Configured</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={squareLocationId}
                    onChange={(e) => setSquareLocationId(e.target.value)}
                    placeholder="L-..."
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg p-2.5 font-mono focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
            <span className="text-[10px] text-slate-400 font-mono flex items-center mr-auto">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 mr-1.5" />
              Payload updates settings/payment_config.provider
            </span>

            <button
              onClick={handleSave}
              disabled={saving || !isAdmin}
              className={`flex items-center justify-center space-x-2 font-bold px-6 py-3 rounded-xl text-sm transition shadow-md hover:shadow-lg h-12 w-full sm:w-auto ${
                !isAdmin 
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none hover:shadow-none' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
              }`}
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
