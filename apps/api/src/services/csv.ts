import { parse } from 'csv-parse/sync';
import { InwardRow } from '@fc-sms/types';

export function parseInwardCsv(buffer: Buffer): InwardRow[] {
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  if (!rows.length) throw new Error('CSV is empty');

  const first = rows[0];
  if (!('load' in first) && !('poid' in first)) {
    throw new Error('Not an Inward Details CSV — missing "load" or "poid" column');
  }

  return rows as unknown as InwardRow[];
}

export function deriveCourier(docket: string): string {
  const d = docket.toUpperCase();
  if (/^RB|^RD/.test(d)) return 'ROCKETBEES';
  if (/^BD/.test(d)) return 'BLUE DART';
  if (/^DL/.test(d)) return 'DELHIVERY';
  if (/^DT/.test(d)) return 'DTDC';
  if (/^EE/.test(d)) return 'ECOM EXPRESS';
  if (/^\d{8,}$/.test(d)) return 'EXPRESSBEES';
  return 'OTHER';
}

export function aggregateLoad(rows: InwardRow[]) {
  const loadId = rows[0].load;
  const warehouseId = rows[0].warehouseID || '—';
  const docket = rows[0].shippingID || rows[0].poid || '—';
  const boxIds = new Set(rows.map(r => r.boxID).filter(Boolean));
  const boxes = boxIds.size || Math.ceil(rows.length / 10);

  let totalMrp = 0;
  let totalCtc = 0;
  for (const r of rows) {
    totalMrp += parseFloat(r.mrp || '0') * parseInt(r.quantity || '1', 10);
    totalCtc += parseFloat(r.ctc || '0') * parseInt(r.quantity || '1', 10);
  }

  return {
    loadId,
    warehouseId,
    courier: deriveCourier(docket),
    docket,
    boxes,
    totalMrp: Math.round(totalMrp * 100) / 100,
    totalCtc: Math.round(totalCtc * 100) / 100,
  };
}
