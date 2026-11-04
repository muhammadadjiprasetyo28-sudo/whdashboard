import Papa from 'papaparse';

export interface UnpostedDoc {
  id: string;
  menu: string;
  documentStatus: string;
  createdBy: string;
  documentNo: string;
  documentDate: string;
  area: string;
}

export interface UnpostedSummary {
  total: number;
  menuCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  areaCounts: Record<string, number>;
  lastUpdated?: string;
}

const TARIKAN_CSV_PROXY = '/api/unposted-docs';
const TARIKAN_CSV_DIRECT = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv&hl=id';

/**
 * Daftar resmi PIC / Created By yang diizinkan untuk area Jakarta
 */
export const JAKARTA_ALLOWED_CREATORS = [
  'Jeanny Marselyn',
  'Iwan Gunawan',
  'Rasto',
  'Nirwanto',
  'Wahyuningsih Kasmun',
  'Muhammad Adji',
  'Imam Syah',
  'Heri Suprapto',
  'Arief Nugroho'
] as const;

export const JAKARTA_ALLOWED_CREATORS_SET = new Set(
  JAKARTA_ALLOWED_CREATORS.map(name => name.toLowerCase().trim())
);

export function isAllowedJakartaCreator(createdBy?: string): boolean {
  if (!createdBy) return false;
  return JAKARTA_ALLOWED_CREATORS_SET.has(createdBy.toLowerCase().trim());
}

/**
 * Deduce area from Documentno if explicit Area field is empty
 */
export function deduceAreaFromDocNo(docNo: string, explicitArea: string, createdBy?: string): string {
  const cleanArea = explicitArea ? explicitArea.trim() : '';
  if (cleanArea && cleanArea.toUpperCase() !== 'UNKNOWN' && cleanArea !== '-') {
    return cleanArea;
  }

  // Jika dibuat oleh PIC resmi Jakarta, tetapkan area ke Jakarta
  if (createdBy && isAllowedJakartaCreator(createdBy)) {
    return 'Jakarta';
  }

  if (!docNo) return 'Lainnya / General';
  const upper = docNo.toUpperCase();

  if (upper.includes('JKT') || upper.includes('JAKARTA') || upper.includes('/YKT/')) return 'Jakarta';
  if (upper.includes('KRW') || upper.includes('PID') || upper.includes('KARAWANG')) return 'Karawang';
  if (upper.includes('SMG') || upper.includes('SEMARANG')) return 'Semarang';
  if (upper.includes('SBY') || upper.includes('SURABAYA')) return 'Surabaya';
  if (upper.includes('JMR') || upper.includes('JEMBER')) return 'Jember';
  if (upper.includes('MKS') || upper.includes('MAKASSAR')) return 'Makassar';
  if (upper.includes('PTN') || upper.includes('PONTIANAK')) return 'Pontianak';
  if (upper.includes('BJM') || upper.includes('BANJARMASIN')) return 'Banjarmasin';
  if (upper.includes('PLG') || upper.includes('PALEMBANG')) return 'Palembang';
  if (upper.includes('MDN') || upper.includes('MEDAN')) return 'Medan';
  if (upper.includes('PKB') || upper.includes('PEKANBARU')) return 'Pekanbaru';
  if (upper.includes('AMT')) return 'Jakarta';
  if (upper.includes('PSN')) return 'Jakarta';

  return 'Lainnya / General';
}

/**
 * Fetch and parse Unposted Dokumen from sheet Tarikan (gid 1541449669)
 */
