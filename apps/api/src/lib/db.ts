import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../../fcsms.db');

const db: import('better-sqlite3').Database = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Convert SQLite row booleans (0/1) to JS booleans for known fields
const BOOL_FIELDS = new Set(['isClosed', 'closed', 'isActive']);

function fixRow(row: any) {
  if (!row) return row;
  const out: any = { ...row };
  for (const key of BOOL_FIELDS) {
    if (key in out) out[key] = Boolean(out[key]);
  }
  return out;
}

// Drop-in replacement for pg's query() — returns Promise<{rows}>
export function query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
  try {
    const stmt = db.prepare(sql);
    const upper = sql.trim().toUpperCase();
    let rows: any[];
    if (upper.startsWith('SELECT') || upper.startsWith('WITH') || sql.toUpperCase().includes('RETURNING')) {
      rows = (stmt.all as any)(...params);
    } else {
      (stmt.run as any)(...params);
      rows = [];
    }
    return Promise.resolve({ rows: rows.map(fixRow) });
  } catch (err) {
    return Promise.reject(err);
  }
}

export const uid = () => crypto.randomUUID();

// ── Schema bootstrap ──────────────────────────────────────────────────────────
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Store" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      state TEXT,
      phone TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS "User" (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STAFF',
      storeId TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );

    CREATE TABLE IF NOT EXISTS "Load" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      loadId TEXT,
      warehouseId TEXT NOT NULL DEFAULT '',
      courier TEXT NOT NULL DEFAULT '',
      docket TEXT NOT NULL DEFAULT '',
      boxes INTEGER NOT NULL DEFAULT 0,
      totalMrp REAL NOT NULL DEFAULT 0,
      totalCtc REAL NOT NULL DEFAULT 0,
      comment TEXT,
      importedBy TEXT NOT NULL DEFAULT '',
      importedAt TEXT NOT NULL DEFAULT (datetime('now')),
      closedAt TEXT,
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );
    CREATE INDEX IF NOT EXISTS Load_storeId ON "Load"(storeId);

    CREATE TABLE IF NOT EXISTS "LoadProduct" (
      id TEXT PRIMARY KEY,
      loadId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      brandId TEXT,
      mrp REAL NOT NULL DEFAULT 0,
      ctc REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT, stockType TEXT, poId TEXT,
      cgst REAL NOT NULL DEFAULT 0,
      sgst REAL NOT NULL DEFAULT 0,
      igst REAL NOT NULL DEFAULT 0,
      hsnCode TEXT, age INTEGER, gender TEXT, color TEXT, productType TEXT, boxId TEXT,
      scannedQty INTEGER NOT NULL DEFAULT 0,
      scannedBy TEXT, scannedAt TEXT,
      FOREIGN KEY (loadId) REFERENCES "Load"(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS LoadProduct_loadId ON "LoadProduct"(loadId);
    CREATE INDEX IF NOT EXISTS LoadProduct_productId ON "LoadProduct"(productId);

    CREATE TABLE IF NOT EXISTS "CatalogItem" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      fcId TEXT,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      mrp REAL NOT NULL DEFAULT 0,
      ctc REAL NOT NULL DEFAULT 0,
      brand TEXT,
      category TEXT NOT NULL DEFAULT '',
      subcategory TEXT NOT NULL DEFAULT '',
      age INTEGER, gender TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (storeId, productId),
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );

    CREATE TABLE IF NOT EXISTS "Audit" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      startedAt TEXT NOT NULL DEFAULT (datetime('now')),
      endedAt TEXT,
      initiatedBy TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );

    CREATE TABLE IF NOT EXISTS "AuditItem" (
      id TEXT PRIMARY KEY,
      auditId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      availQty INTEGER NOT NULL DEFAULT 0,
      matchedQty INTEGER NOT NULL DEFAULT 0,
      mrp REAL NOT NULL DEFAULT 0,
      ctc REAL NOT NULL DEFAULT 0,
      matchedBy TEXT, matchedAt TEXT,
      FOREIGN KEY (auditId) REFERENCES "Audit"(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "StockReturn" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      refNo TEXT NOT NULL UNIQUE,
      process TEXT NOT NULL,
      storeCode TEXT, requestedBy TEXT, approvedBy TEXT,
      category TEXT, subCategory TEXT,
      totalQty INTEGER, totalMrp REAL, totalCtc REAL,
      reason TEXT, remark TEXT,
      transporterName TEXT, docketNo TEXT, boxes INTEGER, dispatchDate TEXT,
      cnAmount REAL, cn120Days REAL, cn180Days REAL, cnComment TEXT,
      isClosed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );

    CREATE TABLE IF NOT EXISTS "EossItem" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      fcId TEXT NOT NULL,
      productName TEXT NOT NULL,
      mrp REAL NOT NULL DEFAULT 0,
      discountPct REAL, eossPrice REAL, brand TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (storeId, fcId),
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );

    CREATE TABLE IF NOT EXISTS "InventoryReport" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      importedAt TEXT NOT NULL DEFAULT (datetime('now')),
      importedBy TEXT NOT NULL DEFAULT '',
      totalQty INTEGER NOT NULL DEFAULT 0,
      rowCount INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );
    CREATE INDEX IF NOT EXISTS InventoryReport_storeId ON "InventoryReport"(storeId);

    CREATE TABLE IF NOT EXISTS "InventoryReportItem" (
      id TEXT PRIMARY KEY,
      reportId TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      subcategory TEXT NOT NULL DEFAULT '',
      ageGroup TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (reportId) REFERENCES "InventoryReport"(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS InventoryReportItem_reportId ON "InventoryReportItem"(reportId);

    CREATE TABLE IF NOT EXISTS "Member" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT, loyaltyId TEXT, dob TEXT,
      tier TEXT NOT NULL DEFAULT 'Bronze',
      points INTEGER NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      joinedAt TEXT NOT NULL DEFAULT (datetime('now')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (storeId, phone),
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );
  `);

  // Migrate: add scannedQty to existing LoadProduct tables
  try { db.exec(`ALTER TABLE "LoadProduct" ADD COLUMN scannedQty INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE "LoadProduct" ADD COLUMN scannedBy TEXT`); } catch {}
  try { db.exec(`ALTER TABLE "LoadProduct" ADD COLUMN scannedAt TEXT`); } catch {}

  // Migrate: add subcategory to AuditItem (for category-level audits)
  try { db.exec(`ALTER TABLE "AuditItem" ADD COLUMN subcategory TEXT NOT NULL DEFAULT ''`); } catch {}

  // Migrate: add EOSS offer/match columns
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN offer TEXT`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN couponCode TEXT`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN matchedStatus TEXT NOT NULL DEFAULT 'pending'`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN matchedBy TEXT`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN matchedAt TEXT`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN category TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN subcategory TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE "EossItem" ADD COLUMN ctc REAL NOT NULL DEFAULT 0`); } catch {}

  // Migrate: add StoreSettings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS "StoreSettings" (
      storeId TEXT PRIMARY KEY,
      gstin TEXT NOT NULL DEFAULT '',
      legalName TEXT NOT NULL DEFAULT '',
      tradeName TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      pincode TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      panNo TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );
  `);

  // Migrate: add Invoice tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Invoice" (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      invoiceNo TEXT NOT NULL UNIQUE,
      customerName TEXT NOT NULL DEFAULT '',
      customerPhone TEXT NOT NULL DEFAULT '',
      salesperson TEXT NOT NULL DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discountAmt REAL NOT NULL DEFAULT 0,
      taxAmt REAL NOT NULL DEFAULT 0,
      totalAmt REAL NOT NULL DEFAULT 0,
      paymentMode TEXT NOT NULL DEFAULT 'Cash',
      note TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      createdBy TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (storeId) REFERENCES "Store"(id)
    );
    CREATE TABLE IF NOT EXISTS "InvoiceItem" (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      fcId TEXT NOT NULL DEFAULT '',
      productName TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      mrp REAL NOT NULL DEFAULT 0,
      qty INTEGER NOT NULL DEFAULT 1,
      discountPct REAL NOT NULL DEFAULT 0,
      gstPct REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES "Invoice"(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS Invoice_storeId ON "Invoice"(storeId);
    CREATE INDEX IF NOT EXISTS InvoiceItem_invoiceId ON "InvoiceItem"(invoiceId);
  `);

  // Migrate: add ProductImageCache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS "ProductImageCache" (
      productId TEXT PRIMARY KEY,
      imageUrl TEXT,
      fetchedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed if empty
  const count = (db.prepare('SELECT COUNT(*) as c FROM "Store"').get() as any).c;
  if (count === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO "Store"(id,name,code,city) VALUES(?,?,?,?)`).run('store-001','FC Franchise - Pune','PNQ001','Pune');
    db.prepare(`INSERT INTO "User"(id,phone,password,name,role,storeId) VALUES(?,?,?,?,?,?)`).run('user-super','9999999999',hash,'Super Admin','SUPER_ADMIN','store-001');
    db.prepare(`INSERT INTO "User"(id,phone,password,name,role,storeId) VALUES(?,?,?,?,?,?)`).run('user-admin','9876543210',hash,'Store Admin','STORE_ADMIN','store-001');
    console.log('✅  Database seeded (Super Admin: 9999999999 / admin123)');
  }
}

initSchema();

export { db };
