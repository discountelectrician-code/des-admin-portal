import { corsHeaders } from '../src/utils/cors.js';
import { db } from '../src/firebase.js';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default async function handler(req: any, res: any) {
  // CORS Headers
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
    let worksiteData: any = null;

    if (data.name) {
       // Already in new format
       mappedData = {
         id: data.id,
         name: data.name,
         company: data.company || null,
         contact: data.contact || {},
         integrationKeys: data.integrationKeys || {},
         customerSince: data.customerSince || serverTimestamp(),
         legacyId: data.legacyId || null
       };
    } else {
       // Legacy mapping
       const firstName = data['First Name'] || data.firstName || '';
       const lastName = data['Last Name'] || data.lastName || '';
       mappedData.name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Name';
       mappedData.company = data.company || data['Company'] || null;
       
       mappedData.contact = {
         mobile: data['Mobile Number'] || data.phone || null,
         home: data['Home Number'] || null,
         work: data['Work Number'] || null,
         email: data['Email'] || data.email || null,
         additionalEmails: []
       };

       mappedData.integrationKeys = {
         stripeId: data['Stripe-Id'] || data.stripeId || null,
         quoId: data['OpenphoneId'] || data.openphoneId || data.quoId || null
       };

       mappedData.legacyId = data['ID'] !== undefined ? String(data['ID']) : (data.legacyId || null);
       mappedData.id = data.id || null;
       mappedData.customerSince = data.customerSince || serverTimestamp();

       const jobStreet = data['Job Street'] || data.address || null;
       const jobCity = data['Job City'] || null;
       
       if (jobStreet || jobCity) {
         worksiteData = {
           street: jobStreet || '',
           city: jobCity || '',
           createdAt: serverTimestamp()
         };
       }
    }

    if (typeof mappedData.name !== 'string' || !mappedData.name.trim()) {
      return res.status(400).json({ error: 'name is required and must be a string' });
    }

    const finalRecord: any = {
      name: mappedData.name,
      updatedAt: serverTimestamp()
    };
    if (mappedData.company !== undefined) finalRecord.company = mappedData.company;
    if (mappedData.contact) finalRecord.contact = mappedData.contact;
    if (mappedData.integrationKeys) finalRecord.integrationKeys = mappedData.integrationKeys;
    if (mappedData.customerSince) finalRecord.customerSince = mappedData.customerSince;
    if (mappedData.legacyId) finalRecord.legacyId = mappedData.legacyId;

    let docRef;
    let customerId = mappedData.id;
    if (customerId) {
      docRef = doc(db, 'customers', customerId);
      await setDoc(docRef, { ...finalRecord, createdAt: finalRecord.createdAt || serverTimestamp() }, { merge: true });
    } else {
      finalRecord.createdAt = serverTimestamp();
      docRef = await addDoc(collection(db, 'customers'), finalRecord);
      customerId = docRef.id;
    }

    if (worksiteData) {
       worksiteData.customerId = customerId;
       await addDoc(collection(db, 'worksites'), worksiteData);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Customer saved securely',
      id: customerId 
    });

  } catch (error: any) {
    console.error('Customer API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

