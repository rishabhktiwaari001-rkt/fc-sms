import { Router } from 'express';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, storeScope);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const srs = await query(`SELECT * FROM "StockReturn" WHERE storeId=? ORDER BY createdAt DESC`, [req.storeId!]);
    return res.json({ success: true, data: srs.rows.map(mapSR) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const r = await query(`SELECT * FROM "StockReturn" WHERE id=? AND storeId=?`, [req.params.id, req.storeId!]);
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'SR not found' });
    return res.json({ success: true, data: mapSR(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const id = uid();
    const refNo = b.refNo || `SR-${Date.now().toString().slice(-6)}`;
    await query(
      `INSERT INTO "StockReturn"(id,storeId,refNo,process,storeCode,requestedBy,approvedBy,category,subCategory,
        totalQty,totalMrp,totalCtc,reason,remark,transporterName,docketNo,boxes,dispatchDate,
        cnAmount,cn120Days,cn180Days,cnComment,isClosed)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.storeId!, refNo, b.process, b.storeCode ?? null, b.requestedBy ?? null, b.approvedBy ?? null,
       b.category ?? null, b.subCategory ?? null, b.totalQty ?? null, b.totalMrp ?? null, b.totalCtc ?? null,
       b.reason ?? null, b.remark ?? null, b.transporterName ?? null, b.docketNo ?? null, b.boxes ?? null,
       b.dispatchDate || null, b.cnAmount ?? null, b.cn120Days ?? null, b.cn180Days ?? null,
       b.cnComment ?? null, b.isClosed ? 1 : 0]
    );
    const result = await query(`SELECT * FROM "StockReturn" WHERE id=?`, [id]);
    return res.status(201).json({ success: true, data: mapSR(result.rows[0]) });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    await query(
      `UPDATE "StockReturn" SET
        process=COALESCE(?,process), storeCode=COALESCE(?,storeCode),
        requestedBy=COALESCE(?,requestedBy), approvedBy=COALESCE(?,approvedBy),
        category=COALESCE(?,category), subCategory=COALESCE(?,subCategory),
        totalQty=COALESCE(?,totalQty), totalMrp=COALESCE(?,totalMrp),
        totalCtc=COALESCE(?,totalCtc), reason=COALESCE(?,reason),
        remark=COALESCE(?,remark), transporterName=COALESCE(?,transporterName),
        docketNo=COALESCE(?,docketNo), boxes=COALESCE(?,boxes),
        dispatchDate=COALESCE(?,dispatchDate), cnAmount=COALESCE(?,cnAmount),
        cn120Days=COALESCE(?,cn120Days), cn180Days=COALESCE(?,cn180Days),
        cnComment=COALESCE(?,cnComment), isClosed=COALESCE(?,isClosed),
        updatedAt=datetime('now')
      WHERE id=? AND storeId=?`,
      [b.process ?? null, b.storeCode ?? null, b.requestedBy ?? null, b.approvedBy ?? null,
       b.category ?? null, b.subCategory ?? null, b.totalQty ?? null, b.totalMrp ?? null,
       b.totalCtc ?? null, b.reason ?? null, b.remark ?? null, b.transporterName ?? null,
       b.docketNo ?? null, b.boxes ?? null, b.dispatchDate ?? null, b.cnAmount ?? null,
       b.cn120Days ?? null, b.cn180Days ?? null, b.cnComment ?? null,
       b.isClosed !== undefined ? (b.isClosed ? 1 : 0) : null,
       req.params.id, req.storeId!]
    );
    const result = await query(`SELECT * FROM "StockReturn" WHERE id=?`, [req.params.id]);
    return res.json({ success: true, data: mapSR(result.rows[0]) });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

function mapSR(r: any) {
  return { ...r, closed: r.isClosed, transporter: r.transporterName };
}

export default router;
