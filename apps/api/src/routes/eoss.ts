import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
router.use(authenticate, storeScope);

// ── GET /eoss — list all EOSS items for store ────────────────────────────────
router.get('/', async (req: AuthRequest, res) => {
  try {
    const items = await query(
      `SELECT * FROM "EossItem" WHERE storeId=? ORDER BY createdAt DESC`,
      [req.storeId!]
    );
    res.json({ success: true, data: items.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /eoss/stats — summary counts ────────────────────────────────────────
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const r = await query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN matchedStatus='matched' THEN 1 ELSE 0 END) as matched,
        SUM(CASE WHEN matchedStatus='not_found' THEN 1 ELSE 0 END) as notFound,
        SUM(CASE WHEN matchedStatus='pending' THEN 1 ELSE 0 END) as pending
       FROM "EossItem" WHERE storeId=?`,
      [req.storeId!]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /eoss/import — upload Excel, populate EossItem from CatalogItem ─────
router.post('/import', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) return res.status(400).json({ success: false, error: 'Excel is empty' });

    // Detect column names robustly (handle case, spaces, lowercase variants)
    const sample = rows[0];
    const keys = Object.keys(sample);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

    // productId: exact match 'productid', never pick 'fcfid' (store franchise code)
    const productIdKey = keys.find(k => norm(k) === 'productid')
      ?? keys.find(k => norm(k).includes('product') && !norm(k).includes('fcfid'))
      ?? '';
    const offerKey  = keys.find(k => norm(k).includes('offer'))  ?? '';
    const couponKey = keys.find(k => norm(k).includes('coupon')) ?? '';

    console.log('[EOSS import] detected columns:', { keys, productIdKey, offerKey, couponKey });

    if (!productIdKey) return res.status(400).json({
      success: false,
      error: `Cannot find Product Id column. Columns found: ${keys.join(', ')}`
    });

    const sid = req.storeId!;

    // Clear existing EOSS items for this store
    await query(`DELETE FROM "EossItem" WHERE storeId=?`, [sid]);

    let inserted = 0;
    let skipped  = 0;

    for (const row of rows) {
      const productId  = String(row[productIdKey] ?? '').trim();
      const offer      = String(row[offerKey]     ?? '').trim() || null;
      const couponCode = String(row[couponKey]    ?? '').trim() || null;
      if (!productId) { skipped++; continue; }

      // Look up product details from CatalogItem
      const catRes = await query(
        `SELECT * FROM "CatalogItem" WHERE storeId=? AND productId=? LIMIT 1`,
        [sid, productId]
      );
      const cat = catRes.rows[0];

      const productName = cat?.productName ?? `Product ${productId}`;
      const mrp         = cat?.mrp ?? 0;
      const ctc         = cat?.ctc ?? 0;
      const brand       = cat?.brand ?? null;
      const category    = cat?.category ?? '';
      const subcategory = cat?.subcategory ?? '';

      await query(
        `INSERT INTO "EossItem"(id,storeId,fcId,productName,mrp,ctc,brand,category,subcategory,offer,couponCode,matchedStatus,isActive)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',1)
         ON CONFLICT(storeId,fcId) DO UPDATE SET
           productName=excluded.productName, mrp=excluded.mrp, ctc=excluded.ctc,
           brand=excluded.brand, category=excluded.category, subcategory=excluded.subcategory,
           offer=excluded.offer, couponCode=excluded.couponCode,
           matchedStatus='pending', matchedBy=NULL, matchedAt=NULL,
           updatedAt=datetime('now')`,
        [uid(), sid, productId, productName, mrp, ctc, brand, category, subcategory, offer, couponCode]
      );
      inserted++;
    }

    const stats = await query(
      `SELECT COUNT(*) as total FROM "EossItem" WHERE storeId=?`, [sid]
    );

    res.json({ success: true, data: { inserted, skipped, total: stats.rows[0].total } });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /eoss/scan — look up a product by FC ID ────────────────────────────
router.post('/scan', async (req: AuthRequest, res) => {
  try {
    const { fcId } = req.body;
    if (!fcId) return res.status(400).json({ success: false, error: 'fcId required' });

    const r = await query(
      `SELECT * FROM "EossItem" WHERE storeId=? AND fcId=?`,
      [req.storeId!, String(fcId).trim()]
    );

    if (!r.rows[0]) {
      return res.status(404).json({
        success: false,
        error: `FC ID ${fcId} not found in EOSS list`,
      });
    }

    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── PATCH /eoss/:id/status — mark matched or not_found ──────────────────────
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body; // 'matched' | 'not_found' | 'pending'
    if (!['matched', 'not_found', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    await query(
      `UPDATE "EossItem" SET matchedStatus=?, matchedBy=?, matchedAt=datetime('now'), updatedAt=datetime('now')
       WHERE id=? AND storeId=?`,
      [status, req.user!.name, req.params.id, req.storeId!]
    );
    const result = await query(`SELECT * FROM "EossItem" WHERE id=?`, [req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── PATCH /eoss/:id — update item fields ─────────────────────────────────────
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { discountPct, eossPrice, brand, isActive } = req.body;
    await query(
      `UPDATE "EossItem" SET
        discountPct=COALESCE(?,discountPct), eossPrice=COALESCE(?,eossPrice),
        brand=COALESCE(?,brand), isActive=COALESCE(?,isActive), updatedAt=datetime('now')
       WHERE id=? AND storeId=?`,
      [discountPct ?? null, eossPrice ?? null, brand ?? null,
       isActive !== undefined ? (isActive ? 1 : 0) : null,
       req.params.id, req.storeId!]
    );
    const result = await query(`SELECT * FROM "EossItem" WHERE id=?`, [req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, error: String(err) });
  }
});

export default router;