export async function fetchUnpostedDocuments(forceFresh = false): Promise<UnpostedDoc[]> {
  const url = TARIKAN_CSV_PROXY + (forceFresh ? `?t=${Date.now()}` : '');
  let text = '';

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    text = await res.text();
    if (text.startsWith('{') && text.includes('"error"')) {
      throw new Error('Proxy returned JSON error');
    }
  } catch (err) {
    console.warn('Fallback to direct Google Sheet link for unposted docs:', err);
    try {
      const fallbackRes = await fetch(TARIKAN_CSV_DIRECT + (forceFresh ? `&t=${Date.now()}` : ''), { cache: 'no-store' });
      if (!fallbackRes.ok) throw new Error(`Direct fetch error: ${fallbackRes.status}`);
      text = await fallbackRes.text();
    } catch (fallbackErr) {
      console.error('All fetch attempts failed for unposted docs:', fallbackErr);
      return [];
    }
  }

  const rawLines = text.split('\n');
  const documents: UnpostedDoc[] = [];

  let menuIdx = 0;
  let statusIdx = 1;
  let createdIdx = 2;
  let docNoIdx = 3;
  let dateIdx = 4;
  let areaIdx = 5;

  let startRow = 2; // Default starting row for sheet Tarikan

  // Find header line dynamically
  for (let i = 0; i < Math.min(10, rawLines.length); i++) {
    const lineStr = rawLines[i].replace(/^"|"$/g, '').trim();
    if (lineStr.toLowerCase().includes('menu') && (lineStr.toLowerCase().includes('document') || lineStr.toLowerCase().includes('documentno'))) {
      const parts = lineStr.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      parts.forEach((p, idx) => {
        const lower = p.toLowerCase();
        if (lower === 'menu') {
          menuIdx = idx;
        } else if (lower.includes('status')) {
          statusIdx = idx;
        } else if (lower.includes('created')) {
          createdIdx = idx;
        } else if (lower.includes('documentno') || lower.includes('docno') || (lower.includes('doc') && !lower.includes('date'))) {
          docNoIdx = idx;
        } else if (lower.includes('date')) {
          dateIdx = idx;
        } else if (lower.includes('area')) {
          areaIdx = idx;
        }
      });
      startRow = i + 1;
      break;
    }
  }

  for (let i = startRow; i < rawLines.length; i++) {
    const lineStr = rawLines[i].trim();
    if (!lineStr) continue;

    // Use Papa.parse for precise quote parsing per line
    const parsedLine = Papa.parse<string[]>(lineStr, { skipEmptyLines: true }).data[0];
    if (!parsedLine || parsedLine.length < 3) continue;

    const menu = (parsedLine[menuIdx] || '').trim();
    const documentStatus = (parsedLine[statusIdx] || '').trim();
    const createdBy = (parsedLine[createdIdx] || '').trim();
    const documentNo = (parsedLine[docNoIdx] || '').trim();
    const documentDate = (parsedLine[dateIdx] || '').trim();
    const rawArea = (parsedLine[areaIdx] || '').trim();

    // Skip headers or invalid rows
    if (!menu || menu.toLowerCase() === 'menu' || documentNo.toLowerCase().includes('documentno')) continue;
    if (createdBy.toLowerCase().includes('terakhir ditarik')) continue;

    const area = deduceAreaFromDocNo(documentNo, rawArea, createdBy);

    documents.push({
      id: `${documentNo || 'doc'}-${i}`,
      menu,
      documentStatus: documentStatus || 'In Progress',
      createdBy: createdBy || '-',
      documentNo: documentNo || '-',
      documentDate: documentDate || '-',
      area
    });
  }

  return documents;
}

/**
 * Filter documents according to user role and selected area.
 * Rules:
 * - If selected area is "All Cabang" or "HQ" or user is Super Admin / HQ, show all,
 *   except for Jakarta documents which must be created by one of the 9 allowed PICs.
 * - For area "Jakarta", strictly ONLY show documents created by the 9 allowed PICs:
 *   Jeanny Marselyn, Iwan Gunawan, Rasto, Nirwanto, Wahyuningsih Kasmun,
 *   Muhammad Adji, Imam Syah, Heri Suprapto, Arief Nugroho.
 * - Otherwise, match row.area against selectedArea.
 */
