import { corsHeaders } from '../src/utils/cors.js';
import { db } from '../src/firebase.js';
import { collection, addDoc, doc, setDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

export default async function handler(req: any, res: any) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const data = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    let mappedData: any = {};

    // Check if it's already in the new format by looking for schedule object
    if (data.schedule && data.type) {
      mappedData = {
        id: data.id || null,
        customerId: data.customerId || null,
        worksiteId: data.worksiteId || null,
        leadUserId: data.leadUserId || null,
        crewUserIds: Array.isArray(data.crewUserIds) ? data.crewUserIds : [],
        type: data.type,
        schedule: data.schedule,
        details: data.details || {},
        legacyColor: data.legacyColor || undefined,
        legacyCrewNames: Array.isArray(data.legacyCrewNames) ? data.legacyCrewNames : undefined,
        legacyData: data.legacyData || undefined,
        legacyId: data.legacyId || null
      };
    } else {
      // Legacy mapping
      mappedData.id = data.id || null;
      mappedData.customerId = data['Customer'] || data.customerId || null;
      mappedData.worksiteId = data['Worksite'] || data.worksiteId || null;
      
      const leadName = data['Lead'] || data.leadUserId || null;
      const crewNamesInput = data['Crew'] || data.crewUserIds;
      const crewNames = Array.isArray(crewNamesInput) ? crewNamesInput : (crewNamesInput ? [crewNamesInput] : []);
      
      let leadUserId = null;
      let crewUserIds: string[] = [];
      let legacyCrewNames: string[] = [];

      try {
        const employeesRef = collection(db, 'employees');
        
        if (leadName) {
          const q = query(employeesRef, where('name', '==', leadName));
          const qs = await getDocs(q);
          if (!qs.empty) {
            leadUserId = qs.docs[0].id;
          } else {
            legacyCrewNames.push(leadName);
          }
        }

        for (const cName of crewNames) {
          const q = query(employeesRef, where('name', '==', cName));
          const qs = await getDocs(q);
          if (!qs.empty) {
            crewUserIds.push(qs.docs[0].id);
          } else {
            legacyCrewNames.push(cName);
          }
        }
      } catch (err) {
        console.error('Error looking up employees:', err);
      }

      mappedData.leadUserId = leadUserId;
      mappedData.crewUserIds = crewUserIds;
      mappedData.legacyCrewNames = legacyCrewNames.length > 0 ? legacyCrewNames : undefined;

      let type = data['Appointment Type'] || data.type || 'Internal';
      if (data['Task']) {
         type = 'Internal';
      }
      if (!['Estimate', 'Job', 'Warranty', 'Internal'].includes(type)) {
         type = 'Internal'; // Default or fallback mapping
      }
      mappedData.type = type;

      mappedData.schedule = {
        startTime: data['Start Time'] || data.startTime || null,
        endTime: data['End Time'] || data.endTime || null
      };

      mappedData.details = {
        amount: data['Amount'] || data.amount || null,
        description: data['Description'] || data.description || '',
        notes: data['Notes'] || data.notes || '',
        callTranscript: data['Call Transcript'] || data.callTranscript || ''
      };

      if (data['Background Color'] || data.backgroundColor) {
        mappedData.legacyColor = data['Background Color'] || data.backgroundColor;
      }

      mappedData.legacyId = data['ID'] !== undefined ? String(data['ID']) : (data.legacyId || null);
      
      if (!mappedData.customerId && !mappedData.worksiteId) {
        // Missing links, add legacyData
        mappedData.legacyData = {
           name: data['Customer Name'] || data.customerName || '',
           address: data['Address'] || data.address || ''
        };
      }
    }

    if (!mappedData.type || !mappedData.schedule) {
      return res.status(400).json({ error: 'type and schedule are required' });
    }

    const finalRecord: any = {
      type: mappedData.type,
      schedule: mappedData.schedule,
      updatedAt: serverTimestamp()
    };
    
    if (mappedData.customerId !== undefined && mappedData.customerId !== null) finalRecord.customerId = mappedData.customerId;
    if (mappedData.worksiteId !== undefined && mappedData.worksiteId !== null) finalRecord.worksiteId = mappedData.worksiteId;
    if (mappedData.leadUserId !== undefined && mappedData.leadUserId !== null) finalRecord.leadUserId = mappedData.leadUserId;
    if (mappedData.crewUserIds) finalRecord.crewUserIds = mappedData.crewUserIds;
    if (mappedData.details) finalRecord.details = mappedData.details;
    if (mappedData.legacyColor !== undefined) finalRecord.legacyColor = mappedData.legacyColor;
    if (mappedData.legacyCrewNames !== undefined) finalRecord.legacyCrewNames = mappedData.legacyCrewNames;
    if (mappedData.legacyData !== undefined) finalRecord.legacyData = mappedData.legacyData;
    if (mappedData.legacyId !== undefined && mappedData.legacyId !== null) finalRecord.legacyId = mappedData.legacyId;

    let docRef;
    let appointmentId = mappedData.id;
    if (appointmentId) {
      docRef = doc(db, 'appointments', appointmentId);
      await setDoc(docRef, { ...finalRecord, createdAt: finalRecord.createdAt || serverTimestamp() }, { merge: true });
    } else {
      finalRecord.createdAt = serverTimestamp();
      docRef = await addDoc(collection(db, 'appointments'), finalRecord);
      appointmentId = docRef.id;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Appointment saved securely',
      id: appointmentId 
    });

  } catch (error: any) {
    console.error('Appointment API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

