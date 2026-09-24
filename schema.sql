-- FC SMS Database Schema
-- Apply with: psql -U fcsms -d fcsms -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'STORE_ADMIN', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Store
CREATE TABLE IF NOT EXISTS "Store" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT,
  "phone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Store_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Store_code_key" UNIQUE ("code")
);

-- User
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "phone" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'STAFF',
  "storeId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_phone_key" UNIQUE ("phone"),
  CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);

-- Load (Inward Shipment)
CREATE TABLE IF NOT EXISTS "Load" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "loadId" TEXT,
  "warehouseId" TEXT NOT NULL DEFAULT '',
  "courier" TEXT NOT NULL DEFAULT '',
  "docket" TEXT NOT NULL DEFAULT '',
  "boxes" INTEGER NOT NULL DEFAULT 0,
  "totalMrp" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalCtc" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "comment" TEXT,
  "importedBy" TEXT NOT NULL DEFAULT '',
  "importedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closedAt" TIMESTAMPTZ,
  CONSTRAINT "Load_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Load_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);
CREATE INDEX IF NOT EXISTS "Load_storeId_idx" ON "Load"("storeId");

-- LoadProduct
CREATE TABLE IF NOT EXISTS "LoadProduct" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "loadId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "brandId" TEXT,
  "mrp" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "ctc" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "barcode" TEXT,
  "stockType" TEXT,
  "poId" TEXT,
  "cgst" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "sgst" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "igst" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "hsnCode" TEXT,
  "age" INTEGER,
  "gender" TEXT,
  "color" TEXT,
  "productType" TEXT,
  "boxId" TEXT,
  CONSTRAINT "LoadProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoadProduct_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "LoadProduct_loadId_idx" ON "LoadProduct"("loadId");
CREATE INDEX IF NOT EXISTS "LoadProduct_productId_idx" ON "LoadProduct"("productId");

-- CatalogItem
CREATE TABLE IF NOT EXISTS "CatalogItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "storeId" TEXT NOT NULL,
  "fcId" TEXT,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "mrp" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "ctc" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "brand" TEXT,
  "category" TEXT NOT NULL DEFAULT '',
  "subcategory" TEXT NOT NULL DEFAULT '',
  "age" INTEGER,
  "gender" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogItem_storeId_productId_key" UNIQUE ("storeId", "productId"),
  CONSTRAINT "CatalogItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);
CREATE INDEX IF NOT EXISTS "CatalogItem_store_cat_idx" ON "CatalogItem"("storeId", "category", "subcategory");

-- Audit
CREATE TABLE IF NOT EXISTS "Audit" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "storeId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subcategory" TEXT NOT NULL DEFAULT '',
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "endedAt" TIMESTAMPTZ,
  "initiatedBy" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "Audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Audit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);
CREATE INDEX IF NOT EXISTS "Audit_storeId_idx" ON "Audit"("storeId");

-- AuditItem
CREATE TABLE IF NOT EXISTS "AuditItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "auditId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "availQty" INTEGER NOT NULL DEFAULT 0,
  "matchedQty" INTEGER NOT NULL DEFAULT 0,
  "mrp" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "ctc" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "matchedBy" TEXT,
  "matchedAt" TIMESTAMPTZ,
  CONSTRAINT "AuditItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE
);

-- StockReturn
CREATE TABLE IF NOT EXISTS "StockReturn" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "storeId" TEXT NOT NULL,
  "refNo" TEXT NOT NULL,
  "process" TEXT NOT NULL,
  "storeCode" TEXT,
  "requestedBy" TEXT,
  "approvedBy" TEXT,
  "category" TEXT,
  "subCategory" TEXT,
  "totalQty" INTEGER,
  "totalMrp" DECIMAL(12,2),
  "totalCtc" DECIMAL(12,2),
  "reason" TEXT,
  "remark" TEXT,
  "transporterName" TEXT,
  "docketNo" TEXT,
  "boxes" INTEGER,
  "dispatchDate" DATE,
  "cnAmount" DECIMAL(12,2),
  "cn120Days" DECIMAL(12,2),
  "cn180Days" DECIMAL(12,2),
  "cnComment" TEXT,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "StockReturn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockReturn_refNo_key" UNIQUE ("refNo"),
  CONSTRAINT "StockReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);
CREATE INDEX IF NOT EXISTS "StockReturn_storeId_idx" ON "StockReturn"("storeId");

-- EossItem
CREATE TABLE IF NOT EXISTS "EossItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "storeId" TEXT NOT NULL,
  "fcId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "mrp" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discountPct" DECIMAL(6,2),
  "eossPrice" DECIMAL(10,2),
  "brand" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EossItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EossItem_storeId_fcId_key" UNIQUE ("storeId", "fcId"),
  CONSTRAINT "EossItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);
CREATE INDEX IF NOT EXISTS "EossItem_storeId_idx" ON "EossItem"("storeId");

-- Member
CREATE TABLE IF NOT EXISTS "Member" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "loyaltyId" TEXT,
  "dob" DATE,
  "tier" TEXT NOT NULL DEFAULT 'Bronze',
  "points" INTEGER NOT NULL DEFAULT 0,
  "spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Member_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Member_storeId_phone_key" UNIQUE ("storeId", "phone"),
  CONSTRAINT "Member_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);
CREATE INDEX IF NOT EXISTS "Member_storeId_idx" ON "Member"("storeId");
