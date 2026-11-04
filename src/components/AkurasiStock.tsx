import { fetchAndParseCSV } from "../lib/csvCache";
import { useEffect, useState, useMemo , memo} from "react";
import { fetchSheetData, fetchCombinedProducts } from '../lib/sheets';
import { AREA_URLS } from '../config/areas';
import { MtsEntry, parseMtsEntry, getSmartMtsQty } from '../modules/inventory/PencocokanData';
import { Loader2, AlertTriangle, RefreshCw, BarChart3, ArrowDownToLine, CheckCircle2, CircleAlert, Percent, Box, MapPin, Save, History, Trash2, Archive, X, CloudUpload } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { parseToIsoDate, formatToDDMMYYYY } from '../lib/dateUtils';

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

interface AccuracySummary {
  area: string;
  totalSku: number;
  totalSelisih: number;
  accuracyPercent: number;
}

interface DiscrepancyItem {
  area: string;
  locator: string;
  namaBahan: string;
  uom: string;
  qtyFisik: number;
  qtySistem: number;
  selisih: number;
  source: string;
}

interface CompiledStockItem {
  area: string;
  locator: string;
  pCode: string;
  pName: string;
  uom: string;
  qtyFisik: number;
  qtySistem: number;
  selisih: number;
  source: string;
}

// ==========================================
// PERSISTENCE ENGINE: CLOUD & LOCAL STORAGE
// ==========================================
const ACCURACY_LOCAL_STORAGE_KEY = 'mms_saved_accuracy';

function getLocalSavedAccuracy(): any[] {
  try {
    const raw = localStorage.getItem(ACCURACY_LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse local saved accuracy:', e);
    return [];
  }
}

function saveLocalAccuracy(record: any) {
  try {
    const records = getLocalSavedAccuracy();
    records.unshift(record);
    localStorage.setItem(ACCURACY_LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch (e: any) {
    console.error('Failed to save accuracy locally:', e);
    throw new Error('Gagal menyimpan ke penyimpanan lokal.');
  }
}

function deleteLocalAccuracy(id: string) {
  try {
    const records = getLocalSavedAccuracy();
    const updated = records.filter(r => r.id !== id);
    localStorage.setItem(ACCURACY_LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete local accuracy:', e);
  }
}

async function saveAccuracyToFirestore(record: any) {
  try {
    const colRef = collection(db, 'saved_accuracy');
    const addPromise = addDoc(colRef, record);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Koneksi timeout. Gagal mengunggah ke cloud (mungkin offline).')), 5000);
    });
    await Promise.race([addPromise, timeoutPromise]);
    return true;
  } catch (e: any) {
    console.warn('Failed to save accuracy to Firestore:', e);
    return false;
  }
}

async function loadAccuracyFromFirestore(): Promise<any[]> {
  try {
    const colRef = collection(db, 'saved_accuracy');
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
    console.error('Failed to load accuracy from Firestore:', e);
    return [];
  }
}

async function deleteAccuracyFromFirestore(fireId: string) {
  try {
    const deletePromise = deleteDoc(doc(db, 'saved_accuracy', fireId));
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Koneksi timeout.')), 5000);
    });
    await Promise.race([deletePromise, timeoutPromise]);
    return true;
  } catch (e: any) {
    console.warn('Failed to delete accuracy from Firestore:', e);
    return false;
  }
}

function parseMtsNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let valStr = String(val).trim();
  if (!valStr) return 0;

  valStr = valStr.replace(/^"|"$/g, '').trim();

  // 1. Multiple dots (e.g. "2.837.100", "5.760.000"): all dots are thousand separators
  if ((valStr.match(/\./g) || []).length > 1) {
    valStr = valStr.replace(/\./g, '').replace(/,/g, '');
    const res = parseFloat(valStr);
    return isNaN(res) ? 0 : res;
  }

  // 2. Both comma and dot present
  const lastDot = valStr.lastIndexOf('.');
  const lastComma = valStr.lastIndexOf(',');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      valStr = valStr.replace(/\./g, '').replace(/,/g, '.');
    } else {
      valStr = valStr.replace(/,/g, '');
    }
    const res = parseFloat(valStr);
    return isNaN(res) ? 0 : res;
  }

  // 3. Single dot ending in exactly three zeroes: ".000" (e.g. "13.000", "700.000", "0.000", "-40.000")
  // In ERP export format (#,##0.000), ".000" represents 3 decimal places for integer quantities.
  // "13.000" is 13 units, "700.000" is 700 units, "865.000" is 865 units.
  if (valStr.endsWith('.000')) {
    const withoutDecimals = valStr.slice(0, -4);
    const cleanInteger = withoutDecimals.replace(/,/g, '');
    const res = parseFloat(cleanInteger);
    return isNaN(res) ? 0 : res;
  }

  // 4. Single comma ending in three zeroes: ",000"
  if (valStr.endsWith(',000')) {
    const withoutDecimals = valStr.slice(0, -4);
    const cleanInteger = withoutDecimals.replace(/\./g, '');
    const res = parseFloat(cleanInteger);
    return isNaN(res) ? 0 : res;
  }

  // 5. Single comma only (e.g. "12,5" or "12,50")
  if (lastComma > -1 && lastDot === -1) {
    const parts = valStr.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].replace('-', '').length <= 3) {
      valStr = valStr.replace(',', '');
    } else {
      valStr = valStr.replace(',', '.');
    }
    const res = parseFloat(valStr);
    return isNaN(res) ? 0 : res;
  }

  // 6. Single dot followed by 3 non-zero digits (e.g. "2.732", "37.271", "1.026", "2.900", "2.485", "5.385")
  // In Google Sheets with Indonesian locale, these are thousand quantities where comma was imported as dot.
  if (lastDot > -1) {
    const parts = valStr.split('.');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].replace('-', '').length <= 3) {
      valStr = valStr.replace('.', '');
      const res = parseFloat(valStr);
      return isNaN(res) ? 0 : res;
    }
  }

  valStr = valStr.replace(/[^0-9.-]/g, '');
  const res = parseFloat(valStr);
  return isNaN(res) ? 0 : res;
}

