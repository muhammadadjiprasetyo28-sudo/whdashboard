/**
 * Enterprise Number & Quantity Utility for WH Command Center
 * Handles Indonesian numeric formatting, dot thousand separators, comma decimals,
 * and MTS export specifics (e.g. "1.000", "13.000", "2.837.100", "12,5", "12,50", "2.732", "-40.000").
 */

export interface MtsQuantityParseResult {
  raw: string;
  isEndWith000: boolean;
  baseVal: number;
  thousandVal: number;
  parsedVal: number;
}

/**
 * Parses raw MTS export value into parsed components.
 */
export function parseMtsQuantity(val: any): MtsQuantityParseResult {
  if (val === null || val === undefined) {
    return { raw: '', isEndWith000: false, baseVal: 0, thousandVal: 0, parsedVal: 0 };
  }

  if (typeof val === 'number') {
    const num = isNaN(val) ? 0 : val;
    return {
      raw: String(num),
      isEndWith000: false,
      baseVal: num,
      thousandVal: num * 1000,
      parsedVal: num
    };
  }

  const s = String(val).trim().replace(/^"|"$/g, '').trim();
  if (!s) {
    return { raw: '', isEndWith000: false, baseVal: 0, thousandVal: 0, parsedVal: 0 };
  }

  // 1. Multiple dots (e.g. "2.837.100", "5.760.000"): dots are thousand separators
  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount > 1) {
    const clean = s.replace(/\./g, '').replace(/,/g, '.');
    const num = parseFloat(clean) || 0;
    return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
  }

  // 2. Both comma and dot present (e.g. "3.179,12")
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastComma > -1 && lastDot > -1) {
    let clean = s;
    if (lastComma > lastDot) {
      clean = clean.replace(/\./g, '').replace(/,/g, '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
    const num = parseFloat(clean) || 0;
    return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
  }

  // 3. Comma decimal (e.g. "437,6", "12,5", "12,50", "39,99")
  if (s.includes(',')) {
    const num = parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
  }

  // 4. Dot ending in exactly three zeroes: ".000" (e.g. "1.000", "13.000", "400.000", "-40.000", "26.000")
  if (s.endsWith('.000')) {
    const base = parseFloat(s.slice(0, -4)) || 0;
    return {
      raw: s,
      isEndWith000: true,
      baseVal: base,
      thousandVal: base * 1000,
      parsedVal: base
    };
  }

  // 5. Dot followed by 3 digits where integer part is <= 3 digits (e.g. "2.593", "2.732", "2.839", "5.385", "37.271")
  if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].replace('-', '').length <= 3) {
      const num = parseFloat(s.replace('.', '')) || 0;
      return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
    }
  }

  // Standard fallback
  const num = parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
  return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
}

/**
 * Intelligent matcher for MTS quantities resolving ambiguity between small unit vs thousands
 */
export function getSmartQuantity(
  entry: MtsQuantityParseResult | number | undefined,
  stokRill = 0,
  stokKemarin = 0,
  uom = '',
  kodeProduk = ''
): number {
  if (!entry) return 0;
  if (typeof entry === 'number') return entry;
  if (!entry.isEndWith000) return entry.parsedVal;

  const targetQty = Math.abs(stokRill) > 0 ? stokRill : (Math.abs(stokKemarin) > 0 ? stokKemarin : 0);

  if (targetQty > 0) {
    const diffBase = Math.abs(targetQty - entry.baseVal);
    const diffThousand = Math.abs(targetQty - entry.thousandVal);
    if (diffThousand < diffBase || (targetQty >= 1000 && entry.baseVal < 100)) {
      return entry.thousandVal;
    }
    return entry.baseVal;
  }

  if (entry.baseVal >= 100) return entry.baseVal;
  const isSackOrThousands = (uom || '').toLowerCase().includes('lembar') || (kodeProduk || '').toUpperCase().includes('SAK');
  if (isSackOrThousands) return entry.thousandVal;
  return entry.baseVal;
}

/**
 * Formats a numeric value with Indonesian thousand separators and optional decimals.
 */
export function formatNumberIndo(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val);
}
