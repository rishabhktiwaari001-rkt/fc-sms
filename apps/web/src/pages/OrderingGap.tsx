import React, { useState, useCallback } from 'react';

/* ── Types ─────────────────────────────────────────────── */
interface OGRow {
  category: string;
  subcategory: string;
  afsSize: string;
  gender: string;
  sleeveLength: string;
  soldQty: number;
  last3Qty: number;
  monthlyAvg: number;
  currentStock: number;
  minRequired: number;   // for apparel = monthlyAvg × 4; for non-apparel = monthlyAvg × 1.5
  monthsCover: number;
  portalCount: number;
  gap: number;           // positive = need to order
  inTransitQty: number;  // units already on the way
  effectiveGap: number;  // gap after subtracting in-transit
  status: 'critical' | 'low' | 'ok' | 'overstock' | 'dump' | 'in-transit';
}

interface SalesEntry { sold: number; last3: number; }

/* ── Helpers ────────────────────────────────────────────── */
/** "Clothes & Shoes" → true; Baby Gear, Feeding & Nursing, etc → false */
function isApparel(cat: string): boolean {
  return /clothes?\s*&\s*shoes?|cloth.*shoe|shoe.*cloth/i.test(cat);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  const dmyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyShort) return new Date(2000 + +dmyShort[3], +dmyShort[2] - 1, +dmyShort[1]);
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error('Could not load SheetJS from CDN. Check internet connection.'));
    document.head.appendChild(s);
  });
}

/** Normalise sleeve name: "Half sleeves" → "Half Sleeves", "Full Sleeves" → "Full Sleeves" */
function normSleeve(s: string): string {
  if (!s) return '';
  if (/half/i.test(s)) return 'Half Sleeves';
  if (/full/i.test(s)) return 'Full Sleeves';
  return s.trim();
}

/** 5-part key: category + sub + size + gender + sleeve (apparel) */
function makeKey5(cat: string, sub: string, size: string, gender: string, sleeve: string) {
  return [cat, sub, size, gender, sleeve].map(x => x.trim().toLowerCase()).join('||');
}
/** 4-part key: no sleeve */
function makeKey4(cat: string, sub: string, size: string, gender: string) {
  return [cat, sub, size, gender].map(x => x.trim().toLowerCase()).join('||');
}
/** 3-part key: no gender / sleeve */
function makeKey3(cat: string, sub: string, size: string) {
  return [cat, sub, size].map(x => x.trim().toLowerCase()).join('||');
}

/** Normalise product ID for transit matching */
function normPid(id: string): string { return id.trim().toLowerCase(); }

