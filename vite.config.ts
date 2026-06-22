import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'dataforseo-dev-proxy',
        configureServer(server) {
          server.middlewares.use((req: any, res: any, next: any) => {
            if (req.url && req.url.startsWith('/api/dataforseo-proxy')) {
              let body = '';
              req.on('data', (chunk: any) => {
                body += chunk.toString();
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body || '{}');
                  const { endpoint, payload, authKey } = parsed;
                  if (!endpoint || !authKey) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: "Missing required parameters: 'endpoint' or 'authKey'." }));
                    return;
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

                  const response = await fetch(endpoint, options);
                  res.statusCode = response.status;
                  res.setHeader('Content-Type', 'application/json');

                  if (!response.ok) {
                    const errorText = await response.text();
                    res.end(JSON.stringify({
                      error: `DataForSEO API responded with status ${response.status}`,
                      details: errorText
                    }));
                    return;
                  }

                  const data = await response.json();
                  res.end(JSON.stringify(data));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || "Local dev proxy server failure" }));
                }
              });
            } else {
              next();
            }
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