export function filterDocsByArea(docs: UnpostedDoc[], selectedArea: string, isSuperAdminOrHq: boolean): UnpostedDoc[] {
  const targetAreaLower = (selectedArea || '').toLowerCase().trim();

  if (isSuperAdminOrHq || targetAreaLower === 'all cabang' || targetAreaLower === 'hq' || targetAreaLower === 'all') {
    return docs.filter(doc => {
      // Pastikan dokumen Jakarta di tampilan global hanya menampilkan 9 PIC resmi
      if (doc.area.toLowerCase() === 'jakarta') {
        return isAllowedJakartaCreator(doc.createdBy);
      }
      return true;
    });
  }

  return docs.filter(doc => {
    const docAreaLower = (doc.area || '').toLowerCase().trim();
    const isAreaMatch = docAreaLower === targetAreaLower || docAreaLower.includes(targetAreaLower);
    if (!isAreaMatch) return false;

    // Aturan khusus: Area Jakarta hanya memunculkan 9 Created By resmi
    if (targetAreaLower === 'jakarta' || docAreaLower === 'jakarta') {
      return isAllowedJakartaCreator(doc.createdBy);
    }

    return true;
  });
}

export interface IMDocDetailLine {
  id: string;
  organization: string;
  branchFrom: string;
  locatorFrom: string;
  branchTo: string;
  locatorTo: string;
  movementDate: string;
  documentNo: string;
  documentType: string;
  documentStatus: string;
  category: string;
  productParentGroup: string;
  productCode: string;
  productName: string;
  uom: string;
  volume: number;
  weight: number;
  qty: number;
  totalVolume: number;
  totalWeight: number;
  routeNo: string;
  routeDate: string;
  routeVehicle: string;
  routeCarType: string;
  routeDriver: string;
  routeStatus: string;
}

const IM_CSV_PROXY = '/api/im-docs';
const IM_CSV_DIRECT = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=978352399&single=true&output=csv&hl=id';
const IM_IP_CSV_DIRECT = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=39909118&single=true&output=csv&hl=id';

/**
 * Fetch and extract lines for a specific Document No from sheet IM (and IM_IP)
 */
