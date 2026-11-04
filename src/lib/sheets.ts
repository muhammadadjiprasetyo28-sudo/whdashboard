import { fetchAndParseCSV } from "./csvCache";
/**
 * GOOGLE APPS SCRIPT CODE TO DEPLOY:
 * 
 * 1. Open your Google Sheet
 * 2. Extensions > Apps Script
 * 3. Paste the following code:
 * 
function doGet(e) {
  var action = e.parameter.action;
  var range = e.parameter.range;
  if (action === "get") {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    try {
      var sheetData = ss.getRange(range).getValues();
      return ContentService.createTextOutput(JSON.stringify({ values: sheetData })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ error: "Unknown GET action" })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var postData = JSON.parse(e.postData.contents);
  var action = postData.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    if (action === "append") {
      var range = postData.range;
      var values = postData.values;
      var sheetName = range.split("!")[0].replace(/'/g, "");
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
      sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "update") {
      var range = postData.range;
      var values = postData.values;
      var sheetName = range.split("!")[0].replace(/'/g, "");
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
      var gridRange = sheet.getRange(range.split("!")[1]);
      gridRange.setValues(values);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "init") {
      var sheetsToCreate = [
        { title: 'MASTER_PRODUK', headers: ['Kode Produk', 'Nama Produk', 'Satuan', 'Kategori'] },
        { title: 'MASTER_LOCATOR', headers: ['WH Group', 'Nama Locator', 'Deskripsi', 'WH Type', 'Area'] },
        { title: 'INPUT', headers: ['Tanggal', 'Nama Bahan', 'Qty', 'UOM', 'I/O/A', 'Locator', 'Locator To', 'No. Document', 'Keterangan', 'Kode'] },
        { title: 'INPUT RM', headers: ['Tanggal', 'Nama Bahan', 'Qty', 'UOM', 'I/O/A', 'Locator', 'Locator To', 'No. Document', 'Keterangan', 'Kode'] },
        { title: 'INPUT MFG', headers: ['Tanggal', 'Nama Bahan', 'Qty', 'UOM', 'I/O/A', 'Locator', 'Locator To', 'No. Document', 'Keterangan', 'Kode'] },
        { title: 'INPUT SUPPLIES', headers: ['Tanggal', 'Nama Bahan', 'Qty', 'UOM', 'I/O/A', 'Locator', 'Locator To', 'No. Document', 'Keterangan', 'Kode'] },
      ];
      
      sheetsToCreate.forEach(function(s) {
        var sheet = ss.getSheetByName(s.title);
        if (!sheet) {
          sheet = ss.insertSheet(s.title);
          sheet.getRange(1, 1, 1, s.headers.length).setValues([s.headers]);
        }
      });
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ error: "Unknown POST action" })).setMimeType(ContentService.MimeType.JSON);
}
 * 
 * 4. Click Deploy -> New deployment
 * 5. Select type: Web App
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. Click Deploy and copy the Web App URL.
 */

import { db } from './firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

export interface PublicProduct {
  kode: string;
  nama: string;
  satuan: string;
  rphMap: Record<string, number>;
}

export interface CombinedProduct {
  kode: string;
  nama: string;
  satuan: string;
  rphMap: Record<string, number>;
  isCustom?: boolean;
}

let publicProductsCache: PublicProduct[] | null = null;
let lastPublicFetch = 0;

export async function fetchCombinedProducts(forceFresh = false): Promise<CombinedProduct[]> {
  // 1. Fetch public Google Sheet products
  const publicProducts = await fetchPublicMasterProduk(forceFresh).catch((err) => {
    console.error("Failed to fetch public master products from sheet:", err);
    return [] as PublicProduct[];
  });

  // 2. Fetch Firestore overrides
  let overrides: CombinedProduct[] = [];
  try {
    const querySnapshot = await getDocs(collection(db, "master_produk_overrides"));
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      overrides.push({
        kode: doc.id,
        nama: data.nama || "",
        satuan: data.satuan || "",
        rphMap: data.rphMap || {},
        isCustom: true
      });
    });
  } catch (err) {
    console.error("Failed to fetch products from firestore:", err);
  }

  // 3. Merge them
  const mergedMap = new Map<string, CombinedProduct>();

  // Add public products first
  publicProducts.forEach(p => {
    mergedMap.set(p.kode.toUpperCase().trim(), {
      kode: p.kode,
      nama: p.nama,
      satuan: p.satuan,
      rphMap: { ...p.rphMap }
    });
  });

  // Overwrite with Firestore overrides or add new ones
  overrides.forEach(ov => {
    const key = ov.kode.toUpperCase().trim();
    const existing = mergedMap.get(key);
    if (existing) {
      mergedMap.set(key, {
        kode: existing.kode,
        nama: ov.nama || existing.nama,
        satuan: ov.satuan || existing.satuan,
        rphMap: {
          ...existing.rphMap,
          ...ov.rphMap
        }
      });
    } else {
      mergedMap.set(key, ov);
    }
  });

  return Array.from(mergedMap.values());
}

