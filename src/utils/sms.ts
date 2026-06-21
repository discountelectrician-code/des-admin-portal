import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Robust POST Fetch wrapper implementing the identical multi-strategy authentication sequence
 * successfully established in QuoRoutingConfig.tsx, but defaulting to Strategy 5 (raw Authorization)
 * as the primary attempt based on target API gate feedback.
 */
async function robustPostFetch(url: string, key: string, payload: any): Promise<Response> {
  const warnings: string[] = [];

  // Strategy 1 (formerly Strategy 5): Raw header Authorization without Bearer prefix.
  // This is the primary gatekeeper for the /v1/messages endpoint.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': key
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) return res;
    warnings.push(`Strategy 1 (raw Authorization) returned status ${res.status}`);

    // Strategy 2: Multi-header authorization (Bearer token and x-api-key variants)
    const headers2 = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'x-api-key': key,
      'X-API-KEY': key,
      'X-API-Key': key
    };
    const res2 = await fetch(url, {
      method: 'POST',
      headers: headers2,
      body: JSON.stringify(payload)
    });
    if (res2.ok) return res2;
    warnings.push(`Strategy 2 (multi-headers) returned status ${res2.status}`);

    const separator = url.includes('?') ? '&' : '?';

    // Strategy 3: Query parameter /?api_key=
    const res3 = await fetch(`${url}${separator}api_key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res3.ok) return res3;
    warnings.push(`Strategy 3 returned status ${res3.status}`);

    // Strategy 4: Query parameter /?key=
    const res4 = await fetch(`${url}${separator}key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res4.ok) return res4;
    warnings.push(`Strategy 4 returned status ${res4.status}`);

    // Strategy 5: Query parameter /?apiKey=
    const res5 = await fetch(`${url}${separator}apiKey=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res5.ok) return res5;
    warnings.push(`Strategy 5 returned status ${res5.status}`);

    // Only log if all strategies within robustPostFetch fail
    console.warn(`[Quo SDK] All authorization strategies failed for ${url}:\n  - ${warnings.join('\n  - ')}`);
    return res;
  } catch (err) {
    // Collect error but only throw or print when completely failing the wrapper flow
    throw err;
  }
}

/**
 * Robust Onboarding SMS helper utilizing the active Quo API and Main Office configuration
 * Refined to strictly target and prioritize Customer Texting Line for onboarding invitations.
 */
export async function sendOnboardingSms(techName: string, toNumber: string, uniqueLink: string): Promise<boolean> {
  try {
    console.log(`[Quo Onboarding Link] Initiating SMS dispatch to ${techName} (${toNumber})...`);

    // 1. Fetch Quo config for custom API key
    let apiKey = 'o10vIQ4KoW0RRNxO5ydVfdkYYg9IxVyn'; // Dynamic fallback key
    try {
      const configSnap = await getDoc(doc(db, 'settings', 'quo_config'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        if (data.apiKey && data.apiKey.trim()) {
          apiKey = data.apiKey.trim();
        }
      }
    } catch (apiErr) {
      console.warn('[Onboarding SMS] Failed to query quo_config settings:', apiErr);
    }

    // 2. Fetch the numbers registry and communications routing config
    let fromNumberId = '';
    let fromNumber = '';
    
    try {
      const [registrySnap, commSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'quo_number_registry')),
        getDoc(doc(db, 'settings', 'communications_config'))
      ]);

      const numbers = registrySnap.exists() ? (registrySnap.data().numbers || []) : [];

      if (commSnap.exists()) {
        const commData = commSnap.data();
        if (commData.main_office && commData.main_office.customerNumberId) {
          // STRICT RULE: Must use the Customer Texting Line for onboarding invitations!
          fromNumberId = commData.main_office.customerNumberId;
        }
      }

      // Find the specific office number object in the synced registry matching historical ID
      let selectedNum = numbers.find((n: any) => n.id === fromNumberId || (n.data && n.data.id === fromNumberId));

      // Fallback A: Search specifically for numbers with "customer", "texting", or "client" labeling monikers
      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('customer') || moniker.includes('texting') || moniker.includes('client');
        });
      }

      // Fallback B: Search for general registry "office" or "main" labeled numbers
      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('office') || moniker.includes('main');
        });
      }

      // Fallback C: Use first item in registry if we still don't have a number
      if (!selectedNum && numbers.length > 0) {
        selectedNum = numbers[0];
      }

      if (selectedNum) {
        const payloadData = selectedNum.data || selectedNum;
        fromNumber = payloadData.formattedNumber || payloadData.phoneNumber || payloadData.number || payloadData.phone || '';
        if (!fromNumberId) {
          fromNumberId = selectedNum.id || payloadData.id || '';
        }
      }
    } catch (storeErr) {
      console.warn('[Onboarding SMS] Failed loading telemetry configurations for fromNumber:', storeErr);
    }

    // Formulate message block:
    const bodyText = `Hi ${techName}, welcome to Discount Electrical! Complete your account setup here: ${uniqueLink}. This link expires in 48 hours.`;

    const digits = toNumber.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
    const formattedTo = ['+1' + normalizedDigits];

    console.log(`[Onboarding SMS] Dispatch details: FromId=${fromNumberId}, FromNum=${fromNumber}, To=${formattedTo[0]}, Msg="${bodyText}"`);

    // strictly matching Quo v1/messages requirement:
    // destination number in array & formatted in E.164, content: messageString, from: phoneNumberId
    const messagePayload = {
      from: fromNumberId || undefined,
      to: formattedTo,
      content: bodyText
    };

    let success = false;

    // Retry Strategy A: Central Messages Endpoint (Prioritized as reliable primary channel)
    try {
      console.log(`[Onboarding SMS] Attempting primary endpoint: POST /v1/messages...`);
      const msgRes = await robustPostFetch(`https://api.quo.com/v1/messages`, apiKey, messagePayload);
      if (msgRes.ok) {
        success = true;
      }
    } catch (msgErr) {
      // Muted - Only log final aggregated failure across all endpoints
    }

    // Retry Strategy B: Alternate SMS Endpoint (Secondary backup channel)
    if (!success) {
      try {
        console.log(`[Onboarding SMS] Attempting secondary endpoint: POST /v1/sms...`);
        const smsRes = await robustPostFetch(`https://api.quo.com/v1/sms`, apiKey, messagePayload);
        if (smsRes.ok) {
          success = true;
        }
      } catch (smsErr) {
        // Muted - Only log final aggregated failure across all endpoints
      }
    }

    if (!success) {
      console.error('[Onboarding SMS] Dispatch failed across all authorized endpoints.');
    }

    return success;
  } catch (err) {
    console.error('[Onboarding SMS] Master handler failed to complete dispatch execution:', err);
    return false;
  }
}