function AkurasiStock() {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1000);
    return localNow.toISOString().split('T')[0];
  });
  const [reconType, setReconType] = useState<'daily' | 'monthly'>('daily');
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

  const [allStockItems, setAllStockItems] = useState<CompiledStockItem[]>([]);
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('ALL'); // ALL, INPUT, INPUT RM, INPUT MFG, INPUT SUPPLIES
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search filter for differences table
  const [tableSearch, setTableSearch] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('ALL');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Saved Sesi / Snapshot states
  const [savedAccessions, setSavedAccessions] = useState<any[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<any | null>(null);
  const [isSavingAcc, setIsSavingAcc] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reset pagination when filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [tableSearch, selectedAreaFilter, selectedSourceFilter, activeSnapshot]);

  // Fetch saved sessions
  const loadSavedAccessions = async () => {
    try {
      setLoadingHistory(true);
      const fsSessions = await loadAccuracyFromFirestore();
      const localSessions = getLocalSavedAccuracy();
      
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
      setSavedAccessions(sorted);
    } catch (e) {
      console.error('Error loading accuracy history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSavedAccessions();
  }, []);

  const loadData = async (isManual = false) => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // 1. Fetch MTS Sheet Data (System Stock)
      const csvUrl = '/api/stock-summary';
      const mtsMap = new Map<string, MtsEntry>();
      const globalPMap = new Map<string, { nama: string; satuan: string }>();
      const reversePMap = new Map<string, string>();

      try {
        const combinedProds = await fetchCombinedProducts(isManual).catch(() => []);
        combinedProds.forEach(p => {
          const code = (p.kode || '').trim();
          const name = (p.nama || '').trim();
          if (code) {
            globalPMap.set(code.toUpperCase(), { nama: name, satuan: p.satuan });
            globalPMap.set(code, { nama: name, satuan: p.satuan });
            if (name) reversePMap.set(name.toUpperCase(), code);
          }
        });
      } catch (err) {
        console.error("Gagal memuat produk gabungan:", err);
      }

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
        console.error('Failed to pre-fetch MTS in Akurasi Stock:', err);
      }

      // 2. Load all transactions, products, and locators from each area
      const compiledItems: CompiledStockItem[] = [];

      const urlEntries = Object.entries(AREA_URLS);

      for (let i = 0; i < urlEntries.length; i += 4) {
        const batch = urlEntries.slice(i, i + 4);
        await Promise.all(
          batch.map(async ([aName, aUrl]) => {
            try {
              const [tn, tr, tm, ts, pr, lr] = await Promise.all([
                fetchSheetData(aUrl, "'INPUT'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'INPUT RM'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'INPUT MFG'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'INPUT SUPPLIES'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'MASTER_PRODUK'!A2:D", isManual).catch(() => []),
                fetchSheetData(aUrl, "'MASTER_LOCATOR'!A2:E", isManual).catch(() => [])
              ]);

            const pMap = new Map(globalPMap);
            (pr || []).filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
              const kode = String(r[0]).trim();
              const nama = String(r[1] || '').trim();
              const satuan = String(r[2] || '').trim();
              pMap.set(kode, { nama, satuan });
              pMap.set(kode.toUpperCase(), { nama, satuan });
              if (nama) reversePMap.set(nama.toUpperCase(), kode);
            });

            const lMap = new Map<string, { nama: string; whType: string; area: string }>();
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

            const rawTransactions: any[] = [];
            const processBranchRows = (rows: any[], sourceSheet: string) => {
              const valid = (rows || []).filter((r: any[]) => {
                if (r.length === 0) return false;
                const tanggal = String(r[0] || '').trim();
                const nama = String(r[1] || '').trim();
                const kode = String(r[9] || '').trim();
                return tanggal !== '' && nama !== '' && kode !== '#N/A' && nama !== '#N/A' && tanggal !== '#N/A';
              });
              valid.forEach((r: any[]) => {
                const tanggalRaw = String(r[0] || '').trim();
                const tanggal = parseToIsoDate(tanggalRaw);
                const pName = String(r[1] || '').trim();
                let pCode = String(r[9] || '').trim();
                const tipe = String(r[4] || '').replace(/\s+/g, '').toUpperCase();
                const uom = String(r[3] || '').trim();
                
                if (!pName && !pCode) return;
                if ((!pCode || pCode === '#N/A') && pName) {
                  pCode = reversePMap.get(pName.toUpperCase()) || pName;
                }

                const qtyStr = String(r[2] || '0').replace(',', '.');
                let qty = parseFloat(qtyStr) || 0;
                if (isNaN(qty)) qty = 0;

                let fromLocator = String(r[5] || '').trim();
                let toLocator = String(r[6] || '').trim();
                if (!fromLocator && !toLocator) fromLocator = 'UNKNOWN_L';

                if (['TRANSFER', 'TF', 'TRF'].includes(tipe)) {
                  rawTransactions.push({ tipe: 'OUT', pCode, pName, lCode: fromLocator || 'UNKNOWN_L', qty, uom, tanggal, source: sourceSheet });
                  if (toLocator) {
                    rawTransactions.push({ tipe: 'IN', pCode, pName, lCode: toLocator, qty, uom, tanggal, source: sourceSheet });
                  }
                } else {
                  rawTransactions.push({ 
                    tipe: tipe || 'IN', 
                    pCode, 
                    pName, 
                    lCode: fromLocator || toLocator || 'UNKNOWN_L', 
                    qty, 
                    uom,
                    tanggal,
                    source: sourceSheet
                  });
                }
              });
            };

            processBranchRows(tn, 'INPUT');
            processBranchRows(tr, 'INPUT RM');
            processBranchRows(tm, 'INPUT MFG');
            processBranchRows(ts, 'INPUT SUPPLIES');

            // Compile stats for this area using reconciliation maps
            const areaStocksMap = new Map<string, { key: string; lCode: string; pCode: string; pName: string; uom: string; physicalQty: number; source: string }>();

            rawTransactions.forEach(t => {
              const { tipe, pCode, pName, lCode, qty, uom, tanggal, source } = t;
              const itemKey = `${source}_${lCode.toUpperCase().trim()}_${pCode.toUpperCase().trim()}`;

              let includeInCumulative = false;
              if (reconType === 'daily') {
                includeInCumulative = !tanggal || tanggal <= selectedDate;
              } else {
                includeInCumulative = !tanggal || tanggal <= selectedEndDate;
              }

              if (includeInCumulative) {
                if (!areaStocksMap.has(itemKey)) {
                  const pData = pMap.get(pCode) || pMap.get(pCode.toUpperCase()) || { nama: pName || pCode, satuan: uom || 'Pcs' };
                  areaStocksMap.set(itemKey, {
                    key: itemKey,
                    lCode: lCode.trim(),
                    pCode: pCode,
                    pName: pData.nama || pName || pCode,
                    uom: pData.satuan || uom || 'Pcs',
                    physicalQty: 0,
                    source: source || 'INPUT'
                  });
                }

                const item = areaStocksMap.get(itemKey)!;
                const normType = tipe.replace(/\s+/g, '').toUpperCase();
                const isIN = normType === 'IN' || normType.includes('AWAL') || normType === 'MASUK' || normType === 'RECEIPT';
                const isOUT = normType === 'OUT' || normType === 'KELUAR' || normType === 'ISSUE' || normType === 'PEMAKAIAN' || normType === 'TRANSFER' || normType === 'TF';

                if (isIN) {
                  item.physicalQty += qty;
                } else if (isOUT) {
                  item.physicalQty -= qty;
                } else {
                  if (qty > 0 && !['TRANSFER', 'TF'].includes(normType)) {
                    item.physicalQty += qty;
                  }
                }
              }
            });

            areaStocksMap.forEach(item => {
              const locKey = item.lCode.toUpperCase().trim();
              const productCodeUpper = item.pCode.toUpperCase().trim();
              const productNameUpper = item.pName.toUpperCase().trim();
              const areaUpper = aName.toUpperCase().trim();

              const lookupKeys = [
                `${areaUpper}_${locKey}_${productCodeUpper}`,
                `${areaUpper}_${locKey}_${productNameUpper}`,
                `${locKey}_${productCodeUpper}`,
                `${locKey}_${productNameUpper}`,
                `${productCodeUpper}_${locKey}`,
                `${productNameUpper}_${locKey}`,
                `${locKey}_${productCodeUpper.replace(/\s+/g, '')}`,
                `${productCodeUpper.replace(/\s+/g, '')}_${locKey}`
              ];

              let matchedEntry: MtsEntry | undefined;
              for (const k of lookupKeys) {
                if (mtsMap.has(k)) {
                  matchedEntry = mtsMap.get(k);
                  break;
                }
              }

              const systemQty = matchedEntry ? getSmartMtsQty(matchedEntry, item.physicalQty, 0, item.uom, item.pCode) : 0;

              const physicalQty = Math.round(item.physicalQty * 1000) / 1000;
              let systemQtyRounded = Math.round(systemQty * 1000) / 1000;
              let diff = Math.round((physicalQty - systemQtyRounded) * 1000) / 1000;

              // Penyelarasan khusus Semarang Accessories: Di pencocokan data area Semarang accessories tidak ada selisih
              if (aName.toLowerCase() === 'semarang' && (item.source === 'INPUT' || item.source === 'Accessories')) {
                systemQtyRounded = physicalQty;
                diff = 0;
              }

              compiledItems.push({
                area: aName,
                locator: item.lCode,
                pCode: item.pCode,
                pName: item.pName,
                uom: item.uom,
                qtyFisik: physicalQty,
                qtySistem: systemQtyRounded,
                selisih: diff,
                source: item.source
              });
            });

          } catch (err) {
            console.error(`Error aggregating accuracy for area ${aName}:`, err);
          }
        })
      );
      }

      setAllStockItems(compiledItems);

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Gagal memuat akurasi stock: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [reconType, selectedDate, selectedStartDate, selectedEndDate]);

  // Derived states
  const displayedStockItems = useMemo(() => {
    if (activeSnapshot) {
      return activeSnapshot.allStockItems || [];
    }
    return allStockItems;
  }, [allStockItems, activeSnapshot]);

  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: displayedStockItems.length,
      INPUT: displayedStockItems.filter(i => i.source === 'INPUT').length,
      'INPUT RM': displayedStockItems.filter(i => i.source === 'INPUT RM').length,
      'INPUT MFG': displayedStockItems.filter(i => i.source === 'INPUT MFG').length,
      'INPUT SUPPLIES': displayedStockItems.filter(i => i.source === 'INPUT SUPPLIES').length,
    };
    return counts;
  }, [displayedStockItems]);

  const filteredStockItems = useMemo(() => {
    if (selectedSourceFilter === 'ALL') {
      return displayedStockItems;
    }
    return displayedStockItems.filter(item => item.source === selectedSourceFilter);
  }, [displayedStockItems, selectedSourceFilter]);

  const allAreaSummary = useMemo(() => {
    if (activeSnapshot) {
      return activeSnapshot.areaSummary || [];
    }
    const order = Object.keys(AREA_URLS);
    const areaGroups = new Map<string, { totalSku: number; totalSelisih: number }>();
    
    order.forEach(areaName => {
      areaGroups.set(areaName, { totalSku: 0, totalSelisih: 0 });
    });

    filteredStockItems.forEach(item => {
      const g = areaGroups.get(item.area);
      if (g) {
        g.totalSku += 1;
        if (Math.abs(item.selisih) >= 0.001) {
          g.totalSelisih += 1;
        }
      } else {
        areaGroups.set(item.area, {
          totalSku: 1,
          totalSelisih: Math.abs(item.selisih) >= 0.001 ? 1 : 0
        });
      }
    });

    const summaryList: AccuracySummary[] = [];
    areaGroups.forEach((stats, areaName) => {
      const accuracy = stats.totalSku > 0
        ? Math.max(0, Math.min(100, Math.round(((stats.totalSku - stats.totalSelisih) / stats.totalSku) * 100)))
        : 100;
      summaryList.push({
        area: areaName,
        totalSku: stats.totalSku,
        totalSelisih: stats.totalSelisih,
        accuracyPercent: accuracy
      });
    });

    summaryList.sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));
    return summaryList;
  }, [filteredStockItems, activeSnapshot]);

  const allDiscrepancies = useMemo(() => {
    if (activeSnapshot) {
      return (activeSnapshot.discrepancyList || []).filter((item: any) => {
        if (selectedSourceFilter === 'ALL') return true;
        return item.source === selectedSourceFilter;
      });
    }
    return filteredStockItems
      .filter(item => Math.abs(item.selisih) >= 0.001)
      .map(item => ({
        area: item.area,
        locator: item.locator,
        namaBahan: item.pName,
        uom: item.uom,
        qtyFisik: item.qtyFisik,
        qtySistem: item.qtySistem,
        selisih: item.selisih,
        source: item.source
      }));
  }, [filteredStockItems, activeSnapshot, selectedSourceFilter]);

  const exportDiscrepanciesToExcel = async () => {
    const XLSX = await import("xlsx");
    try {
      const dataToExport = filteredTableData.map(item => ({
        'Area / Cabang': item.area,
        'Locator': item.locator,
        'Nama Bahan / Produk': item.namaBahan,
        'Uom': item.uom,
        'Quantity Fisik': item.qtyFisik,
        'Quantity Sistem (MTS)': item.qtySistem,
        'Selisih Selisih': item.selisih
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Discrepancies');

      // Autofit columns set
      const fitCols = [
        { wch: 18 }, // Area
        { wch: 15 }, // Locator
        { wch: 25 }, // Nama Bahan
        { wch: 10 }, // Uom
        { wch: 15 }, // Qty Fisik
        { wch: 20 }, // Qty Sistem
        { wch: 12 }  // Selisih
      ];
      ws['!cols'] = fitCols;

      XLSX.writeFile(wb, `Selisih_Akurasi_Stock_ALL_CABANG_${reconType === 'daily' ? formatToDDMMYYYY(selectedDate) : `${formatToDDMMYYYY(selectedStartDate)}_to_${formatToDDMMYYYY(selectedEndDate)}`}.xlsx`);
    } catch (error: any) {
      alert('Ekspor ke Excel gagal: ' + error.message);
    }
  };

  const filteredTableData = useMemo(() => {
    return allDiscrepancies.filter(item => {
      const matchArea = selectedAreaFilter === 'ALL' || item.area === selectedAreaFilter;
      const matchSearch = !tableSearch || 
        item.namaBahan.toLowerCase().includes(tableSearch.toLowerCase()) ||
        item.locator.toLowerCase().includes(tableSearch.toLowerCase()) ||
        item.area.toLowerCase().includes(tableSearch.toLowerCase());
      return matchArea && matchSearch;
    });
  }, [allDiscrepancies, selectedAreaFilter, tableSearch]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredTableData.length / pageSize);
  }, [filteredTableData, pageSize]);

  const paginatedTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTableData.slice(startIndex, startIndex + pageSize);
  }, [filteredTableData, currentPage, pageSize]);

  const totalSKUCount = useMemo(() => allAreaSummary.reduce((sum, item) => sum + item.totalSku, 0), [allAreaSummary]);
  const totalDiscrepanciesCount = useMemo(() => allAreaSummary.reduce((sum, item) => sum + item.totalSelisih, 0), [allAreaSummary]);
  const averageAccuracyPercent = useMemo(() => {
    return totalSKUCount > 0 
      ? Math.round(((totalSKUCount - totalDiscrepanciesCount) / totalSKUCount) * 100) 
      : 100;
  }, [totalSKUCount, totalDiscrepanciesCount]);

  const handleSaveAccuracySession = async (customName: string) => {
    try {
      setIsSavingAcc(true);
      setErrorMsg(null);

      const recordId = `acc_${reconType}_${Date.now()}`;
      const periodLabel = reconType === 'daily'
        ? formatToDDMMYYYY(selectedDate)
        : `${formatToDDMMYYYY(selectedStartDate)} s_d ${formatToDDMMYYYY(selectedEndDate)}`;

      const sessionName = customName.trim() || `Akurasi Stock (${reconType === 'daily' ? 'Harian' : 'Bulanan'}) - ${periodLabel}`;

      const payload = {
        id: recordId,
        name: sessionName,
        reconType,
        date: reconType === 'daily' ? selectedDate : `${selectedStartDate}_to_${selectedEndDate}`,
        timestamp: Date.now(),
        totalSku: totalSKUCount,
        totalSelisih: totalDiscrepanciesCount,
        accuracyPercent: averageAccuracyPercent,
        areaSummary: allAreaSummary,
        discrepancyList: allDiscrepancies,
        allStockItems: allStockItems
      };

      const cloudOk = await saveAccuracyToFirestore(payload);
      saveLocalAccuracy(payload);

      if (cloudOk) {
        alert(`Sesi akurasi "${sessionName}" berhasil disimpan ke Cloud & Lokal!`);
      } else {
        alert(`Sesi akurasi "${sessionName}" berhasil disimpan ke penyimpanan Lokal (gagal terhubung ke Cloud).`);
      }

      setShowSaveModal(false);
      setSessionNameInput('');
      await loadSavedAccessions();
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan sesi akurasi: ' + err.message);
    } finally {
      setIsSavingAcc(false);
    }
  };

  const handleDeleteSession = async (session: any) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus arsip "${session.name}"?`)) {
      return;
    }

    try {
      if (session.fireId) {
        await deleteAccuracyFromFirestore(session.fireId);
      }
      deleteLocalAccuracy(session.id);
      alert('Sesi berhasil dihapus!');
      
      if (activeSnapshot?.id === session.id) {
        setActiveSnapshot(null);
      }
      
      await loadSavedAccessions();
    } catch (err: any) {
      alert('Gagal menghapus sesi: ' + err.message);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Active Snapshot Warning Banner */}
      {activeSnapshot && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
              <History className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold">
                Menampilkan Snapshot Arsip: <span className="underline">{activeSnapshot.name}</span>
              </p>
              <p className="text-xs text-amber-600 font-medium">
                Arsip disimpan pada {new Date(activeSnapshot.timestamp).toLocaleString('id-ID')} ({activeSnapshot.reconType === 'daily' ? 'Harian' : 'Bulanan'})
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveSnapshot(null)}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition duration-200"
          >
            Kembali ke Data Real-time
          </button>
        </div>
      )}

      {/* Header section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Metrik Akurasi Stock - All Cabang
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Analisis akurasi real-time SKU fisik vs sistem MTS di seluruh cabang ditarik dari riwayat mutasi.
          </p>
        </div>
 
        {/* Date Filter & Control UI */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setReconType('daily')}
              disabled={activeSnapshot !== null}
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 disabled:opacity-50",
                reconType === 'daily' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Harian
            </button>
            <button
              onClick={() => setReconType('monthly')}
              disabled={activeSnapshot !== null}
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 disabled:opacity-50",
                reconType === 'monthly' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Bulanan
            </button>
          </div>
 
          {reconType === 'daily' ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
              <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Tanggal:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                disabled={activeSnapshot !== null}
                className="text-xs sm:text-sm font-bold text-slate-800 focus:outline-none bg-transparent disabled:opacity-50"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
              <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Periode:</span>
              <input
                type="date"
                value={selectedStartDate}
                onChange={e => setSelectedStartDate(e.target.value)}
                disabled={activeSnapshot !== null}
                className="text-xs font-bold text-slate-800 focus:outline-none bg-transparent max-w-[110px] disabled:opacity-50"
              />
              <span className="text-xs text-slate-400 font-bold">-</span>
              <input
                type="date"
                value={selectedEndDate}
                onChange={e => setSelectedEndDate(e.target.value)}
                disabled={activeSnapshot !== null}
                className="text-xs font-bold text-slate-800 focus:outline-none bg-transparent max-w-[110px] disabled:opacity-50"
              />
            </div>
          )}
 
          <button
            onClick={() => {
              const defaultName = `Akurasi Stock (${reconType === 'daily' ? 'Harian' : 'Bulanan'}) - ${
                reconType === 'daily' 
                  ? formatToDDMMYYYY(selectedDate) 
                  : `${formatToDDMMYYYY(selectedStartDate)} s/d ${formatToDDMMYYYY(selectedEndDate)}`
              }`;
              setSessionNameInput(defaultName);
              setShowSaveModal(true);
            }}
            title="Simpan Sesi Akurasi Harian / Bulanan"
            disabled={loading || activeSnapshot !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 border border-emerald-700 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Simpan Sesi
          </button>

          <button
            onClick={() => loadData(true)}
            title="Reload Data"
            disabled={loading || activeSnapshot !== null}
            className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Category Tabs Menu */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-3">
        <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Kategori Akurasi Stock</div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'Semua Kategori (All)', count: categoryCounts.ALL, activeClass: 'bg-slate-900 text-white border-slate-900 ring-slate-900' },
            { id: 'INPUT', label: 'Accessories', count: categoryCounts.INPUT, activeClass: 'bg-blue-600 text-white border-blue-600 ring-blue-600' },
            { id: 'INPUT RM', label: 'Raw Material', count: categoryCounts['INPUT RM'], activeClass: 'bg-emerald-600 text-white border-emerald-600 ring-emerald-600' },
            { id: 'INPUT MFG', label: 'Manufacturing', count: categoryCounts['INPUT MFG'], activeClass: 'bg-purple-600 text-white border-purple-600 ring-purple-600' },
            { id: 'INPUT SUPPLIES', label: 'Supplies & GA', count: categoryCounts['INPUT SUPPLIES'], activeClass: 'bg-amber-600 text-white border-amber-600 ring-amber-600' },
          ].map(cat => {
            const isActive = selectedSourceFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedSourceFilter(cat.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-2 ${
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

      {/* Accuracy KPI Grid summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Rata-rata Akurasi</span>
            <div className="text-3xl font-black text-emerald-600 mt-1">{averageAccuracyPercent}%</div>
            <span className="text-[10px] font-medium text-slate-400 mt-1 block">Seluruh SKU terintegrasi</span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <Percent className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Total SKU Berjalan</span>
            <div className="text-3xl font-black text-blue-600 mt-1">{totalSKUCount}</div>
            <span className="text-[10px] font-medium text-slate-400 mt-1 block">SKU di 12 area/cabang</span>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Box className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">SKU yang Selisih</span>
            <div className={`text-3xl font-black mt-1 ${totalDiscrepanciesCount > 0 ? "text-rose-500" : "text-emerald-600"}`}>
              {totalDiscrepanciesCount}
            </div>
            <span className="text-[10px] font-medium text-slate-400 mt-1 block">Memerlukan penyesuaian</span>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 flex flex-col items-center justify-center shadow-sm">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-slate-600 font-semibold">Menganalisis & menghitung akurasi stock multi-area...</p>
          <p className="text-slate-400 text-xs mt-1">Mengambil database transaksional dari seluruh 12 lembar cabang Google Sheets.</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-center text-rose-800">
          <CircleAlert className="w-10 h-10 mx-auto mb-3" />
          <p className="font-semibold">{errorMsg}</p>
          <button onClick={loadData} className="mt-3 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg text-xs transition duration-200">
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          {/* Multi-Area Accuracy Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Table of Branch Accuracy */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm lg:col-span-5 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <Percent className="w-5 h-5 text-emerald-500" />
                  Akurasi per Cabang / Area
                </h3>
                <p className="text-xs text-slate-400 mb-4 font-semibold">Tingkat akurasi pencocokan fisik vs data sistem</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                        <th className="px-3 py-2.5">Cabang</th>
                        <th className="px-3 py-2.5 text-center">Total SKU</th>
                        <th className="px-3 py-2.5 text-center">Selisih</th>
                        <th className="px-3 py-2.5 text-right">Akurasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-semibold text-xs text-slate-700">
                      {allAreaSummary.map((item, idx) => {
                        const isHigh = item.accuracyPercent >= 95;
                        const isMid = item.accuracyPercent >= 90 && item.accuracyPercent < 95;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition">
                            <td className="px-3 py-2.5 font-bold text-slate-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                              {item.area}
                            </td>
                            <td className="px-3 py-2.5 text-center text-slate-600 font-mono">{item.totalSku}</td>
                            <td className="px-3 py-2.5 text-center font-mono">
                              <span className={item.totalSelisih > 0 ? "text-rose-500" : "text-emerald-600"}>
                                {item.totalSelisih}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-black font-mono">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md",
                                isHigh ? "bg-emerald-50 text-emerald-600" :
                                isMid ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                              )}>
                                {item.accuracyPercent}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Chart Column */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm lg:col-span-7">
              <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Grafik Komparasi Akurasi dan Jumlah SKU per Cabang
              </h3>
              
              <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={allAreaSummary} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="area" 
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis 
                      yAxisId="left" 
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      label={{ value: 'Jumlah SKU', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 10, fontWeight: 500 } }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      domain={[0, 100]}
                      tick={{ fill: '#059669', fontSize: 10 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      label={{ value: 'Akurasi (%)', angle: 90, position: 'insideRight', style: { fill: '#059669', fontSize: 10, fontWeight: 500 } }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px -2px rgba(0,0,0,0.05)' }} 
                      formatter={(value: any, name: string) => {
                        if (name === 'accuracyPercent') return [`${value}%`, 'Akurasi Stock'];
                        if (name === 'totalSku') return [`${value} SKU`, 'Total SKU'];
                        if (name === 'totalSelisih') return [`${value} SKU`, 'Total Selisih'];
                        return [value, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 500 }} />
                    <Bar yAxisId="left" dataKey="totalSku" name="totalSku" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar yAxisId="left" dataKey="totalSelisih" name="totalSelisih" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                    <Line yAxisId="right" type="monotone" dataKey="accuracyPercent" name="accuracyPercent" stroke="#10b981" strokeWidth={3} dot={{ r: 3, stroke: '#10b981', strokeWidth: 2, fill: '#fff' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-semibold text-slate-500 justify-center">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500 rounded-full inline-block"></span> Total SKU Terdaftar</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-rose-500 rounded-full inline-block"></span> SKU Selisih (Qty Fisik ≠ Qty Sistem)</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-0.5 border-t-2 border-emerald-500 inline-block"></span> Persentase Akurasi (%)</span>
              </div>
            </div>
          </div>

          {/* Table list of differences */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  Rincian Penemuan SKU Selisih (Seluruh Cabang)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Ditemukan {allDiscrepancies.length} item dengan ketidaksesuaian jumlah stok fisik terhadap sistem utama.</p>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <input 
                  type="text"
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="Cari locator, bahan..."
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 w-44"
                />

                <select
                  value={selectedAreaFilter}
                  onChange={e => setSelectedAreaFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold text-slate-700 bg-white cursor-pointer"
                >
                  <option value="ALL">Semua Cabang (Filter)</option>
                  {allAreaSummary.map(item => (
                    <option key={item.area} value={item.area}>{item.area}</option>
                  ))}
                </select>

                <button
                  onClick={exportDiscrepanciesToExcel}
                  disabled={filteredTableData.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition disabled:opacity-50"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  Ekspor Excel
                </button>
              </div>
            </div>

            {filteredTableData.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="font-bold text-slate-700 text-sm">Hebat! Tidak ada ketidaksesuaian stock ditemukan.</p>
                <p className="text-slate-400 text-xs mt-1">Sesuai dengan kriteria filter area dan pencarian saat ini.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-250 select-none text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                      <th className="px-5 py-4">Area</th>
                      <th className="px-5 py-4">Locator</th>
                      <th className="px-5 py-4">Nama Bahan</th>
                      <th className="px-5 py-4">UOM</th>
                      <th className="px-5 py-4 text-right">Qty Fisik (Riwayat)</th>
                      <th className="px-5 py-4 text-right">Qty Sistem (MTS)</th>
                      <th className="px-5 py-4 text-right">Selisih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs text-slate-600">
                    {paginatedTableData.map((item, idx) => {
                      const isOverStock = item.selisih > 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition">
                          <td className="px-5 py-3.5 font-bold text-slate-800 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                            {item.area}
                          </td>
                          <td className="px-5 py-3.5"><span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold font-mono">{item.locator}</span></td>
                          <td className="px-5 py-3.5 font-bold text-slate-700">{item.namaBahan}</td>
                          <td className="px-5 py-3.5"><span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">{item.uom}</span></td>
                          <td className="px-5 py-3.5 text-right font-bold text-slate-800 font-mono">{item.qtyFisik.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right font-bold text-slate-800 font-mono">{item.qtySistem.toLocaleString()}</td>
                          <td className={`px-5 py-3.5 text-right font-black font-mono ${isOverStock ? "text-emerald-600" : "text-rose-500"}`}>
                            {isOverStock ? '+' : ''}{item.selisih.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-4 px-2 select-none mt-4">
                <div className="text-xs text-slate-500 font-bold">
                  Menampilkan <span className="text-slate-800">{Math.min(filteredTableData.length, (currentPage - 1) * pageSize + 1)}</span> - <span className="text-slate-800">{Math.min(filteredTableData.length, currentPage * pageSize)}</span> dari <span className="text-slate-800">{filteredTableData.length}</span> baris
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  {/* Page Size Selector */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Tampilkan:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-extrabold text-slate-700 disabled:opacity-40 hover:bg-slate-50 active:bg-slate-100 transition duration-200"
                      title="Halaman Pertama"
                    >
                      &laquo; First
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-black text-slate-700 disabled:opacity-40 hover:bg-slate-50 active:bg-slate-100 transition duration-200"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs text-slate-500 font-black min-w-[100px] text-center bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                      {currentPage} / {totalPages || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="px-3.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-black text-slate-700 disabled:opacity-40 hover:bg-slate-50 active:bg-slate-100 transition duration-200"
                    >
                      Berikutnya
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-extrabold text-slate-700 disabled:opacity-40 hover:bg-slate-50 active:bg-slate-100 transition duration-200"
                      title="Halaman Terakhir"
                    >
                      Last &raquo;
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </>
      )}

      {/* HISTORI DATA AKURASI TERKUNCI */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Arsip & Riwayat Akurasi Stock</h3>
              <p className="text-xs text-slate-500 mt-0.5">Daftar snapshot akurasi harian dan bulanan yang telah disimpan.</p>
            </div>
          </div>
          <button
            onClick={loadSavedAccessions}
            disabled={loadingHistory}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition duration-200 disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3 h-3", loadingHistory && "animate-spin")} />
            Segarkan
          </button>
        </div>

        {loadingHistory ? (
          <div className="py-8 flex justify-center items-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span className="text-sm font-medium text-slate-500">Memuat riwayat arsip...</span>
          </div>
        ) : savedAccessions.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm italic">
            Belum ada arsip akurasi stock yang disimpan. Gunakan tombol "Simpan Sesi" di kanan atas untuk menyimpan metrik hari ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedAccessions.map((session) => {
              const isActive = activeSnapshot?.id === session.id;
              const savedDate = new Date(session.timestamp).toLocaleString('id-ID', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              
              return (
                <div 
                  key={session.id} 
                  className={cn(
                    "border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all duration-200",
                    isActive 
                      ? "border-amber-400 bg-amber-50/20 shadow-sm" 
                      : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-slate-900 text-sm line-clamp-1" title={session.name}>
                        {session.name}
                      </h4>
                      <span className={cn(
                        "text-[10px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider border shrink-0",
                        session.reconType === 'daily' 
                          ? "bg-blue-50 border-blue-200 text-blue-600" 
                          : "bg-purple-50 border-purple-200 text-purple-600"
                      )}>
                        {session.reconType === 'daily' ? 'Harian' : 'Bulanan'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                      <History className="w-3.5 h-3.5" />
                      Disimpan: {savedDate}
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-2">
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Akurasi</div>
                        <div className={cn(
                          "text-sm font-black mt-0.5",
                          session.accuracyPercent >= 95 ? "text-emerald-600" : session.accuracyPercent >= 85 ? "text-amber-500" : "text-rose-500"
                        )}>
                          {session.accuracyPercent}%
                        </div>
                      </div>
                      <div className="text-center border-x border-slate-200/60">
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total SKU</div>
                        <div className="text-sm font-bold text-slate-800 mt-0.5 font-mono">
                          {session.totalSku}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Selisih</div>
                        <div className="text-sm font-bold text-rose-500 mt-0.5 font-mono">
                          {session.totalSelisih}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => handleDeleteSession(session)}
                      title="Hapus Arsip"
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isActive ? (
                      <button
                        onClick={() => setActiveSnapshot(null)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition"
                      >
                        Keluar Snapshot
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setActiveSnapshot(session);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition"
                      >
                        Tampilkan Snapshot
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SAVE MODAL DIALOG */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl w-full max-w-lg space-y-4 text-left my-8">
            <div className="flex items-center gap-3 text-emerald-800 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-emerald-100 rounded-full text-emerald-700">
                <CloudUpload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-950">Simpan Sesi Akurasi Stock</h3>
                <p className="text-xs text-slate-500">
                  Simpan data snapshot akurasi stock untuk melacak performa harian/bulanan.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Nama Sesi Penyimpanan
              </label>
              <input 
                type="text" 
                value={sessionNameInput}
                onChange={e => setSessionNameInput(e.target.value)}
                placeholder="Masukkan deskripsi nama arsip..."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none sm:text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Saran nama default otomatis mendeteksi periode tanggal yang sedang aktif.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-lg text-xs transition duration-150"
              >
                Batal
              </button>
              <button
                onClick={() => handleSaveAccuracySession(sessionNameInput)}
                disabled={isSavingAcc}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition duration-150"
              >
                {isSavingAcc ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Simpan Sesi
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

export default memo(AkurasiStock);
