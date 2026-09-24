import { Router } from 'express';
import { query, uid } from '../lib/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  try {
    const stores = await query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM "User" u WHERE u.storeId = s.id) as staff,
        (SELECT COUNT(*) FROM "Load" l WHERE l.storeId = s.id) as loads,
        (SELECT COALESCE(SUM(c.quantity),0) FROM "CatalogItem" c WHERE c.storeId = s.id) as totalItems,
        (SELECT COALESCE(SUM(l.totalMrp),0) FROM "Load" l WHERE l.storeId = s.id) as totalMrp
      FROM "Store" s ORDER BY s.name ASC
    `);
    return res.json({ success: true, data: stores.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, code, city, state, phone } = req.body;
    if (!name || !code || !city) return res.status(400).json({ success: false, error: 'name, code, city required' });
    const id = uid();
    await query(`INSERT INTO "Store"(id,name,code,city,state,phone) VALUES(?,?,?,?,?,?)`, [id, name, code, city, state ?? null, phone ?? null]);
    const result = await query(`SELECT * FROM "Store" WHERE id=?`, [id]);
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

export default router;