export async function fetchIMDocDetails(documentNo: string): Promise<IMDocDetailLine[]> {
  if (!documentNo || !documentNo.trim()) return [];

  let text = '';
  try {
    const res = await fetch(`${IM_CSV_PROXY}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    text = await res.text();
    if (text.startsWith('{') && text.includes('"error"')) {
      throw new Error('Proxy returned JSON error');
    }
  } catch (err) {
    console.warn('Fallback to direct Google Sheet link for IM docs:', err);
    try {
      const [res1, res2] = await Promise.all([
        fetch(IM_CSV_DIRECT, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').catch(() => ''),
        fetch(IM_IP_CSV_DIRECT, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').catch(() => '')
      ]);
      text = (res1 || '') + '\n' + (res2 || '');
    } catch (fallbackErr) {
      console.error('Direct fetch failed for IM docs:', fallbackErr);
      return [];
    }
  }

  if (!text) return [];

  const rawLines = text.split('\n');
  const targetDocNo = documentNo.trim().toUpperCase();

  let orgIdx = 0;
  let bFromIdx = 1;
  let lFromIdx = 2;
  let bToIdx = 3;
  let lToIdx = 4;
  let mDateIdx = 5;
  let docNoIdx = 6;
  let docTypeIdx = 7;
  let docStatusIdx = 8;
  let catIdx = 9;
  let parentGroupIdx = 10;
  let pCodeIdx = 11;
  let pNameIdx = 12;
  let uomIdx = 13;
  let volIdx = 14;
  let wtIdx = 15;
  let qtyIdx = 16;
  let totVolIdx = 17;
  let totWtIdx = 18;
  let routeNoIdx = 19;
  let routeDateIdx = 20;
  let routeVehIdx = 21;
  let routeCarIdx = 22;
  let routeDriverIdx = 23;
  let routeStatusIdx = 24;

  const matchedLines: IMDocDetailLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const lineStr = rawLines[i].trim();
    if (!lineStr) continue;

    // Check if line is a header
    if (lineStr.toLowerCase().includes('document no') || lineStr.toLowerCase().includes('documentno')) {
      const parts = lineStr.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      parts.forEach((p, idx) => {
        const lower = p.toLowerCase();
        if (lower.includes('organization')) orgIdx = idx;
        else if (lower.includes('branch from')) bFromIdx = idx;
        else if (lower.includes('locator from')) lFromIdx = idx;
        else if (lower.includes('branch to')) bToIdx = idx;
        else if (lower.includes('locator to')) lToIdx = idx;
        else if (lower.includes('movement date')) mDateIdx = idx;
        else if (lower.includes('document no') || lower === 'documentno' || lower === 'docno') docNoIdx = idx;
        else if (lower.includes('document type')) docTypeIdx = idx;
        else if (lower.includes('document status')) docStatusIdx = idx;
        else if (lower.includes('product category')) catIdx = idx;
        else if (lower.includes('parent group')) parentGroupIdx = idx;
        else if (lower.includes('product value') || lower.includes('kode')) pCodeIdx = idx;
        else if (lower.includes('product name') || lower.includes('nama')) pNameIdx = idx;
        else if (lower === 'uom' || lower.includes('satuan')) uomIdx = idx;
        else if (lower.includes('movement qty') || lower === 'qty') qtyIdx = idx;
        else if (lower.includes('total volume')) totVolIdx = idx;
        else if (lower.includes('volume')) volIdx = idx;
        else if (lower.includes('total weight')) totWtIdx = idx;
        else if (lower.includes('weight')) wtIdx = idx;
        else if (lower.includes('route no')) routeNoIdx = idx;
        else if (lower.includes('route date')) routeDateIdx = idx;
        else if (lower.includes('route vehicle')) routeVehIdx = idx;
        else if (lower.includes('car type')) routeCarIdx = idx;
        else if (lower.includes('route driver')) routeDriverIdx = idx;
        else if (lower.includes('route status')) routeStatusIdx = idx;
      });
      continue;
    }

    // Fast check if line contains our targetDocNo before full parse
    if (!lineStr.toUpperCase().includes(targetDocNo)) continue;

    const parsed = Papa.parse<string[]>(lineStr, { skipEmptyLines: true }).data[0];
    if (!parsed || parsed.length < 5) continue;

    const rowDocNo = (parsed[docNoIdx] || '').trim();
    if (!rowDocNo) continue;

    if (rowDocNo.toUpperCase() === targetDocNo || rowDocNo.toUpperCase().includes(targetDocNo) || targetDocNo.includes(rowDocNo.toUpperCase())) {
      const qtyNum = parseFloat(String(parsed[qtyIdx] || '0').replace(/,/g, '.')) || 0;
      const volNum = parseFloat(String(parsed[volIdx] || '0').replace(/,/g, '.')) || 0;
      const wtNum = parseFloat(String(parsed[wtIdx] || '0').replace(/,/g, '.')) || 0;
      const totVolNum = parseFloat(String(parsed[totVolIdx] || '0').replace(/,/g, '.')) || 0;
      const totWtNum = parseFloat(String(parsed[totWtIdx] || '0').replace(/,/g, '.')) || 0;

      matchedLines.push({
        id: `im-line-${i}`,
        organization: (parsed[orgIdx] || '').trim(),
        branchFrom: (parsed[bFromIdx] || '').trim(),
        locatorFrom: (parsed[lFromIdx] || '').trim(),
        branchTo: (parsed[bToIdx] || '').trim(),
        locatorTo: (parsed[lToIdx] || '').trim(),
        movementDate: (parsed[mDateIdx] || '').trim(),
        documentNo: rowDocNo,
        documentType: (parsed[docTypeIdx] || '').trim(),
        documentStatus: (parsed[docStatusIdx] || '').trim(),
        category: (parsed[catIdx] || '').trim(),
        productParentGroup: (parsed[parentGroupIdx] || '').trim(),
        productCode: (parsed[pCodeIdx] || '').trim(),
        productName: (parsed[pNameIdx] || '').trim(),
        uom: (parsed[uomIdx] || 'PCS').trim(),
        volume: volNum,
        weight: wtNum,
        qty: qtyNum,
        totalVolume: totVolNum,
        totalWeight: totWtNum,
        routeNo: (parsed[routeNoIdx] || '').trim(),
        routeDate: (parsed[routeDateIdx] || '').trim(),
        routeVehicle: (parsed[routeVehIdx] || '').trim(),
        routeCarType: (parsed[routeCarIdx] || '').trim(),
        routeDriver: (parsed[routeDriverIdx] || '').trim(),
        routeStatus: (parsed[routeStatusIdx] || '').trim(),
      });
    }
  }

  return matchedLines;
}
