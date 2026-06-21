import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  Timestamp,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { sendLeadRecoverySms } from '../utils/sms';
import { 
  Phone, 
  Mail, 
  MessageSquare, 
  User, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  X, 
  AlertCircle,
  Clock,
  Filter,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  status: 'draft' | 'abandoned' | 'confirmed' | string;
  createdAt: any; // Timestamp or Date
  serviceDetails?: string;
  confirmedTimeslot?: string;
}

export default function LeadRecovery() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'draft' | 'abandoned' | 'no_timeslot'>('all');
  
  // Modal tracking
  const [activeSmsLead, setActiveSmsLead] = useState<Lead | null>(null);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  
  // Feedback indicator for specific leads
  const [leadFeedback, setLeadFeedback] = useState<Record<string, { status: 'success' | 'failed'; message: string }>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  useEffect(() => {
    // strictly querying the service_requests Firestore collection, filtering where status == 'draft'
    const q = query(collection(db, 'service_requests'), where('status', '==', 'draft'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Lead[] = [];
      snapshot.forEach((doc) => {
        const item = doc.data();
        data.push({
          id: doc.id,
          firstName: item.firstName || '',
          lastName: item.lastName || '',
          phoneNumber: item.phoneNumber || item.phone || '',
          email: item.email || '',
          status: item.status || 'draft',
          createdAt: item.createdAt,
          serviceDetails: item.serviceDetails || '',
          confirmedTimeslot: item.confirmedTimeslot || ''
        });
      });
      // Sort newest first
      data.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds : (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds : (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
        return timeB - timeA;
      });
      setLeads(data);
      setLoading(false);
    }, (err) => {
      console.error("Error reading lead recovery database:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [refreshTrigger]);

  // Filter criteria: display only records where booking was not finalized (draft, abandoned, or missing timeslot)
  const filteredLeads = leads.filter(lead => {
    const isFinalized = lead.status === 'confirmed' || (lead.confirmedTimeslot && lead.confirmedTimeslot.trim() !== '');
    
    // Root constraint: Must NOT be finalized
    if (isFinalized) return false;

    if (filterType === 'all') return true;
    if (filterType === 'draft') return lead.status === 'draft';
    if (filterType === 'abandoned') return lead.status === 'abandoned';
    if (filterType === 'no_timeslot') return !lead.confirmedTimeslot || lead.confirmedTimeslot.trim() === '';
    return true;
  });

  // Opens SMS Custom Message Modal
  const openSmsModal = (lead: Lead) => {
    const rawDigits = (lead.phoneNumber || '').replace(/\D/g, '');
    if (rawDigits.length < 10) return; // Prevent opening modal if phone is invalid/missing
    setActiveSmsLead(lead);
    setSmsMessage(`Hi ${lead.firstName}, this is Discount Electrical. We noticed you started a service request but didn't finish. How can we help?`);
  };

  // Dispatch SMS through robust post Quo SDK
  const handleSendSms = async () => {
    if (!activeSmsLead) return;
    setSmsSending(true);

    const targetPhone = activeSmsLead.phoneNumber;
    const key = activeSmsLead.id;

    try {
      const isSuccess = await sendLeadRecoverySms(targetPhone, smsMessage);
      if (isSuccess) {
        setLeadFeedback(prev => ({
          ...prev,
          [key]: { status: 'success', message: `SMS message dispatched successfully to +1 ${targetPhone}` }
        }));
      } else {
        setLeadFeedback(prev => ({
          ...prev,
          [key]: { status: 'failed', message: `SMS delivery failed. Verify API key and recipient number: ${targetPhone}` }
        }));
      }
    } catch (err: any) {
      setLeadFeedback(prev => ({
        ...prev,
        [key]: { status: 'failed', message: err.message || `SMS delivery failed.` }
      }));
    } finally {
      setSmsSending(false);
      setActiveSmsLead(null);
      
      // Auto-clear notification after 8 seconds
      setTimeout(() => {
        setLeadFeedback(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, 8000);
    }
  };

  const handleDeleteLead = async (id: string) => {
    console.log('Attempting to delete lead:', id);
    console.log('Targeting Firestore path:', 'service_requests/' + id);
    if (window.confirm('Are you sure you want to delete this lead?')) {
      try {
        console.log('Current Auth User Email:', auth.currentUser?.email);
        await deleteDoc(doc(db, 'service_requests', id));
        window.alert('Lead deleted successfully!');
        setRefreshTrigger(prev => !prev);
      } catch (err: any) {
        console.error('Delete failed:', err);
        window.alert('Delete failed: ' + err.message);
      }
    }
  };

  // Formats Dates beautifully
  const formatTime = (createdAt: any) => {
    if (!createdAt) return 'Unknown Time';
    let dateObj: Date;
    if (createdAt instanceof Timestamp) {
      dateObj = createdAt.toDate();
    } else if (createdAt.seconds) {
      dateObj = new Date(createdAt.seconds * 1000);
    } else if (createdAt instanceof Date) {
      dateObj = createdAt;
    } else {
      dateObj = new Date(createdAt);
    }
    return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Top action header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Abandoned Lead Recovery</h2>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider">
              Outreach Engine
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed max-w-2xl">
            Monitor unresolved bookings or dropped shopping-cart drafts from the public intake terminal. Reach out instantly to recover high-value service requests via mobile dial, email, or standard Quo API texting.
          </p>
        </div>
      </div>

      {/* Main recovery block split view */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Quick Filter Panel */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 self-start">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-300">
            <Filter className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-widest font-mono">Lead Filter</h3>
          </div>

          <div className="flex flex-col space-y-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`flex items-center justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterType === 'all' 
                  ? 'bg-amber-400/10 border border-amber-400/20 text-amber-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span>All Active Leads</span>
              <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded-md text-slate-400">
                {leads.filter(l => l.status !== 'confirmed' && !l.confirmedTimeslot).length}
              </span>
            </button>

            <button
              onClick={() => setFilterType('draft')}
              className={`flex items-center justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterType === 'draft' 
                  ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span>Drafts Only</span>
              <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded-md text-slate-400">
                {leads.filter(l => l.status === 'draft' && !l.confirmedTimeslot).length}
              </span>
            </button>

            <button
              onClick={() => setFilterType('abandoned')}
              className={`flex items-center justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterType === 'abandoned' 
                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span>Abandoned Only</span>
              <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded-md text-slate-400">
                {leads.filter(l => l.status === 'abandoned' && !l.confirmedTimeslot).length}
              </span>
            </button>

            <button
              onClick={() => setFilterType('no_timeslot')}
              className={`flex items-center justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterType === 'no_timeslot' 
                  ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span>No Confirmed Timeslot</span>
              <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded-md text-slate-400">
                {leads.filter(l => (!l.confirmedTimeslot || l.confirmedTimeslot.trim() === '') && l.status !== 'confirmed').length}
              </span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 leading-normal font-sans space-y-2">
            <p><strong>Durable Cloud Retention:</strong> Leads synchronize live from the persistent Firestore backend.</p>
            <p><strong>Recovery KPI Checklist:</strong> SMS outreach utilizes the verified <em>Quo Customer Texting Line</em> configured under communications settings.</p>
          </div>
        </div>

        {/* Lead cards grid list */}
        <div className="lg:col-span-3 space-y-4">
          
          {loading ? (
            <div className="bg-slate-900 border border-slate-800 p-12 rounded-2xl flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">Syncing recovery pipeline leads...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 p-16 rounded-2xl text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <Filter className="w-5 h-5 text-slate-500" />
              </div>
              <div className="space-y-1">
                <h4 className="text-white text-sm font-bold">No abandoned leads found</h4>
                <p className="text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
                  Excellent work! No customer requests are currently sitting in draft or abandoned state, or all leads match alternative filters.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                  Showing {filteredLeads.length} Lead Record{filteredLeads.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-3.5">
                <AnimatePresence mode="popLayout">
                  {filteredLeads.map((lead) => {
                    const feedback = leadFeedback[lead.id];
                    const rawDigits = (lead.phoneNumber || '').replace(/\D/g, '');
                    const hasValidPhone = rawDigits.length >= 10;
                    const hasValidEmail = !!(lead.email && lead.email.trim());

                    return (
                      <motion.div
                        key={lead.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition shadow-sm relative overflow-hidden"
                      >
                        
                        {/* Status chip badge */}
                        <div className="absolute right-5 top-5 flex items-center space-x-2 z-20">
                          {lead.status === 'draft' ? (
                            <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full">
                              Draft Form
                            </span>
                          ) : lead.status === 'abandoned' ? (
                            <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full">
                              Abandoned
                            </span>
                          ) : (
                            <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full">
                              No Timeslot
                            </span>
                          )}

                          <button
                            onClick={(e) => { e.stopPropagation(); alert('Click detected!'); handleDeleteLead(lead.id); }}
                            title="Dismiss Lead"
                            className="p-1 px-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:text-rose-400 rounded-lg text-slate-400 transition cursor-pointer relative z-20"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Customer profile block */}
                        <div className="flex items-start space-x-3.5">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-amber-400" />
                          </div>

                          <div className="space-y-1 pr-24">
                            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 leading-tight">
                              {lead.firstName} {lead.lastName}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 text-[11px] font-mono">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                <span>Dropped {formatTime(lead.createdAt)}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                {hasValidEmail ? (
                                  <span>{lead.email}</span>
                                ) : (
                                  <span className="text-slate-500 italic">No Email Provided</span>
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-500" />
                                {hasValidPhone ? (
                                  <span>{lead.phoneNumber}</span>
                                ) : (
                                  <span className="text-slate-500 italic">No Phone Provided</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Description details */}
                        {lead.serviceDetails && (
                          <div className="mt-3.5 bg-slate-950 p-3.5 rounded-xl border border-slate-850 text-slate-350 text-xs font-sans leading-relaxed">
                            <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Service Details Provided:</div>
                            {lead.serviceDetails}
                          </div>
                        )}

                        {/* Action notifications inside lead */}
                        {feedback && (
                          <div className={`mt-3 p-3 text-xs rounded-xl border flex items-start gap-2 ${
                            feedback.status === 'success' 
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          }`}>
                            {feedback.status === 'success' ? (
                              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-450" />
                            ) : (
                              <AlertCircle className="w-4 h-4 shrink-0 text-rose-450" />
                            )}
                            <p className="leading-tight">{feedback.message}</p>
                          </div>
                        )}

                        {/* Horizontal Actions Divider & Buttons */}
                        <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-wrap gap-2">
                          {hasValidPhone ? (
                            <a
                              href={`tel:${rawDigits}`}
                              className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-100 border border-slate-700 rounded-xl text-xs font-semibold tracking-wide transition"
                            >
                              <Phone className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Call Phone</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-800/40 text-slate-500 border border-slate-850 rounded-xl text-xs font-semibold tracking-wide opacity-50 cursor-not-allowed"
                              title="No valid phone number provided"
                            >
                              <Phone className="w-3.5 h-3.5 text-slate-600" />
                              <span>Call Phone</span>
                            </button>
                          )}

                          {hasValidEmail ? (
                            <a
                              href={`mailto:${lead.email}?subject=Discount%2520Electrical%2520Service%2520Request&body=Hi%2520${lead.firstName},%2520this%2520is%2520Discount%2520Electrical.%2520We%2520noticed%2520you%2520started%2520a%2520service%252520request...`}
                              className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-100 border border-slate-700 rounded-xl text-xs font-semibold tracking-wide transition"
                            >
                              <Mail className="w-3.5 h-3.5 text-amber-400" />
                              <span>Email Client</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-800/40 text-slate-500 border border-slate-850 rounded-xl text-xs font-semibold tracking-wide opacity-50 cursor-not-allowed"
                              title="No valid email address provided"
                            >
                              <Mail className="w-3.5 h-3.5 text-slate-600" />
                              <span>Email Client</span>
                            </button>
                          )}

                          {hasValidPhone ? (
                            <button
                              onClick={() => openSmsModal(lead)}
                              className="flex items-center gap-1 px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-350 hover:text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Quick Text (Quo)</span>
                            </button>
                          ) : (
                            <button
                              disabled
                              className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-800/40 text-slate-500 border border-slate-850 rounded-xl text-xs font-semibold tracking-wide opacity-50 cursor-not-allowed"
                              title="No valid phone number provided"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-slate-600" />
                              <span>Quick Text (Quo)</span>
                            </button>
                          )}
                        </div>

                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Quick SMS Sending Modal over dynamic backdrop */}
      <AnimatePresence>
        {activeSmsLead && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              
              <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950/80">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight font-sans">
                    Send Recover Text: {activeSmsLead.firstName} {activeSmsLead.lastName}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSmsLead(null)}
                  className="p-1 text-slate-400 hover:text-white bg-slate-800/40 rounded-lg hover:bg-slate-800 border-none cursor-pointer text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-indigo-600/5 p-3.5 rounded-xl border border-indigo-500/10 flex items-start space-x-2.5 text-xs text-indigo-300">
                  <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    This SMS will be delivered instantly to guest recipient <strong>+1 {activeSmsLead.phoneNumber}</strong> through the official synced Quo API texting line.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold font-mono text-slate-500 tracking-wider">SMS MESSAGE BODY CONTENT</label>
                  <textarea
                    rows={4}
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    className="w-full bg-slate-950 text-slate-100 text-xs font-sans rounded-xl border border-slate-800 p-3.5 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ring-offset-slate-900 leading-relaxed resize-none"
                    placeholder="Enter customized text..."
                  />
                  <div className="text-right text-[10px] text-slate-500 font-mono">
                    Characters: {smsMessage.length} | 1 Message Unit
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-end space-x-2 shadow-inner">
                <button
                  onClick={() => setActiveSmsLead(null)}
                  className="px-4 py-2 border border-slate-800 text-slate-400 text-xs font-bold rounded-xl hover:text-white hover:bg-slate-900 transition font-sans cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendSms}
                  disabled={smsSending || !smsMessage.trim()}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition font-sans cursor-pointer"
                >
                  {smsSending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending SMS...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Send Dispatch</span>
                    </>
                  )}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
