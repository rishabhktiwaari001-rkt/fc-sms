import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../lib/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ success: false, error: 'Phone and password required' });
  try {
    const result = await query(
      `SELECT u.*, s.name as storeName FROM "User" u JOIN "Store" s ON s.id = u.storeId
       WHERE u.phone = ? AND u.isActive = 1`,
      [phone]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, name: user.name, phone: user.phone, role: user.role, storeId: user.storeId, storeName: user.storeName },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    return res.json({ success: true, data: { token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, storeId: user.storeId, storeName: user.storeName } } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/me', authenticate, (req: AuthRequest, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
