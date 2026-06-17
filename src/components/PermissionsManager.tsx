/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserClaims } from '../types';
import { 
  ShieldAlert, 
  Check, 
  UserPlus, 
  Users, 
  RefreshCw, 
  Lock, 
  Layers, 
  CreditCard, 
  Clock, 
  ShieldCheck,
  Calendar,
  DollarSign,
  Briefcase,
  Phone,
  Home,
  FileText,
  Edit,
  UserCheck,
  UserX
} from 'lucide-react';
import AddEmployeeModal from './AddEmployeeModal';
import EditEmployeeModal from './EditEmployeeModal';

export default function PermissionsManager() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const selectedUser = users.find(u => u.uid === selectedUserId) || null;

  // Subscribe to /users collection
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const loadedUsers: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedUsers.push({
          uid: docSnap.id,
          email: data.email || '',
          displayName: data.displayName || 'Anonymous User',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          claims: data.claims || { admin: false, pay: false, timecard: false },
          employeeProfile: data.employeeProfile
        });
      });
      setUsers(loadedUsers);
      
      // Auto-select first user if none is selected
      setSelectedUserId((currentId) => {
        if (loadedUsers.length > 0 && !currentId) {
          return loadedUsers[0].uid;
        }
        return currentId;
      });
      setLoading(false);
    }, (error) => {
      console.error("Error reading users permissions list:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Toggle a single permission claim
  const handleToggleClaim = async (claimKey: keyof UserClaims) => {
    if (!selectedUser) return;
    setIsUpdating(true);

    try {
      const updatedClaims = {
        ...selectedUser.claims,
        [claimKey]: !selectedUser.claims[claimKey]
      };

      const userDocRef = doc(db, 'users', selectedUser.uid);
      await updateDoc(userDocRef, {
        claims: updatedClaims,
        updatedAt: serverTimestamp()
      });
      
    } catch (err: any) {
      console.error(err);
      alert(`Claim Update Failed via Firebase Rules:\n${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div id="permissions_manager_view" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* COLUMN 1 & 2: User Profiles Directory List */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Compact Title bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 text-slate-800">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold font-sans">Multi-Subdomain Identity Repository</h2>
          </div>
          
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition shadow-md hover:shadow border-none cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Employee</span>
          </button>
        </div>

        {/* Directory Table Grid */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-150 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Active Subdomain Users Directory</h3>
            <span className="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full font-mono font-bold leading-none">{users.length} Registered</span>
          </div>

          {/* Desktop view: Table (hide on mobile) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Employee Name</th>
                  <th className="px-5 py-3">Auth Email</th>
                  <th className="px-5 py-3 text-center">Admin Claim</th>
                  <th className="px-5 py-3 text-center">Pay Claim</th>
                  <th className="px-5 py-3 text-center">Timecard Claim</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 font-mono text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-350" />
                      Loading users list...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 font-sans text-slate-500 bg-slate-50 text-xs">
                      No users in directory. Click <strong className="font-bold underline cursor-pointer text-indigo-600 hover:text-indigo-700" onClick={() => setIsAddModalOpen(true)}>"Add New Employee"</strong> to onboard a new technician shift member!
                    </td>
                  </tr>
                ) : (
                  users.map((usr) => {
                    const isTerminated = usr.employeeProfile?.status === 'Terminated';
                    return (
                      <tr 
                        key={usr.uid} 
                        onClick={() => setSelectedUserId(usr.uid)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedUserId === usr.uid ? 'bg-indigo-50/40 border-l-2 border-l-indigo-600' : ''}`}
                      >
                        <td className="px-5 py-3.5 font-semibold text-slate-800 font-sans">
                          <div className="flex items-center space-x-2">
                            <span className={isTerminated ? 'text-slate-400 line-through' : ''}>
                              {usr.displayName}
                            </span>
                            {isTerminated && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-red-100 text-red-750 text-red-700 border border-red-200">
                                LF-TERMINATED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`px-5 py-3.5 font-mono text-slate-500 text-[11px] ${isTerminated ? 'text-slate-400' : ''}`}>
                          {usr.email}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono leading-none ${usr.claims.admin ? 'bg-purple-100 text-purple-700 font-bold border border-purple-200' : 'bg-slate-100 text-slate-400'}`}>
                            {usr.claims.admin ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono leading-none ${usr.claims.pay ? 'bg-sky-100 text-sky-700 font-bold border border-sky-200' : 'bg-slate-100 text-slate-400'}`}>
                            {usr.claims.pay ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono leading-none ${usr.claims.timecard ? 'bg-teal-100 text-teal-700 font-bold border border-teal-200' : 'bg-slate-100 text-slate-400'}`}>
                            {usr.claims.timecard ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(usr);
                              setIsEditModalOpen(true);
                            }}
                            className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border-none transition cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit Profile</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Employee Cards view (block md:hidden) */}
          <div className="block md:hidden">
            {loading ? (
              <div className="text-center py-12 font-mono text-slate-400 p-4 bg-white">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-350" />
                Loading users list...
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 font-sans text-slate-500 bg-slate-50 text-xs p-4 bg-white">
                No users in directory. Click <strong className="font-bold underline cursor-pointer text-indigo-600 hover:text-indigo-700" onClick={() => setIsAddModalOpen(true)}>"Add New Employee"</strong> to onboard a new technician shift member!
              </div>
            ) : (
              <div className="p-4 space-y-4 bg-slate-50/50 border-t border-slate-100">
                {users.map((usr) => {
                  const isTerminated = usr.employeeProfile?.status === 'Terminated';
                  const techRole = usr.employeeProfile?.techLevel || 'Apprentice';
                  
                  return (
                    <div 
                      key={usr.uid} 
                      onClick={() => setSelectedUserId(usr.uid)}
                      className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-550 flex flex-col active:scale-[0.99] select-none ${selectedUserId === usr.uid ? 'ring-2 ring-indigo-600 border-transparent bg-indigo-50/10 shadow-md' : 'border-slate-200'}`}
                    >
                      {/* Card Content Header */}
                      <div className="p-4 flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          {/* Name */}
                          <div className="font-bold text-slate-800 text-sm truncate flex items-center gap-1.5 flex-wrap">
                            <span className={isTerminated ? 'text-slate-400 line-through' : ''}>
                              {usr.displayName}
                            </span>
                          </div>
                          {/* Email info */}
                          <div className="text-xs text-slate-500 font-mono truncate">{usr.email}</div>
                          
                          {/* Tech Level classification badge */}
                          <div className="pt-2 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wide">
                              {techRole}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex-shrink-0">
                          {isTerminated ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-red-100 text-red-750 text-red-700 border border-red-200 uppercase tracking-wider">
                              Terminated
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Access claims displays */}
                      <div className="px-4 pb-4 grid grid-cols-3 gap-2 border-b border-slate-100">
                        <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-150">
                          <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-0.5 font-sans">Admin</span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono leading-none ${usr.claims.admin ? 'bg-purple-100 text-purple-700 font-bold border border-purple-200' : 'bg-slate-100 text-slate-400'}`}>
                            {usr.claims.admin ? 'YES' : 'NO'}
                          </span>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-150">
                          <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-0.5 font-sans">Pay</span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono leading-none ${usr.claims.pay ? 'bg-sky-100 text-sky-700 font-bold border border-sky-200' : 'bg-slate-100 text-slate-400'}`}>
                            {usr.claims.pay ? 'YES' : 'NO'}
                          </span>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-150">
                          <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-0.5 font-sans">Timecard</span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono leading-none ${usr.claims.timecard ? 'bg-teal-100 text-teal-700 font-bold border border-teal-200' : 'bg-slate-100 text-slate-400'}`}>
                            {usr.claims.timecard ? 'YES' : 'NO'}
                          </span>
                        </div>
                      </div>

                      {/* Full-width Edit button at the bottom of the card */}
                      <div className="p-3 bg-slate-50" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(usr);
                            setIsEditModalOpen(true);
                          }}
                          className="w-full inline-flex items-center justify-center space-x-2 text-sm font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-4 py-3 h-12 min-h-[48px] rounded-xl transition cursor-pointer active:scale-[0.98] shadow-sm font-sans"
                        >
                          <Edit className="w-4 h-4 text-indigo-600" />
                          <span>Edit Profile</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* COLUMN 3: Select Claims Toggling Control Panel */}
      <div className="lg:col-span-1 space-y-6">
        
        {/* Custom claims customiser panel */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <div className="bg-slate-900 px-5 py-4 text-white">
            <h3 className="text-sm font-semibold tracking-wider uppercase flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Claims Customiser</span>
            </h3>
          </div>

          {selectedUser ? (
            <div className="p-5 space-y-6 font-sans">
              
              {/* Profile Details and extended HR record */}
              <div className="space-y-3 pb-5 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Workspace Target</span>
                
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 flex items-center justify-center">
                    {selectedUser.employeeProfile?.photoUrl ? (
                      <img 
                        src={selectedUser.employeeProfile.photoUrl} 
                        alt={selectedUser.displayName} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Users className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-805 leading-tight">{selectedUser.displayName}</h4>
                    <div className="text-xs font-mono text-slate-500 truncate mt-0.5">{selectedUser.email}</div>
                  </div>
                </div>

                {selectedUser.employeeProfile && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-2.5 text-xs text-slate-600 font-sans">
                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>Onboarding HR Record</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${selectedUser.employeeProfile.status === 'Terminated' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                        {selectedUser.employeeProfile.status || 'Active'}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">Hire Date</span>
                        <span className="font-semibold text-slate-705">{selectedUser.employeeProfile.hireDate}</span>
                      </div>
                    </div>

                    {selectedUser.employeeProfile.status === 'Terminated' && selectedUser.employeeProfile.terminationDate && (
                      <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-lg border border-red-150 text-red-800">
                        <Calendar className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <div>
                          <span className="text-[10px] text-red-500 block font-normal uppercase">Termination Date</span>
                          <span className="font-semibold">{selectedUser.employeeProfile.terminationDate}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">Hourly Pay Rate</span>
                        <span className="font-semibold text-slate-705">${selectedUser.employeeProfile.payRate.toFixed(2)} / hr</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">Tech Classification</span>
                        <span className="font-semibold text-slate-705 inline-flex items-center bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-mono leading-none border border-indigo-100">
                          {selectedUser.employeeProfile.techLevel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">Cell Contact</span>
                        <span className="font-semibold text-slate-750">{selectedUser.employeeProfile.cellPhone}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Home className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">Home Residence</span>
                        <span className="font-normal text-slate-700 leading-tight block">{selectedUser.employeeProfile.homeAddress}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">Driver's License</span>
                        <span className="font-mono font-semibold text-slate-705">{selectedUser.employeeProfile.driversLicense}</span>
                      </div>
                    </div>

                    {selectedUser.employeeProfile.ext && Object.keys(selectedUser.employeeProfile.ext).length > 0 && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Extended System Metadata</span>
                        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-500">
                          <div>Audit Status: <span className="text-emerald-600 font-bold">Passed</span></div>
                          <div className="truncate" title={selectedUser.employeeProfile.ext.onboardedBy || 'System'}>Created By: {selectedUser.employeeProfile.ext.onboardedBy || 'System'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-[10px] font-mono text-slate-400">UID: {selectedUser.uid}</div>
              </div>

              {/* Toggles */}
              <div className="space-y-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Custom Claims Assignments</span>
                
                {/* ADMIN CLAIM */}
                <div className="flex items-start justify-between p-3 rounded-lg border border-slate-200 hover:border-purple-300 bg-slate-50 transition-all">
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-xs font-bold text-slate-800">Admin Portal Scope</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                      Allows full access to this administrator framework and telemetry charts.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer mt-1">
                    <input 
                      type="checkbox" 
                      checked={selectedUser.claims.admin} 
                      onChange={() => handleToggleClaim('admin')}
                      disabled={isUpdating}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-purple-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {/* PAY CLAIM */}
                <div className="flex items-start justify-between p-3 rounded-lg border border-slate-200 hover:border-sky-300 bg-slate-50 transition-all">
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                      <span className="text-xs font-bold text-slate-800">Payments Scope (pay.)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                      Allows client authentication on payments.discountelectricalservice.com.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer mt-1">
                    <input 
                      type="checkbox" 
                      checked={selectedUser.claims.pay} 
                      onChange={() => handleToggleClaim('pay')}
                      disabled={isUpdating}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-sky-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>

                {/* TIMECARD CLAIM */}
                <div className="flex items-start justify-between p-3 rounded-lg border border-slate-200 hover:border-teal-300 bg-slate-50 transition-all">
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      <span className="text-xs font-bold text-slate-800">Timecards Scope (timecard.)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                      Grants access to technicians clock-in suite on timecard.discountelectricalservice.com.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer mt-1">
                    <input 
                      type="checkbox" 
                      checked={selectedUser.claims.timecard} 
                      onChange={() => handleToggleClaim('timecard')}
                      disabled={isUpdating}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-teal-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                  </label>
                </div>

              </div>

              {/* Claims details footer */}
              <div className="pt-2 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                <span>Ref: users/{selectedUser.uid}</span>
                {isUpdating ? (
                  <span className="flex items-center text-indigo-500">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin mr-1" />
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center text-emerald-500">
                    <Check className="w-3 h-3 mr-0.5 font-bold" />
                    Synced
                  </span>
                )}
              </div>

            </div>
          ) : (
            <div className="p-8 text-center text-xs font-serif text-slate-450 bg-slate-50 leading-relaxed font-sans">
              Select an employee from the directory to review and customize their security claims assignments.
            </div>
          )}

        </div>

        {/* Security Warning card */}
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-250 text-amber-800">
          <div className="flex items-center space-x-2 text-amber-600 mb-1.5 font-sans">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Hardened Security Guard</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Standard technicians cannot modify their own permissions in Firestore. Only users matching the <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[9px]">admin</code> custom claim or bootstrapped email are authorized to write permissions to this directory.
          </p>
        </div>

      </div>

      {/* Employee Onboarding Overlay Modal */}
      <AddEmployeeModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={() => setSelectedUserId(null)} 
      />

      {/* Employee Edit Profile Lifecycle Modal */}
      <EditEmployeeModal 
        isOpen={isEditModalOpen} 
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingUser(null);
        }} 
        onSuccess={() => {
          setSelectedUserId(editingUser?.uid || null);
        }} 
        user={editingUser}
      />

    </div>
  );
}
