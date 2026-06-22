import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // DataForSEO CORS Proxy Endpoint
  app.post("/api/dataforseo-proxy", async (req, res) => {
    try {
      const { endpoint, payload, authKey } = req.body;

      if (!endpoint) {
        return res.status(400).json({ error: "Missing 'endpoint' parameter." });
      }
      if (!authKey) {
        return res.status(400).json({ error: "Missing 'authKey' parameter." });
      }

      console.log(`Server-side API Proxy: Relaying request to: ${endpoint}`);
      
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

      const response = await fetch(endpoint, options);
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error: `DataForSEO API responded with status ${response.status}`,
          details: errorText
        });
      }

      const responseData = await response.json();
      return res.json(responseData);
    } catch (err: any) {
      console.error("Proxy execution exception:", err);
      return res.status(500).json({ error: err.message || "Proxy connection server failure" });
    }
  });

  // Vite middleware for development mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
