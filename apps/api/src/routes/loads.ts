import { Router } from 'express';
import multer from 'multer';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';
import { parseInwardCsv, aggregateLoad } from '../services/csv';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(authenticate, storeScope);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const loads = await query(
      `SELECT l.*, (SELECT COUNT(*) FROM "LoadProduct" lp WHERE lp.loadId=l.id) as _count_products
       FROM "Load" l WHERE l.storeId=? ORDER BY l.importedAt DESC`,
      [req.storeId!]
    );
    return res.json({ success: true, data: loads.rows.map(mapLoad) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/loads/search-product?q=  — find which loads contain a product
router.get('/search-product', async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const like = `%${q}%`;
    const rows = await query(
      `SELECT lp.*, l.id as _loadId, l.warehouseId, l.courier, l.docket, l.importedBy, l.importedAt, l.closedAt
       FROM "LoadProduct" lp
       JOIN "Load" l ON l.id = lp.loadId
       WHERE l.storeId=? AND (lp.productId LIKE ? OR lp.productName LIKE ? OR lp.barcode LIKE ?)
       ORDER BY l.importedAt DESC LIMIT 50`,
      [req.storeId!, like, like, like]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const lRes = await query(
      `SELECT * FROM "Load" l WHERE l.id=? AND l.storeId=?`,
      [req.params.id, req.storeId!]
    );
    if (!lRes.rows[0]) return res.status(404).json({ success: false, error: 'Load not found' });
    const pRes = await query(`SELECT * FROM "LoadProduct" WHERE loadId=?`, [req.params.id]);
    return res.json({ success: true, data: { ...mapLoad(lRes.rows[0]), products: pRes.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/import', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const rows = parseInwardCsv(req.file.buffer);
    const meta = aggregateLoad(rows);
    const sid = req.storeId!;

    await query(
      `INSERT INTO "Load"(id,storeId,warehouseId,courier,docket,boxes,totalMrp,totalCtc,importedBy,importedAt)
       VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         warehouseId=excluded.warehouseId, courier=excluded.courier, docket=excluded.docket,
         boxes=excluded.boxes, totalMrp=excluded.totalMrp, totalCtc=excluded.totalCtc,
         importedBy=excluded.importedBy, importedAt=datetime('now')`,
      [meta.loadId, sid, meta.warehouseId, meta.courier, meta.docket, meta.boxes, meta.totalMrp, meta.totalCtc, req.user!.name]
    );

    await query(`DELETE FROM "LoadProduct" WHERE loadId=?`, [meta.loadId]);
    for (const r of rows) {
      await query(
        `INSERT INTO "LoadProduct"(id,loadId,productId,productName,brandId,mrp,ctc,discount,quantity,barcode,stockType,poId,cgst,sgst,igst,hsnCode,age,gender,color,productType,boxId)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uid(), meta.loadId, r.productID, r.productname, r.brandID || null,
         parseFloat(r.mrp || '0'), parseFloat(r.ctc || '0'), parseFloat(r.discount || '0'),
         parseInt(r.quantity || '1', 10), r.barcode || null, r.stockType || null, r.poid || null,
         parseFloat(r.cgst || '0'), parseFloat(r.sgst || '0'), parseFloat(r.igst || '0'),
         r.hsnCode || null, r.age ? parseInt(r.age, 10) : null,
         r.gender || null, r.color || null, r.productType || null, r.boxID || null]
      );
    }

    const lRes = await query(`SELECT * FROM "Load" WHERE id=?`, [meta.loadId]);
    return res.json({ success: true, data: { load: mapLoad(lRes.rows[0]), productCount: rows.length } });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { comment, close } = req.body;
    if (comment !== undefined) {
      await query(`UPDATE "Load" SET comment=? WHERE id=? AND storeId=?`, [comment, req.params.id, req.storeId!]);
    }
    if (close) {
      await query(`UPDATE "Load" SET closedAt=datetime('now') WHERE id=? AND storeId=?`, [req.params.id, req.storeId!]);
    }
    const result = await query(`SELECT * FROM "Load" WHERE id=?`, [req.params.id]);
    return res.json({ success: true, data: mapLoad(result.rows[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/loads/:id/scan  — scan a product by productId or barcode
router.post('/:id/scan', async (req: AuthRequest, res) => {
  try {
    const { code } = req.body; // barcode, productId, or fcId
    if (!code) return res.status(400).json({ success: false, error: 'code required' });

    // Find matching product in this load (by productId or barcode)
    const found = await query(
      `SELECT * FROM "LoadProduct" WHERE loadId=? AND (productId=? OR barcode=?) LIMIT 1`,
      [req.params.id, code, code]
    );
    if (!found.rows[0]) {
      return res.status(404).json({ success: false, error: `Product "${code}" not found in this load` });
    }
    const product = found.rows[0];
    const newQty = (product.scannedQty ?? 0) + 1;
    await query(
      `UPDATE "LoadProduct" SET scannedQty=?, scannedBy=?, scannedAt=datetime('now') WHERE id=?`,
      [newQty, req.user!.name, product.id]
    );
    const updated = await query(`SELECT * FROM "LoadProduct" WHERE id=?`, [product.id]);
    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/loads/:id/scan/reset — reset all scanned quantities
router.post('/:id/scan/reset', async (req: AuthRequest, res) => {
  try {
    await query(
      `UPDATE "LoadProduct" SET scannedQty=0, scannedBy=NULL, scannedAt=NULL WHERE loadId=?`,
      [req.params.id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await query(`DELETE FROM "Load" WHERE id=? AND storeId=?`, [req.params.id, req.storeId!]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

function mapLoad(l: any) {
  return {
    ...l,
    loadId: l.id,
    importDate: l.importedAt,
    closeDate: l.closedAt,
    _count: { products: l._count_products ?? 0 },
  };
}

export default router;
