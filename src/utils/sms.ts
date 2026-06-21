import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Robust POST Fetch wrapper implementing the identical multi-strategy authentication sequence
 * successfully established in QuoRoutingConfig.tsx, but defaulting to Strategy 5 (raw Authorization)
 * as the primary attempt based on target API gate feedback.
 */
async function robustPostFetch(url: string, key: string, payload: any): Promise<Response> {
  // Strategy 1 (formerly Strategy 5): Raw header Authorization without Bearer prefix.
  // This is the primary gatekeeper for the /v1/messages endpoint.
  console.log(`[Quo SDK] robustPostFetch: Strategy 1 (raw Authorization) for ${url}`);
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
    console.warn(`[Quo SDK] Strategy 1 (raw Authorization) returned status ${res.status}`);

    // Strategy 2: Multi-header authorization (Bearer token and x-api-key variants)
    console.log(`[Quo SDK] robustPostFetch: Strategy 2 (multi-headers) for ${url}`);
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
    console.warn(`[Quo SDK] Strategy 2 (multi-headers) returned status ${res2.status}`);

    const separator = url.includes('?') ? '&' : '?';

    // Strategy 3: Query parameter /?api_key=
    console.log(`[Quo SDK] robustPostFetch: Strategy 3 (?api_key=) for ${url}`);
    const res3 = await fetch(`${url}${separator}api_key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res3.ok) return res3;
    console.warn(`[Quo SDK] Strategy 3 returned status ${res3.status}`);

    // Strategy 4: Query parameter /?key=
    console.log(`[Quo SDK] robustPostFetch: Strategy 4 (?key=) for ${url}`);
    const res4 = await fetch(`${url}${separator}key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res4.ok) return res4;
    console.warn(`[Quo SDK] Strategy 4 returned status ${res4.status}`);

    // Strategy 5: Query parameter /?apiKey=
    console.log(`[Quo SDK] robustPostFetch: Strategy 5 (?apiKey=) for ${url}`);
    const res5 = await fetch(`${url}${separator}apiKey=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res5.ok) return res5;
    console.warn(`[Quo SDK] Strategy 5 returned status ${res5.status}`);

    // Return the primary response for diagnostics if all fail
    return res;
  } catch (err) {
    console.error('[Quo SDK] robustPostFetch catch exception:', err);
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

    // Retry Strategy A: Resource-centric phone-numbers message channel (Preferred Quo API Path)
    if (fromNumberId) {
      try {
        console.log(`[Onboarding SMS] Attempting Strategy A: POST /v1/phone-numbers/${fromNumberId}/messages...`);
        const lineRes = await robustPostFetch(`https://api.quo.com/v1/phone-numbers/${fromNumberId}/messages`, apiKey, {
          to: formattedTo,
          content: bodyText
        });

        console.log(`[Onboarding SMS] Strategy A status: ${lineRes.status}`);
        if (lineRes.ok) {
          success = true;
        }
      } catch (lineErr) {
        console.warn('[Onboarding SMS] Strategy A exception occurred:', lineErr);
      }
    }

    // Retry Strategy B: Central Messages Endpoint
    if (!success) {
      try {
        console.log(`[Onboarding SMS] Attempting Strategy B: POST /v1/messages...`);
        const msgRes = await robustPostFetch(`https://api.quo.com/v1/messages`, apiKey, messagePayload);

        console.log(`[Onboarding SMS] Strategy B status: ${msgRes.status}`);
        if (msgRes.ok) {
          success = true;
        }
      } catch (msgErr) {
        console.warn('[Onboarding SMS] Strategy B exception occurred:', msgErr);
      }
    }

    // Retry Strategy C: Alternate SMS Endpoint
    if (!success) {
      try {
        console.log(`[Onboarding SMS] Attempting Strategy C: POST /v1/sms...`);
        const smsRes = await robustPostFetch(`https://api.quo.com/v1/sms`, apiKey, messagePayload);

        console.log(`[Onboarding SMS] Strategy C status: ${smsRes.status}`);
        if (smsRes.ok) {
          success = true;
        }
      } catch (smsErr) {
        console.error('[Onboarding SMS] Strategy C exception occurred:', smsErr);
      }
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

    // Retry Strategy A: Resource-centric phone-numbers message channel (Preferred Quo API Path)
    if (fromNumberId) {
      try {
        console.log(`[Activation SMS] Attempting Strategy A: POST /v1/phone-numbers/${fromNumberId}/messages...`);
        const lineRes = await robustPostFetch(`https://api.quo.com/v1/phone-numbers/${fromNumberId}/messages`, apiKey, {
          to: formattedTo,
          content: bodyText
        });

        console.log(`[Activation SMS] Strategy A status: ${lineRes.status}`);
        if (lineRes.ok) {
          success = true;
        }
      } catch (lineErr) {
        console.warn('[Activation SMS] Strategy A exception occurred:', lineErr);
      }
    }

    // Retry Strategy B: Central Messages Endpoint
    if (!success) {
      try {
        console.log(`[Activation SMS] Attempting Strategy B: POST /v1/messages...`);
        const msgRes = await robustPostFetch(`https://api.quo.com/v1/messages`, apiKey, messagePayload);

        console.log(`[Activation SMS] Strategy B status: ${msgRes.status}`);
        if (msgRes.ok) {
          success = true;
        }
      } catch (msgErr) {
        console.warn('[Activation SMS] Strategy B exception occurred:', msgErr);
      }
    }

    // Retry Strategy C: Alternate SMS Endpoint
    if (!success) {
      try {
        console.log(`[Activation SMS] Attempting Strategy C: POST /v1/sms...`);
        const smsRes = await robustPostFetch(`https://api.quo.com/v1/sms`, apiKey, messagePayload);

        console.log(`[Activation SMS] Strategy C status: ${smsRes.status}`);
        if (smsRes.ok) {
          success = true;
        }
      } catch (smsErr) {
        console.error('[Activation SMS] Strategy C exception occurred:', smsErr);
      }
    }

    return success;
  } catch (err) {
    console.error('[Activation SMS] Master handler failed to complete dispatch execution:', err);
    return false;
  }
}
