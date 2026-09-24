import { Router } from 'express';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, storeScope);

// GET /audits/active-list — all open (non-ended) audits for this store
router.get('/active-list', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT * FROM "Audit" WHERE storeId=? AND endedAt IS NULL ORDER BY startedAt DESC`,
      [req.storeId!]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /audits — all audits for this store
router.get('/', async (req: AuthRequest, res) => {
  try {
    const audits = await query(
      `SELECT a.*, (SELECT COUNT(*) FROM "AuditItem" ai WHERE ai.auditId=a.id) as _count_items
       FROM "Audit" a WHERE a.storeId=? ORDER BY a.startedAt DESC`,
      [req.storeId!]
    );
    const data = audits.rows.map((a: any) => ({
      ...a, _count: { items: a._count_items },
      startDate: a.startedAt, endDate: a.endedAt, closedAt: a.endedAt, subCategory: a.subcategory,
    }));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /audits/:id — single audit with items
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const aRes = await query(`SELECT * FROM "Audit" WHERE id=? AND storeId=?`, [req.params.id, req.storeId!]);
    if (!aRes.rows[0]) return res.status(404).json({ success: false, error: 'Audit not found' });
    const iRes = await query(`SELECT * FROM "AuditItem" WHERE auditId=? ORDER BY subcategory, productName`, [req.params.id]);
    const items = iRes.rows.map((i: any) => ({
      ...i,
      availableQty: i.availQty,
      matchedDate: i.matchedAt,
    }));
    return res.json({ success: true, data: { ...aRes.rows[0], items } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /audits — start a new audit for a category (optionally a specific subcategory)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { category, subcategory } = req.body;
    if (!category) return res.status(400).json({ success: false, error: 'category required' });
    const sid = req.storeId!;

    // Load products from CatalogItem for this category (all subcategories, or specific one)
    const catItems = subcategory
      ? await query(
          `SELECT * FROM "CatalogItem" WHERE storeId=? AND category=? AND subcategory=? ORDER BY subcategory, productName`,
          [sid, category, subcategory]
        )
      : await query(
          `SELECT * FROM "CatalogItem" WHERE storeId=? AND category=? ORDER BY subcategory, productName`,
          [sid, category]
        );

    const auditId = uid();
    await query(
      `INSERT INTO "Audit"(id,storeId,category,subcategory,initiatedBy) VALUES(?,?,?,?,?)`,
      [auditId, sid, category, subcategory ?? '', req.user!.name]
    );

    // Insert one AuditItem per unique product, including its subcategory
    for (const c of catItems.rows) {
      await query(
        `INSERT INTO "AuditItem"(id,auditId,productId,productName,subcategory,availQty,matchedQty,mrp,ctc) VALUES(?,?,?,?,?,?,0,?,?)`,
        [uid(), auditId, c.productId, c.productName, c.subcategory ?? '', c.quantity, c.mrp, c.ctc]
      );
    }

    const aRes = await query(`SELECT * FROM "Audit" WHERE id=?`, [auditId]);
    const iRes = await query(`SELECT * FROM "AuditItem" WHERE auditId=? ORDER BY subcategory, productName`, [auditId]);
    return res.status(201).json({ success: true, data: { ...aRes.rows[0], items: iRes.rows } });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

// POST /audits/:id/scan — scan an FC ID barcode; increments matchedQty by 1
router.post('/:id/scan', async (req: AuthRequest, res) => {
  try {
    const { fcId } = req.body;
    if (!fcId) return res.status(400).json({ success: false, error: 'fcId required' });

    const auditRes = await query(`SELECT * FROM "Audit" WHERE id=? AND storeId=?`, [req.params.id, req.storeId!]);
    if (!auditRes.rows[0]) return res.status(404).json({ success: false, error: 'Audit not found' });
    const audit = auditRes.rows[0];
    if (audit.endedAt) return res.status(400).json({ success: false, error: 'Audit is already closed' });

    const itemRes = await query(
      `SELECT * FROM "AuditItem" WHERE auditId=? AND productId=?`,
      [req.params.id, fcId]
    );
    if (!itemRes.rows[0]) {
      return res.status(404).json({
        success: false,
        error: `FC ID ${fcId} not found in "${audit.category}" category`,
      });
    }
    const item = itemRes.rows[0];

    if (item.matchedQty >= item.availQty) {
      return res.status(400).json({
        success: false,
        error: `All ${item.availQty} unit(s) of this product are already matched`,
        alreadyDone: true,
        item: { ...item, availableQty: item.availQty },
      });
    }

    await query(
      `UPDATE "AuditItem" SET matchedQty=matchedQty+1, matchedBy=?, matchedAt=datetime('now') WHERE id=?`,
      [req.user!.name, item.id]
    );

    const updated = await query(`SELECT * FROM "AuditItem" WHERE id=?`, [item.id]);
    const row = updated.rows[0];
    return res.json({
      success: true,
      data: { ...row, availableQty: row.availQty, matchedDate: row.matchedAt },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// PATCH /audits/:id/items/:itemId — manually update matchedQty
router.patch('/:id/items/:itemId', async (req: AuthRequest, res) => {
  try {
    const { matchedQty } = req.body;
    await query(
      `UPDATE "AuditItem" SET matchedQty=?, matchedBy=?, matchedAt=datetime('now') WHERE id=?`,
      [matchedQty, req.user!.name, req.params.itemId]
    );
    const result = await query(`SELECT * FROM "AuditItem" WHERE id=?`, [req.params.itemId]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

// PATCH /audits/:id/close — end the audit
router.patch('/:id/close', async (req: AuthRequest, res) => {
  try {
    await query(
      `UPDATE "Audit" SET endedAt=datetime('now') WHERE id=? AND storeId=?`,
      [req.params.id, req.storeId!]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
