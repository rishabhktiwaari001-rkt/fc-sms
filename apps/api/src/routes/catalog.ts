import { Router } from 'express';
import multer from 'multer';
import { query, uid } from '../lib/db';
import { authenticate, storeScope, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(authenticate, storeScope);

// ── CSV Parser ──────────────────────────────────────────────────────────────
// Supports two CSV formats:
//
// FORMAT A — Pivot-style stock report (FC warehouse export):
//   Category,(All) or Category,Boys
//   Subcategory,Ethnic Wear
//   ,
//   Row Labels,Sum of AvailableQuantity
//   0 - 3 M,11
//   Grand Total,422
//   (multiple such sections per file)
//
// FORMAT B — Flat CSV with header row:
//   Category,Subcategory,AgeGroup,Quantity
//   Boys,Ethnic Wear,0-3M,11
//   ...

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function splitCsvLine(line: string): string[] {
  // Handle quoted fields
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

// ── Parse flat product-level CSV (FirstCry stock export) ──────────────────────
// Columns: ProductID, ProductName, AvailableQuantity, MRP, CTC, Category,
//          Subcategory, Brand, Gender, Age, ProductDescription, ...
function parseProductLevelCsv(buffer: Buffer) {
  const raw = stripBom(buffer.toString('utf-8'));
  const lines = raw.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) return null;

  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

  const idxProductId  = headers.findIndex(h => h === 'productid');
  const idxMrp        = headers.findIndex(h => h === 'mrp');
  if (idxProductId < 0 || idxMrp < 0) return null;  // not product-level format

  const idxName     = headers.findIndex(h => h === 'productname');
  const idxQty      = headers.findIndex(h => h === 'availablequantity');
  const idxCtc      = headers.findIndex(h => h === 'ctc');
  const idxCategory = headers.findIndex(h => h === 'category');
  const idxSubcat   = headers.findIndex(h => h === 'subcategory');
  const idxBrand    = headers.findIndex(h => h === 'brand');
  const idxGender   = headers.findIndex(h => h === 'gender');
  const idxAge      = headers.findIndex(h => h === 'age');

  type ProductRow = {
    productId: string; productName: string; quantity: number;
    mrp: number; ctc: number; category: string; subcategory: string;
    brand: string; gender: string | null; age: string | null;
  };

  // Use a Map to group by productId — same product can appear in multiple
  // shelf-location rows; we SUM quantities and keep the first row's metadata.
  const pidMap = new Map<string, ProductRow>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const productId = cells[idxProductId]?.trim();
    if (!productId) continue;
    const qty = parseInt(cells[idxQty] ?? '0', 10) || 0;
    const existing = pidMap.get(productId);
    if (existing) {
      existing.quantity += qty;   // accumulate across shelf rows
    } else {
      pidMap.set(productId, {
        productId,
        productName: cells[idxName]?.trim() ?? '',
        quantity:    qty,
        mrp:         parseFloat(cells[idxMrp] ?? '0') || 0,
        ctc:         parseFloat(cells[idxCtc] ?? '0') || 0,
        category:    cells[idxCategory]?.trim() ?? '',
        subcategory: cells[idxSubcat]?.trim() ?? '',
        brand:       cells[idxBrand]?.trim() ?? '',
        gender:      cells[idxGender]?.trim() || null,
        age:         cells[idxAge]?.trim() || null,
      });
    }
  }
  const products = Array.from(pidMap.values());
  return products.length > 0 ? products : null;
}

