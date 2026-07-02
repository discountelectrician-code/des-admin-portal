import { corsHeaders } from '../src/utils/cors.js';
import { db } from '../src/firebase.js';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';

async function processEmployee(data: any) {
  let mappedData: any = {};

  // Check if it's already in the new format by looking for required fields (name and email)
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
    
    let role = data['Tech Access Level'] || data.role || data['Role'];
    if (!['Lead', 'Technician', 'Admin'].includes(role)) {
       role = 'Technician';
    }
    mappedData.role = role;
    
    mappedData.preferredColor = data['Hex Color'] || data.preferredColor || data.hexColor || '';
    mappedData.isActive = true;
    mappedData.legacyId = data['unique id'] !== undefined ? String(data['unique id']) : (data['ID'] !== undefined ? String(data['ID']) : (data.legacyId || null));
  }

  if (!mappedData.name || !mappedData.email) {
    throw new Error('name and email are required');
  }

  // Sanitization: Pick explicitly allowed fields
  const { name: finalName, email, phone, role: finalRole, preferredColor, isActive, legacyId } = mappedData;

  const finalRecord: any = {
    name: finalName,
    email,
    role: finalRole,
    isActive,
    updatedAt: serverTimestamp()
  };
  
  if (phone !== undefined) finalRecord.phone = phone;
  if (preferredColor !== undefined) finalRecord.preferredColor = preferredColor;
  if (legacyId !== undefined && legacyId !== null) finalRecord.legacyId = legacyId;

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

  return employeeId;
}

export default async function handler(req: any, res: any) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ status: 'error', message: 'Invalid payload' });
    }

    const isArray = Array.isArray(payload);
    const records = isArray ? payload : [payload];
    const results = [];

    for (const record of records) {
      const id = await processEmployee(record);
      results.push({ success: true, id });
    }

    return res.status(200).json({ 
      status: 'success', 
      message: 'Employee(s) saved securely',
      results: isArray ? results : undefined,
      id: !isArray ? results[0].id : undefined
    });

  } catch (error: any) {
    console.error('Employee API Error:', error);
    return res.status(500).json({ status: 'error', message: error.message || 'Internal Server Error' });
  }
}

