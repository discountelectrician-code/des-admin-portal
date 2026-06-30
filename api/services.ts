import { db } from '../src/firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    const docId = data.id || data['ID'] || null;
    const finalRecord = { ...data, updatedAt: serverTimestamp(), createdAt: data.createdAt || serverTimestamp() };
    
    let docRef;
    let serviceId = docId;
    if (serviceId) {
      docRef = doc(db, 'services', serviceId);
      await setDoc(docRef, finalRecord, { merge: true });
    } else {
      docRef = await addDoc(collection(db, 'services'), finalRecord);
      serviceId = docRef.id;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Service saved securely',
      id: serviceId 
    });

  } catch (error: any) {
    console.error('Service API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
