// Unified date utility for inventory & reconciliation modules

const INDO_MONTHS_MAP: Record<string, string> = {
  januari: '01', jan: '01',
  februari: '02', feb: '02',
  maret: '03', mar: '03',
  april: '04', apr: '04',
  mei: '05', may: '05',
  juni: '06', jun: '06',
  juli: '07', jul: '07',
  agustus: '08', ags: '08', agu: '08', aug: '08',
  september: '09', sep: '09',
  oktober: '10', okt: '10', oct: '10',
  november: '11', nov: '11',
  desember: '12', des: '12', dec: '12'
};

const INDO_MONTHS_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Validates whether a day/month/year combination forms a real calendar date.
 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1980 || year > 2120) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Normalizes any date string, ISO timestamp, or Excel serial number to standard ISO format "YYYY-MM-DD".
 * Returns empty string if invalid or empty.
 */
export function parseToIsoDate(dtStr: any): string {
  if (dtStr === null || dtStr === undefined) return '';
  let cleaned = String(dtStr).trim();
  if (
    !cleaned ||
    cleaned === '#N/A' ||
    cleaned === '-' ||
    cleaned === 'null' ||
    cleaned === 'undefined' ||
    cleaned.toLowerCase() === 'invalid date'
  ) {
    return '';
  }

  // 1. ISO 8601 full timestamp check (e.g. "2026-09-01T07:00:00.000Z")
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return '';
  }

  // 2. Excel Serial Date check (e.g. 44000 to 60000)
  const num = Number(cleaned);
  if (!isNaN(num) && num >= 10000 && num <= 100000) {
    const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      const y = dateObj.getUTCFullYear();
      const m = dateObj.getUTCMonth() + 1;
      const d = dateObj.getUTCDate();
      if (isValidCalendarDate(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    return '';
  }

  // 3. Month name check (e.g., "28 Agustus 2024", "28-Agu-24", "15 Jan 2025", "10 Okt 2026")
  const wordMatch = cleaned.match(/^(\d{1,2})[\s\-\/\.]([a-zA-Z]+)[\s\-\/\.](\d{2,4})/);
  if (wordMatch) {
    const day = parseInt(wordMatch[1], 10);
    const monthKey = wordMatch[2].toLowerCase();
    let yStr = wordMatch[3];
    if (yStr.length === 2) yStr = '20' + yStr;
    const year = parseInt(yStr, 10);
    const mStr = INDO_MONTHS_MAP[monthKey];
    if (mStr) {
      const month = parseInt(mStr, 10);
      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return '';
  }

  // Strip trailing time portion if present (e.g. "2024-08-28 14:30:00" or "28/08/2024 14:30:00")
  if (cleaned.includes(' ') && !cleaned.match(/[a-zA-Z]/)) {
    cleaned = cleaned.split(' ')[0];
  }

  // 4. Try exact YYYY-MM-DD or YYYY/MM/DD
  const yyyymmdd = cleaned.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1], 10);
    const m = parseInt(yyyymmdd[2], 10);
    const d = parseInt(yyyymmdd[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return '';
  }

  // 5. Try DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
  const parts = cleaned.includes('/') ? cleaned.split('/') : (cleaned.includes('-') ? cleaned.split('-') : []);
  if (parts.length === 3) {
    let p1 = parts[0].trim();
    let p2 = parts[1].trim();
    let yStr = parts[2].trim();
    if (yStr.includes(' ')) yStr = yStr.split(' ')[0];

    // If starts with 4-digit year: YYYY/MM/DD
    if (p1.length === 4) {
      const y = parseInt(p1, 10);
      const m = parseInt(p2, 10);
      const d = parseInt(yStr, 10);
      if (isValidCalendarDate(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      return '';
    }

    if (yStr.length === 2) {
      yStr = '20' + yStr;
    }
    const year = parseInt(yStr, 10);
    const n1 = parseInt(p1, 10);
    const n2 = parseInt(p2, 10);

    if (n1 > 12) {
      // Must be DD/MM/YYYY
      if (isValidCalendarDate(year, n2, n1)) {
        return `${year}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
      }
    } else if (n2 > 12) {
      // Must be MM/DD/YYYY
      if (isValidCalendarDate(year, n1, n2)) {
        return `${year}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
      }
    } else {
      // Default to Indonesian DD/MM/YYYY
      if (isValidCalendarDate(year, n2, n1)) {
        return `${year}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
      }
    }
    return '';
  }

  // 6. Standard Javascript Date parsing fallback
  const parsed = Date.parse(cleaned);
  if (!isNaN(parsed)) {
    const dObj = new Date(parsed);
    const y = dObj.getFullYear();
    const m = dObj.getMonth() + 1;
    const d = dObj.getDate();
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // If not valid, return empty string
  return '';
}

/**
 * Returns UTC timestamp milliseconds for sorting and chronological comparison.
 */
export function getParsedDateValue(dtStr: any): number {
  const iso = parseToIsoDate(dtStr);
  if (!iso) return 0;
  const parts = iso.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d).getTime();
  }
  return 0;
}

/**
 * Formats ISO date "YYYY-MM-DD" or raw date into Indonesian human readable format "DD MMMM YYYY".
 */
export function displayTanggalIndonesian(dtStr: any): string {
  const iso = parseToIsoDate(dtStr);
  if (!iso) return dtStr ? String(dtStr) : '-';
  const parts = iso.split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parts[0];
    if (m >= 0 && m < 12) {
      return `${d} ${INDO_MONTHS_NAMES[m]} ${y}`;
    }
  }
  return iso;
}

/**
 * Formats ISO date "YYYY-MM-DD" to "DD/MM/YYYY".
 */
export function formatToDDMMYYYY(dtStr: any): string {
  const iso = parseToIsoDate(dtStr);
  if (!iso) return dtStr ? String(dtStr) : '-';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}
