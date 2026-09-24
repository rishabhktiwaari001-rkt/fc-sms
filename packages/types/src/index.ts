// ── Auth ─────────────────────────────────────────────────────────────────────
export type Role = 'SUPER_ADMIN' | 'STORE_ADMIN' | 'STAFF';

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  storeId: string;
  storeName: string;
}

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Load (Inward Shipment) ────────────────────────────────────────────────────
export interface Load {
  id: string;
  storeId: string;
  loadId: string;          // business ID from CSV e.g. LD240001
  warehouseId: string;
  courier: string;
  docket: string;
  boxes: number;
  totalMrp: number;
  totalCtc: number;
  comment: string | null;
  importedBy: string;
  importDate: string;      // alias for importedAt
  importedAt: string;
  closeDate: string | null; // alias for closedAt
  closedAt: string | null;
  _count?: { products: number };
}

export interface LoadProduct {
  id: string;
  loadId: string;
  productId: string;
  productName: string;
  brandId: string | null;
  mrp: number;
  ctc: number;
  discount: number;
  quantity: number;
  barcode: string | null;
  stockType: string | null;
  poId: string | null;
  cgst: number;
  sgst: number;
  igst: number;
  hsnCode: string | null;
  age: number | null;
  gender: string | null;
  color: string | null;
  productType: string | null;
}

// ── Catalog ───────────────────────────────────────────────────────────────────
export interface CatalogItem {
  id: string;
  storeId: string;
  fcId: string;            // FC product ID
  productId: string;       // internal productId
  productName: string;
  mrp: number;
  ctc: number;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  age: number | null;
  gender: string | null;
  quantity: number;
  updatedAt: string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────
export interface Audit {
  id: string;
  storeId: string;
  category: string;
  subCategory: string | null;
  startDate: string;
  endDate: string;
  initiatedBy: string;
  totalQty: number | null;
  totalMrp: number | null;
  totalCtc: number | null;
  matchedQty: number | null;
  matchedMrp: number | null;
  closedAt: string | null;
  items?: AuditItem[];
}

export interface AuditItem {
  id: string;
  auditId: string;
  fcId: string;
  productId: string;
  productName: string;
  availableQty: number;
  availQty: number;        // alias
  matchedQty: number | null;
  mrp: number;
  ctc: number;
  matchedBy: string | null;
  matchedDate: string | null;
  matchedAt: string | null; // alias
}

// ── Stock Return ──────────────────────────────────────────────────────────────
export interface StockReturn {
  id: string;
  storeId: string;
  refNo: string;
  process: string;
  storeCode: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  category: string | null;
  subCategory: string | null;
  totalQty: number | null;
  totalMrp: number | null;
  totalCtc: number | null;
  reason: string | null;
  remark: string | null;
  transporterName: string | null;
  transporter: string | null;  // alias
  docketNo: string | null;
  boxes: number | null;
  dispatchDate: string | null;
  cnAmount: number | null;
  cn120Days: number | null;
  cn180Days: number | null;
  cnComment: string | null;
  isClosed: boolean;
  closed: boolean;             // alias
  createdAt: string;
}

// ── EOSS ──────────────────────────────────────────────────────────────────────
export interface EossItem {
  id: string;
  storeId: string;
  fcId: string;
  productName: string;
  mrp: number;
  discountPct: number | null;
  eossPrice: number | null;
  brand: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Member ────────────────────────────────────────────────────────────────────
export interface Member {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  email: string | null;
  loyaltyId: string | null;
  dob: string | null;
  tier: string;
  points: number;
  spent: number;
  joinedAt: string;
  createdAt: string;
}

// ── Staff ─────────────────────────────────────────────────────────────────────
export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  role: Role;
  storeId: string;
  storeName: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── CSV Row (Inward Details) ───────────────────────────────────────────────────
export interface InwardRow {
  productID: string;
  poid: string;
  productname: string;
  productdesc: string;
  brandID: string;
  subcategoryID: string;
  mrp: string;
  discount: string;
  quantity: string;
  barcode: string;
  ctc: string;
  stockType: string;
  warehouseID: string;
  poItemID: string;
  poType: string;
  cpo: string;
  load: string;
  orderDate: string;
  shippingDate: string;
  isReturnable: string;
  shippingID: string;
  cgst: string;
  sgst: string;
  igst: string;
  hsnCode: string;
  createdAt: string;
  updatedAt: string;
  offer: string;
  taxType: string;
  taxRate: string;
  taxAmount: string;
  primaryBaseCost: string;
  NGM: string;
  productType: string;
  boxID: string;
  foCost: string;
  age: string;
  gender: string;
  color: string;
  typeid: string;
  inwardBaseCost: string;
  companyID: string;
  prePOID: string;
}

// ── API Helpers ───────────────────────────────────────────────────────────────
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