function parseInventoryCsv(buffer: Buffer) {
  const raw = stripBom(buffer.toString('utf-8'));
  const lines = raw.split(/\r?\n/).map(l => l.trimEnd());
  const items: Array<{ category: string; subcategory: string; ageGroup: string; qty: number }> = [];

  // ── Try FORMAT A (pivot) first ──
  let category = '';
  let subcategory = '';
  let inData = false;

  for (const line of lines) {
    const cells = splitCsvLine(line);
    const key = (cells[0] ?? '').trim();
    const val = (cells[1] ?? '').trim();
    const keyLow = key.toLowerCase();
    const valLow = val.toLowerCase();

    if (keyLow === 'category') {
      category = (valLow === '(all)' || val === '') ? '' : val;
      inData = false;
      continue;
    }
    if (keyLow === 'subcategory') { subcategory = val; inData = false; continue; }
    // Trigger on "Row Labels" or "Age Group" or "Size" or similar pivot headers
    if (keyLow === 'row labels' || keyLow === 'age group' || keyLow === 'size' ||
        keyLow === 'row label' || keyLow === 'agegroup') {
      inData = true;
      continue;
    }
    if (keyLow === 'grand total' || keyLow === 'total' || key === '') {
      inData = false;
      continue;
    }

    if (inData && key) {
      const qty = parseInt(val || '0', 10);
      if (!isNaN(qty) && qty >= 0) {
        items.push({ category, subcategory, ageGroup: key, qty });
      }
    }
  }

  if (items.length > 0) return items;

  // ── Try FORMAT B (flat CSV with headers) ──
  // Find header row — look for a row containing "category" or "subcategory"
  let headerIdx = -1;
  let colCategory = -1, colSubcategory = -1, colAgeGroup = -1, colQty = -1;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitCsvLine(lines[i]);
    const lower = cells.map(c => c.toLowerCase().replace(/[^a-z]/g, ''));
    const catIdx = lower.findIndex(c => c === 'category');
    const subIdx = lower.findIndex(c => c === 'subcategory' || c === 'sub');
    const ageIdx = lower.findIndex(c => c === 'agegroup' || c === 'age' || c === 'size' || c === 'rowlabels');
    const qtyIdx = lower.findIndex(c => c === 'qty' || c === 'quantity' || c === 'availableqty' || c === 'availablequantity' || c === 'sumofavailablequantity');
    if (ageIdx >= 0 || qtyIdx >= 0) {
      headerIdx = i;
      colCategory = catIdx;
      colSubcategory = subIdx;
      colAgeGroup = ageIdx;
      colQty = qtyIdx;
      break;
    }
  }

  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]);
      if (cells.every(c => c === '')) continue;
      const ageGroup = colAgeGroup >= 0 ? (cells[colAgeGroup] ?? '') : '';
      const rawQty = colQty >= 0 ? (cells[colQty] ?? '') : '';
      const qty = parseInt(rawQty, 10);
      if (!ageGroup || isNaN(qty) || qty < 0) continue;
      const cat = colCategory >= 0 ? (cells[colCategory] ?? '') : '';
      const sub = colSubcategory >= 0 ? (cells[colSubcategory] ?? '') : '';
      items.push({ category: cat, subcategory: sub, ageGroup, qty });
    }
  }

  return items;
}

// ── Inventory report endpoints ───────────────────────────────────────────────

