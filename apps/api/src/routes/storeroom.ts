import { Router } from 'express';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, storeScope);

// ── GET /storeroom/boxes ── list all boxes ────────────────────────────────────
router.get('/boxes', async (req: AuthRequest, res) => {
  try {
    const boxes = await query(
      `SELECT b.*,
         (SELECT COUNT(*) FROM "StoreRoomItem" i WHERE i.boxId=b.id) as itemCount,
         (SELECT COALESCE(SUM(i.quantity),0) FROM "StoreRoomItem" i WHERE i.boxId=b.id) as scannedQty
       FROM "StoreRoomBox" b
       WHERE b.storeId=?
       ORDER BY b.createdAt DESC`,
      [req.storeId!]
    );
    return res.json({ success: true, data: boxes.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /storeroom/boxes ── create a new box ─────────────────────────────────
router.post('/boxes', async (req: AuthRequest, res) => {
  try {
    const { name, date } = req.body;
    if (!name || !date) {
      return res.status(400).json({ success: false, error: 'name and date are required' });
    }
    const id = uid();
    await query(
      `INSERT INTO "StoreRoomBox"(id, storeId, name, date, createdBy)
       VALUES(?,?,?,?,?)`,
      [id, req.storeId!, String(name).trim(), date, req.user!.name]
    );
    const box = await query(`SELECT * FROM "StoreRoomBox" WHERE id=?`, [id]);
    return res.json({ success: true, data: box.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /storeroom/boxes/:id ── box detail with items ─────────────────────────
router.get('/boxes/:id', async (req: AuthRequest, res) => {
  try {
    const boxRes = await query(
      `SELECT * FROM "StoreRoomBox" WHERE id=? AND storeId=?`,
      [req.params.id, req.storeId!]
    );
    if (!boxRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    const itemsRes = await query(
      `SELECT * FROM "StoreRoomItem" WHERE boxId=? ORDER BY scannedAt DESC`,
      [req.params.id]
    );
    return res.json({ success: true, data: { ...boxRes.rows[0], items: itemsRes.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /storeroom/boxes/:id/scan ── scan a product, match against catalog ───
router.post('/boxes/:id/scan', async (req: AuthRequest, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code required' });

    // Box must exist and be open
    const boxRes = await query(
      `SELECT * FROM "StoreRoomBox" WHERE id=? AND storeId=?`,
      [req.params.id, req.storeId!]
    );
    if (!boxRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    if (boxRes.rows[0].closedAt) {
      return res.status(400).json({ success: false, error: 'Box is closed' });
    }

    // Match against catalog by productId or fcId
    const catalogRes = await query(
      `SELECT * FROM "CatalogItem" WHERE storeId=? AND (productId=? OR fcId=?) LIMIT 1`,
      [req.storeId!, code.trim(), code.trim()]
    );
    if (!catalogRes.rows[0]) {
      return res.status(404).json({ success: false, error: `"${code}" not found in catalog` });
    }
    const cat = catalogRes.rows[0];

    // Check if this product already exists in the box → increment, else insert
    const existingRes = await query(
      `SELECT * FROM "StoreRoomItem" WHERE boxId=? AND productId=?`,
      [req.params.id, cat.productId]
    );

    let item: any;
    if (existingRes.rows[0]) {
      const newQty = existingRes.rows[0].quantity + 1;
      await query(
        `UPDATE "StoreRoomItem" SET quantity=?, scannedBy=?, scannedAt=datetime('now') WHERE id=?`,
        [newQty, req.user!.name, existingRes.rows[0].id]
      );
      const upd = await query(`SELECT * FROM "StoreRoomItem" WHERE id=?`, [existingRes.rows[0].id]);
      item = upd.rows[0];
    } else {
      const id = uid();
      await query(
        `INSERT INTO "StoreRoomItem"(id, boxId, storeId, productId, productName, brand, age, mrp, ctc, quantity, scannedBy, scannedAt)
         VALUES(?,?,?,?,?,?,?,?,?,1,?,datetime('now'))`,
        [id, req.params.id, req.storeId!, cat.productId, cat.productName,
         cat.brand || '', cat.age ?? null, cat.mrp, cat.ctc, req.user!.name]
      );
      const ins = await query(`SELECT * FROM "StoreRoomItem" WHERE id=?`, [id]);
      item = ins.rows[0];
    }

    return res.json({ success: true, data: { item, catalog: cat } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── PATCH /storeroom/items/:itemId ── adjust qty (+1 / -1), delete if hits 0 ─
router.patch('/items/:itemId', async (req: AuthRequest, res) => {
  try {
    const { delta } = req.body; // +1 or -1
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ success: false, error: 'delta must be 1 or -1' });
    }

    const itemRes = await query(
      `SELECT i.* FROM "StoreRoomItem" i
       JOIN "StoreRoomBox" b ON b.id=i.boxId
       WHERE i.id=? AND b.storeId=? AND b.closedAt IS NULL`,
      [req.params.itemId, req.storeId!]
    );
    if (!itemRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Item not found or box is closed' });
    }

    const newQty = itemRes.rows[0].quantity + delta;
    if (newQty <= 0) {
      await query(`DELETE FROM "StoreRoomItem" WHERE id=?`, [req.params.itemId]);
      return res.json({ success: true, data: null }); // null = item removed
    }

    await query(
      `UPDATE "StoreRoomItem" SET quantity=? WHERE id=?`,
      [newQty, req.params.itemId]
    );
    const upd = await query(`SELECT * FROM "StoreRoomItem" WHERE id=?`, [req.params.itemId]);
    return res.json({ success: true, data: upd.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /storeroom/boxes/:id/close ── compute totals and close ───────────────
router.post('/boxes/:id/close', async (req: AuthRequest, res) => {
  try {
    const boxRes = await query(
      `SELECT * FROM "StoreRoomBox" WHERE id=? AND storeId=?`,
      [req.params.id, req.storeId!]
    );
    if (!boxRes.rows[0]) return res.status(404).json({ success: false, error: 'Box not found' });
    if (boxRes.rows[0].closedAt) return res.status(400).json({ success: false, error: 'Box already closed' });

    // Compute totals from items
    const totRes = await query(
      `SELECT
         COALESCE(SUM(quantity), 0)          AS totalQty,
         COALESCE(SUM(mrp * quantity), 0)    AS totalMrp,
         COALESCE(SUM(ctc * quantity), 0)    AS totalCtc
       FROM "StoreRoomItem" WHERE boxId=?`,
      [req.params.id]
    );
    const { totalQty, totalMrp, totalCtc } = totRes.rows[0];

    await query(
      `UPDATE "StoreRoomBox"
       SET closedAt=datetime('now'), totalQty=?, totalMrp=?, totalCtc=?
       WHERE id=?`,
      [totalQty, totalMrp, totalCtc, req.params.id]
    );

    const updated = await query(`SELECT * FROM "StoreRoomBox" WHERE id=?`, [req.params.id]);
    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── DELETE /storeroom/boxes/:id ── delete an open box ────────────────────────
router.delete('/boxes/:id', async (req: AuthRequest, res) => {
  try {
    await query(
      `DELETE FROM "StoreRoomBox" WHERE id=? AND storeId=?`,
      [req.params.id, req.storeId!]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
