import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import "dotenv/config";
import multer from "multer";
import FormData from "form-data";
import fetch from "node-fetch";

async function startServer() {
  console.log("Starting MedNote server...");
  const app = express();
  const PORT = 3000;

  const upload = multer({ storage: multer.memoryStorage() });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // DocEngine health check
  app.get("/api/docengine-health", async (req, res) => {
    console.log("=== [DOCENGINE] RECEBIDA REQUISIÇÃO DE SAÚDE DA IA [GET /api/docengine-health] ===");
    console.log(`- process.env.DOCENGINE_API_KEY: ${process.env.DOCENGINE_API_KEY ? "Configurada (tamanho: " + process.env.DOCENGINE_API_KEY.length + ")" : "Não configurada"}`);
    console.log(`- process.env.DOCENGINE_API_URL: ${process.env.DOCENGINE_API_URL || "Não configurada"}`);

    try {
      let apiKey = process.env.DOCENGINE_API_KEY || "dk_app_398621514c374c1bbaee5c20d65f2a83";
      let baseUrl = (process.env.DOCENGINE_API_URL || "https://drive-ai-file-reader-572028997371.us-east1.run.app").trim().replace(/\/$/, '');
      
      // Resiliência de URL: Forçar atualização se contiver o host antigo
      if (baseUrl.includes("spherical-leaf")) {
        console.warn("⚠️ URL antiga detectada em process.env.DOCENGINE_API_URL. Forçando redirecionamento para o ambiente novo.");
        baseUrl = "https://drive-ai-file-reader-572028997371.us-east1.run.app";
      }

      console.log(`- URL base de destino calculada: ${baseUrl}`);
      console.log(`- API Key integrada: ${apiKey.substring(0, 10)}...`);

      const tryHealth = async (key: string, url: string) => {
        console.log(`- Efetuando fetch na URL de saúde: ${url}`);
        return fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'Content-Type': 'application/json'
          }
        });
      };

      // Tenta a chave principal com /api/health
      let response = await tryHealth(apiKey, `${baseUrl}/api/health`);
      
      // Se retornar 404, tenta na raiz /health ou base
      if (response.status === 404) {
        console.log("⚠️ /api/health retornou 404, tentando fallback para /health...");
        response = await tryHealth(apiKey, `${baseUrl}/health`);
      }

      // Se ainda falhar com o status, ou se a chave falhar, tenta com a chave alternativa
      if (!response.ok) {
        console.warn(`⚠️ Chamada inicial de saúde retornou status ${response.status}. Tentando chave alternativa...`);
        const altKey = "dk_app_9afda75222e940538b598d9564b693b8";
        response = await tryHealth(altKey, `${baseUrl}/api/health`);
        if (response.status === 404) {
          response = await tryHealth(altKey, `${baseUrl}/health`);
        }
      }

      if (!response.ok) {
        throw new Error(`Erro retornado pela DocEngine: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log("✅ Conexão estabelecida com a IA de forma bem sucedida!", JSON.stringify(data));
      res.json(data);
    } catch (error: any) {
      console.error('❌ Erro no teste de integridade da DocEngine:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Set higher limit for large PDF base64 payloads
  app.use(express.json({ limit: '50mb' }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware attached.");
  } else {
    // In production, the server is bundled into dist/server.cjs
    // So __dirname will be the dist directory itself
    const distPath = typeof __dirname !== 'undefined' 
      ? __dirname 
      : path.join(process.cwd(), 'dist');
    
    console.log(`Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath));
    
    // Support SPA routing - serve index.html for any unknown routes
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully started and listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
