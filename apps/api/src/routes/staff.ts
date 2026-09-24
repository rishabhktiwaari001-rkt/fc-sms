import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, storeScope);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const staff = await query(
      `SELECT u.id, u.name, u.phone, u.role, u.isActive, u.createdAt, s.name as storeName
       FROM "User" u JOIN "Store" s ON s.id = u.storeId
       WHERE u.storeId=? ORDER BY u.name ASC`,
      [req.user!.storeId]
    );
    return res.json({ success: true, data: staff.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/', requireRole('STORE_ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { name, phone, role, password } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ success: false, error: 'name, phone, password required' });
    const hashed = await bcrypt.hash(password, 10);
    const id = uid();
    await query(
      `INSERT INTO "User"(id,name,phone,role,password,storeId) VALUES(?,?,?,?,?,?)`,
      [id, name, phone, role ?? 'STAFF', hashed, req.user!.storeId]
    );
    const result = await query(`SELECT id,name,phone,role,isActive,createdAt FROM "User" WHERE id=?`, [id]);
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

router.patch('/:id/toggle', requireRole('STORE_ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const current = await query(`SELECT isActive FROM "User" WHERE id=? AND storeId=?`, [req.params.id, req.user!.storeId]);
    if (!current.rows[0]) return res.status(404).json({ success: false, error: 'Staff not found' });
    const newActive = current.rows[0].isActive ? 0 : 1;
    await query(`UPDATE "User" SET isActive=? WHERE id=?`, [newActive, req.params.id]);
    const result = await query(`SELECT id,name,phone,role,isActive,createdAt FROM "User" WHERE id=?`, [req.params.id]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
