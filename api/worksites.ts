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

    // Check if it's already in the new format by looking for location object or specs object
    if (data.location || data.specs || data.electrical) {
      mappedData = {
        id: data.id || null,
        customerId: data.customerId || '',
        location: data.location || {},
        specs: data.specs || {},
        electrical: data.electrical || {},
        legacyId: data.legacyId || null
      };
    } else {
      // Legacy mapping
      mappedData.id = data.id || null;
      mappedData.customerId = data['Customer'] || data.customerId || '';
      mappedData.legacyId = data['ID'] !== undefined ? String(data['ID']) : (data.legacyId || null);

      mappedData.location = {
        street: data['Street'] || data.street || '',
        streetLine2: data['Street Line 2'] || data.streetLine2 || '',
        city: data['City'] || data.city || '',
        state: data['State'] || data.state || '',
        zip: String(data['Zip'] || data.zip || ''),
        county: data['County'] || data.county || ''
      };

      mappedData.specs = {
        baths: data['# Baths'] || data.baths || null,
        bedrooms: data['# Bedrooms'] || data.bedrooms || null,
        sqft: data['Square Footage'] || data.sqft || null,
        yearBuilt: data['Year Built'] || data.yearBuilt || null,
        propertyType: data['Property Type'] || data.propertyType || ''
      };

      // Group panels
      const panels = [];
      for (let i = 1; i <= 4; i++) {
        const brand = data[`Panel ${i} Brand`];
        const amps = data[`Panel ${i} Amps`];
        const location = data[`Panel ${i} Location`];
        if (brand || amps || location) {
          panels.push({
            id: i,
            brand: brand || '',
            amps: amps || '',
            location: location || ''
          });
        }
      }
      
      const panelBrands = data['Panel Brands'] || '';
      if (panels.length === 0 && panelBrands) {
         panels.push({ id: 1, brand: panelBrands });
      }

      mappedData.electrical = {
        meter: data['Meter #'] || data.meter || '',
        panels: panels,
        switches: {
          count: data['Switch Counts'] || data.switchCounts || null,
          details: data['Switches Details'] || ''
        }
      };
    }

    if (typeof mappedData.customerId !== 'string' || !mappedData.customerId.trim()) {
      let foundCustomerId = null;
      const street = mappedData.location.street || data['Street'] || '';
      const geoAddress = data['Geographic Address'] || '';

      const searchQueries = [];
      if (street) searchQueries.push(street);
      if (geoAddress && geoAddress !== street) searchQueries.push(geoAddress);

      for (const searchTerm of searchQueries) {
         if (foundCustomerId) break;

         // Try finding customer by address.street
         let q = query(collection(db, 'customers'), where('address.street', '==', searchTerm));
         let qs = await getDocs(q);
         if (!qs.empty) {
           foundCustomerId = qs.docs[0].id;
           break;
         }

         // Try finding customer by full geographic address
         q = query(collection(db, 'customers'), where('address.full', '==', searchTerm));
         qs = await getDocs(q);
         if (!qs.empty) {
           foundCustomerId = qs.docs[0].id;
           break;
         }

         // Try finding by worksite street
         q = query(collection(db, 'worksites'), where('street', '==', searchTerm));
         qs = await getDocs(q);
         if (!qs.empty && qs.docs[0].data().customerId) {
           foundCustomerId = qs.docs[0].data().customerId;
           break;
         }
         
         q = query(collection(db, 'worksites'), where('location.street', '==', searchTerm));
         qs = await getDocs(q);
         if (!qs.empty && qs.docs[0].data().customerId) {
           foundCustomerId = qs.docs[0].data().customerId;
           break;
         }
      }

      if (foundCustomerId) {
        mappedData.customerId = foundCustomerId;
      } else {
        mappedData.customerId = 'unassigned-legacy-worksites';
      }
    }

    if (typeof mappedData.customerId !== 'string' || !mappedData.customerId.trim()) {
      return res.status(400).json({ error: 'customerId is required and must be a string' });
    }

    const finalRecord: any = {
      customerId: mappedData.customerId,
      location: mappedData.location,
      specs: mappedData.specs,
      electrical: mappedData.electrical,
      updatedAt: serverTimestamp()
    };
    if (mappedData.legacyId) finalRecord.legacyId = mappedData.legacyId;

    let docRef;
    let worksiteId = mappedData.id;
    if (worksiteId) {
      docRef = doc(db, 'worksites', worksiteId);
      await setDoc(docRef, { ...finalRecord, createdAt: finalRecord.createdAt || serverTimestamp() }, { merge: true });
    } else {
      finalRecord.createdAt = serverTimestamp();
      docRef = await addDoc(collection(db, 'worksites'), finalRecord);
      worksiteId = docRef.id;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Worksite saved securely',
      id: worksiteId 
    });

  } catch (error: any) {
    console.error('Worksite API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
