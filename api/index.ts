import type { Request, Response } from 'express';
import app from '../server/app.js';
import { connectToDatabase, isDatabaseConnected } from '../server/db.js';

// Vercel Serverless Function entrypoint: routes all incoming /api/* requests to the Express application
export default async function handler(req: Request, res: Response) {
  // Ensure database is connected on cold starts before processing request
  if (!isDatabaseConnected()) {
    try {
      await connectToDatabase();
    } catch (e: any) {
      console.warn('Vercel serverless DB connect notice:', e?.message || e);
    }
  }

  // If Vercel stripped '/api' from req.url, restore it for Express route matching
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  return app(req, res);
}
