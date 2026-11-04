import { fetchAndParseCSV } from "../../lib/csvCache";
import { useEffect, useState, useMemo, useRef , memo} from "react";
import { fetchSheetData } from '../../lib/sheets';
import { AREA_URLS } from '../../App';
import { Loader2, Search, Scale, CheckCircle2, AlertTriangle, RefreshCw, Undo, Lock, History, FileSpreadsheet, Info, Calendar, Trash2, Check, X , TrendingUp, Activity, Maximize2, Minimize2} from 'lucide-react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { parseToIsoDate, formatToDDMMYYYY } from '../../lib/dateUtils';

// Custom tailwind utility class helper if required
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

// Helper to format values with optional UOM aware precision (e.g., minimum 2 decimals for Kg)
function formatValue(num: number, uom?: string) {
  if (num === null || num === undefined) return '0';
  const uomLower = uom ? uom.toLowerCase().trim() : '';
  const isKg = uomLower.includes('kg') || uomLower.includes('kilo');
  
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: isKg ? 2 : 0,
    maximumFractionDigits: 3
  });
}

export interface MtsEntry {
  raw: string;
  isEndWith000: boolean;
  baseVal: number;
  thousandVal: number;
  parsedVal: number;
}

export function parseMtsEntry(val: any): MtsEntry {
  if (val === null || val === undefined) {
    return { raw: '', isEndWith000: false, baseVal: 0, thousandVal: 0, parsedVal: 0 };
  }
  if (typeof val === 'number') {
    const num = isNaN(val) ? 0 : val;
    return { raw: String(num), isEndWith000: false, baseVal: num, thousandVal: num * 1000, parsedVal: num };
  }
  let s = String(val).trim().replace(/^"|"$/g, '').trim();
  if (!s) {
    return { raw: '', isEndWith000: false, baseVal: 0, thousandVal: 0, parsedVal: 0 };
  }

  // 1. Multiple dots (e.g. "2.837.100", "5.760.000"): all dots are thousand separators
  if ((s.match(/\./g) || []).length > 1) {
    const num = parseFloat(s.replace(/\./g, '').replace(/,/g, '')) || 0;
    return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
  }

  // 2. Both comma and dot present
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

  // 3. Comma decimal (e.g. "437,6", "1.227,12", "39,99")
  if (s.includes(',')) {
    const num = parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    return { raw: s, isEndWith000: false, baseVal: num, thousandVal: num, parsedVal: num };
  }

  // 4. Dot ending in exactly three zeroes: ".000" (e.g. "13.000", "71.000", "400.000", "26.000", "1.000", "0.000")
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

  // 5. Dot followed by 3 non-zero digits (e.g. "2.593", "10.200", "8.462", "4.433", "23.500", "4.800", "1.940", "2.025", "2.839", "37.271", "5.385")
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

export function getSmartMtsQty(entry: MtsEntry | number | undefined, stokRill: number, stokKemarin: number, uom?: string, kodeProduk?: string): number {
  if (!entry) return 0;
  if (typeof entry === 'number') return entry;
  if (!entry.isEndWith000) return entry.parsedVal;

  const targetQty = Math.abs(stokRill) > 0 ? stokRill : (Math.abs(stokKemarin) > 0 ? stokKemarin : 0);
  
  if (targetQty > 0) {
    const diffBase = Math.abs(targetQty - entry.baseVal);
    const diffThousand = Math.abs(targetQty - entry.thousandVal);
    // If target is in thousands (>= 1000) or closer to thousandVal:
    if (diffThousand < diffBase || (targetQty >= 1000 && entry.baseVal < 100)) {
      return entry.thousandVal;
    }
    return entry.baseVal;
  }

  // When targetQty is 0 (unrecorded/no movements yet):
  if (entry.baseVal >= 100) return entry.baseVal;
  const isSackOrThousandsUom = (uom || '').toLowerCase().includes('lembar') || (kodeProduk || '').toUpperCase().includes('SAK');
  if (isSackOrThousandsUom) return entry.thousandVal;
  return entry.baseVal;
}

function parseMtsNumber(val: any): number {
  const entry = parseMtsEntry(val);
  return entry.parsedVal;
}

// ==========================================
// PERSISTENCE ENGINE: CLOUD & LOCAL STORAGE
// ==========================================
const LOCAL_STORAGE_KEY = 'mms_saved_reconciliations';

function getLocalSavedReconciliations(): any[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse local saved reconciliations:', e);
    return [];
  }
}

function saveLocalReconciliation(record: any) {
  try {
    const records = getLocalSavedReconciliations();
    records.unshift(record);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch (e: any) {
    console.error('Failed to save record to localStorage:', e);
    throw new Error('Gagal menyimpan ke penyimpanan perangkat (mungkin kuota penuh).');
  }
}

function deleteLocalReconciliation(id: string) {
  try {
    const records = getLocalSavedReconciliations();
    const updated = records.filter(r => r.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete record from localStorage:', e);
  }
}

// Firestore Operations with Fail-Safe Fallbacks
async function saveToFirestore(record: any) {
  try {
    const colRef = collection(db, 'saved_reconciliations');
    // Add timeout to prevent hanging when offline
    const addPromise = addDoc(colRef, record);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Koneksi timeout. Menyimpan ke cloud memakan waktu terlalu lama (mungkin offline atau data terlalu besar).')), 5000);
    });
    await Promise.race([addPromise, timeoutPromise]);
    return true;
  } catch (e: any) {
    console.warn('Failed to save to Firestore (will save locally):', e.message);
    return false;
  }
}

async function loadFromFirestore(): Promise<any[]> {
  try {
    const colRef = collection(db, 'saved_reconciliations');
    const snapshot = await getDocs(colRef);
    const results: any[] = [];
    snapshot.forEach(docSnap => {
      results.push({
        fireId: docSnap.id,
        ...docSnap.data()
      });
    });
    return results;
  } catch (e) {
    console.error('Failed to load from Firestore:', e);
    return [];
  }
}

async function deleteFromFirestore(fireId: string) {
  try {
    const deletePromise = deleteDoc(doc(db, 'saved_reconciliations', fireId));
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Koneksi timeout. Menghapus dari cloud memakan waktu terlalu lama.')), 5000);
    });
    await Promise.race([deletePromise, timeoutPromise]);
    return true;
  } catch (e: any) {
    console.warn('Failed to delete from Firestore (will delete locally):', e.message);
    return false;
  }
}

interface ReconciliationItem {
  key: string; // pCode + '_' + lCode
  whGroup: string;
  namaLocator: string;
  kodeProduk: string;
  namaProduk: string;
  uom: string;
  stockSistem: number;
  stokKemarin: number; // dynamically calculated from start up to selectedDate - 1 (Yesterday / PM)
  stokRill: number; // dynamically calculated from transactions
  mutasiQty: number; // qty shifted inside the defined interval (daily / monthly)
  mutasiQtyIn: number; // IN mutations
  mutasiQtyOut: number; // OUT mutations
  selisih: number;
  status: 'SESUAI' | 'SELISIH' | 'BELUM';
  area: string;
  source: string;
}

interface WeeklyLocatorQty {
  locatorCode: string;
  locatorName: string;
  qty: number;
}

interface WeeklyProductItem {
  key: string;
  kodeProduk: string;
  namaProduk: string;
  uom: string;
  area: string;
  source: string;
  locators: WeeklyLocatorQty[];
  totalStokKemarin: number;
  totalMutasiIn: number;
  totalMutasiOut: number;
  totalQty: number;
  totalStockSistem: number;
  totalSelisih: number;
  status: string;
  hasMovement?: boolean;
}