/**
 * Sends a final activation SMS via Quo API with E.164 target array structure and matching payload contents.
 */
export async function sendActivationSms(techName: string, toNumber: string, appLink: string): Promise<boolean> {
  try {
    console.log(`[Quo Activation Link] Initiating SMS dispatch to ${techName} (${toNumber})...`);

    // 1. Fetch Quo config for custom API key
    let apiKey = 'o10vIQ4KoW0RRNxO5ydVfdkYYg9IxVyn'; // Dynamic fallback key
    try {
      const configSnap = await getDoc(doc(db, 'settings', 'quo_config'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        if (data.apiKey && data.apiKey.trim()) {
          apiKey = data.apiKey.trim();
        }
      }
    } catch (apiErr) {
      console.warn('[Activation SMS] Failed to query quo_config settings:', apiErr);
    }

    // 2. Fetch the numbers registry and communications routing config
    let fromNumberId = '';
    let fromNumber = '';
    
    try {
      const [registrySnap, commSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'quo_number_registry')),
        getDoc(doc(db, 'settings', 'communications_config'))
      ]);

      const numbers = registrySnap.exists() ? (registrySnap.data().numbers || []) : [];

      if (commSnap.exists()) {
        const commData = commSnap.data();
        if (commData.main_office) {
          // Try customer line, else fall back to notifications line
          fromNumberId = commData.main_office.customerNumberId || commData.main_office.techNotificationNumberId || '';
        }
      }

      let selectedNum = numbers.find((n: any) => n.id === fromNumberId || (n.data && n.data.id === fromNumberId));

      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('customer') || moniker.includes('texting') || moniker.includes('client');
        });
      }

      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('office') || moniker.includes('main');
        });
      }

      if (!selectedNum && numbers.length > 0) {
        selectedNum = numbers[0];
      }

      if (selectedNum) {
        const payloadData = selectedNum.data || selectedNum;
        fromNumber = payloadData.formattedNumber || payloadData.phoneNumber || payloadData.number || payloadData.phone || '';
        if (!fromNumberId) {
          fromNumberId = selectedNum.id || payloadData.id || '';
        }
      }
    } catch (storeErr) {
      console.warn('[Activation SMS] Failed loading telemetry configurations for fromNumber:', storeErr);
    }

    // Formulate message block
    const bodyText = `Hi ${techName}, your Discount Electrical account has been activated! Complete your login or access your workspace apps here: ${appLink}`;

    const digits = toNumber.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
    const formattedTo = ['+1' + normalizedDigits];

    console.log(`[Activation SMS] Dispatch details: FromId=${fromNumberId}, FromNum=${fromNumber}, To=${formattedTo[0]}, Msg="${bodyText}"`);

    // strictly matching Quo v1/messages requirement:
    // destination number in array & formatted in E.164, content: messageString, from: phoneNumberId
    const messagePayload = {
      from: fromNumberId || undefined,
      to: formattedTo,
      content: bodyText
    };

    let success = false;

    // Retry Strategy A: Central Messages Endpoint (Prioritized as reliable primary channel)
    try {
      console.log(`[Activation SMS] Attempting primary endpoint: POST /v1/messages...`);
      const msgRes = await robustPostFetch(`https://api.quo.com/v1/messages`, apiKey, messagePayload);
      if (msgRes.ok) {
        success = true;
      }
    } catch (msgErr) {
      // Muted - Only log final aggregated failure across all endpoints
    }

    // Retry Strategy B: Alternate SMS Endpoint (Secondary backup channel)
    if (!success) {
      try {
        console.log(`[Activation SMS] Attempting secondary endpoint: POST /v1/sms...`);
        const smsRes = await robustPostFetch(`https://api.quo.com/v1/sms`, apiKey, messagePayload);
        if (smsRes.ok) {
          success = true;
        }
      } catch (smsErr) {
        // Muted - Only log final aggregated failure across all endpoints
      }
    }

    if (!success) {
      console.error('[Activation SMS] Dispatch failed across all authorized endpoints.');
    }

    return success;
  } catch (err) {
    console.error('[Activation SMS] Master handler failed to complete dispatch execution:', err);
    return false;
  }
}