export async function saveProductOverride(kode: string, fields: Partial<CombinedProduct>): Promise<void> {
  const docRef = doc(db, "master_produk_overrides", kode.toUpperCase().trim());
  await setDoc(docRef, fields, { merge: true });
}

export async function fetchPublicMasterProduk(forceFresh = false): Promise<PublicProduct[]> {
  if (!forceFresh && publicProductsCache && (Date.now() - lastPublicFetch < 60000)) {
    return publicProductsCache;
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1657911583&single=true&output=csv&t=${Date.now()}`;
  const data = await fetchAndParseCSV<any[]>(csvUrl, forceFresh);

  if (data.length === 0) return [];

  // Find header row containing "kode" or "nama"
  let headerIndex = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const rowStr = data[i].map(val => String(val).toLowerCase().trim());
    if (rowStr.some(val => val.includes('kode') || val.includes('nama'))) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) headerIndex = 0;

  const headers = data[headerIndex].map((h: any) => String(h).trim());

  // Helper to find column index (lazy search)
  const findColIdxLazy = (keywords: string[]) => {
    return headers.findIndex(h => 
      keywords.some(kw => h.toLowerCase().includes(kw.toLowerCase()))
    );
  };

  const idxKode = findColIdxLazy(['kode produk', 'kode_produk', 'kode', 'sku']);
  const idxNama = findColIdxLazy(['nama produk', 'nama_produk', 'nama', 'description', 'name']);
  const idxSatuan = findColIdxLazy(['satuan', 'uom', 'unit']);

  // RPH column mappings
  const rphCols: Record<string, number> = {
    "JAKARTA": findColIdxLazy(['rph jkt', 'rph_jkt', 'jkt']),
    "JAKARTA A5": findColIdxLazy(['rph jkt', 'rph_jkt', 'jkt']), // Fallback to JKT
    "KARAWANG": findColIdxLazy(['rph krw', 'rph_krw', 'krw']),
    "SEMARANG": findColIdxLazy(['rph smg', 'rph_smg', 'smg']),
    "SURABAYA": findColIdxLazy(['rph sby', 'rph_sby', 'sby']),
    "JEMBER": findColIdxLazy(['rph jmr', 'rph_jmr', 'jmr']),
    "PALEMBANG": findColIdxLazy(['rph plg', 'rph_plg', 'plg']),
    "MEDAN": findColIdxLazy(['rph mdn', 'rph_mdn', 'mdn']),
    "PEKANBARU": findColIdxLazy(['rph pkb', 'rph_pkb', 'pkb']),
    "PONTIANAK": findColIdxLazy(['rph ptk', 'rph_ptk', 'ptk']),
    "BANJARMASIN": findColIdxLazy(['rph bjm', 'rph_bjm', 'bjm']),
    "MAKASSAR": findColIdxLazy(['rph mks', 'rph_mks', 'mks']),
  };

  const productsList: PublicProduct[] = [];

  for (let i = headerIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const kode = idxKode !== -1 ? String(row[idxKode] || '').trim() : '';
    const nama = idxNama !== -1 ? String(row[idxNama] || '').trim() : '';
    const satuan = idxSatuan !== -1 ? String(row[idxSatuan] || '').trim() : '';

    if (!kode || kode === '#N/A' || kode.toLowerCase() === 'kode produk') continue;

    const rphMap: Record<string, number> = {};
    Object.entries(rphCols).forEach(([areaName, colIdx]) => {
      if (colIdx !== -1 && row[colIdx] !== undefined) {
        const valStr = String(row[colIdx]).replace(/,/g, '.').trim();
        const val = parseFloat(valStr);
        rphMap[areaName] = !isNaN(val) ? val : 0;
      } else {
        rphMap[areaName] = 0;
      }
    });

    productsList.push({
      kode,
      nama,
      satuan,
      rphMap
    });
  }

  publicProductsCache = productsList;
  lastPublicFetch = Date.now();
  return productsList;
}

// Cache to store completed fetches
interface CacheEntry {
  timestamp: number;
  data: any[][];
}
const fetchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60000; // 1 minute cache to improve performance

// Map to store in-flight requests (Request Coalescing)
const inFlightRequests = new Map<string, Promise<any[][]>>();

export function clearSheetCache() {
  fetchCache.clear();
  inFlightRequests.clear();
  
  // Clear sessionStorage cached items
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith("gsheet_cache_")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
      console.log(`[Cache Clear] Cleaned ${keysToRemove.length} sessionStorage cache items.`);
    }
  } catch (e) {
    console.error("Failed to clear sessionStorage cache", e);
  }
}

export async function fetchSheetData(gasUrl: string, range: string, forceFresh = false) {
  if (!gasUrl || gasUrl === 'HQ' || !gasUrl.startsWith('http')) {
    console.warn(`[fetchSheetData] Ignored fetch request for invalid gasUrl: "${gasUrl}"`);
    return [];
  }
  const cacheKey = `${gasUrl}||${range}`;
  const storageKey = `gsheet_cache_${cacheKey}`;

  // 1. Check in-memory Cache (if not forcing fresh)
  if (!forceFresh) {
    const cached = fetchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[Memory Cache Hit] Returning cached data for range: ${range}`);
      return JSON.parse(JSON.stringify(cached.data)); // Return deep copy to prevent mutation
    }

    // 2. Check sessionStorage Cache (if not forcing fresh)
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        const stored = window.sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed: CacheEntry = JSON.parse(stored);
          if (Date.now() - parsed.timestamp < CACHE_TTL) {
            console.log(`[Session Cache Hit] Returning cached data for range: ${range}`);
            // Warm up in-memory cache
            fetchCache.set(cacheKey, parsed);
            return JSON.parse(JSON.stringify(parsed.data));
          }
        }
      }
    } catch (e) {
      console.warn("sessionStorage retrieval failed:", e);
    }
  }

  // 3. Check if a request for this exact key is already in flight (Coalescing / promise deduplication)
  if (inFlightRequests.has(cacheKey)) {
    console.log(`[Request Coalesced] Awaiting in-flight request for range: ${range}`);
    const inFlightPromise = inFlightRequests.get(cacheKey)!;
    const data = await inFlightPromise;
    return JSON.parse(JSON.stringify(data));
  }

  // 4. Define the actual fetch operation (with automatic retries)
  const fetchPromise = (async () => {
    let attempts = 0;
    const maxAttempts = 3;
    const baseDelay = 1000; // 1 second base delay for backoff

    while (attempts < maxAttempts) {
      try {
        let data: any;
        if (typeof window !== 'undefined') {
          const token = window.sessionStorage.getItem('auth_token') || '';
          const proxyRes = await fetch('/api/sheets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ gasUrl, action: 'get', range })
          });
          if (!proxyRes.ok) {
            const errData = await proxyRes.json().catch(() => ({}));
            throw new Error(errData.error || `Google Sheets proxy gagal (HTTP ${proxyRes.status})`);
          }
          data = await proxyRes.json();
        } else {
          const url = `${gasUrl}?action=get&range=${encodeURIComponent(range)}&t=${Date.now()}`;
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          data = await res.json();
        }

        if (data && data.error) {
          const errStr = String(data.error).toLowerCase();
          if (errStr.includes("not found") || errStr.includes("range") || errStr.includes("sheet")) {
            console.info(`[Sheet Info] Range "${range}" tidak ditemukan di spreadsheet cabang ini. Dianggap kosong.`);
            return [];
          }
          throw new Error(data.error);
        }

        const values = data.values || [];
        
        // Populate in-memory cache
        const cacheEntry: CacheEntry = { timestamp: Date.now(), data: values };
        fetchCache.set(cacheKey, cacheEntry);

        // Populate sessionStorage cache
        try {
          if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.setItem(storageKey, JSON.stringify(cacheEntry));
          }
        } catch (e) {
          console.warn("sessionStorage save failed:", e);
        }

        return values;
      } catch (error: any) {
        attempts++;
        console.warn(`[Fetch Effort ${attempts}/${maxAttempts}] for ${range} failed: ${error.message}`);
        if (attempts >= maxAttempts) {
          throw error;
        }
        // Exponential backoff delay with jitter
        const delay = baseDelay * Math.pow(2, attempts - 1) * (0.5 + Math.random());
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return [];
  })();

  // 5. Save to inFlightRequests map
  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    const data = await fetchPromise;
    return JSON.parse(JSON.stringify(data));
  } finally {
    // 6. Always clean up in-flight request once it's done
    inFlightRequests.delete(cacheKey);
  }
}

async function proxyPost(gasUrl: string, payload: any) {
  if (!gasUrl || gasUrl === 'HQ') {
    throw new Error("URL sistem belum dikonfigurasi untuk cabang ini.");
  }
  const endpoint = typeof window !== 'undefined' ? '/api/sheets' : gasUrl;
  const token = typeof window !== 'undefined' ? (window.sessionStorage.getItem('auth_token') || '') : '';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ gasUrl, ...payload })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error) errMsg = parsed.error;
    } catch {}
    throw new Error(`Gagal menyimpan ke server (HTTP ${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

export async function appendSheetRow(gasUrl: string, range: string, values: any[][]) {
  clearSheetCache(); // Invalidate cache on write
  return proxyPost(gasUrl, { action: 'append', range, values });
}

export async function updateSheetRow(gasUrl: string, range: string, values: any[][]) {
  clearSheetCache(); // Invalidate cache on write
  return proxyPost(gasUrl, { action: 'update', range, values });
}

/** Check if the necessary sheets exist, if not create them */
export async function initializeERPSpreadsheet(gasUrl: string) {
  clearSheetCache(); // Invalidate cache on init
  if (!gasUrl || gasUrl === 'HQ') return;
  return proxyPost(gasUrl, { action: 'init' });
}
