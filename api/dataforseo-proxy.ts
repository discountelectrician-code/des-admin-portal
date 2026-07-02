export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests for the proxy
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { endpoint, payload, authKey } = req.body || {};

    if (!endpoint) {
      return res.status(400).json({ error: "Missing 'endpoint' parameter." });
    }
    if (!authKey) {
      return res.status(400).json({ error: "Missing 'authKey' parameter." });
    }

    const hasPayload = payload !== undefined && payload !== null && (typeof payload !== "object" || Object.keys(payload).length > 0);
    const isGet = !hasPayload;

    const options: RequestInit = {
      method: isGet ? "GET" : "POST",
      headers: {
        "Authorization": `Basic ${authKey}`,
        "Content-Type": "application/json"
      }
    };

    if (!isGet) {
      options.body = JSON.stringify(payload);
    }

    const d4sResponse = await fetch(endpoint, options);
    const status = d4sResponse.status;

    if (!d4sResponse.ok) {
      const errorText = await d4sResponse.text();
      return res.status(status).json({
        error: `DataForSEO API responded with status ${status}`,
        details: errorText
      });
    }

    const responseData = await d4sResponse.json();
    return res.status(200).json(responseData);
  } catch (err: any) {
    console.error("Vercel Proxy Exception:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error in proxy" });
  }
}