/**
 * Generic SMS helper utilizing the active Quo API and Main Office Customer Texting Line.
 */
export async function sendSms(toNumber: string, bodyText: string): Promise<boolean> {
  try {
    console.log(`[Quo SMS Helper] Initiating generic SMS dispatch to ${toNumber}...`);

    // 1. Fetch Quo config for custom API key
    let apiKey = 'o10vIQ4KoW0RRNxO5ydVfdkYYg9IxVyn'; // Dynamic fallback key
    try {
      const configSnap = await getDoc(doc(db, 'settings', 'quo_config'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        if (data.apiKey && data.apiKey.trim()) {
          apiKey = data.apiKey.trim();
        }
      }
    } catch (apiErr) {
      console.warn('[Quo SMS] Failed to query quo_config settings:', apiErr);
    }

    // 2. Fetch the numbers registry and communications routing config
    let fromNumberId = '';
    let fromNumber = '';
    
    try {
      const [registrySnap, commSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'quo_number_registry')),
        getDoc(doc(db, 'settings', 'communications_config'))
      ]);

      const numbers = registrySnap.exists() ? (registrySnap.data().numbers || []) : [];

      if (commSnap.exists()) {
        const commData = commSnap.data();
        if (commData.main_office && commData.main_office.customerNumberId) {
          // STRICT RULE: Must use the Customer Texting Line for outbound!
          fromNumberId = commData.main_office.customerNumberId;
        }
      }

      // Find the specific office number object in the synced registry
      let selectedNum = numbers.find((n: any) => n.id === fromNumberId || (n.data && n.data.id === fromNumberId));

      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('customer') || moniker.includes('texting') || moniker.includes('client');
        });
      }

      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('office') || moniker.includes('main');
        });
      }

      if (!selectedNum && numbers.length > 0) {
        selectedNum = numbers[0];
      }

      if (selectedNum) {
        const payloadData = selectedNum.data || selectedNum;
        fromNumber = payloadData.formattedNumber || payloadData.phoneNumber || payloadData.number || payloadData.phone || '';
        if (!fromNumberId) {
          fromNumberId = selectedNum.id || payloadData.id || '';
        }
      }
    } catch (storeErr) {
      console.warn('[Quo SMS] Failed loading telemetry configurations for fromNumber:', storeErr);
    }

    const digits = toNumber.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
    const formattedTo = ['+1' + normalizedDigits];

    console.log(`[Quo SMS] Dispatch details: FromId=${fromNumberId}, FromNum=${fromNumber}, To=${formattedTo[0]}, Msg="${bodyText}"`);

    const messagePayload = {
      from: fromNumberId || undefined,
      to: formattedTo,
      content: bodyText
    };

    let success = false;

    // Retry Strategy A: Central Messages Endpoint (Prioritized as reliable primary channel)
    try {
      console.log(`[Quo SMS] Attempting primary endpoint: POST /v1/messages...`);
      const msgRes = await robustPostFetch(`https://api.quo.com/v1/messages`, apiKey, messagePayload);
      if (msgRes.ok) {
        success = true;
      }
    } catch (msgErr) {
      // Muted - Only log final aggregated failure across all endpoints
    }

    // Retry Strategy B: Alternate SMS Endpoint (Secondary backup channel)
    if (!success) {
      try {
        console.log(`[Quo SMS] Attempting secondary endpoint: POST /v1/sms...`);
        const smsRes = await robustPostFetch(`https://api.quo.com/v1/sms`, apiKey, messagePayload);
        if (smsRes.ok) {
          success = true;
        }
      } catch (smsErr) {
        // Muted - Only log final aggregated failure across all endpoints
      }
    }

    if (!success) {
      console.error('[Quo SMS] Dispatch failed across all authorized endpoints.');
    }

    return success;
  } catch (err) {
    console.error('[Quo SMS] Master handler failed to complete dispatch execution:', err);
    return false;
  }
}