// GET /catalog/inventory/latest — latest report + aggregated categories
router.get('/inventory/latest', async (req: AuthRequest, res) => {
  try {
    const rep = await query(
      `SELECT * FROM "InventoryReport" WHERE storeId=? ORDER BY importedAt DESC LIMIT 1`,
      [req.storeId!]
    );
    if (!rep.rows[0]) return res.json({ success: true, data: null });
    return res.json({ success: true, data: rep.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /catalog/inv/categories — top-level categories from latest inventory report
router.get('/inv/categories', async (req: AuthRequest, res) => {
  try {
    const rep = await query(
      `SELECT id FROM "InventoryReport" WHERE storeId=? ORDER BY importedAt DESC LIMIT 1`,
      [req.storeId!]
    );
    if (!rep.rows[0]) return res.json({ success: true, data: [] });
    const reportId = rep.rows[0].id;

    // If category is blank, use subcategory as the grouping level
    const rows = await query(
      `SELECT
         CASE WHEN category='' THEN subcategory ELSE category END AS groupName,
         SUM(qty) AS totalQty,
         COUNT(DISTINCT subcategory) AS subCount,
         COUNT(*) AS rowCount
       FROM "InventoryReportItem"
       WHERE reportId=?
       GROUP BY groupName
       ORDER BY groupName`,
      [reportId]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /catalog/inv/categories/:cat — subcategories with brands, MRP, CTC from CatalogItem
router.get('/inv/categories/:cat', async (req: AuthRequest, res) => {
  try {
    const rep = await query(
      `SELECT id FROM "InventoryReport" WHERE storeId=? ORDER BY importedAt DESC LIMIT 1`,
      [req.storeId!]
    );
    if (!rep.rows[0]) return res.json({ success: true, data: [] });
    const reportId = rep.rows[0].id;
    const cat = decodeURIComponent(req.params.cat);

    // Qty from inventory report
    const invRows = await query(
      `SELECT subcategory, SUM(qty) AS totalQty, COUNT(*) AS rowCount
       FROM "InventoryReportItem"
       WHERE reportId=? AND (category=? OR (category='' AND subcategory=?))
       GROUP BY subcategory
       ORDER BY subcategory`,
      [reportId, cat, cat]
    );

    // MRP, CTC, brands from CatalogItem
    const ciRows = await query(
      `SELECT subcategory,
         ROUND(SUM(CAST(quantity AS REAL)*mrp),2) AS totalMrp,
         ROUND(SUM(CAST(quantity AS REAL)*ctc),2) AS totalCtc,
         GROUP_CONCAT(DISTINCT brand) AS brands
       FROM "CatalogItem"
       WHERE storeId=? AND (category=? OR (category='' AND subcategory=?))
       GROUP BY subcategory`,
      [req.storeId!, cat, cat]
    );
    const ciMap = new Map(ciRows.rows.map((r: any) => [r.subcategory, r]));

    const data = invRows.rows.map((r: any) => {
      const ci = ciMap.get(r.subcategory) as any;
      return {
        ...r,
        totalMrp: ci?.totalMrp ?? 0,
        totalCtc: ci?.totalCtc ?? 0,
        brands: ci?.brands ?? '',
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /catalog/inv/articles/:cat/:sub — individual products from CatalogItem
router.get('/inv/articles/:cat/:sub', async (req: AuthRequest, res) => {
  try {
    const cat = decodeURIComponent(req.params.cat);
    const sub = decodeURIComponent(req.params.sub);

    const rows = await query(
      `SELECT id, fcId, productId, productName, brand, mrp, ctc, age, gender, quantity, category, subcategory
       FROM "CatalogItem"
       WHERE storeId=? AND (category=? OR (category='' AND subcategory=?)) AND subcategory=?
       ORDER BY productName`,
      [req.storeId!, cat, cat, sub]
    );

    // Also get total qty from inventory report for header stats
    const rep = await query(
      `SELECT id FROM "InventoryReport" WHERE storeId=? ORDER BY importedAt DESC LIMIT 1`,
      [req.storeId!]
    );
    let invTotalQty = 0;
    if (rep.rows[0]) {
      const invSum = await query(
        `SELECT SUM(qty) AS totalQty FROM "InventoryReportItem"
         WHERE reportId=? AND (category=? OR (category='' AND subcategory=?)) AND subcategory=?`,
        [rep.rows[0].id, cat, cat, sub]
      );
      invTotalQty = invSum.rows[0]?.totalQty ?? 0;
    }

    return res.json({ success: true, data: { products: rows.rows, invTotalQty } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /catalog/inv/categories/:cat/:sub — age group detail rows
router.get('/inv/categories/:cat/:sub', async (req: AuthRequest, res) => {
  try {
    const rep = await query(
      `SELECT id FROM "InventoryReport" WHERE storeId=? ORDER BY importedAt DESC LIMIT 1`,
      [req.storeId!]
    );
    if (!rep.rows[0]) return res.json({ success: true, data: [] });
    const reportId = rep.rows[0].id;
    const cat = decodeURIComponent(req.params.cat);
    const sub = decodeURIComponent(req.params.sub);

    const rows = await query(
      `SELECT ageGroup, qty
       FROM "InventoryReportItem"
       WHERE reportId=? AND (category=? OR (category='' AND subcategory=?)) AND subcategory=?
       ORDER BY ageGroup`,
      [reportId, cat, cat, sub]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── CatalogItem category endpoints (populated by sync/manual) ───────────────

router.get('/categories', async (req: AuthRequest, res) => {
  try {
    // Grand total across ALL products in this store
    const totRow = await query(
      `SELECT SUM(quantity) AS totalQty,
              ROUND(SUM(CAST(quantity AS REAL)*mrp),2) AS totalMrp,
              ROUND(SUM(CAST(quantity AS REAL)*ctc),2) AS totalCtc,
              COUNT(*) AS totalProducts
       FROM "CatalogItem" WHERE storeId=?`,
      [req.storeId!]
    );

    // Per-category breakdown — include empty-category products under '(Uncategorised)'
    const rows = await query(
      `SELECT
         CASE WHEN category='' OR category IS NULL THEN '(Uncategorised)' ELSE category END AS category,
         SUM(quantity) AS totalQty,
         ROUND(SUM(CAST(quantity AS REAL)*mrp),2) AS totalMrp,
         ROUND(SUM(CAST(quantity AS REAL)*ctc),2) AS totalCtc,
         COUNT(*) AS productCount,
         COUNT(DISTINCT subcategory) AS subCount,
         GROUP_CONCAT(DISTINCT brand) AS brands,
         GROUP_CONCAT(DISTINCT subcategory) AS subcategoryList
       FROM "CatalogItem"
       WHERE storeId=?
       GROUP BY CASE WHEN category='' OR category IS NULL THEN '(Uncategorised)' ELSE category END
       ORDER BY CASE WHEN category='' OR category IS NULL THEN '(Uncategorised)' ELSE category END`,
      [req.storeId!]
    );
    return res.json({ success: true, data: rows.rows, totals: totRow.rows[0] ?? null });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/categories/:cat', async (req: AuthRequest, res) => {
  try {
    const displayCat = decodeURIComponent(req.params.cat);
    // Map the display sentinel back to empty string for DB lookup
    const dbCat = displayCat === '(Uncategorised)' ? '' : displayCat;

    const rows = await query(
      `SELECT
         CASE WHEN subcategory='' OR subcategory IS NULL THEN '(Uncategorised)' ELSE subcategory END AS subcategory,
         SUM(quantity) AS totalQty,
         ROUND(SUM(CAST(quantity AS REAL)*mrp),2) AS totalMrp,
         ROUND(SUM(CAST(quantity AS REAL)*ctc),2) AS totalCtc,
         COUNT(*) AS productCount,
         GROUP_CONCAT(DISTINCT brand) AS brands
       FROM "CatalogItem"
       WHERE storeId=? AND category=?
       GROUP BY CASE WHEN subcategory='' OR subcategory IS NULL THEN '(Uncategorised)' ELSE subcategory END
       ORDER BY CASE WHEN subcategory='' OR subcategory IS NULL THEN '(Uncategorised)' ELSE subcategory END`,
      [req.storeId!, dbCat]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/categories/:cat/:sub', async (req: AuthRequest, res) => {
  try {
    const displayCat = decodeURIComponent(req.params.cat);
    const displaySub = decodeURIComponent(req.params.sub);
    const dbCat = displayCat === '(Uncategorised)' ? '' : displayCat;
    const dbSub = displaySub === '(Uncategorised)' ? '' : displaySub;

    const rows = await query(
      `SELECT * FROM "CatalogItem"
       WHERE storeId=? AND category=? AND subcategory=?
       ORDER BY productName`,
      [req.storeId!, dbCat, dbSub]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /catalog/preview-csv — returns first 20 lines so client can show format debug ──
router.post('/preview-csv', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  const raw = stripBom(req.file.buffer.toString('utf-8'));
  const lines = raw.split(/\r?\n/).map((l, i) => ({ n: i + 1, text: l.trimEnd() })).slice(0, 30);
  return res.json({ success: true, data: lines });
});

// ── POST /catalog/import-inventory ──────────────────────────────────────────
router.post('/import-inventory', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    // ── FORMAT C: flat product-level CSV (FirstCry stock export) ──
    const products = parseProductLevelCsv(req.file.buffer);
    if (products) {
      const reportId = uid();
      const totalQty = products.reduce((s, p) => s + p.quantity, 0);

      // Create InventoryReport record for timestamp tracking
      await query(
        `INSERT INTO "InventoryReport"(id, storeId, importedBy, totalQty, rowCount) VALUES(?,?,?,?,?)`,
        [reportId, req.storeId!, req.user!.name, totalQty, products.length]
      );

      // Clear ALL existing CatalogItem rows for this store so stale data
      // (e.g. from "Sync from Loads") is replaced by this stock sheet snapshot.
      await query(`DELETE FROM "CatalogItem" WHERE storeId=?`, [req.storeId!]);

      // Insert products — no ON CONFLICT needed because table is now clean.
      // Quantities are already summed per productId by the parser above.
      for (const p of products) {
        await query(
          `INSERT INTO "CatalogItem"(id, storeId, fcId, productId, productName, mrp, ctc, brand, category, subcategory, age, gender, quantity)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uid(), req.storeId!, p.productId, p.productId, p.productName,
           p.mrp, p.ctc, p.brand, p.category, p.subcategory, p.age, p.gender, p.quantity]
        );
      }

      // Also aggregate into InventoryReportItem for legacy qty views
      const aggMap = new Map<string, { category: string; subcategory: string; ageGroup: string; qty: number }>();
      for (const p of products) {
        const key = `${p.category}||${p.subcategory}||${p.age ?? 'All'}`;
        const existing = aggMap.get(key);
        if (existing) { existing.qty += p.quantity; }
        else { aggMap.set(key, { category: p.category, subcategory: p.subcategory, ageGroup: p.age ?? 'All', qty: p.quantity }); }
      }
      for (const agg of aggMap.values()) {
        await query(
          `INSERT INTO "InventoryReportItem"(id, reportId, category, subcategory, ageGroup, qty) VALUES(?,?,?,?,?,?)`,
          [uid(), reportId, agg.category, agg.subcategory, agg.ageGroup, agg.qty]
        );
      }

      return res.json({
        success: true,
        data: { reportId, totalQty, rowCount: products.length, format: 'product-level' }
      });
    }

    // ── FORMATS A & B: pivot / age-group CSV ──
    const items = parseInventoryCsv(req.file.buffer);
    if (items.length === 0) {
      const raw = stripBom(req.file.buffer.toString('utf-8'));
      const preview = raw.split(/\r?\n/).slice(0, 10).map((l, i) => `${i + 1}: ${l.trimEnd()}`);
      return res.status(400).json({
        success: false,
        error: 'No data rows found in CSV. Unrecognized format.',
        preview,
        hint: 'Expected FirstCry stock CSV with ProductID/MRP/CTC columns, or pivot format with Row Labels column'
      });
    }

    const reportId = uid();
    const totalQty = items.reduce((s, r) => s + r.qty, 0);

    await query(
      `INSERT INTO "InventoryReport"(id, storeId, importedBy, totalQty, rowCount) VALUES(?,?,?,?,?)`,
      [reportId, req.storeId!, req.user!.name, totalQty, items.length]
    );
    for (const item of items) {
      await query(
        `INSERT INTO "InventoryReportItem"(id, reportId, category, subcategory, ageGroup, qty) VALUES(?,?,?,?,?,?)`,
        [uid(), reportId, item.category, item.subcategory, item.ageGroup, item.qty]
      );
    }

    return res.json({ success: true, data: { reportId, totalQty, rowCount: items.length, format: 'pivot' } });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

// ── POST /catalog/sync-from-loads — populate CatalogItem from closed loads ──
router.post('/sync-from-loads', async (req: AuthRequest, res) => {
  try {
    const prods = await query(
      `SELECT lp.productId, lp.productName, lp.brandId, lp.mrp, lp.ctc, lp.productType, lp.age, lp.gender, SUM(lp.quantity) AS qty
       FROM "LoadProduct" lp
       JOIN "Load" l ON l.id=lp.loadId
       WHERE l.storeId=? AND l.closedAt IS NOT NULL
       GROUP BY lp.productId`,
      [req.storeId!]
    );
    let synced = 0;
    for (const p of prods.rows) {
      await query(
        `INSERT INTO "CatalogItem"(id,storeId,productId,productName,mrp,ctc,brand,category,subcategory,age,gender,quantity)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(storeId,productId) DO UPDATE SET
           productName=excluded.productName, mrp=excluded.mrp, ctc=excluded.ctc,
           brand=excluded.brand, quantity=excluded.quantity, updatedAt=datetime('now')`,
        [uid(), req.storeId!, p.productId, p.productName, p.mrp, p.ctc,
         p.brandId ?? null, p.productType ?? '', '', p.age ?? null, p.gender ?? null, p.qty]
      );
      synced++;
    }
    return res.json({ success: true, data: { synced } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── Legacy flat catalog ──────────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res) => {
  try {
    const q = req.query.search ? `%${req.query.search}%` : null;
    const items = q
      ? await query(`SELECT * FROM "CatalogItem" WHERE storeId=? AND (productId LIKE ? OR productName LIKE ? OR brand LIKE ?) ORDER BY category,subcategory`, [req.storeId!, q, q, q])
      : await query(`SELECT * FROM "CatalogItem" WHERE storeId=? ORDER BY category,subcategory`, [req.storeId!]);
    return res.json({ success: true, data: items.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const like = `%${q}%`;
    const items = await query(`SELECT * FROM "CatalogItem" WHERE storeId=? AND (productId LIKE ? OR productName LIKE ? OR brand LIKE ?) LIMIT 50`, [req.storeId!, like, like, like]);
    return res.json({ success: true, data: items.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { productId, productName, mrp, ctc, brand, category, subcategory, age, gender, quantity, fcId } = req.body;
    const id = uid();
    await query(
      `INSERT INTO "CatalogItem"(id,storeId,fcId,productId,productName,mrp,ctc,brand,category,subcategory,age,gender,quantity)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(storeId,productId) DO UPDATE SET
         productName=excluded.productName, mrp=excluded.mrp, ctc=excluded.ctc,
         brand=excluded.brand, category=excluded.category, subcategory=excluded.subcategory,
         age=excluded.age, gender=excluded.gender, quantity=excluded.quantity, fcId=excluded.fcId, updatedAt=datetime('now')`,
      [id, req.storeId!, fcId ?? null, productId, productName, mrp, ctc, brand ?? null, category ?? '', subcategory ?? '', age ?? null, gender ?? null, quantity ?? 0]
    );
    const result = await query(`SELECT * FROM "CatalogItem" WHERE storeId=? AND productId=?`, [req.storeId!, productId]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(400).json({ success: false, error: String(err) });
  }
});

router.post('/match/:loadId', async (req: AuthRequest, res) => {
  try {
    const [lpRes, catRes] = await Promise.all([
      query(`SELECT * FROM "LoadProduct" WHERE loadId=?`, [req.params.loadId]),
      query(`SELECT * FROM "CatalogItem" WHERE storeId=?`, [req.storeId!]),
    ]);
    const catMap = new Map(catRes.rows.map((c: any) => [c.productId, c]));
    const matched: any[] = [], unmatched: any[] = [], priceDiff: any[] = [];
    for (const p of lpRes.rows) {
      const cat = catMap.get(p.productId);
      if (cat) {
        matched.push(p);
        const diff = Math.abs(Number(p.mrp) - Number((cat as any).mrp));
        if (diff > 1) priceDiff.push({ ...p, catalogMrp: (cat as any).mrp, diff });
      } else unmatched.push(p);
    }
    return res.json({ success: true, data: { matched, unmatched, priceDiff, total: lpRes.rows.length } });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