/* ── Component ──────────────────────────────────────────── */
export default function OrderingGap() {
  const [ogCSFile, setOgCSFile]   = useState<File | null>(null);
  const [ogSSFile, setOgSSFile]   = useState<File | null>(null);
  const [ogASRFile, setOgASRFile] = useState<File | null>(null);
  const [ogITFile, setOgITFile]   = useState<File | null>(null);
  const [ogData,   setOgData]     = useState<OGRow[] | null>(null);
  const [ogLoading, setOgLoading] = useState(false);
  const [ogError,   setOgError]   = useState<string | null>(null);

  // Filters
  const [ogStatusFilter, setOgStatusFilter] = useState<'all'|'critical'|'low'|'ok'|'overstock'|'dump'|'in-transit'>('all');
  const [ogCatFilter,    setOgCatFilter]    = useState('All');
  const [ogSubcatFilter, setOgSubcatFilter] = useState('All');
  const [ogGenderFilter, setOgGenderFilter] = useState('All');
  const [ogSleeveFilter, setOgSleeveFilter] = useState('All');
  const tableRef = React.useRef<HTMLDivElement>(null);

  const handleCardClick = (filterVal: string) => {
    setOgStatusFilter(filterVal as any);
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  /* ── Styles ─── */
  const card = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const th   = { padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textAlign: 'left' as const, borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' as const };
  const td   = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const };
  const tdR  = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  const sel  = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 };
  const badge = (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color });

  /* ── Core Analysis ── */
  const analyzeOrderingGap = useCallback(async () => {
    if (!ogSSFile || !ogASRFile) { setOgError('Please upload Secondary Stock and ASR files first.'); return; }
    setOgLoading(true); setOgError(null); setOgData(null);
    try {
      const XLSX = await loadXLSX();

      /* ── 1. CS Inventory (optional) — portal availability ── */
      // key3 (cat||sub||size) → count
      const csMap = new Map<string, number>();
      const csLoaded = !!ogCSFile;
      if (ogCSFile) {
        await new Promise<void>((res, rej) => {
          const fr = new FileReader();
          fr.onload = ev => {
            try {
              const wb = XLSX.read(ev.target?.result, { type: 'binary' });
              const sheetName = wb.SheetNames.find((n: string) => /final.*north/i.test(n)) ?? wb.SheetNames[0];
              const ws = wb.Sheets[sheetName];
              const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
              for (const r of rows) {
                const sub  = (r['Subcategory Name'] || r['SubcategoryName'] || r['SubCategory Name'] || '').trim();
                const size = (r['AFS Size'] || r['AFSSize'] || r['Size'] || '').trim();
                const cat  = (r['Category Name'] || r['CategoryName'] || r['Category'] || '').trim();
                if (!sub || !size) continue;
                const k = makeKey3(cat, sub, size);
                csMap.set(k, (csMap.get(k) || 0) + 1);
              }
              res();
            } catch (e: any) { rej(new Error('CS Inventory parse error: ' + e.message)); }
          };
          fr.onerror = () => rej(new Error('Failed to read CS Inventory file'));
          fr.readAsBinaryString(ogCSFile);
        });
      }

      /* ── 2. Secondary Stock XLSX — read the ACTUAL data sheet ── */
      // Key: makeKey5(cat,sub,size,gender,sleeve) → stock count
      // Also store display names + productId mapping for transit matching
      interface SSEntry { cat: string; sub: string; size: string; gender: string; sleeve: string; stock: number; }
      const ssEntries: SSEntry[] = [];
      const ssMap = new Map<string, number>(); // key5 → stock

      // For in-transit matching: key5 → Set of productIds
      const key5ToProducts = new Map<string, Set<string>>();
      // Dimensional fallback: normPid → key4 (cat||sub||size||gender)
      const pidToKey4 = new Map<string, string>();

      await new Promise<void>((res, rej) => {
        const fr = new FileReader();
        fr.onload = ev => {
          try {
            const wb = XLSX.read(ev.target?.result, { type: 'binary' });
            // Find the actual data sheet — NOT Sheet2 (9 rows), NOT Sheet1 (pivot)
            // The real data is in the sheet named "SecondaryStock_*" (8000+ rows)
            const sheetName =
              wb.SheetNames.find((n: string) => /SecondaryStock/i.test(n)) ??
              wb.SheetNames[wb.SheetNames.length - 1]; // fallback: last sheet

            const ws = wb.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

            for (const r of rows) {
              const cat    = (r['CategoryName']    || r['Category Name']    || r['Category']    || '').trim();
              const sub    = (r['SubCategoryName'] || r['Sub Category Name']|| r['SubCategory'] || '').trim();
              const size   = (r['AFS Size']        || r['AFSSize']          || r['Size']        || '').trim();
              const gender = (r['Gender']          || '').trim();
              const sleeve = normSleeve((r['SleeveLength'] || r['Sleeve Length'] || r['SleeveLenght'] || '').trim());
              const stock  = parseFloat(String(r['CurrentStock'] || r['Current Stock'] || '0')) || 0;
              if (!sub || !size) continue;

              // Capture productId for transit matching (Product ID alone is size-specific in this system)
              const productId = String(r['ProductID'] || r['Product ID'] || r['ArticleCode'] || r['Article Code'] || r['ItemCode'] || r['SKU'] || '').trim();

              const k5 = makeKey5(cat, sub, size, gender, sleeve);
              ssMap.set(k5, (ssMap.get(k5) || 0) + stock);
              ssEntries.push({ cat, sub, size, gender, sleeve, stock });

              // Build productId→key5 mapping for transit lookup
              if (productId) {
                const pid = normPid(productId);
                const existing = key5ToProducts.get(k5);
                if (existing) existing.add(pid);
                else key5ToProducts.set(k5, new Set([pid]));
                // key4 = cat||sub||size||gender (no sleeve) for dimensional fallback
                const k4 = [cat, sub, size, gender].map((s: string) => s.trim().toLowerCase()).join('||');
                pidToKey4.set(pid, k4);
              }
            }
            res();
          } catch (e: any) { rej(new Error('Secondary Stock parse error: ' + e.message)); }
        };
        fr.onerror = () => rej(new Error('Failed to read Secondary Stock file'));
        fr.readAsBinaryString(ogSSFile);
      });

      /* ── 3. ASR CSV — sales data ── */
      // Build maps at multiple granularities for flexible join
      const LAST3_MONTHS    = new Set(['2026-08', '2026-09', '2026-10']);
      const ASR_TOTAL_MONTHS = 7; // Apr–Oct 2026

      // key5 (cat||sub||size||gender||sleeve) — if ASR has sleeve
      const asrFull   = new Map<string, SalesEntry>();
      // key4 (cat||sub||size||gender) — if ASR has gender
      const asrGender = new Map<string, SalesEntry>();
      // key3 (cat||sub||size) — always available
      const asrBase   = new Map<string, SalesEntry>();

      const addSales = (map: Map<string, SalesEntry>, k: string, qty: number, isLast3: boolean) => {
        const e = map.get(k) ?? { sold: 0, last3: 0 };
        e.sold += qty;
        if (isLast3) e.last3 += qty;
        map.set(k, e);
      };

      // Also capture display labels from ASR for rows NOT in SS
      interface ASRMeta { cat: string; sub: string; size: string; gender: string; sleeve: string; }
      const asrMeta = new Map<string, ASRMeta>(); // key3 → meta (first seen)

      await new Promise<void>((res, rej) => {
        const fr = new FileReader();
        fr.onload = ev => {
          try {
            const raw = parseCSV(ev.target?.result as string);
            for (const r of raw) {
              const cat    = (r['Category']       || r['CategoryName']    || '').trim();
              const sub    = (r['SubCategory']    || r['Sub Category']    || r['Subcategory'] || r['SubCategoryName'] || '').trim();
              const size   = (r['AFSSize']        || r['AFS Size']        || r['Size']        || '').trim();
              const gender = (r['Gender']         || '').trim();
              const sleeve = normSleeve((r['SleeveLength'] || r['Sleeve Length'] || r['SleeveLenght'] || '').trim());
              const qty    = parseFloat(r['Quantity'] || '0') || 0;
              if (!sub || !size || qty <= 0) continue;

              const dateStr = (r['BillDate'] || r['Bill Date'] || r['Date'] || '').trim();
              const date    = parseDate(dateStr);
              const mk      = date ? monthKey(date) : '';
              const isLast3 = LAST3_MONTHS.has(mk);

              const k5 = makeKey5(cat, sub, size, gender, sleeve);
              const k4 = makeKey4(cat, sub, size, gender);
              const k3 = makeKey3(cat, sub, size);

              addSales(asrFull,   k5, qty, isLast3);
              addSales(asrGender, k4, qty, isLast3);
              addSales(asrBase,   k3, qty, isLast3);

              if (!asrMeta.has(k3)) asrMeta.set(k3, { cat, sub, size, gender, sleeve });
            }
            res();
          } catch (e: any) { rej(new Error('ASR parse error: ' + e.message)); }
        };
        fr.onerror = () => rej(new Error('Failed to read ASR file'));
        fr.readAsText(ogASRFile);
      });

      /** Best available sales for a given (cat, sub, size, gender, sleeve) combo */
      function getSales(cat: string, sub: string, size: string, gender: string, sleeve: string): SalesEntry {
        return (
          asrFull.get(makeKey5(cat, sub, size, gender, sleeve)) ||
          asrGender.get(makeKey4(cat, sub, size, gender)) ||
          asrBase.get(makeKey3(cat, sub, size)) ||
          { sold: 0, last3: 0 }
        );
      }

      /* ── 4. In Transit Stock (optional) — parse ProductID + AgeGroup + Qty ── */
      // transitMap: normPid → transitQty (exact PID match)
      const transitMap = new Map<string, number>();
      // key4TransitMap: cat||sub||size||gender → transitQty (dimensional fallback)
      const key4TransitMap = new Map<string, number>();
      const itLoaded = !!ogITFile;

      if (ogITFile) {
        await new Promise<void>((res, rej) => {
          const fr = new FileReader();
          fr.onload = ev => {
            try {
              let rows: any[] = [];
              // Support both XLSX/XLS and CSV
              const fileName = ogITFile.name.toLowerCase();
              if (fileName.endsWith('.csv')) {
                rows = parseCSV(ev.target?.result as string);
              } else {
                const wb = XLSX.read(ev.target?.result, { type: 'binary' });
                // Try to find a transit-related sheet, else use first sheet
                const sheetName =
                  wb.SheetNames.find((n: string) => /transit|intransit|in.transit/i.test(n)) ??
                  wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
              }

              for (const r of rows) {
                const pid = (
                  r['Product ID']   || r['ProductID']     ||
                  r['ArticleCode']  || r['Article Code']  ||
                  r['ItemCode']     || r['Item Code']     ||
                  r['SKU']          || r['Barcode']       || ''
                ).trim();

                // IT sheet uses 'Quantity' = actual in-transit qty (skip 0 = not yet dispatched)
                const qty = parseFloat(String(
                  r['Quantity']       || r['InTransitQty']    ||
                  r['In Transit Qty'] || r['TransitQty']      ||
                  r['Transit Qty']    || r['Qty']             ||
                  r['QtyInTransit']   || '0'
                )) || 0;

                if (!pid || qty <= 0) continue;
                const key = normPid(pid);
                transitMap.set(key, (transitMap.get(key) || 0) + qty);
                // Dimensional fallback: if this PID exists in SS, accumulate by key4
                const k4 = pidToKey4.get(key);
                if (k4) {
                  key4TransitMap.set(k4, (key4TransitMap.get(k4) || 0) + qty);
                }
              }
              res();
            } catch (e: any) { rej(new Error('In Transit parse error: ' + e.message)); }
          };
          fr.onerror = () => rej(new Error('Failed to read In Transit file'));
          // Use readAsBinaryString for XLSX, readAsText for CSV
          if (ogITFile.name.toLowerCase().endsWith('.csv')) {
            fr.readAsText(ogITFile);
          } else {
            fr.readAsBinaryString(ogITFile);
          }
        });
      }

      /* ── 5. Build dimensional stock summary from SS ── */
      // Aggregate by key5 (already done in ssMap above)
      // We need a deduplicated list of (cat, sub, size, gender, sleeve) entries from SS
      const ssAgg = new Map<string, SSEntry & { stock: number }>();
      for (const e of ssEntries) {
        const k5 = makeKey5(e.cat, e.sub, e.size, e.gender, e.sleeve);
        const existing = ssAgg.get(k5);
        if (existing) {
          existing.stock += e.stock;
        } else {
          ssAgg.set(k5, { ...e, stock: e.stock });
        }
      }

      /* ── 6. Also include rows from ASR that have no SS entry ── */
      // (i.e. items sold out — stock = 0, but sold > 0, so gap = sold)
      const asrOnlyKeys = new Set<string>();
      for (const [k3, meta] of asrMeta) {
        // check if any SS entry covers this sub+size
        const hasSSEntry = [...ssAgg.keys()].some(k5 => k5.startsWith(makeKey3(meta.cat, meta.sub, meta.size)));
        if (!hasSSEntry) {
          asrOnlyKeys.add(k3);
        }
      }

      /* ── 7. Assemble final OGRow array ── */
      const result: OGRow[] = [];

      // Helper: compute in-transit qty for a given key5 by summing all productIds that map to it
      // Helper: exact PID match first; if no match, fall back to dimensional key4 match
      // (same cat+sub+size+gender, different PID — covers reordered items with new barcode)
      function getTransitQty(k5: string): number {
        if (!itLoaded) return 0;
        // Step 1: exact PID match
        const pids = key5ToProducts.get(k5);
        if (pids && pids.size > 0) {
          let total = 0;
          for (const pid of pids) total += transitMap.get(pid) || 0;
          if (total > 0) return total;
        }
        // Step 2: dimensional fallback (cat||sub||size||gender, any PID)
        const parts = k5.split('||');
        const k4 = parts.slice(0, 4).join('||');
        return key4TransitMap.get(k4) || 0;
      }

      // From SS entries (has current stock)
      for (const [k5key, e] of ssAgg) {
        const sales      = getSales(e.cat, e.sub, e.size, e.gender, e.sleeve);
        const sold       = sales.sold;
        const last3      = sales.last3;
        const monthlyAvg = sold / ASR_TOTAL_MONTHS;
        const stock      = e.stock;
        const apparel    = isApparel(e.cat);

        // Gap logic
        const minRequired = apparel
          ? monthlyAvg * 4                  // apparel: maintain 4× monthly avg (≈ 4 months cover)
          : monthlyAvg * 1.5;            // non-apparel: maintain 1.5× monthly avg
        const gap         = Math.round(minRequired - stock);
        const monthsCover = monthlyAvg > 0 ? stock / monthlyAvg : (stock > 0 ? 999 : 0);
        const csKey       = makeKey3(e.cat, e.sub, e.size);
        const portal      = csMap.get(csKey) || 0;

        const isOverstock = stock >= monthlyAvg * 5 && stock > 0 && monthlyAvg > 0;
        const isDump      = isOverstock && (last3 <= 2 || (monthlyAvg > 0 && last3 < monthlyAvg * 3 * 0.5));

        // In-transit adjustment
        const k5 = makeKey5(e.cat, e.sub, e.size, e.gender, e.sleeve);
        const inTransitQty = Math.round(getTransitQty(k5));
        const effectiveGap = gap > 0 ? Math.max(0, gap - inTransitQty) : Math.max(0, gap);

        let status: OGRow['status'];
        // If gap > 0 but fully covered by transit → in-transit
        if (gap > 0 && itLoaded && inTransitQty > 0 && effectiveGap === 0) {
          status = 'in-transit';
        } else if (gap > 0 && csLoaded && portal > 0) status = 'critical';
        else if (gap > 0 && csLoaded && portal === 0) status = 'low';
        else if (gap > 0 && !csLoaded) status = 'critical';
        else if (isDump) status = 'dump';
        else if (isOverstock) status = 'overstock';
        else status = 'ok';

        result.push({
          category:    e.cat,
          subcategory: e.sub,
          afsSize:     e.size,
          gender:      e.gender,
          sleeveLength: e.sleeve,
          soldQty:     Math.round(sold),
          last3Qty:    Math.round(last3),
          monthlyAvg:  Math.round(monthlyAvg * 10) / 10,
          currentStock: Math.round(stock),
          minRequired:  Math.round(minRequired),
          monthsCover:  Math.round(monthsCover * 10) / 10,
          portalCount:  portal,
          gap,
          inTransitQty,
          effectiveGap,
          status,
        });
      }

      // From ASR-only entries (sold out — stock = 0)
      for (const k3 of asrOnlyKeys) {
        const meta    = asrMeta.get(k3)!;
        const sales   = asrBase.get(k3) ?? { sold: 0, last3: 0 };
        const sold    = sales.sold;
        const last3   = sales.last3;
        const avg     = sold / ASR_TOTAL_MONTHS;
        const apparel = isApparel(meta.cat);
        const minReq  = apparel ? avg * 4 : avg * 1.5;
        const gap     = Math.round(minReq);    // stock = 0
        const portal  = csMap.get(k3) || 0;

        // For ASR-only rows, we don't have a key5 to look up in key5ToProducts
        // so transit qty defaults to 0 unless we can find a product combo
        const k5 = makeKey5(meta.cat, meta.sub, meta.size, meta.gender, normSleeve(meta.sleeve));
        const inTransitQty = Math.round(getTransitQty(k5));
        const effectiveGap = gap > 0 ? Math.max(0, gap - inTransitQty) : 0;

        let status: OGRow['status'];
        if (gap > 0 && itLoaded && inTransitQty > 0 && effectiveGap === 0) {
          status = 'in-transit';
        } else if (gap > 0 && csLoaded && portal > 0) status = 'critical';
        else if (gap > 0 && csLoaded && portal === 0) status = 'low';
        else if (gap > 0 && !csLoaded) status = 'critical';
        else status = 'ok';

        result.push({
          category:    meta.cat,
          subcategory: meta.sub,
          afsSize:     meta.size,
          gender:      meta.gender,
          sleeveLength: normSleeve(meta.sleeve),
          soldQty:     Math.round(sold),
          last3Qty:    Math.round(last3),
          monthlyAvg:  Math.round(avg * 10) / 10,
          currentStock: 0,
          minRequired:  Math.round(minReq),
          monthsCover:  0,
          portalCount:  portal,
          gap,
          inTransitQty,
          effectiveGap,
          status,
        });
      }

      const statusOrder: Record<string, number> = { critical: 0, low: 1, dump: 2, overstock: 3, 'in-transit': 4, ok: 5 };
      result.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || b.gap - a.gap);
      setOgData(result);
      setOgCatFilter('All');
      setOgSubcatFilter('All');
      setOgGenderFilter('All');
      setOgSleeveFilter('All');
    } catch (e: any) { setOgError(e.message); }
    setOgLoading(false);
  }, [ogCSFile, ogSSFile, ogASRFile, ogITFile]);

  /* ── Upload card ── */
  const fileInputStyle: React.CSSProperties = { display: 'none' };
  const uploadCard = (label: string, icon: string, desc: string, file: File | null, inputId: string, onChange: (f: File | null) => void, optional?: boolean) => (
    <div style={{ ...card, flex: 1, minWidth: 220, cursor: 'pointer', marginBottom: 0, position: 'relative' as const }} onClick={() => document.getElementById(inputId)?.click()}>
      <input id={inputId} type="file" style={fileInputStyle} accept=".xlsx,.xls,.csv"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
      {optional && (
        <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, background: 'var(--bg2)', color: 'var(--text2)', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
          OPTIONAL
        </div>
      )}
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{desc}</div>
      {file
        ? <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✔ {file.name}</div>
        : <div style={{ fontSize: 12, color: 'var(--text2)' }}>Click to upload{optional ? ' (skip to ignore)' : ''}</div>}
    </div>
  );

  /* ── Derived filter lists ── */
  const ogCats = ogData
    ? ['All', ...Array.from(new Set(ogData.map(r => r.category).filter(Boolean))).sort()]
    : ['All'];

  const ogSubcats = ogData
    ? ['All', ...Array.from(new Set(
        ogData.filter(r => ogCatFilter === 'All' || r.category === ogCatFilter).map(r => r.subcategory)
      )).sort()]
    : ['All'];

  const ogGenders = ogData
    ? ['All', ...Array.from(new Set(ogData.map(r => r.gender).filter(Boolean))).sort()]
    : ['All'];

  // SleeveLength filter only makes sense for apparel
  const hasApparelRows = ogData?.some(r => isApparel(r.category) && r.sleeveLength) ?? false;
  const ogSleeves = hasApparelRows && ogData
    ? ['All', ...Array.from(new Set(ogData.filter(r => r.sleeveLength).map(r => r.sleeveLength))).sort()]
    : ['All'];

  /* ── Apply filters ── */
  const filteredOG = (ogData ?? []).filter(r => {
    if (ogStatusFilter !== 'all' && r.status !== ogStatusFilter) return false;
    if (ogCatFilter    !== 'All' && r.category    !== ogCatFilter)    return false;
    if (ogSubcatFilter !== 'All' && r.subcategory !== ogSubcatFilter) return false;
    if (ogGenderFilter !== 'All' && r.gender      !== ogGenderFilter) return false;
    if (ogSleeveFilter !== 'All' && r.sleeveLength !== ogSleeveFilter) return false;
    return true;
  });

  /* ── Status badge ── */
  const statusBadge = (s: OGRow['status']) => {
    const map: Record<string, [string, string]> = {
      critical:    ['🔴', '#dc2626'],
      low:         ['🟡', '#d97706'],
      ok:          ['🟢', '#059669'],
      overstock:   ['🔵', '#2563eb'],
      dump:        ['💀', '#7c3aed'],
      'in-transit':['🚚', '#0891b2'],
    };
    const [ico, col] = map[s] ?? ['⬜', 'var(--text2)'];
    return <span style={badge(col)}>{ico} {s === 'in-transit' ? 'In Transit' : s.charAt(0).toUpperCase() + s.slice(1)}</span>;
  };

  /* ── Summary counts ── */
  const hasTransit = ogData?.some(r => r.inTransitQty > 0) ?? false;
  const summary = ogData ? {
    critical:    ogData.filter(r => r.status === 'critical').length,
    low:         ogData.filter(r => r.status === 'low').length,
    dump:        ogData.filter(r => r.status === 'dump').length,
    overstock:   ogData.filter(r => r.status === 'overstock').length,
    ok:          ogData.filter(r => r.status === 'ok').length,
    inTransit:   ogData.filter(r => r.status === 'in-transit').length,
    totalGap:    ogData.filter(r => r.gap > 0).reduce((s, r) => s + r.gap, 0),
    netGap:      ogData.filter(r => r.effectiveGap > 0).reduce((s, r) => s + r.effectiveGap, 0),
    dumpUnits:   ogData.filter(r => r.status === 'dump').reduce((s, r) => s + r.currentStock, 0),
  } : null;

  /* ── Column visibility ── */
  const showCatCol    = Boolean(ogData?.some(r => r.category));
  const showGenderCol = Boolean(ogData?.some(r => r.gender));
  const showSleeveCol = Boolean(ogData?.some(r => r.sleeveLength));
  const showMinReq    = Boolean(ogData?.some(r => !isApparel(r.category)));
  const showTransit   = hasTransit;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">🛒 Ordering Gap</div>
          <div className="page-sub">
            Identify stock gaps by Category → Sub-Category → Size → Gender → Sleeve — upload 2–4 reports to analyse
          </div>
        </div>
      </div>

      {/* ── Upload section ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Upload Reports</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {uploadCard('CS Inventory Report', '🏬', 'Portal availability — C&S North India (optional)', ogCSFile, 'og-cs-input', f => { setOgCSFile(f); setOgData(null); }, true)}
          {uploadCard('Secondary Stock Report', '📦', 'Current store floor stock (SecondaryStock sheet)', ogSSFile, 'og-ss-input', f => { setOgSSFile(f); setOgData(null); })}
          {uploadCard('ASR — Article Sale Report', '📈', 'What sold Apr–Oct 2026 (CSV)', ogASRFile, 'og-asr-input', f => { setOgASRFile(f); setOgData(null); })}
          {uploadCard('In Transit Stock', '🚚', 'Products already ordered & coming — match by Product ID + Age Group (optional)', ogITFile, 'og-it-input', f => { setOgITFile(f); setOgData(null); }, true)}
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={analyzeOrderingGap}
            disabled={!ogSSFile || !ogASRFile || ogLoading}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: (!ogSSFile || !ogASRFile || ogLoading) ? 'var(--bg2)' : '#1d4ed8',
              color: (!ogSSFile || !ogASRFile || ogLoading) ? 'var(--text2)' : '#fff',
              fontWeight: 700, fontSize: 14,
              cursor: (!ogSSFile || !ogASRFile || ogLoading) ? 'not-allowed' : 'pointer'
            }}>
            {ogLoading ? '⏳ Analysing…' : '🔍 Analyse Ordering Gap'}
          </button>
          {ogData && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{ogData.length} SKU combinations found</span>}
        </div>
        {ogError && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>⚠️ {ogError}</div>}

        {/* Logic legend */}
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
          <strong style={{ color: 'var(--text1)' }}>Gap logic:</strong>
          {' '}<span style={{ color: '#2563eb' }}>Clothes &amp; Shoes (Apparel)</span> — gap = (Monthly Avg × 4) − Current Stock (4 months cover target) ·
          {' '}<span style={{ color: '#059669' }}>Non-Apparel</span> — min required = Monthly Avg × 1.5 (maintain 6 weeks buffer); gap = Min Required − Current Stock ·
          {' '}<span style={{ color: '#0891b2' }}>🚚 In Transit</span> — if a matching product (by Product ID + Age Group) is already coming, it's subtracted from the gap
        </div>
      </div>

      {/* ── Summary cards ── */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { label: '🔴 Critical (order now)', val: summary.critical,  col: '#dc2626', filter: 'critical'    },
            { label: '🟡 Low (not on portal)', val: summary.low,        col: '#d97706', filter: 'low'         },
            ...(hasTransit ? [{ label: '🚚 Covered by Transit', val: summary.inTransit, col: '#0891b2', filter: 'in-transit' }] : []),
            { label: '💀 Dump Stock SKUs',     val: summary.dump,       col: '#7c3aed', filter: 'dump'        },
            { label: '💀 Dump Stock Units',    val: summary.dumpUnits,  col: '#7c3aed', filter: 'dump'        },
            { label: '🔵 Overstock',           val: summary.overstock,  col: '#2563eb', filter: 'overstock'   },
            { label: '🟢 OK / Sufficient',     val: summary.ok,         col: '#059669', filter: 'ok'          },
            { label: '📦 Total Units Gap',     val: summary.totalGap,   col: 'var(--red)', filter: 'all'      },
            ...(hasTransit && summary.netGap !== summary.totalGap
              ? [{ label: '📦 Net Gap (after Transit)', val: summary.netGap, col: '#b45309', filter: 'all' }]
              : []),
          ].map(c => {
            const isActive = ogStatusFilter === c.filter && c.filter !== 'all';
            return (
              <div
                key={c.label}
                onClick={() => handleCardClick(c.filter)}
                style={{
                  ...card,
                  flex: '1 1 140px', marginBottom: 0, textAlign: 'center',
                  cursor: 'pointer',
                  outline: isActive ? `2px solid ${c.col}` : '2px solid transparent',
                  outlineOffset: 2,
                  transform: isActive ? 'translateY(-2px)' : 'none',
                  transition: 'transform 0.15s, outline 0.15s',
                  userSelect: 'none' as const,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, color: c.col }}>{c.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: c.col, marginTop: 3, opacity: 0.7 }}>
                  {isActive ? '▲ active filter' : 'click to filter ↓'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Filters + Table ── */}
      {ogData && (
        <div ref={tableRef} style={card}>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginRight: 4 }}>Ordering Gap by SKU</div>

            {/* Status */}
            <select value={ogStatusFilter} onChange={e => setOgStatusFilter(e.target.value as any)} style={sel}>
              <option value="all">All Statuses</option>
              <option value="critical">🔴 Critical</option>
              <option value="low">🟡 Low</option>
              {hasTransit && <option value="in-transit">🚚 In Transit</option>}
              <option value="dump">💀 Dump Stock</option>
              <option value="overstock">🔵 Overstock</option>
              <option value="ok">🟢 OK</option>
            </select>

            {/* Category */}
            {ogCats.length > 1 && (
              <select value={ogCatFilter} onChange={e => { setOgCatFilter(e.target.value); setOgSubcatFilter('All'); }} style={sel}>
                {ogCats.map(c => <option key={c}>{c}</option>)}
              </select>
            )}

            {/* Sub-category */}
            <select value={ogSubcatFilter} onChange={e => setOgSubcatFilter(e.target.value)} style={sel}>
              {ogSubcats.map(s => <option key={s}>{s}</option>)}
            </select>

            {/* Gender */}
            {ogGenders.length > 1 && (
              <select value={ogGenderFilter} onChange={e => setOgGenderFilter(e.target.value)} style={sel}>
                {ogGenders.map(g => <option key={g}>{g}</option>)}
              </select>
            )}

            {/* Sleeve — only for apparel rows */}
            {ogSleeves.length > 1 && (
              <select value={ogSleeveFilter} onChange={e => setOgSleeveFilter(e.target.value)} style={sel}>
                <option value="All">All Sleeves</option>
                {ogSleeves.filter(s => s !== 'All').map(s => <option key={s}>{s}</option>)}
              </select>
            )}

            <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' }}>{filteredOG.length} rows</span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {[
                    ...(showCatCol    ? [{ h: 'Category',              r: false }] : []),
                    { h: 'Sub Category',               r: false },
                    { h: 'AFS Size',                   r: false },
                    ...(showGenderCol ? [{ h: 'Gender',                r: false }] : []),
                    ...(showSleeveCol ? [{ h: 'Sleeve',                r: false }] : []),
                    { h: 'Sold (Apr–Oct)',              r: true  },
                    { h: 'Last 3M (A/S/O)',             r: true  },
                    { h: 'Mo. Avg',                    r: true  },
                    { h: 'Curr Stock',                 r: true  },
                    ...(showMinReq   ? [{ h: 'Min Req (1.5×)',         r: true  }] : []),
                    { h: 'Mo. Cover',                  r: true  },
                    { h: 'Gap',                        r: true  },
                    ...(showTransit  ? [{ h: 'In Transit',             r: true  }] : []),
                    ...(showTransit  ? [{ h: 'Net Gap',                r: true  }] : []),
                    ...(ogCSFile     ? [{ h: 'Portal',                 r: true  }] : []),
                    { h: 'Status',                     r: false },
                  ].map(({ h, r }) => (
                    <th key={h} style={{ ...th, textAlign: r ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOG.length === 0
                  ? <tr><td colSpan={20} style={{ ...td, textAlign: 'center', color: 'var(--text2)', padding: 32 }}>No rows match current filters</td></tr>
                  : filteredOG.map((r, i) => {
                      const gapCol        = r.gap > 0 ? 'var(--red)' : 'var(--text2)';
                      const netGapCol     = r.effectiveGap > 0 ? '#b45309' : r.inTransitQty > 0 ? '#0891b2' : 'var(--text2)';
                      const coverCol      = r.monthsCover >= 5 ? '#7c3aed' : r.monthsCover >= 3 ? '#d97706' : r.monthsCover > 0 ? 'var(--green)' : 'var(--text2)';
                      const isDumpRow     = r.status === 'dump';
                      const isTransitRow  = r.status === 'in-transit';
                      const apparel       = isApparel(r.category);
                      return (
                        <tr key={i} style={{
                          background: isDumpRow
                            ? 'rgba(124,58,237,0.06)'
                            : isTransitRow
                            ? 'rgba(8,145,178,0.06)'
                            : i % 2 === 0 ? 'var(--bg1)' : 'var(--bg2)'
                        }}>
                          {showCatCol    && <td style={td}>{r.category}</td>}
                          <td style={td}>{r.subcategory}</td>
                          <td style={td}>{r.afsSize}</td>
                          {showGenderCol && (
                            <td style={{ ...td, color: r.gender === 'Boys' ? '#2563eb' : r.gender === 'Girls' ? '#db2777' : 'var(--text2)' }}>
                              {r.gender || '—'}
                            </td>
                          )}
                          {showSleeveCol && (
                            <td style={{ ...td, fontSize: 12, color: 'var(--text2)' }}>
                              {r.sleeveLength || '—'}
                            </td>
                          )}
                          <td style={tdR}>{r.soldQty}</td>
                          <td style={{ ...tdR, color: r.last3Qty <= 2 ? 'var(--red)' : 'var(--text1)', fontWeight: r.last3Qty <= 2 ? 700 : 400 }}>{r.last3Qty}</td>
                          <td style={{ ...tdR, color: 'var(--text2)' }}>{r.monthlyAvg.toFixed(1)}</td>
                          <td style={{ ...tdR, fontWeight: r.currentStock === 0 ? 700 : 400, color: r.currentStock === 0 ? 'var(--red)' : 'var(--text1)' }}>{r.currentStock}</td>
                          {showMinReq && (
                            <td style={{ ...tdR, color: 'var(--text2)', fontSize: 12 }}>
                              {apparel ? '—' : r.minRequired}
                            </td>
                          )}
                          <td style={{ ...tdR, color: coverCol, fontWeight: 700 }}>
                            {r.monthsCover >= 99 ? '∞' : r.monthsCover.toFixed(1)}M
                          </td>
                          <td style={{ ...tdR, color: gapCol, fontWeight: r.gap > 0 ? 700 : 400 }}>
                            {r.gap > 0 ? `+${r.gap}` : r.gap === 0 ? '—' : r.gap}
                          </td>
                          {showTransit && (
                            <td style={{ ...tdR, color: r.inTransitQty > 0 ? '#0891b2' : 'var(--text2)', fontWeight: r.inTransitQty > 0 ? 700 : 400 }}>
                              {r.inTransitQty > 0 ? `🚚 ${r.inTransitQty}` : '—'}
                            </td>
                          )}
                          {showTransit && (
                            <td style={{ ...tdR, color: netGapCol, fontWeight: r.effectiveGap > 0 ? 700 : 400 }}>
                              {r.effectiveGap > 0 ? `+${r.effectiveGap}` : r.gap > 0 && r.effectiveGap === 0 ? '✓ 0' : '—'}
                            </td>
                          )}
                          {ogCSFile && (
                            <td style={{ ...tdR, color: r.portalCount > 0 ? 'var(--green)' : 'var(--text2)' }}>
                              {r.portalCount > 0 ? r.portalCount : '—'}
                            </td>
                          )}
                          <td style={{ ...td, textAlign: 'center' }}>{statusBadge(r.status)}</td>
                        </tr>
                      );
                    })}
              </tbody>
              {filteredOG.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={
                      (showCatCol ? 1 : 0) + 2 + (showGenderCol ? 1 : 0) + (showSleeveCol ? 1 : 0)
                    }>Total ({filteredOG.length} rows)</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{filteredOG.reduce((s, r) => s + r.soldQty, 0)}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: 'var(--red)' }}>{filteredOG.reduce((s, r) => s + r.last3Qty, 0)}</td>
                    <td style={{ ...tdR, color: 'var(--text2)' }}>—</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{filteredOG.reduce((s, r) => s + r.currentStock, 0)}</td>
                    {showMinReq && <td style={tdR}>—</td>}
                    <td style={tdR}>—</td>
                    <td style={{ ...tdR, fontWeight: 700, color: 'var(--red)' }}>
                      {(() => { const g = filteredOG.filter(r => r.gap > 0).reduce((s, r) => s + r.gap, 0); return g > 0 ? `+${g}` : '—'; })()}
                    </td>
                    {showTransit && (
                      <td style={{ ...tdR, fontWeight: 700, color: '#0891b2' }}>
                        {(() => { const t = filteredOG.reduce((s, r) => s + r.inTransitQty, 0); return t > 0 ? t : '—'; })()}
                      </td>
                    )}
                    {showTransit && (
                      <td style={{ ...tdR, fontWeight: 700, color: '#b45309' }}>
                        {(() => { const g = filteredOG.filter(r => r.effectiveGap > 0).reduce((s, r) => s + r.effectiveGap, 0); return g > 0 ? `+${g}` : '—'; })()}
                      </td>
                    )}
                    {ogCSFile && <td style={{ ...tdR, fontWeight: 700 }}>{filteredOG.reduce((s, r) => s + r.portalCount, 0)}</td>}
                    <td style={td}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>
            🔴 Critical = gap &gt; 0{ogCSFile ? ' (on portal)' : ''} ·
            🟡 Low = gap &gt; 0 (not on portal) ·
            🚚 In Transit = gap fully covered by incoming stock ·
            💀 Dump = 5M+ cover &amp; last-3M slow ·
            🔵 Overstock = 5M+ cover but moving ·
            🟢 OK = healthy stock ·
            Mo.Cover = months of inventory at current avg ·
            <strong> Apparel gap</strong> = (Avg × 4) − Stock;
            <strong> Non-apparel gap</strong> = (Avg × 1.5) − Stock;
            <strong> Net Gap</strong> = Gap − In Transit (what you actually still need to order)
          </div>
        </div>
      )}
    </div>
  );
}