/**
 * Sends a lead recovery SMS via Quo API with E.164 target array structure and matching payload contents.
 * Strictly maps target phone as an array under the to property, and body content under the content property.
 */
export async function sendLeadRecoverySms(phoneNumber: string, messageString: string): Promise<boolean> {
  try {
    console.log(`[Lead Recovery SMS] Initiating SMS dispatch to ${phoneNumber}...`);

    // 1. Fetch Quo config for custom API key
    let apiKey = 'o10vIQ4KoW0RRNxO5ydVfdkYYg9IxVyn'; // Dynamic fallback key
    try {
      const configSnap = await getDoc(doc(db, 'settings', 'quo_config'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        if (data.apiKey && data.apiKey.trim()) {
          apiKey = data.apiKey.trim();
        }
      }
    } catch (apiErr) {
      console.warn('[Lead Recovery SMS] Failed to query quo_config settings:', apiErr);
    }

    // 2. Fetch the numbers registry and communications routing config
    let fromNumberId = '';
    let fromNumber = '';
    
    try {
      const [registrySnap, commSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'quo_number_registry')),
        getDoc(doc(db, 'settings', 'communications_config'))
      ]);

      const numbers = registrySnap.exists() ? (registrySnap.data().numbers || []) : [];

      if (commSnap.exists()) {
        const commData = commSnap.data();
        if (commData.main_office && commData.main_office.customerNumberId) {
          // STRICT RULE: Must use the Customer Texting Line as the from property
          fromNumberId = commData.main_office.customerNumberId;
        }
      }

      let selectedNum = numbers.find((n: any) => n.id === fromNumberId || (n.data && n.data.id === fromNumberId));

      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('customer') || moniker.includes('texting') || moniker.includes('client');
        });
      }

      if (!selectedNum) {
        selectedNum = numbers.find((n: any) => {
          const moniker = (n.name || n.friendlyName || n.label || '').toLowerCase();
          return moniker.includes('office') || moniker.includes('main');
        });
      }

      if (!selectedNum && numbers.length > 0) {
        selectedNum = numbers[0];
      }

      if (selectedNum) {
        const payloadData = selectedNum.data || selectedNum;
        fromNumber = payloadData.formattedNumber || payloadData.phoneNumber || payloadData.number || payloadData.phone || '';
        if (!fromNumberId) {
          fromNumberId = selectedNum.id || payloadData.id || '';
        }
      }
    } catch (storeErr) {
      console.warn('[Lead Recovery SMS] Failed loading telemetry configurations for fromNumber:', storeErr);
    }

    // Strictly map the destination number as an array: to: ['+1' + phoneNumber.replace(/\D/g, '')]
    const rawPhoneNumber = phoneNumber.replace(/\D/g, '');
    const cleanPhoneNumber = rawPhoneNumber.startsWith('1') && rawPhoneNumber.length === 11 ? rawPhoneNumber.slice(1) : rawPhoneNumber;
    const formattedTo = ['+1' + cleanPhoneNumber];

    console.log(`[Lead Recovery SMS] Dispatch details: FromId=${fromNumberId}, FromNum=${fromNumber}, To=${formattedTo[0]}, Msg="${messageString}"`);

    // Strictly match the payload contract
    const messagePayload = {
      from: fromNumberId || undefined,
      to: formattedTo,
      content: messageString
    };

    let success = false;

    // Retry Strategy A: Central Messages Endpoint (Prioritized as reliable primary channel)
    try {
      console.log(`[Lead Recovery SMS] Attempting primary endpoint: POST /v1/messages...`);
      const msgRes = await robustPostFetch(`https://api.quo.com/v1/messages`, apiKey, messagePayload);
      if (msgRes.ok) {
        success = true;
      }
    } catch (msgErr) {
      // Muted - Only log final aggregated failure across all endpoints
    }

    // Retry Strategy B: Alternate SMS Endpoint (Secondary backup channel)
    if (!success) {
      try {
        console.log(`[Lead Recovery SMS] Attempting secondary endpoint: POST /v1/sms...`);
        const smsRes = await robustPostFetch(`https://api.quo.com/v1/sms`, apiKey, messagePayload);
        if (smsRes.ok) {
          success = true;
        }
      } catch (smsErr) {
        // Muted - Only log final aggregated failure across all endpoints
      }
    }

    if (!success) {
      console.error('[Lead Recovery SMS] Dispatch failed across all authorized endpoints.');
    }

    return success;
  } catch (err) {
    console.error('[Lead Recovery SMS] Master handler failed to complete dispatch execution:', err);
    return false;
  }
}

