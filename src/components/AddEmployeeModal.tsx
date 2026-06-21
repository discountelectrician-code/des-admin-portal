/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, auth as primaryAuth } from '../firebase';
import { 
  X, 
  User, 
  Phone, 
  Loader2, 
  Plus, 
  AlertCircle,
  Copy,
  CheckCircle,
  Link2
} from 'lucide-react';
import { sendOnboardingSms } from '../utils/sms';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
  // Form values
  const [fullName, setFullName] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  
  // Operational state flags
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Invitation link states
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [createdPreviewUrl, setCreatedPreviewUrl] = useState<string | null>(null);
  const [smsStatus, setSmsStatus] = useState<'idle' | 'success' | 'failed' | 'sending'>('idle');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  // Process Onboarding Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!fullName.trim() || !cellPhone.trim()) {
      setErrorMsg('Please populate both Full Name and Cell Phone.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setUploadProgress('Preparing onboarding invite ticket...');

    try {
      setUploadProgress('Creating secure onboarding invite ticket in Firestore...');
      const inviteDocRef = doc(collection(db, 'invites'));
      const inviteId = inviteDocRef.id;

      // unique URLs
      const targetUrl = `admin.discountelectricalservice.com/onboard?inviteId=${inviteId}`;
      const previewUrl = `${window.location.origin}/onboard?inviteId=${inviteId}`;

      // Construct invite payload:
      // Required: { name, cellPhone, status: 'pending', createdAt: serverTimestamp() }
      const invitePayload = {
        id: inviteId,
        name: fullName.trim(),
        cellPhone: cellPhone.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        ext: {
          onboardedBy: primaryAuth.currentUser?.email || 'System Onboarding Framework',
          lastAuditCheck: new Date().toISOString()
        }
      };

      await setDoc(inviteDocRef, invitePayload);

      // Trigger Quo SMS notification (Phase 2)
      setUploadProgress('Dispatching welcome invitation SMS via Quo API...');
      setSmsStatus('sending');
      
      const smsSuccess = await sendOnboardingSms(fullName.trim(), cellPhone.trim(), targetUrl);
      if (smsSuccess) {
        setSmsStatus('success');
      } else {
        setSmsStatus('failed');
      }

      // 4. Dispatch security event logging to the Telemetry records
      try {
        const eventId = "log_" + Date.now();
        await setDoc(doc(db, 'tracking_events', eventId), {
          id: eventId,
          timestamp: serverTimestamp(),
          eventType: 'auth',
          subdomain: 'admin',
          userId: primaryAuth.currentUser?.uid || 'system_onboard',
          userEmail: primaryAuth.currentUser?.email || 'admin@discountelectrical.com',
          message: `Onboard invite ticket created for ${fullName} (${cellPhone.trim()}). SMS dispatch status: ${smsSuccess ? 'dispatched' : 'failed'}`,
          status: 'success',
          details: JSON.stringify({
            inviteId,
            smsSuccess
          })
        });
      } catch (logErr) {
        console.warn("Could not write telemetry audit event:", logErr);
      }

      setCreatedInviteUrl(targetUrl);
      setCreatedPreviewUrl(previewUrl);
    } catch (err: any) {
      console.error("Employee onboarding error:", err);
      setErrorMsg(err.message || 'An unknown error occurred during deployment.');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleCopyLink = () => {
    if (!createdPreviewUrl) return;
    navigator.clipboard.writeText(createdPreviewUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (createdInviteUrl) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto sm:p-4 p-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
        <div id="registration_completed_splash" className="bg-slate-950 border border-slate-850 sm:rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="mx-auto w-16 h-16 bg-indigo-500/10 text-indigo-400 flex items-center justify-center rounded-2xl border border-indigo-500/20 shadow-inner">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-white text-lg font-extrabold tracking-tight">Technician Invited!</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Onboarding record initialized for <span className="font-bold text-slate-200">{fullName}</span>.
            </p>
          </div>

          {/* SMS Status Banner */}
          <div className={`p-3.5 rounded-xl border text-xs font-sans text-left flex items-start gap-2.5 ${
            smsStatus === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : smsStatus === 'failed' 
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
          }`}>
            {smsStatus === 'success' && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            {smsStatus === 'failed' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            {smsStatus === 'sending' && <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />}
            <div>
              <div className="font-bold uppercase tracking-wider text-[9px] font-mono leading-none mb-1">
                SMS Dispatch Status: {smsStatus}
              </div>
              <p className="leading-relaxed text-[11px] text-slate-300">
                {smsStatus === 'success' && `Welcome text successfully sent from Quo to ${cellPhone}.`}
                {smsStatus === 'failed' && `Failed sending text message. Please manually share the ticket URL below.`}
                {smsStatus === 'sending' && `Outbound Quo API request in progress...`}
              </p>
            </div>
          </div>

          {/* Dynamic Invite Link Container */}
          <div className="space-y-2 text-left">
            <label className="text-[10px] uppercase font-bold text-slate-450 font-mono tracking-wider flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Secret Onboarding Invitation Link</span>
            </label>
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-1">
              <input 
                type="text" 
                readOnly 
                value={createdPreviewUrl || ''}
                className="bg-transparent flex-1 outline-none text-slate-300 text-xs px-2 select-all font-mono"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 h-8 bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copiedLink ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCreatedInviteUrl(null);
              setCreatedPreviewUrl(null);
              setSmsStatus('idle');
              setFullName('');
              setCellPhone('');
              onSuccess();
              onClose();
            }}
            className="w-full py-3 bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm tracking-tight rounded-xl transition duration-350 cursor-pointer border border-slate-800"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto sm:p-4 p-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
      <form 
        onSubmit={handleSubmit}
        id="add_employee_modal_box" 
        className="relative w-full max-w-md bg-white sm:border sm:border-slate-200 sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-auto max-h-[100vh] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-md">
          <div className="flex items-center space-x-2.5">
            <Plus className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base font-sans">Add Employee</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-start space-x-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="font-semibold">{errorMsg}</p>
            </div>
          )}

          <div className="text-xs text-slate-500 font-sans leading-relaxed">
            Enter the essential electrician contact credentials below. Submitting generates a secure onboarding invitation ticket and dispatches a welcome text message via Quo API so they can set up their login credentials.
          </div>

          <div className="space-y-4">
            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Full Name <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Michael Thompson"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Cell Phone */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-indigo-500" />
                <span>Cell Phone <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="tel"
                required
                value={cellPhone}
                onChange={e => setCellPhone(e.target.value)}
                placeholder="e.g. 615-555-0199"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 z-20 shadow-2xl">
          <div className="text-xs text-slate-500 font-sans text-center sm:text-left select-none">
            {uploadProgress ? (
              <span className="flex items-center text-indigo-600 animate-pulse font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                {uploadProgress}
              </span>
            ) : (
              <span>Fields marked with <span className="text-red-500 font-sans">*</span> are required.</span>
            )}
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-5 py-3 h-12 min-h-[48px] text-xs font-bold text-slate-600 hover:text-slate-850 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 select-none cursor-pointer border border-slate-200 flex items-center justify-center"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-6 py-3 h-12 min-h-[48px] text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-md hover:shadow flex items-center justify-center disabled:opacity-50 select-none cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Send SMS Invite</span>
              )}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
