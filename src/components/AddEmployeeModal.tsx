/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, firebaseConfig, auth as primaryAuth } from '../firebase';
import { EmployeeProfile, UserClaims } from '../types';
import { 
  X, 
  User, 
  Mail, 
  Lock, 
  Calendar, 
  DollarSign, 
  Briefcase, 
  Home, 
  Phone, 
  FileText, 
  Camera, 
  Shield, 
  Check, 
  Loader2, 
  Plus, 
  AlertCircle 
} from 'lucide-react';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Sandbox Secondary Firebase App to create user logins without terminating the Admin's active session
const getSecondaryAuth = () => {
  const secondaryAppName = 'SecondaryEmployeeCreator';
  let secondaryApp;
  if (getApps().some(app => app.name === secondaryAppName)) {
    secondaryApp = getApp(secondaryAppName);
  } else {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }
  return getAuth(secondaryApp);
};

export default function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
  // Form values
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // HR onboarding details
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payRate, setPayRate] = useState('');
  const [techLevel, setTechLevel] = useState<'Apprentice' | 'Journeyman' | 'LLE' | 'Master'>('Apprentice');
  const [homeAddress, setHomeAddress] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [driversLicense, setDriversLicense] = useState('');
  
  // Custom Claims Checkboxes (admin, pay, timecard)
  const [claims, setClaims] = useState<UserClaims>({
    admin: false,
    pay: false,
    timecard: true // default for field operations
  });

  // Profile Picture Upload State
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  // Operational state flags
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle image selected
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleToggleClaim = (claimKey: keyof UserClaims) => {
    setClaims(prev => ({
      ...prev,
      [claimKey]: !prev[claimKey]
    }));
  };

  // Process Onboarding Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!fullName.trim() || !email.trim() || !password || !payRate || !cellPhone || !driversLicense) {
      setErrorMsg('Please populate all mandatory fields before completing onboarding.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Temporary password must be at least 6 characters in length.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setUploadProgress('Uploading employee credentials...');

    let photoUrl = '';

    try {
      // 1. If profile picture exists, perform real Firebase Storage upload
      if (photoFile) {
        setUploadProgress('Saving profile avatar to cloud storage...');
        const uniqueId = Date.now() + '_' + photoFile.name.replace(/\s+/g, '_');
        const storageRef = ref(storage, `employee_photos/${uniqueId}`);
        const uploadResult = await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(uploadResult.ref);
      } else {
        // Fallback default avatar generator URL if admin didn't submit an image
        photoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`;
      }

      // 2. Initialize secondary auth channel to execute signup securely
      setUploadProgress('Creating employee authentication record...');
      const secondaryAuth = getSecondaryAuth();
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newEmployeeUser = userCredential.user;

      // Update their display profile in Firebase Auth
      await updateProfile(newEmployeeUser, {
        displayName: fullName,
        photoURL: photoUrl
      });

      // 3. Construct extensible profile document complying perfectly with schemas
      setUploadProgress('Synchronizing user records & claim validations...');
      const userDocRef = doc(db, 'users', newEmployeeUser.uid);
      
      const onboardingPayload = {
        uid: newEmployeeUser.uid,
        email: email.toLowerCase().trim(),
        displayName: fullName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        claims: {
          admin: claims.admin,
          pay: claims.pay,
          timecard: claims.timecard
        },
        employeeProfile: {
          hireDate: hireDate,
          payRate: parseFloat(payRate),
          techLevel: techLevel,
          homeAddress: homeAddress.trim(),
          cellPhone: cellPhone.trim(),
          driversLicense: driversLicense.trim(),
          photoUrl: photoUrl,
          // Highly structured & extensible payload block for fast future field expansions
          ext: {
            onboardedBy: primaryAuth.currentUser?.email || 'System Onboarding Framework',
            lastAuditCheck: new Date().toISOString(),
            certifications: [],
            emergencyContacts: []
          }
        }
      };

      await setDoc(userDocRef, onboardingPayload);

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
          message: `Onboarded new employee user: ${fullName} (${email.toLowerCase().trim()}) with initial claims: Admin=${claims.admin}, Pay=${claims.pay}, Timecard=${claims.timecard}`,
          status: 'success',
          details: JSON.stringify({
            onboardedUid: newEmployeeUser.uid,
            claimsGranted: claims,
            hireDate,
            payRate: parseFloat(payRate)
          })
        });
      } catch (logErr) {
        console.warn("Could not write telemetry audit event:", logErr);
      }

      // 5. Instantly log out of the secondary auth sandbox so it stays clear and empty
      await signOut(secondaryAuth);

      alert(`Successfully onboarded ${fullName}! Account initialized in Auth & Firestore profiles saved.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Employee onboarding error:", err);
      setErrorMsg(err.message || 'An unknown error occurred during deployment.');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto sm:p-4 p-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
      <form 
        onSubmit={handleSubmit}
        id="add_employee_modal_box" 
        className="relative w-full max-w-2xl bg-white sm:border sm:border-slate-200 sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-auto max-h-[100vh] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Header Header */}
        <div className="sticky top-0 bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-md">
          <div className="flex items-center space-x-2.5">
            <Plus className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base font-sans">Onboard Employee</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-5">
          
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-850 text-red-800 rounded-xl flex items-start space-x-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="font-semibold">{errorMsg}</p>
            </div>
          )}

          {/* Subheading Overview */}
          <div className="text-xs text-slate-500 font-sans leading-relaxed">
            Enter essential electrical technician credentials and HR records below. Completing this form creates an active client auth login while synchronizing their real-time profile and claim rules into Firestore.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-5">
            
            {/* Full Name */}
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
                placeholder="e.g. Michael Thompson"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Email Address */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Mail className="w-3.5 h-3.5 text-indigo-505" />
                <span>Auth Email Address <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. thompson@discountelectrical.com"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Temporary Password */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Lock className="w-3.5 h-3.5 text-indigo-505" />
                <span>Temporary Auth Password <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Hire Date */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-505" />
                <span>Onboarding Hire Date</span>
              </label>
              <input 
                type="date"
                required
                value={hireDate}
                onChange={e => setHireDate(e.target.value)}
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Pay Rate */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <DollarSign className="w-3.5 h-3.5 text-indigo-550" />
                <span>Onboarding Pay Rate ($ / hr) <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="number"
                step="0.01"
                required
                value={payRate}
                onChange={e => setPayRate(e.target.value)}
                placeholder="e.g. 45.50"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

            {/* Tech Level */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Briefcase className="w-3.5 h-3.5 text-indigo-550" />
                <span>Electrician Tech Level</span>
              </label>
              <select 
                value={techLevel}
                onChange={e => setTechLevel(e.target.value as any)}
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm cursor-pointer"
              >
                <option value="Apprentice">Apprentice</option>
                <option value="Journeyman">Journeyman</option>
                <option value="LLE">LLE (Licensed Limited Electrician)</option>
                <option value="Master">Master Electrician</option>
              </select>
            </div>

            {/* Home Address */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Home className="w-3.5 h-3.5 text-indigo-550" />
                <span>Home Residence Address</span>
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

            {/* Cell Phone */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-indigo-550" />
                <span>Cell Phone Contact <span className="text-red-500">*</span></span>
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

            {/* Drivers License */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5 text-indigo-550" />
                <span>Driver's License Information <span className="text-red-500">*</span></span>
              </label>
              <input 
                type="text"
                required
                value={driversLicense}
                onChange={e => setDriversLicense(e.target.value)}
                placeholder="e.g. TN DL-992-10-441-A"
                className="w-full text-sm text-slate-800 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 h-12 min-h-[48px] outline-none transition font-sans shadow-sm"
              />
            </div>

          </div>

          {/* Picture Upload Flow */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-600" />
              <span>Security Profile Picture</span>
            </label>
            
            <div className="flex items-center space-x-4">
              <div id="image_upload_preview" className="w-16 h-16 bg-slate-200 border border-slate-350 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt="Avatar Upload Preview" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-800 text-slate-400" />
                )}
              </div>

              <div className="space-y-2 flex-1">
                <input 
                  type="file" 
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-3 h-12 min-h-[48px] text-xs font-bold border border-indigo-200 bg-white hover:bg-slate-50 hover:bg-indigo-50 text-indigo-700 transition rounded-xl flex items-center justify-center cursor-pointer shadow-sm select-none"
                >
                  Choose Portrait File
                </button>
                <div className="text-[10px] text-slate-500 font-sans leading-tight">
                  {photoFile ? `Selected: ${photoFile.name}` : `Supports PNG, JPG, or SVG portrait uploads (saves directly in storage)`}
                </div>
              </div>
            </div>
          </div>

          {/* Access Claims Toggles */}
          <div className="space-y-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-600" />
              <span>Assign Subdomain Access Claims</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4.5 gap-4">
              
              {/* Admin claim */}
              <button 
                type="button" 
                onClick={() => handleToggleClaim('admin')}
                className={`flex items-start justify-between p-4 border rounded-xl transition text-left focus:ring-2 focus:ring-purple-500 min-h-[58px] ${claims.admin ? 'bg-purple-50/70 border-purple-300 text-purple-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans">Admin Portal</div>
                  <p className="text-[10px] text-slate-500 font-sans leading-tight">Master administrative permissions</p>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${claims.admin ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-350'}`}>
                  {claims.admin && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
              </button>

              {/* Pay claim */}
              <button 
                type="button" 
                onClick={() => handleToggleClaim('pay')}
                className={`flex items-start justify-between p-4 border rounded-xl transition text-left focus:ring-2 focus:ring-sky-500 min-h-[58px] ${claims.pay ? 'bg-sky-50/70 border-sky-300 text-sky-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans">Payments (pay)</div>
                  <p className="text-[10px] text-slate-500 font-sans leading-tight">Billing and financial authorization</p>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${claims.pay ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-350'}`}>
                  {claims.pay && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
              </button>

              {/* Timecard claim */}
              <button 
                type="button" 
                onClick={() => handleToggleClaim('timecard')}
                className={`flex items-start justify-between p-4 border rounded-xl transition text-left focus:ring-2 focus:ring-teal-500 min-h-[58px] ${claims.timecard ? 'bg-teal-50/70 border-teal-300 text-teal-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans">Timecards</div>
                  <p className="text-[10px] text-slate-500 font-sans leading-tight">Log shift clocks & job tasks</p>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${claims.timecard ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-350'}`}>
                  {claims.timecard && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
              </button>

            </div>
          </div>

        </div>

        {/* Sticky Fixed Footer Actions */}
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
              className="flex-1 sm:flex-none px-5 py-3 h-12 min-h-[48px] text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 select-none cursor-pointer border border-slate-200 flex items-center justify-center"
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
                  <span>Deploying...</span>
                </>
              ) : (
                <span>Complete Onboarding</span>
              )}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
