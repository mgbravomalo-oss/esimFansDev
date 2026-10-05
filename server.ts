import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { app } from './server/app.js';
import { connectToDatabase } from './server/db.js';
import { initEsimAlertCronJob } from './server/esimAlertMonitor.js';

const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
const PORT = !isNaN(cliPort) ? cliPort : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV === 'production' && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Wappa eSIM Server running on http://localhost:${PORT}`);

    // Connect to MongoDB Atlas in the background without blocking port 3000 availability
    connectToDatabase()
      .then(() => {
        // Initialize eSIM consumption and expiration alert cron monitor
        initEsimAlertCronJob();
      })
      .catch((err: any) => {
        console.warn('Initial database connection note:', err?.message || err);
      });
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
  });

  const cleanup = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

// In local dev and standard containers (Cloud Run, Docker), launch the Express server.
// In Vercel serverless environments, Vercel executes the handler exported in api/index.ts.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
