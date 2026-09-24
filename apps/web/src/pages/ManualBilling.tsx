import React, { useRef, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';

// ── Types ────────────────────────────────────────────────────────────────────
interface BillItem {
  id: string;
  fcId: string;
  productName: string;
  category: string;
  mrp: number;
  qty: number;
  discountPct: number;
  gstPct: number;
}

interface CatalogHit {
  fcId: string;
  productId: string;
  productName: string;
  mrp: number;
  brand: string | null;
  category: string;
  subcategory: string;
}

interface SavedInvoice {
  id: string;
  invoiceNo: string;
  customerName: string;
  customerPhone: string;
  salesperson: string;
  subtotal: number;
  discountAmt: number;
  taxAmt: number;
  totalAmt: number;
  paymentMode: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
}

interface StoreProfile {
  storeId: string;
  gstin: string;
  legalName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  panNo: string;
}

// ── GST helpers (inclusive in MRP — extract, don't add) ─────────────────────
function lineAmount(item: BillItem) {
  return item.mrp * item.qty * (1 - item.discountPct / 100);
}
function lineTax(item: BillItem) {
  const amt = lineAmount(item);
  return item.gstPct > 0 ? amt * item.gstPct / (100 + item.gstPct) : 0;
}

function fmtINR(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function localUid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Invoice PDF HTML ─────────────────────────────────────────────────────────
function buildInvoiceHTML(invoice: any, items: BillItem[], profile: StoreProfile | null) {
  const subtotal    = items.reduce((s, i) => s + i.mrp * i.qty, 0);
  const discountAmt = items.reduce((s, i) => s + i.mrp * i.qty * i.discountPct / 100, 0);
  const totalAmt    = subtotal - discountAmt;
  const taxAmt      = items.reduce((s, i) => s + lineTax(i), 0);
  const netExclTax  = totalAmt - taxAmt;

  const storeName  = profile?.tradeName || profile?.legalName || 'FirstCry Franchise';
  const storeAddr  = [profile?.address, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(', ');
  const gstin      = profile?.gstin || '';
  const panNo      = profile?.panNo || '';
  const storePhone = profile?.phone || '';
  const storeEmail = profile?.email || '';

  const rows = items.map((item, idx) => {
    const gross   = item.mrp * item.qty;
    const discAmt = gross * item.discountPct / 100;
    const net     = gross - discAmt;
    const tax     = lineTax(item);
    const netExcl = net - tax;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.fcId || '—'}</td>
        <td>${item.productName}<br/><span class="sub">${item.category || ''}</span></td>
        <td class="r">${item.qty}</td>
        <td class="r">₹${item.mrp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="r">${item.discountPct > 0 ? item.discountPct + '%' : '—'}</td>
        <td class="r">${item.gstPct > 0 ? item.gstPct + '%' : '—'}</td>
        <td class="r">₹${netExcl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="r">₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="r"><strong>₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
      </tr>`;
  }).join('');

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Invoice ${invoice.invoiceNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; background: #fff; }
  .page { max-width: 900px; margin: 0 auto; padding: 24px 28px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 2px solid #1a6fc4; }
  .store-block .store-name { font-size: 18px; font-weight: 800; color: #1a6fc4; }
  .store-block .store-legal { font-size: 11px; color: #555; margin-top: 1px; }
  .store-block .store-addr  { font-size: 10px; color: #777; margin-top: 3px; max-width: 320px; }
  .store-block .store-tax   { font-size: 10px; color: #444; margin-top: 4px; }
  .inv-meta { text-align: right; }
  .inv-meta .inv-title { font-size: 13px; font-weight: 800; color: #1a6fc4; letter-spacing: 1px; }
  .inv-meta .inv-no    { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .inv-meta .inv-date  { font-size: 11px; color: #555; margin-top: 4px; }
  .info-row { display: flex; gap: 12px; margin-bottom: 14px; }
  .info-box { flex: 1; background: #f7f9fc; border: 1px solid #dce4ef; border-radius: 5px; padding: 8px 12px; }
  .info-label { font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .info-val { font-size: 12px; font-weight: 600; }
  .info-sub { font-size: 10px; color: #666; }
  .gst-note { background: #fffbea; border: 1px solid #f0d060; border-radius: 4px; padding: 6px 10px; font-size: 10px; color: #7a6000; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  thead tr { background: #1a6fc4; color: #fff; }
  thead th { padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 0.3px; }
  th.r, td.r { text-align: right; }
  tbody tr { border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #f9fbff; }
  tbody td { padding: 6px 8px; vertical-align: top; }
  .sub { font-size: 9px; color: #888; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .totals-box { width: 280px; }
  .tot-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 11px; }
  .tot-row.grand { font-size: 15px; font-weight: 800; color: #1a6fc4; border-top: 2px solid #1a6fc4; border-bottom: none; padding-top: 7px; margin-top: 3px; }
  .tot-row.disc { color: #e05; }
  .footer { text-align: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #777; }
  .footer strong { color: #1a6fc4; }
  .pay-badge { display: inline-block; background: #e7f2ff; color: #1a6fc4; border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 700; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="store-block">
      <div class="store-name">${storeName}</div>
      ${profile?.legalName && profile.legalName !== storeName ? `<div class="store-legal">${profile.legalName}</div>` : ''}
      ${storeAddr ? `<div class="store-addr">📍 ${storeAddr}</div>` : ''}
      <div class="store-tax">
        ${gstin ? `<strong>GSTIN:</strong> ${gstin}` : ''}
        ${panNo ? ` &nbsp;|&nbsp; <strong>PAN:</strong> ${panNo}` : ''}
        ${storePhone ? ` &nbsp;|&nbsp; 📞 ${storePhone}` : ''}
        ${storeEmail ? ` &nbsp;|&nbsp; ✉ ${storeEmail}` : ''}
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-title">TAX INVOICE</div>
      <div class="inv-no">${invoice.invoiceNo}</div>
      <div class="inv-date">Date: ${dateStr}</div>
      <div class="inv-date">Time: ${timeStr}</div>
      ${invoice.salesperson ? `<div class="inv-date">Salesperson: ${invoice.salesperson}</div>` : ''}
    </div>
  </div>

  <div class="info-row">
    <div class="info-box">
      <div class="info-label">Customer</div>
      <div class="info-val">${invoice.customerName || 'Walk-in Customer'}</div>
      ${invoice.customerPhone ? `<div class="info-sub">📞 ${invoice.customerPhone}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="info-label">Payment Mode</div>
      <div class="info-val"><span class="pay-badge">${invoice.paymentMode}</span></div>
      ${invoice.note ? `<div class="info-sub" style="margin-top:3px">${invoice.note}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="info-label">Items / Qty</div>
      <div class="info-val">${items.length} item${items.length !== 1 ? 's' : ''} · ${items.reduce((s, i) => s + i.qty, 0)} qty</div>
      <div class="info-sub">By: ${invoice.createdBy || 'Staff'}</div>
    </div>
  </div>

  <div class="gst-note">
    ⓘ All prices are <strong>MRP (GST Inclusive)</strong> as per Indian retail norms. GST shown is extracted from MRP and is not charged additionally.
    ${gstin ? ` Seller GSTIN: <strong>${gstin}</strong>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>FC ID</th><th>Product</th>
        <th class="r">Qty</th><th class="r">MRP</th><th class="r">Disc%</th><th class="r">GST%</th>
        <th class="r">Taxable</th><th class="r">GST Amt</th><th class="r">Payable</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="tot-row"><span>Subtotal (MRP)</span><span>₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
      ${discountAmt > 0 ? `<div class="tot-row disc"><span>Discount</span><span>- ₹${discountAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>` : ''}
      <div class="tot-row"><span>Taxable Amt (excl. GST)</span><span>₹${netExclTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
      <div class="tot-row"><span>GST (incl. in MRP)</span><span>₹${taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
      <div class="tot-row grand"><span>TOTAL PAYABLE</span><span>₹${totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
    </div>
  </div>

  <div class="footer">
    <strong>Thank you for shopping at ${storeName}!</strong><br/>
    This is a computer-generated tax invoice. All prices are MRP inclusive of GST.
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ManualBilling() {
  const { user } = useAuth();
  type View = 'new' | 'history' | 'setup';
  const [view, setView] = useState<View>('new');
  const [historyTick, setHistoryTick] = useState(0);

  // Store GST profile
  const { data: storeProfile, refetch: refetchProfile } = useFetch<StoreProfile>('/billing/store-profile');
  const [setupForm, setSetupForm]   = useState<Partial<StoreProfile>>({});
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMsg,    setSetupMsg]    = useState('');

  // Populate setup form when profile loads
  useEffect(() => {
    if (storeProfile) setSetupForm(storeProfile);
  }, [storeProfile]);

  // Customer fields
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [salesperson,   setSalesperson]   = useState(user?.name ?? '');
  const [paymentMode,   setPaymentMode]   = useState('Cash');
  const [note,          setNote]          = useState('');

  // Product scan
  const [scanVal,  setScanVal]  = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanHits, setScanHits] = useState<CatalogHit[]>([]);
  const [scanErr,  setScanErr]  = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Manual add modal
  const [showManual, setShowManual] = useState(false);
  const [manualFcId, setManualFcId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualMrp,  setManualMrp]  = useState('');
  const [manualQty,  setManualQty]  = useState('1');
  const [manualDisc, setManualDisc] = useState('0');
  const [manualGst,  setManualGst]  = useState('0');
  const [manualCat,  setManualCat]  = useState('');

  // Bill items
  const [items, setItems] = useState<BillItem[]>([]);

  // Save state
  const [saving,   setSaving]   = useState(false);
  const [savedInv, setSavedInv] = useState<any>(null);
  const [saveErr,  setSaveErr]  = useState('');

  // Invoice history
  const { data: history, loading: histLoading } = useFetch<SavedInvoice[]>(
    '/billing/invoices', { _tick: historyTick }
  );

  // Derived totals (GST inclusive)
  const subtotal    = items.reduce((s, i) => s + i.mrp * i.qty, 0);
  const discountAmt = items.reduce((s, i) => s + i.mrp * i.qty * i.discountPct / 100, 0);
  const totalAmt    = subtotal - discountAmt;
  const taxAmt      = items.reduce((s, i) => s + lineTax(i), 0);
  const netExclTax  = totalAmt - taxAmt;
  const totalQty    = items.reduce((s, i) => s + i.qty, 0);

  // Profile completeness
  const profileComplete = !!(storeProfile?.gstin && storeProfile?.legalName && storeProfile?.address);

  // ── Catalog lookup ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scanVal.trim()) { setScanHits([]); setScanErr(''); return; }
    const t = setTimeout(async () => {
      setScanning(true);
      try {
        const res = await api.get('/billing/lookup', { params: { q: scanVal.trim() } });
        setScanHits(res.data.data ?? []);
        setScanErr(res.data.data?.length === 0 ? 'No products found in catalog' : '');
      } catch { setScanErr('Lookup failed'); }
      finally { setScanning(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [scanVal]);

  function addFromHit(hit: CatalogHit) {
    setItems(prev => {
      const existing = prev.findIndex(i => i.fcId === hit.fcId);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], qty: next[existing].qty + 1 };
        return next;
      }
      return [...prev, {
        id: localUid(), fcId: hit.fcId, productName: hit.productName,
        category: [hit.category, hit.subcategory].filter(Boolean).join(' > '),
        mrp: hit.mrp, qty: 1, discountPct: 0, gstPct: 0,
      }];
    });
    setScanVal(''); setScanHits([]);
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  function addManual() {
    if (!manualName || !manualMrp) return;
    setItems(prev => [...prev, {
      id: localUid(), fcId: manualFcId, productName: manualName, category: manualCat,
      mrp: parseFloat(manualMrp) || 0, qty: parseInt(manualQty) || 1,
      discountPct: parseFloat(manualDisc) || 0, gstPct: parseFloat(manualGst) || 0,
    }]);
    setManualFcId(''); setManualName(''); setManualMrp('');
    setManualQty('1'); setManualDisc('0'); setManualGst('0'); setManualCat('');
    setShowManual(false);
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  function updateItem(id: string, field: keyof BillItem, val: any) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));
  }
  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleSave() {
    if (!items.length) return;
    setSaving(true); setSaveErr('');
    try {
      const res = await api.post('/billing/invoices', {
        customerName, customerPhone, salesperson, paymentMode, note,
        items: items.map(i => ({
          fcId: i.fcId, productName: i.productName, category: i.category,
          mrp: i.mrp, qty: i.qty, discountPct: i.discountPct, gstPct: i.gstPct,
        })),
      });
      if (!res.data.success) throw new Error(res.data.error || 'Unknown error');
      setSavedInv(res.data.data);
      setHistoryTick(t => t + 1);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Save failed — check API server logs';
      setSaveErr(msg);
      console.error('[handleSave]', err);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint(inv?: any) {
    const invoiceData = inv ?? {
      invoiceNo: 'DRAFT',
      customerName, customerPhone, salesperson, paymentMode, note,
      createdBy: user?.name ?? '',
    };
    const html = buildInvoiceHTML(invoiceData, items, storeProfile);
    const win = window.open('', '_blank', 'width=960,height=720');
    if (win) { win.document.write(html); win.document.close(); }
  }

  async function handleReprintSaved(inv: SavedInvoice) {
    try {
      const res = await api.get(`/billing/invoices/${inv.id}`);
      const full = res.data.data;
      const billItems: BillItem[] = (full.items ?? []).map((it: any, idx: number) => ({
        id: String(idx), fcId: it.fcId, productName: it.productName, category: it.category,
        mrp: it.mrp, qty: it.qty, discountPct: it.discountPct, gstPct: it.gstPct,
      }));
      const html = buildInvoiceHTML(full, billItems, storeProfile);
      const win = window.open('', '_blank', 'width=960,height=720');
      if (win) { win.document.write(html); win.document.close(); }
    } catch { alert('Could not load invoice'); }
  }

  function handleNewBill() {
    setItems([]);
    setCustomerName(''); setCustomerPhone(''); setNote('');
    setSalesperson(user?.name ?? '');
    setPaymentMode('Cash');
    setSavedInv(null); setSaveErr('');
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  async function handleSaveProfile() {
    setSetupSaving(true); setSetupMsg('');
    try {
      await api.put('/billing/store-profile', setupForm);
      refetchProfile();
      setSetupMsg('✓ Store profile saved successfully');
    } catch (err: any) {
      setSetupMsg('✗ ' + (err?.response?.data?.error ?? 'Save failed'));
    } finally {
      setSetupSaving(false);
    }
  }

  // Group history by date
  const groupedHistory = React.useMemo(() => {
    if (!history?.length) return [];
    const groups: Record<string, SavedInvoice[]> = {};
    for (const inv of history) {
      const day = inv.createdAt.slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(inv);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [history]);

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 4, background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Manual Billing</div>
          <div className="page-sub">GST-inclusive tax invoices · PDF download</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!profileComplete && (
            <span style={{
              fontSize: 11, background: 'rgba(245,158,11,0.12)', color: '#b45309',
              border: '1px solid rgba(245,158,11,0.3)', padding: '4px 10px', borderRadius: 4,
            }}>⚠ Store GSTIN not set</span>
          )}
          <button className={`btn ${view === 'new'     ? 'btn-brand' : 'btn-ghost'}`} onClick={() => setView('new')}>+ New Bill</button>
          <button className={`btn ${view === 'history' ? 'btn-brand' : 'btn-ghost'}`} onClick={() => { setView('history'); setHistoryTick(t => t + 1); }}>📅 History</button>
          <button className={`btn ${view === 'setup'   ? 'btn-brand' : 'btn-ghost'}`} onClick={() => setView('setup')}>🏪 Store Setup</button>
        </div>
      </div>

      {/* ══════════ STORE SETUP TAB ══════════ */}
      {view === 'setup' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>Store GST Profile</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 18 }}>
            These details print on every tax invoice. Enter once and all future bills will use them automatically.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              ['GSTIN', 'gstin', 'e.g. 09AAAAA0000A1Z5'],
              ['PAN Number', 'panNo', 'e.g. AAAAA0000A'],
              ['Legal Name (as per GST)', 'legalName', 'Registered legal business name'],
              ['Trade Name / Brand', 'tradeName', 'e.g. FirstCry — Chowk, Lucknow'],
            ] as [string, string, string][]).map(([label, key, placeholder]) => (
              <div key={key} style={{ gridColumn: key === 'legalName' || key === 'tradeName' ? 'span 2' : undefined }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{label}</label>
                <input style={inp} placeholder={placeholder}
                  value={(setupForm as any)[key] ?? ''}
                  onChange={e => setSetupForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Street Address</label>
              <input style={inp} placeholder="Shop No. / Building / Street"
                value={setupForm.address ?? ''}
                onChange={e => setSetupForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>

            {([
              ['City', 'city', 'Lucknow'],
              ['State', 'state', 'Uttar Pradesh'],
              ['Pincode', 'pincode', '226003'],
              ['Phone', 'phone', '+91 98765 43210'],
              ['Email', 'email', 'store@example.com'],
            ] as [string, string, string][]).map(([label, key, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{label}</label>
                <input style={inp} placeholder={placeholder}
                  value={(setupForm as any)[key] ?? ''}
                  onChange={e => setSetupForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-brand" style={{ padding: '9px 24px' }}
              disabled={setupSaving} onClick={handleSaveProfile}>
              {setupSaving ? 'Saving…' : '💾 Save Profile'}
            </button>
            {setupMsg && (
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: setupMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
              }}>{setupMsg}</span>
            )}
          </div>

          {storeProfile?.gstin && (
            <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg2)', borderRadius: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--brand)' }}>Current Profile (used on invoices)</div>
              <div><strong>{storeProfile.legalName}</strong>{storeProfile.tradeName && storeProfile.tradeName !== storeProfile.legalName ? ` (${storeProfile.tradeName})` : ''}</div>
              {storeProfile.address && <div style={{ color: 'var(--text2)', marginTop: 2 }}>{[storeProfile.address, storeProfile.city, storeProfile.state, storeProfile.pincode].filter(Boolean).join(', ')}</div>}
              <div style={{ marginTop: 4 }}>GSTIN: <strong>{storeProfile.gstin}</strong>{storeProfile.panNo ? ` · PAN: ${storeProfile.panNo}` : ''}</div>
              {storeProfile.phone && <div style={{ color: 'var(--text2)', marginTop: 2 }}>📞 {storeProfile.phone}{storeProfile.email ? ` · ✉ ${storeProfile.email}` : ''}</div>}
            </div>
          )}
        </div>
      )}

      {/* ══════════ HISTORY TAB ══════════ */}
      {view === 'history' && (
        <div>
          {histLoading && <div className="loading">Loading invoices…</div>}
          {!histLoading && !groupedHistory.length && (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text2)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🧾</div>
              <div style={{ fontWeight: 600 }}>No invoices yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Create your first bill to see it here</div>
            </div>
          )}
          {groupedHistory.map(([day, invs]) => (
            <div key={day} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--brand)',
                  background: 'rgba(26,111,196,0.08)', padding: '3px 10px',
                  borderRadius: 20, border: '1px solid rgba(26,111,196,0.2)',
                }}>
                  📅 {new Date(day).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {invs.length} invoice{invs.length !== 1 ? 's' : ''} · {fmtINR(invs.reduce((s, i) => s + i.totalAmt, 0))} total
                </div>
              </div>
              <div className="card" style={{ padding: 0 }}>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice No</th><th>Time</th><th>Customer</th><th>Payment</th>
                        <th style={{ textAlign: 'right' }}>Discount</th>
                        <th style={{ textAlign: 'right' }}>GST (incl.)</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invs.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>{inv.invoiceNo}</td>
                          <td style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtTime(inv.createdAt)}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{inv.customerName || 'Walk-in'}</div>
                            {inv.customerPhone && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{inv.customerPhone}</div>}
                          </td>
                          <td>
                            <span style={{ background: 'rgba(26,111,196,0.1)', color: 'var(--brand)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                              {inv.paymentMode}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--red)' }}>
                            {inv.discountAmt > 0 ? `- ${fmtINR(inv.discountAmt)}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                            {inv.taxAmt > 0 ? fmtINR(inv.taxAmt) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--brand)' }}>
                            {fmtINR(inv.totalAmt)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleReprintSaved(inv)}>🖨 Print</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ NEW BILL TAB ══════════ */}
      {view === 'new' && (
        <>
          {/* Success banner */}
          {savedInv && (
            <div style={{
              padding: '12px 16px', borderRadius: 6, marginBottom: 12,
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
              color: 'var(--green)', fontWeight: 600, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span>✓ Invoice <strong>{savedInv.invoiceNo}</strong> saved · Total: {fmtINR(savedInv.totalAmt)}</span>
              <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', border: 'none' }}
                onClick={() => handlePrint(savedInv)}>🖨 Print / Download PDF</button>
              <button className="btn btn-sm btn-ghost" onClick={handleNewBill}>+ New Bill</button>
            </div>
          )}

          {/* Error banner */}
          {saveErr && (
            <div style={{
              padding: '12px 16px', borderRadius: 6, marginBottom: 12, fontSize: 13,
              background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span>❌ {saveErr}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setSaveErr('')}>Dismiss</button>
            </div>
          )}

          {/* GSTIN missing warning */}
          {!profileComplete && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 12,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#92400e',
            }}>
              ⚠ Your store GSTIN and address are not set. Invoices will print without them.{' '}
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setView('setup')}>Set up now →</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>

            {/* LEFT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Customer info */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Customer Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Phone</label>
                    <input className="inp" placeholder="Customer phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Name</label>
                    <input className="inp" placeholder="Customer name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Salesperson</label>
                    <input className="inp" placeholder="Salesperson" value={salesperson} onChange={e => setSalesperson(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Payment</label>
                    <select className="inp" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                      style={{ background: 'var(--bg1)', color: 'var(--text1)' }}>
                      {['Cash','Card','UPI','Net Banking','Wallet','Club Cash'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Note</label>
                  <input className="inp" placeholder="Any note for the invoice…" value={note} onChange={e => setNote(e.target.value)} style={{ maxWidth: 500 }} />
                </div>
              </div>

              {/* Product search */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="card-title">Add Products</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', background: 'rgba(26,111,196,0.08)', padding: '3px 8px', borderRadius: 4 }}>
                    ⓘ All MRP prices are GST-inclusive
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input ref={scanRef} className="inp" style={{ flex: 1 }}
                    placeholder="Scan FC ID or type product name…"
                    value={scanVal} onChange={e => setScanVal(e.target.value)} autoFocus
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(true)}>+ Add Manually</button>
                </div>
                {scanHits.length > 0 && (
                  <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg1)', overflow: 'hidden' }}>
                    {scanHits.map(hit => (
                      <div key={hit.fcId || hit.productId} onClick={() => addFromHit(hit)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{hit.productName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                            {hit.fcId ? `FC: ${hit.fcId}` : `ID: ${hit.productId}`}
                            {hit.category ? ` · ${hit.category}` : ''}
                            {hit.brand ? ` · ${hit.brand}` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand)' }}>
                          ₹{hit.mrp} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text2)' }}>incl. GST</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {scanning && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>Searching…</div>}
                {scanErr && !scanning && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{scanErr}</div>}
              </div>

              {/* Items table */}
              {items.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 28 }}>#</th>
                          <th>Product</th>
                          <th style={{ width: 85, textAlign: 'right' }}>MRP (incl.)</th>
                          <th style={{ width: 58, textAlign: 'center' }}>Qty</th>
                          <th style={{ width: 72, textAlign: 'center' }}>Disc%</th>
                          <th style={{ width: 68, textAlign: 'center' }}>GST%</th>
                          <th style={{ width: 85, textAlign: 'right' }}>GST Amt</th>
                          <th style={{ width: 95, textAlign: 'right' }}>Payable</th>
                          <th style={{ width: 28 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const amt = lineAmount(item);
                          const tax = lineTax(item);
                          return (
                            <tr key={item.id}>
                              <td style={{ fontSize: 12, color: 'var(--text2)' }}>{idx + 1}</td>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.productName}</div>
                                {item.fcId && <div style={{ fontSize: 11, color: 'var(--text2)' }}>FC: {item.fcId}</div>}
                                {item.category && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{item.category}</div>}
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 13 }}>₹{item.mrp}</td>
                              <td>
                                <input type="number" min="1" value={item.qty}
                                  onChange={e => updateItem(item.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                                  style={{ width: '100%', padding: '4px 6px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 }}
                                />
                              </td>
                              <td>
                                <input type="number" min="0" max="100" step="0.5" value={item.discountPct}
                                  onChange={e => updateItem(item.id, 'discountPct', parseFloat(e.target.value) || 0)}
                                  style={{ width: '100%', padding: '4px 6px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 }}
                                />
                              </td>
                              <td>
                                <select value={item.gstPct}
                                  onChange={e => updateItem(item.id, 'gstPct', parseFloat(e.target.value))}
                                  style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 }}>
                                  {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                                </select>
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)' }}>
                                {tax > 0 ? fmtINR(tax) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>
                                {fmtINR(amt)}
                              </td>
                              <td>
                                <button onClick={() => removeItem(item.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 16 }}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {items.length === 0 && (
                <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🛒</div>
                  <div style={{ fontWeight: 600 }}>No items added yet</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Scan an FC ID or search by product name above</div>
                </div>
              )}
            </div>

            {/* RIGHT: Summary */}
            <div style={{ position: 'sticky', top: 16 }}>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Bill Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text2)' }}>Items / Qty</span>
                    <span style={{ fontWeight: 600 }}>{items.length} / {totalQty}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 9 }}>
                    <span style={{ color: 'var(--text2)' }}>Subtotal (MRP)</span>
                    <span style={{ fontWeight: 600 }}>{fmtINR(subtotal)}</span>
                  </div>
                  {discountAmt > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--red)' }}>Discount</span>
                      <span style={{ fontWeight: 600, color: 'var(--red)' }}>- {fmtINR(discountAmt)}</span>
                    </div>
                  )}
                  {taxAmt > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text2)' }}>Taxable (excl. GST)</span>
                        <span style={{ fontWeight: 600 }}>{fmtINR(netExclTax)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text2)' }}>GST (incl. in MRP)</span>
                        <span style={{ fontWeight: 600 }}>{fmtINR(taxAmt)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, borderTop: '2px solid var(--brand)', paddingTop: 12, marginTop: 4, color: 'var(--brand)' }}>
                    <span>TOTAL</span>
                    <span>{fmtINR(totalAmt)}</span>
                  </div>
                  {taxAmt > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text2)', textAlign: 'center' }}>GST of {fmtINR(taxAmt)} is included in total</div>
                  )}
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-brand"
                    style={{ width: '100%', padding: '11px', fontSize: 15, fontWeight: 700 }}
                    disabled={items.length === 0 || saving || !!savedInv}
                    onClick={handleSave}>
                    {saving ? 'Saving…' : savedInv ? '✓ Saved' : '💾 Save Invoice'}
                  </button>
                  <button className="btn btn-ghost" style={{ width: '100%' }}
                    disabled={items.length === 0} onClick={() => handlePrint()}>
                    🖨 Print Preview
                  </button>
                  {savedInv && (
                    <button className="btn btn-brand" style={{ width: '100%', background: 'var(--green)', border: 'none' }}
                      onClick={() => handlePrint(savedInv)}>
                      📄 Download PDF
                    </button>
                  )}
                </div>
                {items.length > 0 && !savedInv && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text2)', textAlign: 'center' }}>
                    Save first to get an invoice number on the PDF
                  </div>
                )}
                {storeProfile?.gstin && (
                  <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(16,185,129,0.07)', borderRadius: 4, fontSize: 11, color: 'var(--text2)' }}>
                    ✓ GSTIN: {storeProfile.gstin}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Manual Add Modal */}
          {showManual && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
              onClick={e => { if (e.target === e.currentTarget) setShowManual(false); }}>
              <div className="card" style={{ width: 480, maxWidth: '95vw' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Add Product Manually</div>
                  <button onClick={() => setShowManual(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>✕</button>
                </div>
                <div style={{ background: 'rgba(26,111,196,0.08)', border: '1px solid rgba(26,111,196,0.2)', borderRadius: 4, padding: '6px 10px', fontSize: 11, color: 'var(--brand)', marginBottom: 12 }}>
                  ⓘ Enter MRP as printed on the product — it's GST inclusive.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Product ID / FC ID</label>
                      <input className="inp" placeholder="e.g. 20615938" value={manualFcId} onChange={e => setManualFcId(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Category</label>
                      <input className="inp" placeholder="e.g. Clothing" value={manualCat} onChange={e => setManualCat(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Product Name *</label>
                    <input className="inp" placeholder="Full product name" value={manualName} onChange={e => setManualName(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>MRP (₹) *</label>
                      <input className="inp" type="number" placeholder="0" value={manualMrp} onChange={e => setManualMrp(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Qty</label>
                      <input className="inp" type="number" min="1" value={manualQty} onChange={e => setManualQty(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Disc%</label>
                      <input className="inp" type="number" min="0" max="100" value={manualDisc} onChange={e => setManualDisc(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>GST%</label>
                      <select className="inp" value={manualGst} onChange={e => setManualGst(e.target.value)}
                        style={{ background: 'var(--bg1)', color: 'var(--text1)' }}>
                        {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                      </select>
                    </div>
                  </div>
                  {manualMrp && manualName && (() => {
                    const mrp  = parseFloat(manualMrp) || 0;
                    const qty  = parseInt(manualQty || '1') || 1;
                    const disc = parseFloat(manualDisc || '0') / 100;
                    const gst  = parseFloat(manualGst || '0');
                    const payable = mrp * qty * (1 - disc);
                    const taxAmt_ = gst > 0 ? payable * gst / (100 + gst) : 0;
                    return (
                      <div style={{ background: 'var(--bg2)', borderRadius: 5, padding: '8px 12px', fontSize: 12 }}>
                        Payable: <strong>{fmtINR(payable)}</strong>
                        {taxAmt_ > 0 && <span style={{ color: 'var(--text2)', marginLeft: 8 }}>(incl. GST {fmtINR(taxAmt_)})</span>}
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowManual(false)}>Cancel</button>
                    <button className="btn btn-brand" disabled={!manualName || !manualMrp} onClick={addManual}>Add to Bill</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
