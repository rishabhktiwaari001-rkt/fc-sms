import { Router } from 'express';
import { query } from '../lib/db';

const router = Router();

// GET /api/retail/kv  — return all key-value pairs as { key: parsedValue }
router.get('/kv', async (_req, res) => {
  try {
    const { rows } = await query('SELECT key, value FROM "RetailKV"');
    const out: Record<string, any> = {};
    for (const r of rows) {
      try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
    }
    res.json({ success: true, data: out });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/retail/kv/:key
router.get('/kv/:key', async (req, res) => {
  try {
    const { rows } = await query('SELECT value FROM "RetailKV" WHERE key = ?', [req.params.key]);
    if (!rows.length) return res.json({ success: true, data: null });
    let val: any = rows[0].value;
    try { val = JSON.parse(val); } catch {}
    res.json({ success: true, data: val });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/retail/kv/:key  — upsert a single key
router.put('/kv/:key', async (req, res) => {
  try {
    const value = typeof req.body.value === 'string' ? req.body.value : JSON.stringify(req.body.value);
    await query(
      `INSERT INTO "RetailKV"(key, value, updatedAt) VALUES(?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      [req.params.key, value]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
