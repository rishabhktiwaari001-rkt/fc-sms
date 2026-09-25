import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

import authRoutes from './routes/auth';
import loadsRoutes from './routes/loads';
import catalogRoutes from './routes/catalog';
import auditsRoutes from './routes/audits';
import srRoutes from './routes/sr';
import staffRoutes from './routes/staff';
import storesRoutes from './routes/stores';
import membersRoutes from './routes/members';
import eossRoutes from './routes/eoss';
import dashboardRoutes from './routes/dashboard';
import billingRoutes from './routes/billing';
import imagesRoutes from './routes/images';

const app = express();
const PORT = process.env.PORT || 4000; // deploy trigger v6

// ── Middleware ────────────────────────────────────────────────────────────────
// In production, frontend is served from same origin — CORS_ORIGIN mirrors request origin
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/loads', loadsRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/audits', auditsRoutes);
app.use('/api/sr', srRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/eoss', eossRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/images', imagesRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── 404 for unknown API routes ────────────────────────────────────────────────
app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ── Production: serve React build + SPA fallback ──────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`✅  Franchise Retail Management API running on http://localhost:${PORT}`);
});

export default app;


