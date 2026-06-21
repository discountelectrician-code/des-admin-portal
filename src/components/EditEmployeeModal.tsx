/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { db, auth as primaryAuth } from '../firebase';
import { UserProfile, EmployeeProfile, UserClaims } from '../types';
import { sendActivationSms } from '../utils/sms';
import { formatDate, formatPhoneNumber } from '../utils/format';
import { 
  X, 
  User, 
  Calendar, 
  DollarSign, 
  Briefcase, 
  Home, 
  Phone, 
  FileText, 
  ShieldAlert, 
  Check, 
  Loader2, 
  AlertCircle, 
  UserCheck, 
  UserX,
  Shield,
  Trash2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Key
} from 'lucide-react';

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserProfile | null;
}

export default function EditEmployeeModal({ isOpen, onClose, onSuccess, user }: EditEmployeeModalProps) {
  const isMasterAdmin = !!user && (user.email?.toLowerCase() === 'discountelectrician@gmail.com' || (user.employeeProfile?.techLevel as string) === 'Master' || user.employeeProfile?.techLevel === 'Owner');

  // Field values
  const [fullName, setFullName] = useState('');
  const [payRate, setPayRate] = useState('');
  const [techLevel, setTechLevel] = useState<'Helper' | 'Journeyman' | 'Lead' | 'General Manager' | 'Office' | 'Owner'>('Helper');
  const [homeAddress, setHomeAddress] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [driversLicense, setDriversLicense] = useState('');
  const [dlState, setDlState] = useState('TN');
  
  // Status and Termination
  const [status, setStatus] = useState<'Active' | 'Terminated'>('Active');
  const [terminationDate, setTerminationDate] = useState('');
  const [accessStatus, setAccessStatus] = useState<'Pending' | 'Active' | 'Restricted'>('Pending');

  // Access toggle claims inside edit modal for total administrator lifecycle control
  const [claims, setClaims] = useState<UserClaims>({
    admin: false,
    pay: false,
    timecard: false
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password Update State
  const [newPassword, setNewPassword] = useState('');
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [passwordStatusMsg, setPasswordStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Pre-populate fields when selected user changes
  useEffect(() => {
    if (user) {
      setFullName(user.displayName || '');
      setClaims({
        admin: user.claims?.admin || false,
        pay: user.claims?.pay || false,
        timecard: user.claims?.timecard || false
      });
      
      if (user.employeeProfile) {
        setPayRate(user.employeeProfile.payRate?.toString() || '');
        setTechLevel((user.employeeProfile.techLevel as any) || 'Helper');
        setHomeAddress(user.employeeProfile.homeAddress || '');
        setCellPhone(user.employeeProfile.cellPhone || '');
        setDriversLicense(user.employeeProfile.driversLicense || '');
        setDlState(user.employeeProfile.dlState || 'TN');
        setStatus(user.employeeProfile.status || 'Active');
        setTerminationDate(user.employeeProfile.terminationDate || '');
        setAccessStatus(user.accessStatus || user.employeeProfile.accessStatus || 'Pending');
      } else {
        setPayRate('');
        setTechLevel('Helper');
        setHomeAddress('');
        setCellPhone('');
        setDriversLicense('');
        setDlState('TN');
        setStatus('Active');
        setTerminationDate('');
        setAccessStatus(user.accessStatus || 'Pending');
      }
      setErrorMsg(null);
      setNewPassword('');
      setShowModalPassword(false);
      setPasswordStatusMsg(null);
      setIsSendingReset(false);
      setIsUpdatingPassword(false);
    }
  }, [user, isOpen]);

  // Set default termination date to today if toggled to Terminated and is empty
  useEffect(() => {
    if (status === 'Terminated' && !terminationDate) {
      setTerminationDate(new Date().toISOString().split('T')[0]);
    }
  }, [status]);

  if (!isOpen || !user) return null;

  const handleToggleClaim = (claimKey: keyof UserClaims) => {
    if (status === 'Terminated') {
      // Prompt lockout rule: Claims are globally deactivated if Terminated
      return;
    }
    setClaims(prev => ({
      ...prev,
      [claimKey]: !prev[claimKey]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!fullName.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }

    if (status === 'Terminated' && !terminationDate) {
      setErrorMsg('Termination Date is required when status is Terminated.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      // Determine final claim configuration
      // Lockout Logic: Toggling Account Status to Terminated sets all claims to false
      const finalClaims = status === 'Terminated' 
        ? { admin: false, pay: false, timecard: false } 
        : claims;

      if (user.isInvite) {
        const inviteRef = doc(db, 'invites', user.uid);
        await updateDoc(inviteRef, {
          name: fullName.trim(),
          claims: finalClaims,
          role: techLevel, // Classification
          payRate: parseFloat(payRate) || 0,
          homeAddress: homeAddress.trim(),
          cellPhone: cellPhone.trim(),
          driversLicense: driversLicense.trim(),
          dlState: dlState,
          status: 'pending',
          ext: {
            ...(user.employeeProfile?.ext || {}),
            updatedBy: primaryAuth.currentUser?.email || 'Admin Support',
            lastEditedAt: new Date().toISOString()
          }
        });
      } else {
        const userRef = doc(db, 'users', user.uid);
        
        // Construct up-to-date employee profile matching blueprint exactly
        const updatedProfile: EmployeeProfile = {
          hireDate: user.employeeProfile?.hireDate || new Date().toISOString().split('T')[0],
          payRate: parseFloat(payRate) || 0,
          techLevel: techLevel,
          homeAddress: homeAddress.trim(),
          cellPhone: cellPhone.trim(),
          driversLicense: driversLicense.trim(),
          dlState: dlState,
          photoUrl: user.employeeProfile?.photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`,
          status: status,
          terminationDate: status === 'Terminated' ? terminationDate : '',
          accessStatus: accessStatus,
          ext: {
            ...(user.employeeProfile?.ext || {}),
            updatedBy: primaryAuth.currentUser?.email || 'Admin Support',
            lastEditedAt: new Date().toISOString()
          }
        };

        await updateDoc(userRef, {
          displayName: fullName.trim(),
          claims: finalClaims,
          accessStatus: accessStatus,
          employeeProfile: updatedProfile,
          updatedAt: serverTimestamp()
        });

        // Toggling Access Status 'on' (Active) must trigger a final activation SMS via Quo API
        const originalAccessStatus = user.accessStatus || user.employeeProfile?.accessStatus || 'Pending';
        if (accessStatus === 'Active' && originalAccessStatus !== 'Active') {
          const techName = fullName.trim();
          const techPhone = cellPhone.trim() || user.employeeProfile?.cellPhone || '';
          const appLink = 'admin.discountelectricalservice.com';
          console.log(`[Access Status Change] Toggled on 'Active'. Dispatching Quo activation SMS to ${techName} (${techPhone})...`);
          await sendActivationSms(techName, techPhone, appLink);
        }
      }

      // Dispatch Telemetry events to sync log trails
      try {
        const eventId = "log_edit_" + Date.now();
        await setDoc(doc(db, 'tracking_events', eventId), {
          id: eventId,
          timestamp: serverTimestamp(),
          eventType: 'auth',
          subdomain: 'admin',
          userId: primaryAuth.currentUser?.uid || 'system_onboard',
          userEmail: primaryAuth.currentUser?.email || 'admin@discountelectrical.com',
          message: `Edited Employee profile: ${fullName.trim()} (${user.isInvite ? 'Invite' : user.email}). Status=${status}. AccessStatus=${accessStatus}. Claims overridden to Admin=${finalClaims.admin}, Pay=${finalClaims.pay}, Timecard=${finalClaims.timecard}`,
          status: status === 'Terminated' ? 'warning' : 'info',
          details: JSON.stringify({
            targetUid: user.uid,
            status,
            accessStatus,
            terminationDate: status === 'Terminated' ? terminationDate : 'N/A',
            claimsGranted: finalClaims
          })
        });
      } catch (logErr) {
        console.warn("Could not log profile edit activity:", logErr);
      }

      alert(`Successfully saved updates to employee: ${fullName}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error saving employee updates:", err);
      setErrorMsg(err.message || 'An unexpected error occurred during database commit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    
    const confirmed = window.confirm('Are you sure? This action cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const userRef = doc(db, user.isInvite ? 'invites' : 'users', user.uid);
      await deleteDoc(userRef);

      // Dispatch Telemetry events to sync log trails
      try {
        const eventId = "log_delete_" + Date.now();
        await setDoc(doc(db, 'tracking_events', eventId), {
          id: eventId,
          timestamp: serverTimestamp(),
          eventType: 'auth',
          subdomain: 'admin',
          userId: primaryAuth.currentUser?.uid || 'system_onboard',
          userEmail: primaryAuth.currentUser?.email || 'admin@discountelectrical.com',
          message: `Deleted Employee profile: ${fullName.trim()} (${user.email})`,
          status: 'warning',
          details: JSON.stringify({
            targetUid: user.uid,
            displayName: fullName.trim(),
            email: user.email
          })
        });
      } catch (logErr) {
        console.warn("Could not log profile delete activity:", logErr);
      }

      alert(`Successfully deleted employee: ${fullName}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error deleting employee:", err);
      setErrorMsg(err.message || 'An unexpected error occurred during database deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto sm:p-4 p-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
      <form 
        onSubmit={handleSubmit}
        id="edit_employee_modal_box" 
        className="relative w-full max-w-2xl bg-white sm:border sm:border-slate-200 sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-auto max-h-[100vh] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Header Header */}
        <div className="sticky top-0 bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-md">
          <div className="flex items-center space-x-2.5">
            <User className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base font-sans">Edit Profile</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-5">
          
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-850 text-red-800 rounded-xl flex items-start space-x-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="font-semibold">{errorMsg}</p>
            </div>
          )}

          {/* Core Info Display */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center space-x-4 shadow-sm">
            <div className="w-14 h-14 rounded-full overflow-hidden border border-slate-300 bg-slate-200 flex-shrink-0 flex items-center justify-center shadow-inner">
              {user.employeeProfile?.photoUrl ? (
                <img 
                  src={user.employeeProfile.photoUrl} 
                  alt={fullName} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-7 h-7 text-slate-400" />
              )}
            </div>
            <div>
              <div className="font-bold text-slate-800 text-sm">{fullName}</div>
              <div className="text-xs font-mono text-slate-500">{user.email}</div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {user.uid}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-5">
            
            {/* Full Name / Display Name */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-indigo-505" />
                <span>Full Name <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Michael Thompson"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Tech Level Classification */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Briefcase className="w-3.5 h-3.5 text-indigo-550" />
                <span>Tech Classification Level</span>
              </label>
              <select 
                value={techLevel}
                onChange={e => setTechLevel(e.target.value as any)}
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm cursor-pointer"
              >
                <option value="Helper">Helper</option>
                <option value="Journeyman">Journeyman</option>
                <option value="Lead">Lead</option>
                <option value="General Manager">General Manager</option>
                <option value="Office">Office</option>
                <option value="Owner">Owner</option>
              </select>
            </div>

            {/* Pay Rate */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <DollarSign className="w-3.5 h-3.5 text-indigo-550" />
                <span>Hourly Pay Rate ($ / hr) <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="number"
                step="0.01"
                required
                value={payRate}
                onChange={e => setPayRate(e.target.value)}
                placeholder="e.g. 48.00"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Cell Phone */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-indigo-550" />
                <span>Cell Phone Contact <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="tel"
                required
                value={cellPhone ? formatPhoneNumber(cellPhone) : ''}
                onChange={e => setCellPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. (615) 555-0199"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Residence Address */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Home className="w-3.5 h-3.5 text-indigo-550" />
                <span>Residence Address</span>
              </label>
              <input 
                type="text"
                required
                value={homeAddress}
                onChange={e => setHomeAddress(e.target.value)}
                placeholder="e.g. 1762 Electricity Blvd, Nashville, TN 37211"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Driver's License */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5 text-indigo-550" />
                <span>Driver's License Information <span className="text-red-500">*</span></span>
              </label>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <select
                    value={dlState}
                    onChange={e => setDlState(e.target.value)}
                    className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm cursor-pointer"
                  >
                    {['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
                      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 
                      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 
                      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 
                      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'].map(state => (
                        <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <input 
                    type="text"
                    required
                    value={driversLicense}
                    onChange={e => setDriversLicense(e.target.value)}
                    placeholder="e.g. DL-992-10-441-A"
                    className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Hire Date */}
            <div className="space-y-2 opacity-75">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Original Hire Date (Onboarding)</span>
              </label>
              <input 
                type="text"
                readOnly
                disabled
                value={formatDate(user.employeeProfile?.hireDate)}
                className="w-full text-sm text-slate-650 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none font-sans cursor-not-allowed select-none shadow-sm"
              />
            </div>

          </div>

          {/* Account Status / Lifecycle Termination controls */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Employee Lifecycle & Account Status</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status Picker (Active vs Terminated) */}
              <div className="space-y-2">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block font-sans">Current Status</span>
                <div className="flex bg-white rounded-xl p-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setStatus('Active')}
                    className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 h-12 min-h-[48px] rounded-xl text-xs font-bold transition-all ${status === 'Active' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 bg-transparent border-none'}`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Active Member</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('Terminated')}
                    className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 h-12 min-h-[48px] rounded-xl text-xs font-bold transition-all ${status === 'Terminated' ? 'bg-red-650 bg-red-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 bg-transparent border-none'}`}
                  >
                    <UserX className="w-4 h-4" />
                    <span>Terminated</span>
                  </button>
                </div>
              </div>

              {/* Termination Date picker */}
              <div className={`space-y-2 transition-all duration-300 ${status === 'Terminated' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <label className="text-[11px] text-slate-550 font-bold uppercase tracking-wider block font-sans">Termination Effective Date</label>
                <input 
                  type="date"
                  disabled={status === 'Active'}
                  value={terminationDate}
                  onChange={e => setTerminationDate(e.target.value)}
                  className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
                />
              </div>
            </div>

            {status === 'Terminated' && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-850 text-red-850 text-red-800 rounded-xl flex items-start space-x-2.5 text-xs font-sans leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="font-bold">Active Lockout Revocation Rule:</strong> Saving this profile with a status of <span className="font-bold uppercase">Terminated</span> will immediately overwrite and wipe all custom claim tokens (Admin, Pay, Timecard) as false in Firestore. This instantly blocks access to all services.
                </div>
              </div>
            )}

            {/* Access Status Toggle */}
            <div className="space-y-2 pt-3 border-t border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-500" />
                <span>Access Status Control</span>
              </span>
              <p className="text-[10px] text-slate-500 pb-1 leading-relaxed font-sans">
                Assign technician status in the central registry. Toggling this 'on' (Active) automatically alerts the technician via welcome SMS. Restricted status immediately blocks access.
              </p>
              <div className="flex bg-white rounded-xl p-1 border border-slate-200 max-w-md shadow-xs">
                <button
                  type="button"
                  onClick={() => setAccessStatus('Pending')}
                  className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 h-10 rounded-lg text-xs font-bold transition-all cursor-pointer ${accessStatus === 'Pending' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 bg-transparent border-none'}`}
                >
                  <span className={`w-2 h-2 rounded-full border ${accessStatus === 'Pending' ? 'bg-white border-white' : 'bg-amber-500 border-amber-600'}`}></span>
                  <span>Pending</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessStatus('Active')}
                  className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 h-10 rounded-lg text-xs font-bold transition-all cursor-pointer ${accessStatus === 'Active' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 bg-transparent border-none'}`}
                >
                  <span className={`w-2 h-2 rounded-full border ${accessStatus === 'Active' ? 'bg-white border-white' : 'bg-emerald-500 border-emerald-600'}`}></span>
                  <span>Active</span>
                </button>
                {!isMasterAdmin && (
                  <button
                    type="button"
                    onClick={() => setAccessStatus('Restricted')}
                    className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 h-10 rounded-lg text-xs font-bold transition-all cursor-pointer ${accessStatus === 'Restricted' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 bg-transparent border-none'}`}
                  >
                    <span className={`w-2 h-2 rounded-full border ${accessStatus === 'Restricted' ? 'bg-white border-white' : 'bg-rose-500 border-rose-600'}`}></span>
                    <span>Restricted</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Password Security Administration Block */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Password Security & Administration</span>
            </span>

            {user.isInvite ? (
              <div className="space-y-2 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 font-sans leading-relaxed">
                <span className="font-bold block text-amber-900 mb-0.5">Credential Configuration Pending</span>
                Password credentials and secure resets cannot be configured because this technician is still in the pending onboarding status. Once they click their SMS invitation link and register, complete password administration will be unlocked.
              </div>
            ) : user.uid === primaryAuth.currentUser?.uid ? (
              // Editing OWN password
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  You are editing your own employee account profile. Enter a new password below to update your security credentials.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  <div className="relative flex-1">
                    <input 
                      type={showModalPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min. 6 chars)"
                      className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-4 pr-10 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalPassword(!showModalPassword)}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors p-1 flex items-center justify-center cursor-pointer border-none bg-transparent"
                      title={showModalPassword ? "Hide password" : "Show password"}
                    >
                      {showModalPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={isUpdatingPassword || newPassword.length < 6}
                    onClick={async () => {
                      setIsUpdatingPassword(true);
                      setPasswordStatusMsg(null);
                      try {
                        await updatePassword(primaryAuth.currentUser!, newPassword);
                        setPasswordStatusMsg({ type: 'success', text: 'Password successfully updated!' });
                        setNewPassword('');
                        
                        // Dispatch Telemetry events to sync log trails
                        try {
                          const eventId = "log_pw_" + Date.now();
                          await setDoc(doc(db, 'tracking_events', eventId), {
                            id: eventId,
                            timestamp: serverTimestamp(),
                            eventType: 'auth',
                            subdomain: 'admin',
                            userId: primaryAuth.currentUser?.uid,
                            userEmail: primaryAuth.currentUser?.email,
                            message: `User updated their own password successfully`,
                            status: 'info',
                            details: JSON.stringify({ uid: user.uid })
                          });
                        } catch (logErr) {
                          console.warn("Could not log password update activity:", logErr);
                        }
                      } catch (err: any) {
                        console.error(err);
                        setPasswordStatusMsg({ type: 'error', text: err.message || 'Failed to update password.' });
                      } finally {
                        setIsUpdatingPassword(false);
                      }
                    }}
                    className="px-5 py-3 h-12 min-h-[48px] text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer border-none"
                  >
                    {isUpdatingPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    <span>Update My Password</span>
                  </button>
                </div>
              </div>
            ) : (
              // Editing ANOTHER employee's password (as admin)
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  To maintain system compliance and user security, you can send an official security reset email directly to <strong className="font-semibold text-slate-700">{user.email}</strong> to let them pick a new secure password.
                </p>
                <button
                  type="button"
                  disabled={isSendingReset}
                  onClick={async () => {
                    setIsSendingReset(true);
                    setPasswordStatusMsg(null);
                    try {
                      await sendPasswordResetEmail(primaryAuth, user.email);
                      setPasswordStatusMsg({ 
                        type: 'success', 
                        text: `Reset verification email sent to ${user.email}!` 
                      });
                      
                      // Dispatch Telemetry events to sync log trails
                      try {
                        const eventId = "log_pw_reset_" + Date.now();
                        await setDoc(doc(db, 'tracking_events', eventId), {
                          id: eventId,
                          timestamp: serverTimestamp(),
                          eventType: 'auth',
                          subdomain: 'admin',
                          userId: primaryAuth.currentUser?.uid,
                          userEmail: primaryAuth.currentUser?.email,
                          message: `Admin requested a password reset link for ${user.displayName} (${user.email})`,
                          status: 'info',
                          details: JSON.stringify({ targetUid: user.uid })
                        });
                      } catch (logErr) {
                        console.warn("Could not log password reset activity:", logErr);
                      }
                    } catch (err: any) {
                      console.error(err);
                      setPasswordStatusMsg({ type: 'error', text: err.message || 'Failed to trigger reset email.' });
                    } finally {
                      setIsSendingReset(false);
                    }
                  }}
                  className="px-5 py-2.5 bg-slate-250 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
                >
                  <Mail className="w-4 h-4" />
                  <span>{isSendingReset ? 'Sending reset link...' : 'Send Password Reset Link'}</span>
                </button>
              </div>
            )}

            {passwordStatusMsg && (
              <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                passwordStatusMsg.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-red-50 border-red-200 text-red-850 text-red-800'
              }`}>
                {passwordStatusMsg.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{passwordStatusMsg.text}</span>
              </div>
            )}
          </div>

          {/* Access Claims Toggles inside Edit Modal */}
          <div className={`space-y-4 transition-opacity duration-300 ${status === 'Terminated' ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-600" />
              <span>Assign Subdomain Access Claims</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Admin claim */}
              <button 
                type="button" 
                disabled={status === 'Terminated'}
                onClick={() => handleToggleClaim('admin')}
                className={`flex items-start justify-between p-4 border rounded-xl transition text-left focus:ring-2 focus:ring-purple-500 min-h-[58px] ${claims.admin && status === 'Active' ? 'bg-purple-50/70 border-purple-300 text-purple-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans">Admin Portal</div>
                  <p className="text-[10px] text-slate-500 font-sans leading-tight">Master administrative permissions</p>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${claims.admin && status === 'Active' ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-350'}`}>
                  {claims.admin && status === 'Active' && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
              </button>

              {/* Pay claim */}
              <button 
                type="button" 
                disabled={status === 'Terminated'}
                onClick={() => handleToggleClaim('pay')}
                className={`flex items-start justify-between p-4 border rounded-xl transition text-left focus:ring-2 focus:ring-sky-500 min-h-[58px] ${claims.pay && status === 'Active' ? 'bg-sky-50/70 border-sky-300 text-sky-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans">Payments (pay)</div>
                  <p className="text-[10px] text-slate-500 font-sans leading-tight">Billing and financial authorization</p>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${claims.pay && status === 'Active' ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-350'}`}>
                  {claims.pay && status === 'Active' && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
              </button>

              {/* Timecard claim */}
              <button 
                type="button" 
                disabled={status === 'Terminated'}
                onClick={() => handleToggleClaim('timecard')}
                className={`flex items-start justify-between p-4 border rounded-xl transition text-left focus:ring-2 focus:ring-teal-500 min-h-[58px] ${claims.timecard && status === 'Active' ? 'bg-teal-50/70 border-teal-300 text-teal-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans">Timecards</div>
                  <p className="text-[10px] text-slate-500 font-sans leading-tight">Log shift clocks & job tasks</p>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${claims.timecard && status === 'Active' ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-350'}`}>
                  {claims.timecard && status === 'Active' && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
              </button>

            </div>
          </div>

        </div>

        {/* Sticky Fixed Footer Actions */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 z-20 shadow-2xl">
          <div className="text-xs text-slate-500 font-sans text-center sm:text-left select-none">
            {isSaving ? (
              <span className="flex items-center text-indigo-600 animate-pulse font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Committing to database...
              </span>
            ) : isDeleting ? (
              <span className="flex items-center text-red-600 animate-pulse font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Removing employee records...
              </span>
            ) : (
              <span>Fields marked with <span className="text-red-500 font-sans">*</span> are required.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            {!isMasterAdmin && (
              <>
                <button 
                  type="button" 
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className="flex-1 sm:flex-none px-5 py-3 h-12 min-h-[48px] text-[11px] sm:text-xs font-bold text-red-650 text-red-600 hover:text-red-700 hover:bg-red-50 bg-white border border-red-200 hover:border-red-300 rounded-xl transition disabled:opacity-50 select-none cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                  ) : (
                    <Trash2 className="w-4 h-4 text-red-500" />
                  )}
                  <span>Delete Employee</span>
                </button>

                <div className="hidden sm:block h-6 w-px bg-slate-200" />
              </>
            )}

            <button 
              type="button" 
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="flex-1 sm:flex-none px-5 py-3 h-12 min-h-[48px] text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 select-none cursor-pointer border border-slate-200 flex items-center justify-center"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving || isDeleting}
              className="flex-1 sm:flex-none px-6 py-3 h-12 min-h-[48px] text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-md hover:shadow flex items-center justify-center disabled:opacity-50 select-none cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Commit Changes</span>
              )}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
