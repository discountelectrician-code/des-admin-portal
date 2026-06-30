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

    let mappedData: any = {};

    // Check if it's already in the new format by looking for required fields (name and email)
    // Legacy might not have 'name' directly but 'Display Name' or 'first_name'
    if (data.name && data.email && data.role) {
      mappedData = {
        id: data.id || null,
        name: data.name,
        email: data.email,
        phone: data.phone || '',
        role: data.role,
        preferredColor: data.preferredColor || '',
        isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
        legacyId: data.legacyId || null
      };
    } else {
      // Legacy mapping
      const firstName = data.first_name || '';
      const lastName = data.last_name || '';
      let name = data['Display Name'] || data.displayName || data.name || '';
      
      if (!name && (firstName || lastName)) {
        name = [firstName, lastName].filter(Boolean).join(' ');
      }
      
      if (!name) {
         name = 'Unknown Employee'; // Fallback if no name provided
      }
      
      mappedData.id = data.id || null;
      mappedData.name = name;
      mappedData.email = data.email || data['Email'] || '';
      mappedData.phone = data['Mobile #'] || data.phone || '';
      
      let role = data.role || data['Role'];
      if (!['Lead', 'Technician', 'Admin'].includes(role)) {
         role = 'Technician';
      }
      mappedData.role = role;
      
      mappedData.preferredColor = data['Hex Color'] || data.preferredColor || data.hexColor || '';
      mappedData.isActive = true;
      mappedData.legacyId = data['ID'] !== undefined ? String(data['ID']) : (data.legacyId || null);
    }

    if (!mappedData.name || !mappedData.email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const finalRecord: any = {
      name: mappedData.name,
      email: mappedData.email,
      role: mappedData.role,
      isActive: mappedData.isActive,
      updatedAt: serverTimestamp()
    };
    
    if (mappedData.phone !== undefined) finalRecord.phone = mappedData.phone;
    if (mappedData.preferredColor !== undefined) finalRecord.preferredColor = mappedData.preferredColor;
    if (mappedData.legacyId !== undefined && mappedData.legacyId !== null) finalRecord.legacyId = mappedData.legacyId;

    let docRef;
    let employeeId = mappedData.id;
    if (employeeId) {
      docRef = doc(db, 'employees', employeeId);
      await setDoc(docRef, { ...finalRecord, createdAt: finalRecord.createdAt || serverTimestamp() }, { merge: true });
    } else {
      finalRecord.createdAt = serverTimestamp();
      docRef = await addDoc(collection(db, 'employees'), finalRecord);
      employeeId = docRef.id;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Employee saved securely',
      id: employeeId 
    });

  } catch (error: any) {
    console.error('Employee API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
