import { Router } from 'express';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, storeScope);

// ── GET /billing/invoices — list invoices ────────────────────────────────────
router.get('/invoices', async (req: AuthRequest, res) => {
  try {
    const rows = await query(
      `SELECT * FROM "Invoice" WHERE storeId=? ORDER BY createdAt DESC LIMIT 200`,
      [req.storeId!]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /billing/invoices/:id — single invoice with items ────────────────────
router.get('/invoices/:id', async (req: AuthRequest, res) => {
  try {
    const inv = await query(
      `SELECT * FROM "Invoice" WHERE id=? AND storeId=?`,
      [req.params.id, req.storeId!]
    );
    if (!inv.rows[0]) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const items = await query(
      `SELECT * FROM "InvoiceItem" WHERE invoiceId=? ORDER BY rowid`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...inv.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /billing/invoices — create invoice ──────────────────────────────────
router.post('/invoices', async (req: AuthRequest, res) => {
  try {
    const {
      customerName = '', customerPhone = '', salesperson = '',
      items = [], paymentMode = 'Cash', note = '',
    } = req.body;

    if (!items.length) return res.status(400).json({ success: false, error: 'No items in invoice' });

    // Generate invoice number: INV-YYYYMMDD-NNNN
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countRes = await query(
      `SELECT COUNT(*) as c FROM "Invoice" WHERE storeId=? AND invoiceNo LIKE ?`,
      [req.storeId!, `INV-${today}-%`]
    );
    const seq = String((countRes.rows[0].c ?? 0) + 1).padStart(4, '0');
    const invoiceNo = `INV-${today}-${seq}`;

    // Compute totals — GST is INCLUSIVE in MRP (extract, not add)
    let subtotal = 0;
    let discountAmt = 0;
    let taxAmt = 0;

    const processedItems = items.map((item: any) => {
      const mrp = Number(item.mrp) || 0;
      const qty = Number(item.qty) || 1;
      const discPct = Number(item.discountPct) || 0;
      const gstPct = Number(item.gstPct) || 0;

      const grossAmt = mrp * qty;                          // already includes GST
      const discAmt  = grossAmt * discPct / 100;
      const lineAmt  = grossAmt - discAmt;                 // total payable (GST inclusive)
      // Extract GST portion from payable amount
      const taxOn    = gstPct > 0 ? lineAmt * gstPct / (100 + gstPct) : 0;

      subtotal    += grossAmt;
      discountAmt += discAmt;
      taxAmt      += taxOn;

      return { ...item, amount: parseFloat(lineAmt.toFixed(2)) };
    });

    const totalAmt = subtotal - discountAmt; // GST already inside, not added on top

    const invId = uid();
    await query(
      `INSERT INTO "Invoice"(id,storeId,invoiceNo,customerName,customerPhone,salesperson,subtotal,discountAmt,taxAmt,totalAmt,paymentMode,note,createdBy)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [invId, req.storeId!, invoiceNo, customerName, customerPhone, salesperson,
       parseFloat(subtotal.toFixed(2)), parseFloat(discountAmt.toFixed(2)),
       parseFloat(taxAmt.toFixed(2)), parseFloat(totalAmt.toFixed(2)),
       paymentMode, note || null, req.user!.name]
    );

    for (const item of processedItems) {
      await query(
        `INSERT INTO "InvoiceItem"(id,invoiceId,fcId,productName,category,mrp,qty,discountPct,gstPct,amount)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [uid(), invId, item.fcId || '', item.productName || '', item.category || '',
         item.mrp, item.qty, item.discountPct || 0, item.gstPct || 0, item.amount]
      );
    }

    const full = await query(`SELECT * FROM "Invoice" WHERE id=?`, [invId]);
    const fullItems = await query(`SELECT * FROM "InvoiceItem" WHERE invoiceId=?`, [invId]);

    res.json({ success: true, data: { ...full.rows[0], items: fullItems.rows } });
  } catch (err) {
    console.error('[billing/invoices POST]', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /billing/store-profile — get store GST details ──────────────────────
router.get('/store-profile', async (req: AuthRequest, res) => {
  try {
    const profile = await query(`SELECT * FROM "StoreSettings" WHERE storeId=?`, [req.storeId!]);
    if (profile.rows[0]) {
      return res.json({ success: true, data: profile.rows[0] });
    }
    // Fall back to Store record if no profile saved yet
    const store = await query(`SELECT * FROM "Store" WHERE id=?`, [req.storeId!]);
    const s = store.rows[0] || {};
    res.json({ success: true, data: {
      storeId: req.storeId,
      gstin: '', legalName: s.name || '', tradeName: s.name || '',
      address: '', city: s.city || '', state: s.state || '',
      pincode: '', phone: s.phone || '', email: '', panNo: '',
    }});
  } catch (err) {
    console.error('[billing/store-profile GET]', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── PUT /billing/store-profile — save store GST details ─────────────────────
router.put('/store-profile', async (req: AuthRequest, res) => {
  try {
    const { gstin='', legalName='', tradeName='', address='', city='', state='', pincode='', phone='', email='', panNo='' } = req.body;
    await query(`
      INSERT INTO "StoreSettings"(storeId,gstin,legalName,tradeName,address,city,state,pincode,phone,email,panNo,updatedAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(storeId) DO UPDATE SET
        gstin=excluded.gstin, legalName=excluded.legalName, tradeName=excluded.tradeName,
        address=excluded.address, city=excluded.city, state=excluded.state,
        pincode=excluded.pincode, phone=excluded.phone, email=excluded.email,
        panNo=excluded.panNo, updatedAt=datetime('now')
    `, [req.storeId!, gstin, legalName, tradeName, address, city, state, pincode, phone, email, panNo]);
    const updated = await query(`SELECT * FROM "StoreSettings" WHERE storeId=?`, [req.storeId!]);
    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[billing/store-profile PUT]', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /billing/lookup — search catalog by FC ID or name ───────────────────
router.get('/lookup', async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const rows = await query(
      `SELECT fcId, productId, productName, mrp, ctc, brand, category, subcategory
       FROM "CatalogItem"
       WHERE storeId=? AND (fcId=? OR productId=? OR productName LIKE ?)
       LIMIT 10`,
      [req.storeId!, q, q, `%${q}%`]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
