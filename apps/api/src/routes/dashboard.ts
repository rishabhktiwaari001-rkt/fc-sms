import { Router } from 'express';
import { query } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/stats', authenticate, storeScope, async (req: AuthRequest, res) => {
  try {
    const sid = req.storeId!;
    const [loads, openLoads, catalog, audits, srs, members] = await Promise.all([
      query(`SELECT COUNT(*) as c FROM "Load" WHERE storeId=?`, [sid]),
      query(`SELECT COUNT(*) as c FROM "Load" WHERE storeId=? AND closedAt IS NULL`, [sid]),
      query(`SELECT COALESCE(SUM(quantity),0) as c FROM "CatalogItem" WHERE storeId=?`, [sid]),
      query(`SELECT COUNT(*) as c FROM "Audit" WHERE storeId=? AND endedAt IS NULL`, [sid]),
      query(`SELECT COUNT(*) as c FROM "StockReturn" WHERE storeId=? AND isClosed=0`, [sid]),
      query(`SELECT COUNT(*) as c FROM "Member" WHERE storeId=?`, [sid]),
    ]);
    res.json({ success: true, data: {
      totalLoads: loads.rows[0].c,
      openLoads: openLoads.rows[0].c,
      catalogItems: catalog.rows[0].c,
      openAudits: audits.rows[0].c,
      openSRs: srs.rows[0].c,
      totalMembers: members.rows[0].c,
    }});
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
