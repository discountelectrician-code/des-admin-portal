import { db } from '../src/firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default async function handler(req: any, res: any) {
  // CORS Headers
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

    if (typeof data.firstName !== 'string' || !data.firstName.trim()) {
      return res.status(400).json({ error: 'firstName is required and must be a string' });
    }

    // Validate against our customer data model
    // Allowed fields to ensure no unauthorized fields are added
    const allowedFields = [
      'id', 'firstName', 'lastName', 'email', 'phone', 
      'address', 'status', 'notes', 'company', 'source'
    ];
    
    const sanitizedData: Record<string, any> = {};
    
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        sanitizedData[key] = data[key];
      }
    }

    // Add server timestamp
    sanitizedData.updatedAt = serverTimestamp();
    
    let docRef;
    if (sanitizedData.id) {
      // Merge if ID is provided
      const customerId = sanitizedData.id;
      delete sanitizedData.id; // Don't write the ID to the doc body if used as doc ID, or keep it, it's fine.
      docRef = doc(db, 'customers', customerId);
      await setDoc(docRef, { ...sanitizedData, createdAt: sanitizedData.createdAt || serverTimestamp() }, { merge: true });
    } else {
      // Add new doc
      sanitizedData.createdAt = serverTimestamp();
      docRef = await addDoc(collection(db, 'customers'), sanitizedData);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Customer saved securely',
      id: docRef.id 
    });

  } catch (error: any) {
    console.error('Customer API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
