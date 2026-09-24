import { Router } from 'express';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, storeScope);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const members = await query(
      `SELECT * FROM "Member" WHERE storeId=? ORDER BY joinedAt DESC`,
      [req.storeId!]
    );
    return res.json({ success: true, data: members.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await query(`SELECT * FROM "Member" WHERE id=? AND storeId=?`, [req.params.id, req.storeId!]);
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, loyaltyId, dob, tier, points, spent } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, error: 'name and phone required' });
    const id = uid();
    await query(
      `INSERT INTO "Member"(id,storeId,name,phone,email,loyaltyId,dob,tier,points,spent)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [id, req.storeId!, name, phone, email ?? null, loyaltyId ?? null, dob ?? null, tier ?? 'Bronze', points ?? 0, spent ?? 0]
    );
    const result = await query(`SELECT * FROM "Member" WHERE id=?`, [id]);
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, loyaltyId, dob, tier, points, spent } = req.body;
    await query(
      `UPDATE "Member" SET
        name=COALESCE(?,name), phone=COALESCE(?,phone), email=COALESCE(?,email),
        loyaltyId=COALESCE(?,loyaltyId), dob=COALESCE(?,dob),
        tier=COALESCE(?,tier), points=COALESCE(?,points), spent=COALESCE(?,spent)
       WHERE id=? AND storeId=?`,
      [name ?? null, phone ?? null, email ?? null, loyaltyId ?? null, dob ?? null,
       tier ?? null, points ?? null, spent ?? null, req.params.id, req.storeId!]
    );
    const result = await query(`SELECT * FROM "Member" WHERE id=?`, [req.params.id]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

export default router;