function PencocokanData({ spreadsheetId, area }: { spreadsheetId: string; area: string }) {
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, { nama: string; satuan: string }>>(new Map());
  const [locatorsMap, setLocatorsMap] = useState<Map<string, { nama: string; whType: string; area: string }>>(new Map());
  const [mtsLookupMap, setMtsLookupMap] = useState<Map<string, MtsEntry>>(new Map());
  
  // Daily, Monthly, and Week Reconciliation configuration
  const [reconType, setReconType] = useState<'daily' | 'monthly' | 'week'>('daily');
  const [weekViewMode, setWeekViewMode] = useState<'detail' | 'matrix'>('detail');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1000);
    return localNow.toISOString().split('T')[0];
  });
  const [selectedStartDate, setSelectedStartDate] = useState(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-01`;
  });
  const [selectedEndDate, setSelectedEndDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1000);
    return localNow.toISOString().split('T')[0];
  });

  // Week range helpers
  const getWeekBounds = (refDate: Date = new Date()) => {
    const d = new Date(refDate);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), diffToMonday);
    const sunday = new Date(d.getFullYear(), d.getMonth(), diffToMonday + 6);
    const toIso = (dt: Date) => {
      const offset = dt.getTimezoneOffset();
      return new Date(dt.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
    };
    return { startIso: toIso(monday), endIso: toIso(sunday) };
  };

  const [selectedWeekStartDate, setSelectedWeekStartDate] = useState(() => getWeekBounds().startIso);
  const [selectedWeekEndDate, setSelectedWeekEndDate] = useState(() => getWeekBounds().endIso);

  const setQuickWeek = (offsetWeeks: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetWeeks * 7);
    const bounds = getWeekBounds(d);
    setSelectedWeekStartDate(bounds.startIso);
    setSelectedWeekEndDate(bounds.endIso);
  };

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<{ kodeProduk: string; namaProduk: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [selectedAreaFilter, setSelectedAreaFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL'); // ALL, SESUAI, SELISIH
  const [selectedLocator, setSelectedLocator] = useState('ALL');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('ALL'); // ALL, INPUT, INPUT RM, INPUT MFG, INPUT SUPPLIES
  const [selectedMovementFilter, setSelectedMovementFilter] = useState('ALL'); // ALL, BERGERAK, TIDAK_BERGERAK, STOK_ADA, STOK_KOSONG

  // Pagination state
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Saved Sesi / Locked State Variables
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [activeSavedSession, setActiveSavedSession] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Fetch saved sessions
  const loadSavedSessions = async () => {
    try {
      setLoadingSessions(true);
      const fsSessions = await loadFromFirestore();
      const localSessions = getLocalSavedReconciliations();
      
      const combined = [...fsSessions, ...localSessions];
      const uniqueMap = new Map<string, any>();
      combined.forEach(s => {
        if (!uniqueMap.has(s.id)) {
          uniqueMap.set(s.id, s);
        } else {
          const existing = uniqueMap.get(s.id);
          uniqueMap.set(s.id, { ...existing, ...s });
        }
      });
      
      const sorted = Array.from(uniqueMap.values()).sort((a, b) => b.timestamp - a.timestamp);
      setSavedSessions(sorted);
    } catch (e) {
      console.error('Error loading saved sessions:', e);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSavedSessions();
  }, []);

  // Auto-reset page index when filters, type, or selection date changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedAreaFilter, selectedLocator, selectedStatusFilter, selectedSourceFilter, selectedMovementFilter, pageSize, reconType, selectedDate, selectedStartDate, selectedEndDate, selectedWeekStartDate, selectedWeekEndDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const csvUrl = `/api/stock-summary?t=${Date.now()}`;
      const mtsMap = new Map<string, MtsEntry>();
      
      try {
        const dataMts = await fetchAndParseCSV<string[]>('/api/stock-summary', false, 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=263347272&single=true&output=csv');
          
          if (dataMts.length > 0) {
            let headerIndex = 0;
            for (let i = 0; i < Math.min(10, dataMts.length); i++) {
              const nonEmpCount = dataMts[i].filter(val => String(val).trim().length > 0).length;
              if (nonEmpCount > 5) {
                headerIndex = i;
                break;
              }
            }
            const rawHeaders = dataMts[headerIndex] || [];
            const cleanedHeaders = rawHeaders.map(h => String(h).trim());

            const colLoc = cleanedHeaders.findIndex(h => h.toLowerCase().includes('locator'));
            const colWhGroup = cleanedHeaders.findIndex(h => h.toLowerCase() === 'wh group' || h.toLowerCase().includes('group'));
            const colArea = cleanedHeaders.findIndex(h => h.toLowerCase() === 'area');
            const colSku = cleanedHeaders.findIndex(h => h.toLowerCase().includes('search key') || h.toLowerCase() === 'sku' || h.toLowerCase().includes('produk'));
            const colName = cleanedHeaders.findIndex(h => h.toLowerCase() === 'name' || h.toLowerCase().includes('nama'));
            const colLastQty = cleanedHeaders.findIndex(h => h.toLowerCase().includes('last qty') || h.toLowerCase().includes('sistem'));

            const mtsRows = dataMts.slice(headerIndex + 1);
            mtsRows.forEach(row => {
              const loc = colLoc !== -1 ? String(row[colLoc] || '').trim().toUpperCase() : '';
              const whGroup = colWhGroup !== -1 ? String(row[colWhGroup] || '').trim().toUpperCase() : '';
              const rowArea = colArea !== -1 ? String(row[colArea] || '').trim().toUpperCase() : '';
              const sku = colSku !== -1 ? String(row[colSku] || '').trim().toUpperCase() : '';
              const name = colName !== -1 ? String(row[colName] || '').trim().toUpperCase() : '';
              
              let entry: MtsEntry = { raw: '', isEndWith000: false, baseVal: 0, thousandVal: 0, parsedVal: 0 };
              if (colLastQty !== -1 && row[colLastQty] !== undefined) {
                entry = parseMtsEntry(row[colLastQty]);
              }

              const locCandidates = [loc, whGroup].filter(Boolean);
              locCandidates.forEach(l => {
                if (sku) {
                  mtsMap.set(`${l}_${sku}`, entry);
                  mtsMap.set(`${sku}_${l}`, entry);
                  if (rowArea) {
                    mtsMap.set(`${rowArea}_${l}_${sku}`, entry);
                  }
                }
                if (name) {
                  mtsMap.set(`${l}_${name}`, entry);
                  mtsMap.set(`${name}_${l}`, entry);
                  if (rowArea) {
                    mtsMap.set(`${rowArea}_${l}_${name}`, entry);
                  }
                }
              });
            });
          }
      } catch (err) {
        console.error('Failed to pre-fetch MTS database in reconciliation page:', err);
      }
      setMtsLookupMap(mtsMap);

      const pMap = new Map<string, { nama: string; satuan: string }>();
      const reversePMap = new Map<string, string>();
      const lMap = new Map<string, { nama: string; whType: string; area: string }>();
      const mappedRows: { tipe: string; pCode: string; pName: string; lCode: string; qty: number; uom: string; source: string; area: string; tanggal: string }[] = [];

      const processRows = (rows: any[], source: string, currentArea: string) => {
        const validRows = (rows || []).filter((r: any[]) => {
          if (r.length === 0) return false;
          const tanggal = String(r[0] || '').trim();
          const nama = String(r[1] || '').trim();
          const kode = String(r[9] || '').trim();
          return tanggal !== '' && nama !== '' && kode !== '#N/A' && nama !== '#N/A' && tanggal !== '#N/A';
        });
        validRows.forEach((r: any[]) => {
          const tanggalRaw = String(r[0] || '').trim();
          const tanggal = parseToIsoDate(tanggalRaw);
          const pName = String(r[1] || '').trim();
          let pCode = String(r[9] || '').trim();
          const tipe = String(r[4] || '').replace(/\s+/g, '').toUpperCase();
          const uom = String(r[3] || '').trim();
          
          if (!pName && !pCode) return;
          if (!pCode) {
            pCode = reversePMap.get(pName.toUpperCase()) || pName;
          }

          const qtyStr = String(r[2] || '0').replace(',', '.');
          let qty = parseFloat(qtyStr) || 0;
          if (isNaN(qty)) qty = 0;

          let fromLocator = String(r[5] || '').trim();
          let toLocator = String(r[6] || '').trim();
          
          if (!fromLocator && !toLocator) fromLocator = 'UNKNOWN_L';

          if (tipe === 'TRANSFER' || tipe === 'TF') {
            mappedRows.push({ tipe: 'OUT', pCode, pName, lCode: fromLocator || 'UNKNOWN_L', qty, uom, source, area: currentArea, tanggal });
            if (toLocator) {
              mappedRows.push({ tipe: 'IN', pCode, pName, lCode: toLocator, qty, uom, source, area: currentArea, tanggal });
            }
          } else {
            mappedRows.push({ 
              tipe: tipe || 'IN', 
              pCode, 
              pName, 
              lCode: fromLocator || toLocator || 'UNKNOWN_L', 
              qty, 
              uom,
              source,
              area: currentArea,
              tanggal
            });
          }
        });
      };

      if (area === 'HQ' || spreadsheetId === 'HQ' || area === 'All Cabang' || area.toLowerCase() === 'all') {
        const urlEntries = Object.entries(AREA_URLS);
        for (let i = 0; i < urlEntries.length; i += 4) {
          const batch = urlEntries.slice(i, i + 4);
          await Promise.all(batch.map(async ([aName, aUrl]) => {
            try {
              const [tn, tr, tm, ts, pr, lr] = await Promise.all([
                fetchSheetData(aUrl, "'INPUT'!A2:J", true).catch(() => []),
                fetchSheetData(aUrl, "'INPUT RM'!A2:J", true).catch(() => []),
                fetchSheetData(aUrl, "'INPUT MFG'!A2:J", true).catch(() => []),
                fetchSheetData(aUrl, "'INPUT SUPPLIES'!A2:J", true).catch(() => []),
                fetchSheetData(aUrl, "'MASTER_PRODUK'!A2:D", true).catch(() => []),
                fetchSheetData(aUrl, "'MASTER_LOCATOR'!A2:E", true).catch(() => [])
              ]);

            pr.filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
              const kode = String(r[0]).trim();
              const nama = String(r[1] || '').trim();
              pMap.set(kode, {
                nama: nama,
                satuan: String(r[2] || '').trim()
              });
              if (nama) reversePMap.set(nama.toUpperCase(), kode);
            });

            lr.filter((r: any[]) => r.length > 0 && (r[0] || r[1]) && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
              const val = {
                nama: String(r[1] || r[0]).trim(),
                whType: String(r[3] || '').trim(),
                area: String(r[4] || aName).trim()
              };
              if (r[0]) {
                const k = String(r[0]).trim();
                lMap.set(k, val);
                lMap.set(k.toUpperCase(), val);
              }
              if (r[1]) {
                const k = String(r[1]).trim();
                lMap.set(k, val);
                lMap.set(k.toUpperCase(), val);
              }
            });

            processRows(tn, 'INPUT', aName);
            processRows(tr, 'INPUT RM', aName);
            processRows(tm, 'INPUT MFG', aName);
            processRows(ts, 'INPUT SUPPLIES', aName);
          } catch (e) {
            console.error(`Error loading area ${aName}:`, e);
          }
        }));
        }
      } else {
        const [tn, tr, tm, ts, pr, lr] = await Promise.all([
          fetchSheetData(spreadsheetId, "'INPUT'!A2:J", true).catch(() => []),
          fetchSheetData(spreadsheetId, "'INPUT RM'!A2:J", true).catch(() => []),
          fetchSheetData(spreadsheetId, "'INPUT MFG'!A2:J", true).catch(() => []),
          fetchSheetData(spreadsheetId, "'INPUT SUPPLIES'!A2:J", true).catch(() => []),
          fetchSheetData(spreadsheetId, "'MASTER_PRODUK'!A2:D", true).catch(() => []),
          fetchSheetData(spreadsheetId, "'MASTER_LOCATOR'!A2:E", true).catch(() => [])
        ]);

        pr.filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
          const kode = String(r[0]).trim();
          const nama = String(r[1] || '').trim();
          pMap.set(kode, {
            nama: nama,
            satuan: String(r[2] || '').trim()
          });
          if (nama) reversePMap.set(nama.toUpperCase(), kode);
        });

        lr.filter((r: any[]) => r.length > 0 && (r[0] || r[1]) && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
          const val = {
            nama: String(r[1] || r[0]).trim(),
            whType: String(r[3] || '').trim(),
            area: String(r[4] || area).trim()
          };
          if (r[0]) {
            const k = String(r[0]).trim();
            lMap.set(k, val);
            lMap.set(k.toUpperCase(), val);
          }
          if (r[1]) {
            const k = String(r[1]).trim();
            lMap.set(k, val);
            lMap.set(k.toUpperCase(), val);
          }
        });

        processRows(tn, 'INPUT', area);
        processRows(tr, 'INPUT RM', area);
        processRows(tm, 'INPUT MFG', area);
        processRows(ts, 'INPUT SUPPLIES', area);
      }

      setProductsMap(pMap);
      setLocatorsMap(lMap);
      setAllTransactions(mappedRows);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyinkronkan data untuk pencocokan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [spreadsheetId, area]);

  // Compile Reconciliation list based on transaction history and maps
  const reconciliationList = useMemo(() => {
    const listMap = new Map<string, ReconciliationItem>();

    allTransactions.forEach(t => {
      if (selectedSourceFilter !== 'ALL' && t.source !== selectedSourceFilter) return;

      const { tipe, pCode, pName, lCode, qty, uom, area: rowArea, tanggal, source } = t;
      const itemKey = `${rowArea}_${lCode.toUpperCase()}_${pCode.toUpperCase()}`;

      let includeInCumulative = false;
      let includeInYesterday = false;
      let includeInMutation = false;

      const normalizedType = tipe.replace(/\s+/g, '').toUpperCase();
      const isAwal = normalizedType.includes('AWAL') || normalizedType === 'SALDO' || normalizedType === 'INITIAL';

      if (reconType === 'daily') {
        includeInCumulative = !tanggal || tanggal <= selectedDate;
        includeInYesterday = !tanggal || tanggal < selectedDate || (isAwal && tanggal <= selectedDate);
        includeInMutation = tanggal === selectedDate && !isAwal;
      } else if (reconType === 'week') {
        includeInCumulative = !tanggal || tanggal <= selectedWeekEndDate;
        includeInYesterday = !tanggal || tanggal < selectedWeekStartDate || (isAwal && tanggal <= selectedWeekEndDate);
        includeInMutation = tanggal >= selectedWeekStartDate && tanggal <= selectedWeekEndDate && !isAwal;
      } else {
        includeInCumulative = !tanggal || tanggal <= selectedEndDate;
        includeInYesterday = !tanggal || tanggal < selectedStartDate || (isAwal && tanggal <= selectedEndDate);
        includeInMutation = tanggal >= selectedStartDate && tanggal <= selectedEndDate && !isAwal;
      }

      if (!listMap.has(itemKey)) {
        const lookupKey = lCode.trim();
        const lData = locatorsMap.get(lookupKey) || locatorsMap.get(lookupKey.toUpperCase()) || { nama: lCode, whType: '', area: rowArea };
        const pData = productsMap.get(pCode) || { nama: pName || pCode, satuan: uom || 'Pcs' };

        listMap.set(itemKey, {
          key: itemKey,
          whGroup: lCode,
          namaLocator: lData.nama,
          kodeProduk: pCode,
          namaProduk: pData.nama,
          uom: pData.satuan || uom || 'Pcs',
          stockSistem: 0,
          stokKemarin: 0,
          stokRill: 0,
          mutasiQty: 0,
          mutasiQtyIn: 0,
          mutasiQtyOut: 0,
          selisih: 0,
          status: 'BELUM',
          area: rowArea || lData.area || area,
          source: source || 'INPUT'
        });
      }

      const item = listMap.get(itemKey)!;

      const isIN = normalizedType === 'IN' || normalizedType.includes('AWAL') || normalizedType === 'MASUK' || normalizedType === 'RECEIPT';
      const isOUT = normalizedType === 'OUT' || normalizedType === 'KELUAR' || normalizedType === 'ISSUE' || normalizedType === 'PEMAKAIAN' || normalizedType === 'TRANSFER' || normalizedType === 'TF';

      if (includeInYesterday) {
        if (isIN) {
          item.stokKemarin += qty;
        } else if (isOUT) {
          item.stokKemarin -= qty;
        } else {
          if (qty > 0 && !['TRANSFER', 'TF'].includes(normalizedType)) {
            item.stokKemarin += qty;
          }
        }
      }

      if (includeInCumulative) {
        if (isIN) {
          item.stokRill += qty;
        } else if (isOUT) {
          item.stokRill -= qty;
        } else {
          if (qty > 0 && !['TRANSFER', 'TF'].includes(normalizedType)) {
            item.stokRill += qty;
          }
        }
      }

      if (includeInMutation) {
        if (isIN) {
          item.mutasiQty += qty;
          item.mutasiQtyIn += qty;
        } else if (isOUT) {
          item.mutasiQty -= qty;
          item.mutasiQtyOut += Math.abs(qty);
        } else {
          if (qty > 0 && !['TRANSFER', 'TF'].includes(normalizedType)) {
            item.mutasiQty += qty;
            item.mutasiQtyIn += qty;
          }
        }
      }
    });

    return Array.from(listMap.values()).map(item => {
      const locKey = item.whGroup.toUpperCase().trim();
      const namaLocKey = (item.namaLocator || '').toUpperCase().trim();
      const productCodeUpper = item.kodeProduk.toUpperCase().trim();
      const productNameUpper = item.namaProduk.toUpperCase().trim();
      const rowAreaUpper = (item.area || area || '').toUpperCase().trim();

      const lookupKeys = [
        // Exact area + locator + sku/name
        `${rowAreaUpper}_${locKey}_${productCodeUpper}`,
        `${rowAreaUpper}_${locKey}_${productNameUpper}`,
        `${rowAreaUpper}_${namaLocKey}_${productCodeUpper}`,
        `${rowAreaUpper}_${namaLocKey}_${productNameUpper}`,
        // Locator + sku/name
        `${locKey}_${productCodeUpper}`,
        `${locKey}_${productNameUpper}`,
        `${namaLocKey}_${productCodeUpper}`,
        `${namaLocKey}_${productNameUpper}`,
        // Sku/name + locator
        `${productCodeUpper}_${locKey}`,
        `${productNameUpper}_${locKey}`,
        `${productCodeUpper}_${namaLocKey}`,
        `${productNameUpper}_${namaLocKey}`,
        // Strip spaces in SKU
        `${locKey}_${productCodeUpper.replace(/\s+/g, '')}`,
        `${productCodeUpper.replace(/\s+/g, '')}_${locKey}`,
        `${namaLocKey}_${productCodeUpper.replace(/\s+/g, '')}`,
        `${productCodeUpper.replace(/\s+/g, '')}_${namaLocKey}`
      ];

      let matchedEntry: MtsEntry | undefined;
      for (const k of lookupKeys) {
        if (mtsLookupMap.has(k)) {
          matchedEntry = mtsLookupMap.get(k);
          break;
        }
      }

      let matchedLastQty = matchedEntry ? getSmartMtsQty(matchedEntry, item.stokRill, item.stokKemarin, item.uom, item.kodeProduk) : 0;

      // Penyelarasan khusus Semarang Accessories: Jika tidak ada record di MTS, sesuaikan
      if (rowAreaUpper === 'SEMARANG' && (item.source === 'INPUT' || item.source === 'Accessories') && matchedLastQty === 0) {
        matchedLastQty = item.stokRill;
      }

      const stokKemarin = Math.round(item.stokKemarin * 1000) / 1000;
      const stokRill = Math.round(item.stokRill * 1000) / 1000;
      const mutasiQty = Math.round(item.mutasiQty * 1000) / 1000;
      const mutasiQtyIn = Math.round(item.mutasiQtyIn * 1000) / 1000;
      const mutasiQtyOut = Math.round(item.mutasiQtyOut * 1000) / 1000;
      const selisih = Math.round((stokRill - matchedLastQty) * 1000) / 1000;
      const status = Math.abs(selisih) < 0.001 ? 'SESUAI' : 'SELISIH';

      return {
        ...item,
        stokKemarin,
        stokRill,
        mutasiQty,
        mutasiQtyIn,
        mutasiQtyOut,
        stockSistem: matchedLastQty,
        selisih,
        status
      };
    });
  }, [allTransactions, productsMap, locatorsMap, mtsLookupMap, area, reconType, selectedDate, selectedStartDate, selectedEndDate, selectedWeekStartDate, selectedWeekEndDate, selectedSourceFilter]);

  // Filter unique locators for selection
  const uniqueLocators = useMemo(() => {
    const list = activeSavedSession ? activeSavedSession.items : reconciliationList;
    let filterByArea = selectedAreaFilter === 'ALL' ? list : list.filter((item: any) => item.area === selectedAreaFilter);
    if (selectedSourceFilter !== 'ALL') {
      filterByArea = filterByArea.filter((item: any) => item.source === selectedSourceFilter);
    }
    return Array.from(new Map(filterByArea.map((i: any) => [i.whGroup, { code: i.whGroup, name: i.namaLocator }])).values()).sort((a: any, b: any) => a.code.localeCompare(b.code));
  }, [reconciliationList, activeSavedSession, selectedAreaFilter, selectedSourceFilter]);

  const uniqueProducts = useMemo(() => {
    let list = activeSavedSession ? activeSavedSession.items : reconciliationList;
    if (selectedSourceFilter !== 'ALL') {
      list = list.filter((item: any) => item.source === selectedSourceFilter);
    }
    const map = new Map<string, { kodeProduk: string; namaProduk: string }>();
    list.forEach((item: any) => {
      if (item.namaProduk || item.kodeProduk) {
        const key = `${item.kodeProduk || ''}__${item.namaProduk || ''}`;
        if (!map.has(key)) {
          map.set(key, { kodeProduk: item.kodeProduk, namaProduk: item.namaProduk });
        }
      }
    });
    return Array.from(map.values()).sort((a,b) => a.namaProduk.localeCompare(b.namaProduk));
  }, [reconciliationList, activeSavedSession, selectedSourceFilter]);

  const productSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length === 0) return [];
    const term = searchQuery.toLowerCase();
    return uniqueProducts.filter(p => 
      p.namaProduk.toLowerCase().includes(term) || 
      p.kodeProduk.toLowerCase().includes(term)
    ).slice(0, 15);
  }, [searchQuery, uniqueProducts]);

  // Filter reconciliation list is dependent on user choice filters
  const filteredReconciliation = useMemo(() => {
    return reconciliationList.filter(item => {
      const matchSearch = selectedProduct
        ? item.kodeProduk === selectedProduct.kodeProduk
        : (item.namaProduk.toLowerCase().includes(searchQuery.toLowerCase()) || 
           item.kodeProduk.toLowerCase().includes(searchQuery.toLowerCase()) ||
           item.whGroup.toLowerCase().includes(searchQuery.toLowerCase()) ||
           item.namaLocator.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (selectedAreaFilter !== 'ALL' && item.area !== selectedAreaFilter) return false;
      if (selectedLocator !== 'ALL' && item.whGroup !== selectedLocator) return false;

      if (selectedStatusFilter === 'SESUAI' && item.status !== 'SESUAI') return false;
      if (selectedStatusFilter === 'SELISIH' && item.status !== 'SELISIH') return false;
      if (selectedStatusFilter === 'BELUM' && item.status !== 'BELUM') return false;

      if (selectedSourceFilter !== 'ALL' && item.source !== selectedSourceFilter) return false;

      const hasMovement = Math.abs(item.mutasiQty || 0) > 0 || (item.mutasiQtyIn || 0) > 0 || (item.mutasiQtyOut || 0) > 0;
      if (selectedMovementFilter === 'BERGERAK' && !hasMovement) return false;
      if (selectedMovementFilter === 'TIDAK_BERGERAK' && hasMovement) return false;
      if (selectedMovementFilter === 'STOK_ADA' && (item.stokRill || 0) <= 0) return false;
      if (selectedMovementFilter === 'STOK_KOSONG' && (item.stokRill || 0) > 0) return false;

      return true;
    });
  }, [reconciliationList, searchQuery, selectedAreaFilter, selectedLocator, selectedStatusFilter, selectedProduct, selectedSourceFilter, selectedMovementFilter]);

  // Summary Metrics for LIVE
  const metrics = useMemo(() => {
    const list = reconciliationList;
    let filteredByAreaList = selectedAreaFilter === 'ALL' ? list : list.filter(i => i.area === selectedAreaFilter);
    if (selectedSourceFilter !== 'ALL') {
      filteredByAreaList = filteredByAreaList.filter(i => i.source === selectedSourceFilter);
    }
    if (selectedLocator !== 'ALL') {
      filteredByAreaList = filteredByAreaList.filter(i => i.whGroup === selectedLocator);
    }
    if (selectedMovementFilter === 'BERGERAK') {
      filteredByAreaList = filteredByAreaList.filter(i => Math.abs(i.mutasiQty || 0) > 0 || (i.mutasiQtyIn || 0) > 0 || (i.mutasiQtyOut || 0) > 0);
    } else if (selectedMovementFilter === 'TIDAK_BERGERAK') {
      filteredByAreaList = filteredByAreaList.filter(i => !(Math.abs(i.mutasiQty || 0) > 0 || (i.mutasiQtyIn || 0) > 0 || (i.mutasiQtyOut || 0) > 0));
    } else if (selectedMovementFilter === 'STOK_ADA') {
      filteredByAreaList = filteredByAreaList.filter(i => (i.stokRill || 0) > 0);
    } else if (selectedMovementFilter === 'STOK_KOSONG') {
      filteredByAreaList = filteredByAreaList.filter(i => (i.stokRill || 0) <= 0);
    }
    
    const totalCounted = filteredByAreaList.filter(i => i.stokRill !== null).length;
    const totalMatched = filteredByAreaList.filter(i => i.status === 'SESUAI').length;
    const totalSelisih = filteredByAreaList.filter(i => i.status === 'SELISIH').length;
    const totalBelum = filteredByAreaList.filter(i => i.status === 'BELUM').length;

    return {
      totalItems: filteredByAreaList.length,
      counted: totalCounted,
      matched: totalMatched,
      selisih: totalSelisih,
      belumDiisi: totalBelum
    };
  }, [reconciliationList, selectedAreaFilter, selectedSourceFilter, selectedLocator, selectedMovementFilter]);

  // Grand Total calculation for LIVE
  const grandTotals = useMemo(() => {
    let totalStokKemarin = 0;
    let totalStokRill = 0;
    let totalStockSistem = 0;
    let totalSelisih = 0;
    let totalMutasiQty = 0;
    let totalMutasiQtyIn = 0;
    let totalMutasiQtyOut = 0;

    filteredReconciliation.forEach(item => {
      totalStokKemarin += item.stokKemarin || 0;
      totalStokRill += item.stokRill || 0;
      totalStockSistem += item.stockSistem || 0;
      totalSelisih += item.selisih || 0;
      totalMutasiQty += item.mutasiQty || 0;
      totalMutasiQtyIn += item.mutasiQtyIn || 0;
      totalMutasiQtyOut += item.mutasiQtyOut || 0;
    });

    return {
      stokKemarin: Math.round(totalStokKemarin * 1000) / 1000,
      stokRill: Math.round(totalStokRill * 1000) / 1000,
      stockSistem: Math.round(totalStockSistem * 1000) / 1000,
      selisih: Math.round(totalSelisih * 1000) / 1000,
      mutasiQty: Math.round(totalMutasiQty * 1000) / 1000,
      mutasiQtyIn: Math.round(totalMutasiQtyIn * 1000) / 1000,
      mutasiQtyOut: Math.round(totalMutasiQtyOut * 1000) / 1000
    };
  }, [filteredReconciliation]);

  // Save action handlers
  const initSaveSession = () => {
    const dStr = reconType === 'daily' 
      ? selectedDate 
      : reconType === 'week'
        ? `${selectedWeekStartDate}_to_${selectedWeekEndDate}`
        : `${selectedStartDate}_to_${selectedEndDate}`;
    const typeLabel = reconType === 'daily' ? 'Harian' : reconType === 'week' ? 'Mingguan' : 'Bulanan';
    const areaLabel = selectedAreaFilter === 'ALL' ? (area === 'HQ' ? 'HQ-Pusat' : area) : selectedAreaFilter;
    setSessionNameInput(`Pencocokan ${typeLabel} ${areaLabel} (${dStr})`);
    setShowSaveModal(true);
  };

  const handleSaveSessionConfirm = async () => {
    if (!sessionNameInput.trim()) {
      alert('Silakan masukkan nama sesi.');
      return;
    }
    
    try {
      setIsSaving(true);
      const dStr = reconType === 'daily' 
        ? selectedDate 
        : reconType === 'week'
          ? `${selectedWeekStartDate}_to_${selectedWeekEndDate}`
          : `${selectedStartDate}_to_${selectedEndDate}`;
      
      const sessionData = {
        id: 'rec_' + Date.now(),
        name: sessionNameInput.trim(),
        type: reconType,
        date: dStr,
        timestamp: Date.now(),
        area: selectedAreaFilter === 'ALL' ? (area === 'HQ' ? 'HQ' : area) : selectedAreaFilter,
        grandTotals: {
          stokKemarin: grandTotals.stokKemarin,
          stokRill: grandTotals.stokRill,
          stockSistem: grandTotals.stockSistem,
          selisih: grandTotals.selisih,
          mutasiQty: grandTotals.mutasiQty,
          mutasiQtyIn: grandTotals.mutasiQtyIn,
          mutasiQtyOut: grandTotals.mutasiQtyOut,
          itemCount: filteredReconciliation.length
        },
        items: filteredReconciliation.map(item => ({
          key: item.key,
          whGroup: item.whGroup,
          namaLocator: item.namaLocator,
          kodeProduk: item.kodeProduk,
          namaProduk: item.namaProduk,
          uom: item.uom,
          stokKemarin: item.stokKemarin,
          stokRill: item.stokRill,
          mutasiQty: item.mutasiQty,
          mutasiQtyIn: item.mutasiQtyIn,
          mutasiQtyOut: item.mutasiQtyOut,
          stockSistem: item.stockSistem,
          selisih: item.selisih,
          status: item.status,
          area: item.area
        }))
      };

      // Simpan ke local storage secara langsung agar UI merespon super cepat
      try {
        saveLocalReconciliation(sessionData);
      } catch (localErr: any) {
        // Fix for "kalau ada error langsung perbaiki" (quota exceeded, etc)
        alert('Gagal menyimpan ke penyimpanan lokal (mungkin data terlalu besar). Error: ' + localErr.message);
        setIsSaving(false);
        return;
      }
      
      // Update UI langsung tanpa menunggu Cloud
      setShowSaveModal(false);
      setIsSaving(false);
      loadSavedSessions();
      
      // Background Sync to Cloud dengan timeout 5 detik
      saveToFirestore(sessionData).then(firestoreSuccess => {
        if (!firestoreSuccess) {
          console.warn('Sesi berhasil disimpan di lokal, tetapi gagal disinkronkan ke Cloud (Offline/Timeout).');
        } else {
          console.log('Sesi pencocokan berhasil disinkronkan ke Cloud!');
        }
      });
      
    } catch (e: any) {
      console.error(e);
      alert('Gagal memproses sesi: ' + e.message);
      setIsSaving(false);
    }
  };

  const handleDeleteSession = async (sess: any) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus arsip pencocokan "${sess.name}"?`)) {
      return;
    }
    
    try {
      // Hapus dari local storage langsung agar UI responsif
      deleteLocalReconciliation(sess.id);
      
      if (activeSavedSession?.id === sess.id) {
        setActiveSavedSession(null);
      }
      
      loadSavedSessions();
      
      // Hapus dari Firestore di background
      if (sess.fireId) {
        deleteFromFirestore(sess.fireId).then(success => {
          if (!success) {
             console.warn('Arsip dihapus secara lokal, tapi gagal dihapus dari Cloud.');
          }
        });
      }
    } catch (e: any) {
      console.error(e);
      alert('Gagal menghapus arsip: ' + e.message);
    }
  };

  // Adaptive data selectors (Live vs Archived)
  const displayedList = useMemo(() => {
    if (activeSavedSession) {
      return activeSavedSession.items.filter((item: any) => {
        const matchSearch = selectedProduct
          ? item.kodeProduk === selectedProduct.kodeProduk
          : (item.namaProduk.toLowerCase().includes(searchQuery.toLowerCase()) || 
             item.kodeProduk.toLowerCase().includes(searchQuery.toLowerCase()) ||
             item.whGroup.toLowerCase().includes(searchQuery.toLowerCase()) ||
             item.namaLocator.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchSearch) return false;

        if (selectedSourceFilter !== 'ALL' && item.source !== selectedSourceFilter) return false;

        const hasMovement = Math.abs(item.mutasiQty || 0) > 0 || (item.mutasiQtyIn || 0) > 0 || (item.mutasiQtyOut || 0) > 0;
        if (selectedMovementFilter === 'BERGERAK' && !hasMovement) return false;
        if (selectedMovementFilter === 'TIDAK_BERGERAK' && hasMovement) return false;
        if (selectedMovementFilter === 'STOK_ADA' && (item.stokRill || 0) <= 0) return false;
        if (selectedMovementFilter === 'STOK_KOSONG' && (item.stokRill || 0) > 0) return false;

        return true;
      });
    }
    return filteredReconciliation;
  }, [activeSavedSession, filteredReconciliation, searchQuery, selectedProduct, selectedSourceFilter, selectedMovementFilter]);

  const displayedTotals = useMemo(() => {
    if (activeSavedSession) {
      let totalStokKemarin = 0;
      let totalStokRill = 0;
      let totalStockSistem = 0;
      let totalSelisih = 0;
      let totalMutasiQty = 0;
      let totalMutasiQtyIn = 0;
      let totalMutasiQtyOut = 0;

      displayedList.forEach((item: any) => {
        totalStokKemarin += item.stokKemarin || 0;
        totalStokRill += item.stokRill || 0;
        totalStockSistem += item.stockSistem || 0;
        totalSelisih += item.selisih || 0;
        totalMutasiQty += item.mutasiQty || 0;
        totalMutasiQtyIn += item.mutasiQtyIn || 0;
        totalMutasiQtyOut += item.mutasiQtyOut || 0;
      });

      return {
        stokKemarin: Math.round(totalStokKemarin * 1000) / 1000,
        stokRill: Math.round(totalStokRill * 1000) / 1000,
        stockSistem: Math.round(totalStockSistem * 1000) / 1000,
        selisih: Math.round(totalSelisih * 1000) / 1000,
        mutasiQty: Math.round(totalMutasiQty * 1000) / 1000,
        mutasiQtyIn: Math.round(totalMutasiQtyIn * 1000) / 1000,
        mutasiQtyOut: Math.round(totalMutasiQtyOut * 1000) / 1000
      };
    }
    return grandTotals;
  }, [activeSavedSession, displayedList, grandTotals]);

  const displayedMetrics = useMemo(() => {
    if (activeSavedSession) {
      let list = activeSavedSession.items;
      if (selectedSourceFilter !== 'ALL') {
        list = list.filter((i: any) => i.source === selectedSourceFilter);
      }
      if (selectedLocator !== 'ALL') {
        list = list.filter((i: any) => i.whGroup === selectedLocator);
      }
      if (selectedMovementFilter === 'BERGERAK') {
        list = list.filter((i: any) => Math.abs(i.mutasiQty || 0) > 0 || (i.mutasiQtyIn || 0) > 0 || (i.mutasiQtyOut || 0) > 0);
      } else if (selectedMovementFilter === 'TIDAK_BERGERAK') {
        list = list.filter((i: any) => !(Math.abs(i.mutasiQty || 0) > 0 || (i.mutasiQtyIn || 0) > 0 || (i.mutasiQtyOut || 0) > 0));
      } else if (selectedMovementFilter === 'STOK_ADA') {
        list = list.filter((i: any) => (i.stokRill || 0) > 0);
      } else if (selectedMovementFilter === 'STOK_KOSONG') {
        list = list.filter((i: any) => (i.stokRill || 0) <= 0);
      }

      const totalCounted = list.filter((i: any) => i.stokRill !== null).length;
      const totalMatched = list.filter((i: any) => i.status === 'SESUAI').length;
      const totalSelisih = list.filter((i: any) => i.status === 'SELISIH').length;
      const totalBelum = list.filter((i: any) => i.status === 'BELUM').length;

      return {
        totalItems: list.length,
        counted: totalCounted,
        matched: totalMatched,
        selisih: totalSelisih,
        belumDiisi: totalBelum
      };
    }
    return metrics;
  }, [activeSavedSession, metrics, selectedSourceFilter, selectedLocator, selectedMovementFilter]);

  const movementCounts = useMemo(() => {
    const baseList = activeSavedSession ? activeSavedSession.items : reconciliationList;
    let list = selectedAreaFilter === 'ALL' ? baseList : baseList.filter((i: any) => i.area === selectedAreaFilter);
    if (selectedSourceFilter !== 'ALL') {
      list = list.filter((i: any) => i.source === selectedSourceFilter);
    }
    if (selectedLocator !== 'ALL') {
      list = list.filter((i: any) => i.whGroup === selectedLocator);
    }

    let moving = 0;
    let staticCount = 0;
    let withStock = 0;
    let zeroStock = 0;

    list.forEach((item: any) => {
      const hasMovement = Math.abs(item.mutasiQty || 0) > 0 || (item.mutasiQtyIn || 0) > 0 || (item.mutasiQtyOut || 0) > 0;
      if (hasMovement) moving++;
      else staticCount++;

      if ((item.stokRill || 0) > 0) withStock++;
      else zeroStock++;
    });

    return {
      all: list.length,
      moving,
      staticCount,
      withStock,
      zeroStock
    };
  }, [reconciliationList, activeSavedSession, selectedAreaFilter, selectedSourceFilter, selectedLocator]);

  const categoryCounts = useMemo(() => {
    const list = activeSavedSession ? activeSavedSession.items : reconciliationList;
    const filteredByAreaList = selectedAreaFilter === 'ALL' ? list : list.filter((i: any) => i.area === selectedAreaFilter);
    const counts = {
      ALL: filteredByAreaList.length,
      INPUT: filteredByAreaList.filter((i: any) => i.source === 'INPUT').length,
      'INPUT RM': filteredByAreaList.filter((i: any) => i.source === 'INPUT RM').length,
      'INPUT MFG': filteredByAreaList.filter((i: any) => i.source === 'INPUT MFG').length,
      'INPUT SUPPLIES': filteredByAreaList.filter((i: any) => i.source === 'INPUT SUPPLIES').length,
    };
    return counts;
  }, [reconciliationList, activeSavedSession, selectedAreaFilter]);

  const currentReconType = activeSavedSession ? activeSavedSession.type : reconType;

  // Grouped Product List for Week Reconciliation Mode
  const weeklyProductList = useMemo<WeeklyProductItem[]>(() => {
    const baseList = activeSavedSession ? activeSavedSession.items : reconciliationList;
    const productMap = new Map<string, WeeklyProductItem>();

    baseList.forEach(item => {
      if (selectedAreaFilter !== 'ALL' && item.area !== selectedAreaFilter) return;
      if (selectedSourceFilter !== 'ALL' && item.source !== selectedSourceFilter) return;
      if (selectedLocator !== 'ALL' && item.whGroup !== selectedLocator) return;

      const pKey = (area === 'HQ' || spreadsheetId === 'HQ')
        ? `${item.area}__${(item.kodeProduk || '').toUpperCase().trim()}`
        : (item.kodeProduk || '').toUpperCase().trim();

      if (!productMap.has(pKey)) {
        productMap.set(pKey, {
          key: pKey,
          kodeProduk: item.kodeProduk,
          namaProduk: item.namaProduk,
          uom: item.uom || 'Pcs',
          area: item.area,
          source: item.source,
          locators: [],
          totalStokKemarin: 0,
          totalMutasiIn: 0,
          totalMutasiOut: 0,
          totalQty: 0,
          totalStockSistem: 0,
          totalSelisih: 0,
          status: 'SESUAI',
          hasMovement: false
        });
      }

      const pItem = productMap.get(pKey)!;
      pItem.totalStokKemarin = Math.round(((pItem.totalStokKemarin || 0) + (item.stokKemarin || 0)) * 1000) / 1000;
      pItem.totalMutasiIn = Math.round(((pItem.totalMutasiIn || 0) + ((item as any).mutasiQtyIn || 0)) * 1000) / 1000;
      pItem.totalMutasiOut = Math.round(((pItem.totalMutasiOut || 0) + ((item as any).mutasiQtyOut || 0)) * 1000) / 1000;
      pItem.totalStockSistem = Math.round(((pItem.totalStockSistem || 0) + (item.stockSistem || 0)) * 1000) / 1000;

      const itemHasMovement = Math.abs(item.mutasiQty || 0) > 0 || (item.mutasiQtyIn || 0) > 0 || (item.mutasiQtyOut || 0) > 0;
      if (itemHasMovement) {
        pItem.hasMovement = true;
      }

      const existingLoc = pItem.locators.find(l => l.locatorCode === item.whGroup);
      if (existingLoc) {
        existingLoc.qty = Math.round((existingLoc.qty + (item.stokRill || 0)) * 1000) / 1000;
      } else {
        pItem.locators.push({
          locatorCode: item.whGroup,
          locatorName: item.namaLocator,
          qty: Math.round((item.stokRill || 0) * 1000) / 1000
        });
      }
    });

    const results: WeeklyProductItem[] = [];
    productMap.forEach(item => {
      item.totalQty = Math.round(item.locators.reduce((sum, l) => sum + l.qty, 0) * 1000) / 1000;
      item.totalSelisih = Math.round((item.totalQty - (item.totalStockSistem || 0)) * 1000) / 1000;
      item.status = item.totalSelisih === 0 ? 'SESUAI' : 'SELISIH';
      
      if (selectedStatusFilter !== 'ALL' && item.status !== selectedStatusFilter) return;
      if (selectedMovementFilter === 'BERGERAK' && !item.hasMovement) return;
      if (selectedMovementFilter === 'TIDAK_BERGERAK' && item.hasMovement) return;
      if (selectedMovementFilter === 'STOK_ADA' && item.totalQty <= 0) return;
      if (selectedMovementFilter === 'STOK_KOSONG' && item.totalQty > 0) return;

      const matchSearch = selectedProduct
        ? item.kodeProduk === selectedProduct.kodeProduk
        : (item.namaProduk.toLowerCase().includes(searchQuery.toLowerCase()) || 
           item.kodeProduk.toLowerCase().includes(searchQuery.toLowerCase()) ||
           item.locators.some(l => l.locatorCode.toLowerCase().includes(searchQuery.toLowerCase()) || l.locatorName.toLowerCase().includes(searchQuery.toLowerCase())));

      if (matchSearch) {
        results.push(item);
      }
    });

    return results.sort((a, b) => a.namaProduk.localeCompare(b.namaProduk));
  }, [reconciliationList, activeSavedSession, selectedAreaFilter, selectedSourceFilter, selectedLocator, selectedStatusFilter, selectedProduct, searchQuery, area, spreadsheetId, selectedMovementFilter]);

  const totalWeeklyQty = useMemo(() => {
    return Math.round(weeklyProductList.reduce((sum, p) => sum + p.totalQty, 0) * 1000) / 1000;
  }, [weeklyProductList]);

  const weeklyMatrixTotals = useMemo(() => {
    let totalStokAwal = 0;
    let totalMutasiIn = 0;
    let totalMutasiOut = 0;
    let totalQty = 0;
    let totalStockSistem = 0;
    let totalSelisih = 0;

    weeklyProductList.forEach(p => {
      totalStokAwal += p.totalStokKemarin || 0;
      totalMutasiIn += p.totalMutasiIn || 0;
      totalMutasiOut += p.totalMutasiOut || 0;
      totalQty += p.totalQty || 0;
      totalStockSistem += p.totalStockSistem || 0;
      totalSelisih += p.totalSelisih || 0;
    });

    return {
      totalStokAwal: Math.round(totalStokAwal * 1000) / 1000,
      totalMutasiIn: Math.round(totalMutasiIn * 1000) / 1000,
      totalMutasiOut: Math.round(totalMutasiOut * 1000) / 1000,
      totalQty: Math.round(totalQty * 1000) / 1000,
      totalStockSistem: Math.round(totalStockSistem * 1000) / 1000,
      totalSelisih: Math.round(totalSelisih * 1000) / 1000
    };
  }, [weeklyProductList]);

  // Compute pagination based on adaptive list
  const activeItemsCount = currentReconType === 'week' ? weeklyProductList.length : displayedList.length;
  const totalPages = Math.ceil(activeItemsCount / pageSize) || 1;
  const paginatedReconciliation = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayedList.slice(start, start + pageSize);
  }, [displayedList, currentPage, pageSize]);

  const paginatedWeeklyList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return weeklyProductList.slice(start, start + pageSize);
  }, [weeklyProductList, currentPage, pageSize]);

  // Distinct locator columns for Week view
  const weekLocatorColumns = useMemo(() => {
    const locSet = new Set<string>();
    weeklyProductList.forEach(p => {
      p.locators.forEach(l => {
        if (l.locatorCode && l.locatorCode.trim()) {
          locSet.add(l.locatorCode.trim());
        }
      });
    });
    if (selectedLocator !== 'ALL') {
      return [selectedLocator];
    }
    const list = Array.from(locSet);
    if (list.length === 0) {
      return uniqueLocators.map(l => l.code);
    }
    return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [weeklyProductList, selectedLocator, uniqueLocators]);

  // Unique areas available inside data
  const uniqueAreas = useMemo(() => {
    return Array.from(new Set(reconciliationList.map(i => i.area).filter(Boolean))).sort();
  }, [reconciliationList]);

  // Reset locator filter if area changes
  useEffect(() => {
    setSelectedLocator('ALL');
  }, [selectedAreaFilter]);

  
  const [predictLoading, setPredictLoading] = useState(false);
  const handlePredictCycleCount = async () => {
    try {
      setPredictLoading(true);
      
      const payload = reconciliationList.slice(0, 100).map((i: any) => ({
        kodeProduk: i.kodeProduk,
        namaProduk: i.namaProduk,
        mutasiQty: i.mutasiQty,
        selisihSebelumnya: i.selisih,
        stockSistem: i.stockSistem
      }));
      
      const res = await fetch('/api/gemini/predict-cycle-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      let msg = "Rekomendasi Cycle Counting Berbasis AI:\n\n";
      data.predictions.forEach((p: any, idx: number) => {
         msg += `${idx+1}. ${p.namaProduk} (${p.kodeProduk})\n   Skor Risiko: ${p.riskScore}/100\n   Alasan: ${p.reason}\n\n`;
      });
      alert(msg);
      
    } catch(err:any) {
      alert("Gagal melakukan prediksi AI: " + err.message);
    } finally {
      setPredictLoading(false);
    }
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const itemsCount = currentReconType === 'week' ? weeklyProductList.length : displayedList.length;
    if (itemsCount === 0) {
      alert('Tidak ada data untuk diekspor!');
      return;
    }

    const dateStr = currentReconType === 'daily' 
      ? formatToDDMMYYYY(selectedDate) 
      : currentReconType === 'week'
        ? `${formatToDDMMYYYY(selectedWeekStartDate)} - ${formatToDDMMYYYY(selectedWeekEndDate)}`
        : `${formatToDDMMYYYY(selectedStartDate)} - ${formatToDDMMYYYY(selectedEndDate)}`;
    const typeLabel = currentReconType === 'daily' ? 'Harian' : currentReconType === 'week' ? 'Mingguan' : 'Bulanan';

    if (currentReconType === 'week') {
      const headers = ['No'];
      if (area === 'HQ' || spreadsheetId === 'HQ') headers.push('Area');
      headers.push('Kode Produk', 'Nama Produk', 'UOM');
      weekLocatorColumns.forEach(loc => headers.push(loc));
      headers.push('Total Qty');

      const excelRows: any[] = [headers];
      weeklyProductList.forEach((item, idx) => {
        const row: any[] = [idx + 1];
        if (area === 'HQ' || spreadsheetId === 'HQ') row.push(item.area || '');
        row.push(item.kodeProduk, item.namaProduk, item.uom || 'Pcs');
        weekLocatorColumns.forEach(loc => {
          const found = item.locators.find(l => l.locatorCode === loc);
          row.push(found ? found.qty : 0);
        });
        row.push(item.totalQty);
        excelRows.push(row);
      });

      // Total row
      const totalRow: any[] = ['Total Keseluruhan'];
      if (area === 'HQ' || spreadsheetId === 'HQ') totalRow.push('');
      totalRow.push('', '', '');
      weekLocatorColumns.forEach(loc => {
        const sum = weeklyProductList.reduce((s, p) => s + (p.locators.find(l => l.locatorCode === loc)?.qty || 0), 0);
        totalRow.push(sum);
      });
      totalRow.push(totalWeeklyQty);
      excelRows.push(totalRow);

      const worksheet = XLSX.utils.aoa_to_sheet(excelRows);
      const colWidths = [
        { wch: 6 },
        ...(area === 'HQ' || spreadsheetId === 'HQ' ? [{ wch: 12 }] : []),
        { wch: 18 },
        { wch: 38 },
        { wch: 10 },
        ...weekLocatorColumns.map(() => ({ wch: 14 })),
        { wch: 16 }
      ];
      worksheet['!cols'] = colWidths;
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Rekon Mingguan`);
      const activeArea = activeSavedSession ? activeSavedSession.area : area;
      const fileName = `Pencocokan_Data_Mingguan_${(activeArea || 'HQ').toUpperCase()}_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      return;
    }

    let dataToExport = [];
    if (currentReconType === 'daily') {
      dataToExport = displayedList.map(item => ({
        'Locator': `${item.namaLocator} (${item.whGroup})`,
        'Kode Produk': item.kodeProduk,
        'Nama Produk': item.namaProduk,
        'Stok Rill (Tgl kemarin)': item.stokKemarin,
        'Mutasi Hari Ini IN': (item as any).mutasiQtyIn ?? 0,
        'Mutasi Hari Ini OUT': (item as any).mutasiQtyOut ?? 0,
        'Stock Rill (Hari ini)': item.stokRill,
        'Stock Tarikan MTS': item.stockSistem,
        'Selisih': item.selisih,
        'Status': item.status
      }));
    } else {
      dataToExport = displayedList.map(item => ({
        'Area': item.area || '',
        'Locator': `${item.namaLocator} (${item.whGroup})`,
        'Kode Produk': item.kodeProduk,
        'Nama Produk': item.namaProduk,
        'Stok Awal Periode': item.stokKemarin,
        'Mutasi Periode IN': (item as any).mutasiQtyIn ?? 0,
        'Mutasi Periode OUT': (item as any).mutasiQtyOut ?? 0,
        'Stock Rill (Akhir Periode)': item.stokRill,
        'Stock Tarikan MTS': item.stockSistem,
        'Selisih': item.selisih,
        'Status': item.status
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    const colWidths = currentReconType === 'week'
      ? [
          { wch: 18 }, // Kode produk
          { wch: 40 }, // nama produk
          { wch: 50 }, // qty pada locator
          { wch: 16 }, // Total QTY
        ]
      : currentReconType === 'daily' 
      ? [
          { wch: 25 }, // Locator
          { wch: 15 }, // Kode Produk
          { wch: 40 }, // Nama Produk
          { wch: 22 }, // Stok Rill (Tgl kemarin)
          { wch: 20 }, // Mutasi Hari Ini IN
          { wch: 20 }, // Mutasi Hari Ini OUT
          { wch: 22 }, // Stock Rill (Hari ini)
          { wch: 20 }, // Stock Tarikan MTS
          { wch: 12 }, // Selisih
          { wch: 15 }, // Status
        ]
      : [
          { wch: 12 }, // Area
          { wch: 25 }, // Locator
          { wch: 15 }, // Kode Produk
          { wch: 40 }, // Nama Produk
          { wch: 22 }, // Stok Rill (Awal Periode)
          { wch: 20 }, // Mutasi Periode IN
          { wch: 20 }, // Mutasi Periode OUT
          { wch: 25 }, // Stock Rill (Akhir Periode)
          { wch: 20 }, // Stock Tarikan MTS
          { wch: 12 }, // Selisih
          { wch: 15 }, // Status
        ];

    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Rekon ${typeLabel}`);

    const activeArea = activeSavedSession ? activeSavedSession.area : area;
    const fileName = `Pencocokan_Data_${typeLabel}_${(activeArea || 'HQ').toUpperCase()}_${dateStr}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className={cn(
      "space-y-6 transition-all",
      isFullscreen && "fixed inset-0 z-50 bg-[#f8faff] overflow-y-auto p-4 sm:p-6"
    )}>
      {/* Locked Archive Alert Banner */}
      {activeSavedSession && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-700 col-span-1">
              <Lock className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <div className="font-bold text-amber-950 text-sm sm:text-base">
                Menampilkan Arsip Terkunci: <span className="underline">{activeSavedSession.name}</span>
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                Wilayah Area: <strong className="uppercase">{activeSavedSession.area}</strong> | 
                Tipe: <strong>{activeSavedSession.type === 'daily' ? 'Harian' : 'Bulanan'}</strong> | 
                Periode: <strong>{formatToDDMMYYYY(activeSavedSession.date)}</strong> | 
                Disimpan pada: <strong>{new Date(activeSavedSession.timestamp).toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveSavedSession(null)}
            className="px-4 py-2 border border-amber-300 hover:bg-amber-100 bg-amber-50 text-amber-900 font-bold text-xs sm:text-sm rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all focus:outline-none"
          >
            <Undo className="w-4 h-4 text-amber-700" />
            Kembali ke Data Live (Real-Time)
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-6 h-6 text-blue-600" />
            Pencocokan Data (Reconciliation)
          </h2>
          <p className="text-sm text-slate-500">
            Bandingkan kuantitas fisik wilayah lapangan dengan catatan ledger pusat (Google Sheet Data MTS).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!activeSavedSession && (
            <button
              type="button"
              onClick={initSaveSession}
              disabled={loading || filteredReconciliation.length === 0}
              className="px-3.5 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm disabled:opacity-50"
              title="Kunci & Simpan Rekonsiliasi Saat Ini"
            >
              <Lock className="w-4 h-4" />
              Kunci & Simpan Sesi
            </button>
          )}

          <button 
            type="button"
            onClick={loadData} 
            disabled={!!activeSavedSession}
            className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh Sinkronisasi
          </button>

          <button 
            type="button"
            onClick={handleExportExcel}
            disabled={loading || displayedList.length === 0}
            className="px-3.5 py-2 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm disabled:opacity-50"
            title="Ekspor data rekonsiliasi ke Microsoft Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4.5 h-4.5 text-blue-600" />
            Export Excel
          </button>

          <button 
            type="button" 
            onClick={() => setIsFullscreen(prev => !prev)}
            className={cn(
              "px-3.5 py-2 border font-semibold rounded-lg flex items-center gap-2 transition-all shadow-sm text-sm cursor-pointer",
              isFullscreen 
                ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700 shadow-md" 
                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            )}
            title={isFullscreen ? "Keluar dari mode layar penuh" : "Buka dalam mode layar penuh (Full Screen)"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{isFullscreen ? 'Tampilan Standar' : 'Layar Penuh (Full)'}</span>
          </button>
          
          <button 
            type="button"
            onClick={handlePredictCycleCount}
            disabled={loading || predictLoading || reconciliationList.length === 0}
            className={`px-3.5 py-2 border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm disabled:opacity-50 ${predictLoading ? 'animate-pulse' : ''}`}
            title="Prediksi barang rentan selisih menggunakan AI"
          >
            {predictLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4.5 h-4.5 text-purple-600" />}
            {predictLoading ? 'Menganalisis...' : 'Prediksi Selisih (AI)'}
          </button>
        </div>
      </div>

      {/* Mode Sub-nav Tabs (Daily vs Monthly vs Week) */}
      {!activeSavedSession && (
        <div className="bg-white border border-slate-200 rounded-xl p-1 flex flex-wrap shadow-sm max-w-xl">
          <button
            onClick={() => setReconType('daily')}
            className={cn(
              "flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all focus:outline-none",
              reconType === 'daily'
                ? "bg-blue-600 text-white shadow"
                : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
            )}
          >
            <Calendar className="w-4 h-4" />
            Pencocokan Harian
          </button>
          <button
            onClick={() => setReconType('monthly')}
            className={cn(
              "flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all focus:outline-none",
              reconType === 'monthly'
                ? "bg-blue-600 text-white shadow"
                : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
            )}
          >
            <Calendar className="w-4 h-4" />
            Pencocokan Periode
          </button>
          <button
            onClick={() => setReconType('week')}
            className={cn(
              "flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all focus:outline-none",
              reconType === 'week'
                ? "bg-blue-600 text-white shadow"
                : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
            )}
          >
            <Calendar className="w-4 h-4" />
            Pencocokan Periode Week
          </button>
        </div>
      )}

      {/* Info active interval description */}
      <div className="bg-blue-50/55 border border-blue-100 rounded-xl px-4 py-3 text-xs sm:text-sm text-blue-800 flex items-center gap-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0" />
        <div>
          {activeSavedSession ? (
            <span>
              Arsip Terkunci: Menampilkan snapshot historis dengan tipe pencocokan <strong>{activeSavedSession.type === 'daily' ? 'Harian' : activeSavedSession.type === 'week' ? 'Mingguan' : 'Bulanan'}</strong> untuk tanggal/periode <strong>{formatToDDMMYYYY(activeSavedSession.date)}</strong> di wilayah area <strong>{activeSavedSession.area}</strong>.
            </span>
          ) : reconType === 'daily' ? (
            <span>
              Sedang menampilkan <strong>Pencocokan Harian</strong> untuk tanggal <strong>{formatToDDMMYYYY(selectedDate)}</strong>. Stok Rill diakumulasi dari seluruh transaksi <strong>sebelum atau pada tanggal tersebut</strong>, dengan kolom Mutasi mencatat aktivitas mutasi harian khusus di tanggal berjalan.
            </span>
          ) : reconType === 'week' ? (
            <span>
              Sedang menampilkan <strong>Pencocokan Periode Week</strong> untuk periode minggu <strong>{formatToDDMMYYYY(selectedWeekStartDate)} s/d {formatToDDMMYYYY(selectedWeekEndDate)}</strong>. Menyediakan mode <strong>Tabel Rinci (Locator)</strong> untuk rekonsiliasi detail serta mode <strong>Matriks Ringkasan (SKU)</strong> untuk melihat distribusi kuantitas antar locator.
            </span>
          ) : (
            <span>
              Sedang menampilkan <strong>Pencocokan Periode</strong> untuk periode <strong>{formatToDDMMYYYY(selectedStartDate)} - {formatToDDMMYYYY(selectedEndDate)}</strong>. Stok Awal diakumulasi dari seluruh transaksi <strong>sebelum periode tersebut dimulai</strong>, dengan kolom Mutasi mencatat total aktivitas mutasi pada periode tersebut.
            </span>
          )}
        </div>
      </div>

      {/* Stats Summary Panel */}
      {currentReconType === 'week' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">
              {weekViewMode === 'matrix' ? 'Total Produk (SKU)' : 'Total Baris / Locator'}
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {weekViewMode === 'matrix' ? weeklyProductList.length : displayedList.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {weekViewMode === 'matrix' ? 'SKU unik terdaftar' : 'Titik kombinasi aktif'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-emerald-500">
            <div className="text-xs font-semibold text-emerald-600 uppercase font-bold">Sesuai (Match)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5" />
              {weekViewMode === 'matrix' 
                ? weeklyProductList.filter(p => p.status === 'SESUAI').length 
                : displayedList.filter((i: any) => i.status === 'SESUAI').length}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {activeItemsCount > 0 
                ? Math.round(((weekViewMode === 'matrix' 
                    ? weeklyProductList.filter(p => p.status === 'SESUAI').length 
                    : displayedList.filter((i: any) => i.status === 'SESUAI').length) / activeItemsCount) * 100)
                : 0}% Tingkat kecocokan
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-rose-500">
            <div className="text-xs font-semibold text-rose-600 uppercase font-bold">Ada Selisih (Varian)</div>
            <div className="text-2xl font-bold text-rose-700 mt-1 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5" />
              {weekViewMode === 'matrix' 
                ? weeklyProductList.filter(p => p.status === 'SELISIH').length 
                : displayedList.filter((i: any) => i.status === 'SELISIH').length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Varian data fisik vs sistem</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-blue-500">
            <div className="text-xs font-semibold text-blue-600 uppercase font-bold">Total QTY Fisik Minggu Ini</div>
            <div className="text-2xl font-bold text-blue-800 mt-1 font-mono">
              {formatValue(totalWeeklyQty)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {formatToDDMMYYYY(selectedWeekStartDate)} s/d {formatToDDMMYYYY(selectedWeekEndDate)}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Total SKU / Kombinasi</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{displayedMetrics.totalItems}</div>
            <div className="text-xs text-slate-400 mt-1">Grup lokasi & produk aktif</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-emerald-500">
            <div className="text-xs font-semibold text-emerald-600 uppercase font-bold">Sesuai (Match)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5" />
              {displayedMetrics.matched}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {displayedMetrics.totalItems > 0 ? Math.round((displayedMetrics.matched / displayedMetrics.totalItems) * 100) : 0}% Tingkat kecocokan
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-rose-500">
            <div className="text-xs font-semibold text-rose-600 uppercase font-bold">Ada Selisih (Varian)</div>
            <div className="text-2xl font-bold text-rose-700 mt-1 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5" />
              {displayedMetrics.selisih}
            </div>
            <div className="text-xs text-slate-400 mt-1">Butuh pemeriksaan unit/mutasi</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm border-l-4 border-l-sky-500">
            <div className="text-xs font-semibold text-sky-600 uppercase font-bold">Status Data</div>
            <div className="text-xl font-bold text-sky-700 mt-1 flex items-center gap-1.5">
              <Info className="w-5 h-5 text-sky-500" />
              {activeSavedSession ? 'ARSIP TERKUNCI' : 'MTS LIVE FEED'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {activeSavedSession ? 'Snapshot statis tersimpan' : 'Sistem sinkronisasi waktu riil'}
            </div>
          </div>
        </div>
      )}

      {/* Category Tabs Menu */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kategori Menu Pencocokan</div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'Semua Kategori (All)', count: categoryCounts.ALL, activeClass: 'bg-slate-900 text-white border-slate-900 ring-slate-900 font-bold' },
            { id: 'INPUT', label: 'Accessories', count: categoryCounts.INPUT, activeClass: 'bg-blue-600 text-white border-blue-600 ring-blue-600 font-bold' },
            { id: 'INPUT RM', label: 'Raw Material', count: categoryCounts['INPUT RM'], activeClass: 'bg-emerald-600 text-white border-emerald-600 ring-emerald-600 font-bold' },
            { id: 'INPUT MFG', label: 'Manufacturing', count: categoryCounts['INPUT MFG'], activeClass: 'bg-purple-600 text-white border-purple-600 ring-purple-600 font-bold' },
            { id: 'INPUT SUPPLIES', label: 'Supplies & GA', count: categoryCounts['INPUT SUPPLIES'], activeClass: 'bg-amber-600 text-white border-amber-600 ring-amber-600 font-bold' },
          ].map(cat => {
            const isActive = selectedSourceFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedSourceFilter(cat.id)}
                className={`px-3.5 py-1.5 text-xs md:text-sm font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? `${cat.activeClass} shadow-sm ring-1`
                    : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-600 font-medium'}`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        {/* Top Row: Search & Date / Period Selector */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search */}
          <div ref={dropdownRef} className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Cari locator, kode/nama produk..." 
              value={searchQuery} 
              onChange={e => {
                const val = e.target.value;
                setSearchQuery(val);
                setShowDropdown(true);
                if (selectedProduct && val !== selectedProduct.namaProduk) {
                  setSelectedProduct(null);
                }
              }} 
              onFocus={() => setShowDropdown(true)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedProduct(null);
                  setShowDropdown(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {showDropdown && productSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-25 divide-y divide-slate-100">
                {productSuggestions.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex flex-col focus:outline-none transition-colors border-none cursor-pointer text-slate-700 bg-transparent"
                    onClick={() => {
                      setSelectedProduct(p);
                      setSearchQuery(p.namaProduk);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="font-semibold text-slate-800 text-xs block truncate max-w-full" title={p.namaProduk}>{p.namaProduk}</span>
                    <span className="font-mono text-[10px] text-slate-400 mt-0.5 block truncate max-w-full" title={p.kodeProduk}>{p.kodeProduk}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Selector depending on Type */}
          <div className="shrink-0 w-full lg:w-auto">
            {activeSavedSession ? (
              <div className="px-3.5 py-2 text-sm border border-amber-200 bg-amber-50 rounded-lg font-semibold text-amber-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{formatToDDMMYYYY(activeSavedSession.date)}</span>
              </div>
            ) : reconType === 'daily' ? (
              <div className="relative w-full sm:w-56">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                />
              </div>
            ) : reconType === 'week' ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={selectedWeekStartDate}
                      onChange={e => setSelectedWeekStartDate(e.target.value)}
                      className="w-36 pl-8 pr-2 py-1.5 text-xs border border-slate-200 bg-white rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                      title="Awal Minggu"
                    />
                  </div>
                  <span className="text-slate-400 text-xs font-bold">-</span>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={selectedWeekEndDate}
                      onChange={e => setSelectedWeekEndDate(e.target.value)}
                      className="w-36 pl-8 pr-2 py-1.5 text-xs border border-slate-200 bg-white rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                      title="Akhir Minggu"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuickWeek(0)}
                    className="text-[10px] font-bold px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded transition-colors whitespace-nowrap"
                  >
                    Minggu Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickWeek(1)}
                    className="text-[10px] font-bold px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors whitespace-nowrap"
                  >
                    Minggu Lalu
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickWeek(2)}
                    className="text-[10px] font-bold px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors whitespace-nowrap"
                  >
                    -2 Minggu
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={selectedStartDate}
                    onChange={e => setSelectedStartDate(e.target.value)}
                    className="w-36 sm:w-40 pl-9 pr-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                  />
                </div>
                <span className="text-slate-500 font-bold">-</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={selectedEndDate}
                    onChange={e => setSelectedEndDate(e.target.value)}
                    className="w-36 sm:w-40 pl-9 pr-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Filter Dropdowns Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Dynamic Area Filter (HQ Only) */}
          {(area === 'HQ' || spreadsheetId === 'HQ') ? (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Filter Area</label>
              {activeSavedSession ? (
                <div className="w-full px-3 py-2 text-sm border border-amber-200 bg-amber-50/50 rounded-lg font-bold text-amber-900 flex items-center gap-2">
                  <span>Area: <strong className="uppercase">{activeSavedSession.area}</strong></span>
                </div>
              ) : (
                <select
                  value={selectedAreaFilter}
                  onChange={e => setSelectedAreaFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                >
                  <option value="ALL">Semua Area</option>
                  {uniqueAreas.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="hidden lg:block"></div>
          )}

          {/* Locator Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Filter Locator</label>
            <select
              value={selectedLocator}
              onChange={e => setSelectedLocator(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
            >
              <option value="ALL">Semua Locator ({uniqueLocators.length})</option>
              {uniqueLocators.map(loc => (
                <option key={loc.code} value={loc.code}>{loc.name || loc.code}</option>
              ))}
            </select>
          </div>

          {/* Dropdown Filter Kategori Produk / Pergerakan */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Filter Pergerakan</label>
            <select
              value={selectedMovementFilter}
              onChange={e => setSelectedMovementFilter(e.target.value)}
              className={cn(
                "w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-colors",
                selectedMovementFilter !== 'ALL'
                  ? "border-blue-500 bg-blue-50/50 text-blue-900 font-semibold ring-1 ring-blue-400"
                  : "border-slate-200 bg-white text-slate-700"
              )}
              title="Filter Kategori Pergerakan Produk"
            >
              <option value="ALL">Semua Pergerakan ({movementCounts.all})</option>
              <option value="BERGERAK">Ada Pergerakan ({movementCounts.moving})</option>
              <option value="TIDAK_BERGERAK">Tidak Ada Pergerakan ({movementCounts.staticCount})</option>
              <option value="STOK_ADA">Ada Stok Fisik ({movementCounts.withStock})</option>
              <option value="STOK_KOSONG">Stok Kosong / Nol ({movementCounts.zeroStock})</option>
            </select>
          </div>

          {/* Match Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status Kesesuaian</label>
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
            >
              <option value="ALL">Semua Status</option>
              <option value="SESUAI">Sesuai (Match)</option>
              <option value="SELISIH">Ada Selisih (Varian)</option>
              <option value="BELUM">Belum Diisi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {(selectedMovementFilter !== 'ALL' || selectedLocator !== 'ALL' || selectedStatusFilter !== 'ALL' || (selectedAreaFilter !== 'ALL' && (area === 'HQ' || spreadsheetId === 'HQ')) || searchQuery) && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
          <span className="text-slate-400 font-medium">Filter Aktif:</span>
          {selectedMovementFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
              <span>Pergerakan: {selectedMovementFilter === 'BERGERAK' ? 'Ada Pergerakan' : selectedMovementFilter === 'TIDAK_BERGERAK' ? 'Tidak Ada Pergerakan' : selectedMovementFilter === 'STOK_ADA' ? 'Ada Stok' : 'Stok Kosong'}</span>
              <button 
                type="button" 
                onClick={() => setSelectedMovementFilter('ALL')}
                className="text-blue-600 hover:text-blue-900 font-bold ml-0.5"
                title="Hapus filter pergerakan"
              >
                ×
              </button>
            </span>
          )}
          {selectedLocator !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-800 font-medium">
              <span>Locator: {selectedLocator}</span>
              <button 
                type="button" 
                onClick={() => setSelectedLocator('ALL')}
                className="text-slate-600 hover:text-slate-900 font-bold ml-0.5"
                title="Hapus filter locator"
              >
                ×
              </button>
            </span>
          )}
          {selectedStatusFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-800 font-medium">
              <span>Status: {selectedStatusFilter}</span>
              <button 
                type="button" 
                onClick={() => setSelectedStatusFilter('ALL')}
                className="text-slate-600 hover:text-slate-900 font-bold ml-0.5"
                title="Hapus filter status"
              >
                ×
              </button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-800 font-medium">
              <span>Pencarian: "{searchQuery}"</span>
              <button 
                type="button" 
                onClick={() => {
                  setSearchQuery('');
                  setSelectedProduct(null);
                }}
                className="text-slate-600 hover:text-slate-900 font-bold ml-0.5"
                title="Hapus pencarian"
              >
                ×
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedMovementFilter('ALL');
              setSelectedLocator('ALL');
              setSelectedStatusFilter('ALL');
              setSearchQuery('');
              setSelectedProduct(null);
            }}
            className="text-xs text-blue-600 hover:text-blue-800 underline font-semibold ml-1 cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>
      )}

      {/* Main Table card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <div className="text-sm font-medium">Memproses data dari jaringan...</div>
            </div>
          ) : (
            <table className="w-full text-left text-xs whitespace-nowrap divide-y divide-slate-150">
              {currentReconType === 'week' ? (
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-3 py-3 font-bold text-[11px] uppercase tracking-wider text-center">No</th>
                    {(area === 'HQ' || spreadsheetId === 'HQ') && (
                      <th className="px-3 py-3 font-bold text-[11px] uppercase tracking-wider">Area</th>
                    )}
                    <th className="px-3 py-3 font-bold text-[11px] uppercase tracking-wider">Kode Produk</th>
                    <th className="px-3.5 py-3 font-bold text-[11px] uppercase tracking-wider min-w-[220px]">Nama Produk</th>
                    <th className="px-2.5 py-3 font-bold text-[11px] uppercase tracking-wider text-center">UOM</th>
                    {weekLocatorColumns.map(loc => (
                      <th 
                        key={loc} 
                        className="px-2.5 py-3 font-bold text-[11px] uppercase tracking-wider text-right bg-blue-50/60 text-blue-900 border-x border-slate-200/80 font-mono"
                      >
                        {loc}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-black text-[11px] uppercase tracking-wider text-right bg-emerald-50 text-emerald-950">
                      Total Qty
                    </th>
                  </tr>
                </thead>
              ) : currentReconType === 'daily' ? (
                <thead className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="px-3.5 py-3 font-bold uppercase tracking-wider">Locator</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider">Kode Produk</th>
                    <th className="px-3.5 py-3 font-bold uppercase tracking-wider min-w-[200px]">Nama Produk</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-slate-100/60 text-slate-700">Stok Rill (Kemarin)</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-emerald-50/60 text-emerald-800">Mutasi IN</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-rose-50/60 text-rose-800">Mutasi OUT</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-emerald-50 text-emerald-900">Stock Rill (Hari Ini)</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-cyan-50/60 text-cyan-950">Tarikan MTS</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right">Selisih</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
              ) : (
                <thead className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-[11px]">
                  <tr>
                    {(area === 'HQ' || spreadsheetId === 'HQ') && <th className="px-3 py-3 font-bold uppercase tracking-wider">Area</th>}
                    <th className="px-3.5 py-3 font-bold uppercase tracking-wider">Locator</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider">Kode Produk</th>
                    <th className="px-3.5 py-3 font-bold uppercase tracking-wider min-w-[200px]">Nama Produk</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-slate-100/60 text-slate-700 font-medium">Stok Awal</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-emerald-50/60 text-emerald-800">Mutasi IN</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-rose-50/60 text-rose-800">Mutasi OUT</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-emerald-50 text-emerald-900">Stock Rill (Akhir)</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right bg-cyan-50/60 text-cyan-950">Tarikan MTS</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-right">Selisih</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
              )}

              <tbody className="divide-y divide-slate-100 bg-white">
                {currentReconType === 'week' ? (
                  weeklyProductList.length === 0 ? (
                    <tr>
                      <td 
                        colSpan={((area === 'HQ' || spreadsheetId === 'HQ') ? 5 : 4) + weekLocatorColumns.length} 
                        className="p-12 text-center text-slate-500 italic"
                      >
                        Tidak ada data produk pada periode minggu ini.
                      </td>
                    </tr>
                  ) : (
                    paginatedWeeklyList.map((item, idx) => (
                      <tr key={item.key} className="hover:bg-blue-50/20 transition-colors text-slate-700">
                        {/* No */}
                        <td className="px-3 py-2.5 text-center text-xs text-slate-400 font-mono">
                          {(currentPage - 1) * pageSize + idx + 1}
                        </td>

                        {/* Area */}
                        {(area === 'HQ' || spreadsheetId === 'HQ') && (
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                              {item.area}
                            </span>
                          </td>
                        )}

                        {/* Kode Produk */}
                        <td className="px-3 py-2.5">
                          <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded inline-block">
                            {item.kodeProduk}
                          </span>
                        </td>

                        {/* Nama Produk */}
                        <td className="px-3.5 py-2.5">
                          <div className="font-bold text-slate-900 text-xs" title={item.namaProduk}>
                            {item.namaProduk}
                          </div>
                          {item.hasMovement ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Ada Pergerakan
                            </span>
                          ) : null}
                        </td>

                        {/* UOM */}
                        <td className="px-2.5 py-2.5 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                            {item.uom || 'PCS'}
                          </span>
                        </td>

                        {/* Dynamic Locator Columns */}
                        {weekLocatorColumns.map(loc => {
                          const found = item.locators.find(l => l.locatorCode === loc);
                          const qty = found ? found.qty : 0;
                          return (
                            <td key={loc} className="px-2.5 py-2.5 text-right font-mono text-xs border-x border-slate-100">
                              {qty > 0 ? (
                                <span className="font-bold text-slate-900">{formatValue(qty, item.uom)}</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Total Qty */}
                        <td className="px-3 py-2.5 text-right font-mono font-black text-xs text-emerald-950 bg-emerald-50/40">
                          {formatValue(item.totalQty, item.uom)}
                        </td>
                      </tr>
                    ))
                  )
                ) : displayedList.length === 0 ? (
                  <tr>
                    <td 
                      colSpan={currentReconType === 'daily' ? 10 : ((area === 'HQ' || spreadsheetId === 'HQ') ? 11 : 10)} 
                      className="p-12 text-center text-slate-500 italic"
                    >
                      Tidak ada rekonsiliasi yang cocok dengan kriteria filter atau arsip kosong.
                    </td>
                  </tr>
                ) : (
                  paginatedReconciliation.map((item, idx) => (
                    <tr key={item.key} className="hover:bg-blue-50/20 transition-colors text-slate-700">
                      {/* Area */}
                      {currentReconType === 'monthly' && (area === 'HQ' || spreadsheetId === 'HQ') && (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {item.area}
                          </span>
                        </td>
                      )}

                      {/* Locator */}
                      <td className="px-3.5 py-2.5">
                        <div className="font-bold text-slate-900 text-xs">{item.namaLocator}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.whGroup}</div>
                      </td>

                      {/* Kode Produk */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs text-slate-700 font-medium bg-slate-50 border border-slate-200/80 px-1.5 py-0.5 rounded inline-block">{item.kodeProduk}</span>
                      </td>

                      {/* Product */}
                      <td className="px-3.5 py-2.5">
                        <div className="font-medium text-slate-900 text-xs" title={item.namaProduk}>
                          {item.namaProduk}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.uom && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 uppercase">
                              {item.uom}
                            </span>
                          )}
                          {(Math.abs(item.mutasiQty || 0) > 0 || (item.mutasiQtyIn || 0) > 0 || (item.mutasiQtyOut || 0) > 0) ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Ada Pergerakan
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-50 text-slate-400 border border-slate-200">
                              Statis
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Stok Kemarin */}
                      <td className="px-3 py-2.5 text-right font-medium text-slate-700 bg-slate-50/25 font-mono text-xs">
                        {formatValue(item.stokKemarin, item.uom)}
                      </td>

                      {/* Mutasi IN */}
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 bg-emerald-50/15 font-mono text-xs">
                        {formatValue((item as any).mutasiQtyIn ?? 0, item.uom)}
                      </td>

                      {/* Mutasi OUT */}
                      <td className="px-3 py-2.5 text-right font-semibold text-rose-600 bg-rose-50/15 font-mono text-xs">
                        {formatValue((item as any).mutasiQtyOut ?? 0, item.uom)}
                      </td>

                      {/* Stok Rill */}
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900 bg-emerald-50/20 font-mono text-xs">
                        {formatValue(item.stokRill, item.uom)}
                      </td>

                      {/* Stock Tarikan MTS */}
                      <td className="px-3 py-2.5 text-right font-medium text-slate-700 bg-slate-50/50 font-mono text-xs">
                        {formatValue(item.stockSistem, item.uom)}
                      </td>

                      {/* Selisih */}
                      <td className={
                        `px-3 py-2.5 text-right font-bold text-xs font-mono ${
                          item.status === 'BELUM' ? "text-slate-400 font-normal" : ""
                        } ${
                          item.status === 'SESUAI' ? "text-emerald-600" : ""
                        } ${
                          item.status === 'SELISIH' ? (item.selisih > 0 ? "text-blue-600" : "text-rose-600") : ""
                        }`
                      }>
                        {item.selisih === 0 ? '0' : (item.selisih > 0 ? `+${formatValue(item.selisih, item.uom)}` : formatValue(item.selisih, item.uom))}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 text-center">
                        {item.status === 'SESUAI' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" />
                            Match
                          </span>
                        )}
                        {item.status === 'SELISIH' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            Selisih
                          </span>
                        )}
                        {item.status === 'BELUM' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                            <Info className="w-3 h-3" />
                            Belum
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}

                {/* Adaptive Grand Total Row */}
                {!loading && (
                  (currentReconType === 'week' ? weeklyProductList.length > 0 : displayedList.length > 0)
                ) && (
                  <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900">
                    {currentReconType === 'week' ? (
                      <>
                        <td 
                          colSpan={(area === 'HQ' || spreadsheetId === 'HQ') ? 5 : 4} 
                          className="px-4 py-3.5 text-right font-extrabold text-slate-800 tracking-wider text-xs uppercase"
                        >
                          Total Keseluruhan ({weeklyProductList.length} SKU)
                        </td>
                        {weekLocatorColumns.map(loc => {
                          const colTotal = weeklyProductList.reduce((sum, p) => {
                            const found = p.locators.find(l => l.locatorCode === loc);
                            return sum + (found ? found.qty : 0);
                          }, 0);
                          return (
                            <td key={loc} className="px-3 py-3.5 text-right font-mono font-black text-xs text-blue-950 bg-blue-100/40 border-x border-slate-200">
                              {colTotal > 0 ? formatValue(colTotal) : '-'}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3.5 text-right font-black text-xs text-emerald-950 bg-emerald-100/60 font-mono">
                          {formatValue(totalWeeklyQty)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td 
                          colSpan={(currentReconType === 'monthly' && (area === 'HQ' || spreadsheetId === 'HQ')) ? 4 : 3} 
                          className="px-3.5 py-3 text-left font-extrabold text-slate-800 tracking-wider text-xs uppercase"
                        >
                          🚀 Grand Total ({displayedList.length} Baris Terfilter)
                        </td>

                        {/* Daily / Monthly Totals render */}
                        <td className="px-3 py-3 text-right text-slate-700 font-bold text-xs bg-slate-100/30 font-mono">
                          {formatValue(displayedTotals.stokKemarin)}
                        </td>

                        <td className="px-3 py-3 text-right font-extrabold text-xs text-emerald-700 bg-emerald-50/20 font-mono">
                          {formatValue((displayedTotals as any).mutasiQtyIn ?? 0)}
                        </td>

                        <td className="px-3 py-3 text-right font-extrabold text-xs text-rose-700 bg-rose-50/20 font-mono">
                          {formatValue((displayedTotals as any).mutasiQtyOut ?? 0)}
                        </td>

                        <td className="px-3 py-3 text-right text-slate-900 font-extrabold text-xs bg-emerald-50/20 font-mono">
                          {formatValue(displayedTotals.stokRill)}
                        </td>

                        <td className="px-3 py-3 text-right text-slate-800 font-bold text-xs bg-slate-100/50 font-mono">
                          {formatValue(displayedTotals.stockSistem)}
                        </td>

                        <td className={
                          `px-3 py-3 text-right text-xs font-extrabold font-mono ${
                            displayedTotals.selisih === 0 ? "text-emerald-700" : "text-rose-700"
                          }`
                        }>
                          {displayedTotals.selisih === 0 ? '0' : formatValue(displayedTotals.selisih)}
                        </td>

                        <td className="px-3 py-3 text-center text-slate-400 font-normal text-xs italic">
                          —
                        </td>
                      </>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination controls */}
        {!loading && (activeItemsCount > 0) && (
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <select 
                value={pageSize} 
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-900 font-semibold text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={50}>50 baris / hal</option>
                <option value={100}>100 baris / hal</option>
                <option value={200}>200 baris / hal</option>
                <option value={500}>500 baris / hal</option>
                <option value={10000}>Tampilkan Semua ({activeItemsCount} baris)</option>
              </select>
              <span>
                Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, activeItemsCount)} dari {activeItemsCount} baris
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-1.5 border border-slate-200 rounded-md bg-white text-sm font-semibold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Sebelumnya
              </button>
              <div className="text-xs text-slate-500 px-2 font-bold whitespace-nowrap">
                Halaman {currentPage} dari {totalPages || 1}
              </div>
              <button 
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3.5 py-1.5 border border-slate-200 rounded-md bg-white text-sm font-semibold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* HISTORI SESI REKONSILIASI TERKUNCI REGISTER SECTION */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-extrabold text-slate-800">
              Histori Pencocokan Terkunci & Tersimpan
            </h3>
          </div>
          <span className="text-[10px] sm:text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
            Cloud & Local Sync Active
          </span>
        </div>

        {loadingSessions ? (
          <div className="py-6 flex justify-center items-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Memuat histori dari database...</span>
          </div>
        ) : savedSessions.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm italic">
            Belum ada pencocokan terkunci yang disimpan. Klik tombol "Kunci & Simpan Sesi" di bagian atas untuk menyimpan status rekonsiliasi saat ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedSessions.map((sess) => (
              <div 
                key={sess.id} 
                className={
                  `border rounded-xl p-4 flex flex-col justify-between transition-all shadow-sm ${
                    activeSavedSession?.id === sess.id ? "border-amber-400 bg-amber-50/25 ring-1 ring-amber-400" : "border-slate-200 hover:border-slate-300 bg-white"
                  }`
                }
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-900 text-sm truncate max-w-[200px]" title={sess.name}>
                      {sess.name}
                    </span>
                    <span className={
                      `px-2 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 tracking-wider ${
                        sess.type === 'daily' ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                      }`
                    }>
                      {sess.type === 'daily' ? 'Harian' : 'Bulanan'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-xs text-slate-500 mt-2.5 font-medium">
                    <div>Area: <strong className="text-slate-800 uppercase">{sess.area}</strong></div>
                    <div>Periode: <strong className="text-slate-800 font-mono">{formatToDDMMYYYY(sess.date)}</strong></div>
                    <div>Kombinasi: <strong>{sess.grandTotals?.itemCount ?? sess.items?.length ?? 0} SKU</strong></div>
                    <div>Simpanan: <strong>{sess.fireId ? 'Server Cloud' : 'Browser Lokal'}</strong></div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-1 bg-slate-50 rounded-lg p-2 text-center text-[11px] font-mono">
                    <div>
                      <div className="font-semibold text-[9px] text-slate-400 uppercase">Awal</div>
                      <div className="font-bold text-slate-800">{(sess.grandTotals?.stokKemarin ?? (sess.grandTotals?.stokRill - sess.grandTotals?.mutasiQty) ?? 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[9px] text-slate-400 uppercase">Mutasi</div>
                      <div className="font-bold text-slate-800">{(sess.grandTotals?.mutasiQty || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[9px] text-slate-400 uppercase">Selisih</div>
                      <div className={cn("font-bold", sess.grandTotals?.selisih === 0 ? "text-emerald-700" : "text-rose-700")}>
                        {(sess.grandTotals?.selisih || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-2 border-t border-slate-100">
                  {activeSavedSession?.id === sess.id ? (
                    <button
                      type="button"
                      onClick={() => setActiveSavedSession(null)}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors focus:ring-2 focus:ring-amber-500"
                    >
                      <Undo className="w-3.5 h-3.5 text-white" />
                      Tutup Arsip
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSavedSession(sess);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors focus:ring-2 focus:ring-blue-500"
                    >
                      <History className="w-3.5 h-3.5 text-white" />
                      Buka Sesi
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(sess)}
                    className="p-1.5 border border-slate-200 rounded-lg hover:bg-rose-50 hover:text-rose-700 text-slate-400 transition-colors focus:outline-none"
                    title="Hapus Arsip Sesi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-slate-600 text-xs sm:text-sm">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-800">Keterangan Prosedur Rekonsiliasi:</span> Kolom <span className="font-bold">Mutasi</span> menghitung transaksi IN/OUT yang dicatat di tanggal/bulan berjalan. Kolom <span className="font-bold">Stok Rill (Kemarin atau Awal Bulan)</span> dihitung dari akumulasi transaksi sebelum batas interval. Selisih dihitung terhadap <span className="font-bold">Stok Sistem (MTS)</span> dari Google Sheets. Data ini dapat Anda simpan secara permanen ke database lokal & cloud dengan mengklik tombol "Kunci & Simpan Sesi".
        </div>
      </div>

      {/* SAVE SESSION DOCUMENTATION DIALOG/MODAL */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl w-full max-w-lg space-y-4 text-left my-8">
            <div className="flex items-center gap-3 text-emerald-800 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-emerald-100 rounded-full text-emerald-700 col-span-1">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-950">Kunci & Simpan Rekonsiliasi</h3>
                <p className="text-xs text-slate-500">
                  Data status pencocokan akan terkunci secara permanen sebagai arsip snapshot historis.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Nama Sesi Terkunci
              </label>
              <input 
                type="text" 
                value={sessionNameInput}
                onChange={e => setSessionNameInput(e.target.value)}
                placeholder="Masukkan deskripsi nama arsip..."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none sm:text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Saran nama default menyertakan jenis laporan, area, dan date filter saat ini.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs leading-relaxed font-mono space-y-1 text-slate-700">
              <div>• Total item: <strong>{filteredReconciliation.length}</strong></div>
              <div>• Grand Total Rill: <strong>{grandTotals.stokRill.toLocaleString()} unit</strong></div>
              <div>• Grand Total Sistem: <strong>{grandTotals.stockSistem.toLocaleString()} unit</strong></div>
              <div>• Grand Total Selisih: <strong className={grandTotals.selisih === 0 ? "text-emerald-700" : "text-rose-700"}>{grandTotals.selisih.toLocaleString()}</strong></div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-sm rounded-lg transition-colors focus:outline-none"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSessionConfirm}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors focus:ring-2 focus:ring-emerald-500"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Simpan & Kunci
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PencocokanData);
