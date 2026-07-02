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

    // Check if it's already in the new format
    if (data.lineItems && data.financials) {
      mappedData = {
        id: data.id || null,
        invoiceNumber: data.invoiceNumber || '',
        customerId: data.customerId || '',
        worksiteId: data.worksiteId || '',
        appointmentId: data.appointmentId || null,
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        financials: data.financials || { total: 0, totalPaid: 0, balanceDue: 0 },
        status: data.status || { isSent: false, sentDate: null },
        legacyId: data.legacyId || null
      };
    } else {
      // Legacy mapping
      mappedData.id = data.id || null;
      mappedData.invoiceNumber = data['Invoice #'] || data.invoiceNumber || '';
      mappedData.customerId = data['Customer'] || data.customerId || '';
      mappedData.worksiteId = data['Worksite'] || data.worksiteId || '';
      mappedData.appointmentId = data['Appointment'] || data.appointmentId || null;
      mappedData.legacyId = data['ID'] !== undefined ? String(data['ID']) : (data.legacyId || null);

      mappedData.financials = {
        total: Number(data['Total'] || data.total || 0),
        totalPaid: Number(data['Total Paid'] || data.totalPaid || 0),
        balanceDue: Number(data['Balance Due'] || data.balanceDue || 0)
      };

      mappedData.status = {
        isSent: Boolean(data['Sent?'] || data.isSent),
        sentDate: data['Sent Date'] || data.sentDate || null
      };

      // Perform join on legacy services
      const lineItems: any[] = [];
      if (mappedData.invoiceNumber) {
        try {
          const servicesRef = collection(db, 'services');
          const q = query(servicesRef, where('Invoice #', '==', mappedData.invoiceNumber));
          const querySnapshot = await getDocs(q);
          
          querySnapshot.forEach((doc) => {
            const svc = doc.data();
            lineItems.push({
              description: svc['Description'] || svc.description || '',
              qty: Number(svc['Qty'] || svc.qty || 0),
              unitPrice: Number(svc['UnitPrice'] || svc['Unit Price'] || svc.unitPrice || 0),
              subTotal: Number(svc['Sub Total'] || svc['Subtotal'] || svc.subTotal || 0)
            });
          });
        } catch (err) {
          console.error('Error fetching joined services:', err);
        }
      }
      mappedData.lineItems = lineItems;
    }

    if (!mappedData.invoiceNumber) {
      mappedData.invoiceNumber = `legacy-unnamed-inv-${Math.random()}`;
    }

    if (!mappedData.customerId) {
      mappedData.customerId = 'unassigned-legacy-invoice';
    }

    if (!mappedData.worksiteId) {
      mappedData.worksiteId = 'unassigned-legacy-invoice';
    }

    const finalRecord: any = {
      invoiceNumber: mappedData.invoiceNumber,
      customerId: mappedData.customerId,
      worksiteId: mappedData.worksiteId,
      lineItems: mappedData.lineItems,
      financials: mappedData.financials,
      status: mappedData.status,
      updatedAt: serverTimestamp()
    };
    
    if (mappedData.appointmentId !== undefined && mappedData.appointmentId !== null) finalRecord.appointmentId = mappedData.appointmentId;
    if (mappedData.legacyId !== undefined && mappedData.legacyId !== null) finalRecord.legacyId = mappedData.legacyId;

    let docRef;
    let invoiceId = mappedData.id;
    if (invoiceId) {
      docRef = doc(db, 'invoices', invoiceId);
      await setDoc(docRef, { ...finalRecord, createdAt: finalRecord.createdAt || serverTimestamp() }, { merge: true });
    } else {
      finalRecord.createdAt = serverTimestamp();
      docRef = await addDoc(collection(db, 'invoices'), finalRecord);
      invoiceId = docRef.id;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Invoice saved securely',
      id: invoiceId 
    });

  } catch (error: any) {
    console.error('Invoice API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
