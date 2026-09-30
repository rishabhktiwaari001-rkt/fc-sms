import { Router } from 'express';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';
import { query, uid } from '../lib/db';

const router = Router();
router.use(authenticate, storeScope);

// ── helpers ───────────────────────────────────────────────────────────────────
function denomTotal(e: any) {
  return (
    (e.d2000 || 0) * 2000 +
    (e.d500  || 0) * 500  +
    (e.d200  || 0) * 200  +
    (e.d100  || 0) * 100  +
    (e.d50   || 0) * 50   +
    (e.d20   || 0) * 20   +
    (e.d10   || 0) * 10   +
    (e.d5    || 0) * 5    +
    (e.d2    || 0) * 2    +
    (e.d1    || 0) * 1
  );
}

// GET /cashbook — list (optionally by month YYYY-MM)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const month = req.query.month ? String(req.query.month) : null; // e.g. "2026-09"
    let rows;
    if (month) {
      rows = await query(
        `SELECT * FROM "CashbookEntry" WHERE storeId=? AND date LIKE ? ORDER BY date DESC`,
        [req.storeId!, `${month}%`]
      );
    } else {
      rows = await query(
        `SELECT * FROM "CashbookEntry" WHERE storeId=? ORDER BY date DESC LIMIT 60`,
        [req.storeId!]
      );
    }
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /cashbook/today  — shortcut for today's entry
router.get('/today', async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await query(
      `SELECT * FROM "CashbookEntry" WHERE storeId=? AND date=?`,
      [req.storeId!, today]
    );
    return res.json({ success: true, data: rows.rows[0] ?? null });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /cashbook/opening?date=YYYY-MM-DD  — returns opening cash for a date
// Opening cash = denomination total of the previous day's entry
router.get('/opening', async (req: AuthRequest, res) => {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    // Find the most recent entry BEFORE this date
    const prev = await query(
      `SELECT * FROM "CashbookEntry" WHERE storeId=? AND date < ? ORDER BY date DESC LIMIT 1`,
      [req.storeId!, date]
    );
    const prevEntry = prev.rows[0] ?? null;
    // Opening = previous day's denomination total (physical cash counted in register after deposit).
    // If no denominations were entered, fall back to expected closing (opening + cash sales − deposit).
    const dt = prevEntry ? denomTotal(prevEntry) : 0;
    const expectedClosing = prevEntry
      ? (prevEntry.openingCash || 0) + (prevEntry.cbCash || 0) - (prevEntry.depositAmount || 0)
      : 0;
    const opening = prevEntry ? (dt > 0 ? dt : expectedClosing) : 0;
    return res.json({ success: true, data: { opening, prevDate: prevEntry?.date ?? null } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /cashbook/:date  — get single entry by date YYYY-MM-DD
router.get('/:date', async (req: AuthRequest, res) => {
  try {
    const rows = await query(
      `SELECT * FROM "CashbookEntry" WHERE storeId=? AND date=?`,
      [req.storeId!, req.params.date]
    );
    return res.json({ success: true, data: rows.rows[0] ?? null });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /cashbook  — upsert entry for a date
router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      date,
      openingCash = 0,
      cbCash = 0, cbCreditCard = 0, cbUpi = 0, cbManualBill = 0, cbCreditNote = 0,
      sysCash = 0, sysCreditCard = 0, sysPinelab = 0, sysUpi = 0, sysCreditNote = 0,
      depositDate = null, depositAmount = 0, depositBank = 'HDFC BANK',
      d2000 = 0, d500 = 0, d200 = 0, d100 = 0, d50 = 0,
      d20 = 0, d10 = 0, d5 = 0, d2 = 0, d1 = 0,
      remark = null,
    } = req.body;

    if (!date) return res.status(400).json({ success: false, error: 'date required (YYYY-MM-DD)' });

    const id = uid();
    const user = (req as any).user?.name ?? '';

    await query(
      `INSERT INTO "CashbookEntry"(
        id,storeId,date,openingCash,
        cbCash,cbCreditCard,cbUpi,cbManualBill,cbCreditNote,
        sysCash,sysCreditCard,sysPinelab,sysUpi,sysCreditNote,
        depositDate,depositAmount,depositBank,
        d2000,d500,d200,d100,d50,d20,d10,d5,d2,d1,
        remark,createdBy
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(storeId,date) DO UPDATE SET
        openingCash=excluded.openingCash,
        cbCash=excluded.cbCash, cbCreditCard=excluded.cbCreditCard,
        cbUpi=excluded.cbUpi, cbManualBill=excluded.cbManualBill,
        cbCreditNote=excluded.cbCreditNote,
        sysCash=excluded.sysCash, sysCreditCard=excluded.sysCreditCard,
        sysPinelab=excluded.sysPinelab, sysUpi=excluded.sysUpi,
        sysCreditNote=excluded.sysCreditNote,
        depositDate=excluded.depositDate, depositAmount=excluded.depositAmount,
        depositBank=excluded.depositBank,
        d2000=excluded.d2000, d500=excluded.d500, d200=excluded.d200,
        d100=excluded.d100, d50=excluded.d50, d20=excluded.d20,
        d10=excluded.d10, d5=excluded.d5, d2=excluded.d2, d1=excluded.d1,
        remark=excluded.remark, updatedAt=datetime('now')`,
      [
        id, req.storeId!, date, openingCash,
        cbCash, cbCreditCard, cbUpi, cbManualBill, cbCreditNote,
        sysCash, sysCreditCard, sysPinelab, sysUpi, sysCreditNote,
        depositDate, depositAmount, depositBank,
        d2000, d500, d200, d100, d50, d20, d10, d5, d2, d1,
        remark, user,
      ]
    );

    const saved = await query(
      `SELECT * FROM "CashbookEntry" WHERE storeId=? AND date=?`,
      [req.storeId!, date]
    );
    return res.json({ success: true, data: saved.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /cashbook/summary/monthly?year=2026 — month-wise totals
router.get('/summary/monthly', async (req: AuthRequest, res) => {
  try {
    const year = String(req.query.year || new Date().getFullYear());
    const rows = await query(
      `SELECT
        substr(date,1,7) AS month,
        COUNT(*) AS days,
        SUM(cbCash+cbCreditCard+cbUpi+cbManualBill-cbCreditNote) AS cbTotal,
        SUM(sysCash+sysCreditCard+sysPinelab+sysUpi-sysCreditNote) AS sysTotal,
        SUM(depositAmount) AS deposits
       FROM "CashbookEntry"
       WHERE storeId=? AND date LIKE ?
       GROUP BY substr(date,1,7)
       ORDER BY month DESC`,
      [req.storeId!, `${year}%`]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
