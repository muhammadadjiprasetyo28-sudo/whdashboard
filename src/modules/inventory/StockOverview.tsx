import { fetchAndParseCSV } from "../../lib/csvCache";
import React, { useEffect, useState, useMemo, useRef , memo} from "react";
import { fetchSheetData } from "../../lib/sheets";
import { AREA_URLS } from "../../App";
import type {
  Transaction,
  Product,
  Locator,
  StockSummary,
} from "../../shared/types";
import {
  Loader2,
  Search,
  Package,
  ArrowRightLeft,
  Layers,
  ArrowUpRight,
  PlusCircle,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ExecutiveDashboard from "../dashboard/ExecutiveDashboard";
import { parseToIsoDate } from "../../lib/dateUtils";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function StockOverview({
  spreadsheetId,
  area,
  onNavigateToTab,
}: {
  spreadsheetId: string;
  area: string;
  onNavigateToTab?: (tabId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [stockSummary, setStockSummary] = useState<StockSummary[]>([]);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<{
    kodeProduk: string;
    namaProduk: string;
  } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const [selectedSource, setSelectedSource] = useState("ALL");

  const [allTransactions, setAllTransactions] = useState<
    {
      tipe: string;
      pCode: string;
      pName: string;
      lCode: string;
      qty: number;
      source: string;
      area?: string;
      tanggal?: string;
      uom?: string;
    }[]
  >([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [locatorsMap, setLocatorsMap] = useState<
    Map<string, { nama: string; whType: string; area: string }>
  >(new Map());
  const [mtsMap, setMtsMap] = useState<Map<string, number>>(new Map());

  const loadData = async (retryOnMissing = true, forceFresh = false) => {
    try {
      setLoading(true);

      // Fetch global MTS
      const csvUrl = '/api/stock-summary';
      const mtsMapLocal = new Map<string, number>();

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
            const colSku = cleanedHeaders.findIndex(h => h.toLowerCase().includes('search key') || h.toLowerCase() === 'sku' || h.toLowerCase().includes('produk'));
            const colName = cleanedHeaders.findIndex(h => h.toLowerCase() === 'name' || h.toLowerCase().includes('nama'));
            const colLastQty = cleanedHeaders.findIndex(h => h.toLowerCase().includes('last qty') || h.toLowerCase().includes('sistem'));

            const mtsRows = dataMts.slice(headerIndex + 1);
            mtsRows.forEach(row => {
              const loc = colLoc !== -1 ? String(row[colLoc] || '').trim().toUpperCase() : '';
              const sku = colSku !== -1 ? String(row[colSku] || '').trim().toUpperCase() : '';
              const name = colName !== -1 ? String(row[colName] || '').trim().toUpperCase() : '';
              
              let lastQty = 0;
              if (colLastQty !== -1 && row[colLastQty] !== undefined) {
                let valStr = String(row[colLastQty]).trim();
                let lastDot = valStr.lastIndexOf('.');
                let lastComma = valStr.lastIndexOf(',');
                
                if (lastComma > -1 && lastDot > -1) {
                  if (lastComma > lastDot) {
                    valStr = valStr.replace(/\./g, '').replace(/,/g, '.');
                  } else {
                    valStr = valStr.replace(/,/g, '');
                  }
                } else if (lastComma > -1 && lastDot === -1) {
                  const parts = valStr.split(',');
                  if (parts.length > 1 && parts[parts.length - 1].length === 3 && parts[0].replace('-', '').length <= 3) {
                    valStr = valStr.replace(/,/g, '');
                  } else {
                    valStr = valStr.replace(/,/g, '.');
                  }
                } else if (lastDot > -1 && lastComma === -1) {
                  const parts = valStr.split('.');
                  if (parts.length > 1 && parts[parts.length - 1].length === 3 && parts[0].replace('-', '').length <= 3) {
                    valStr = valStr.replace(/\./g, '');
                  }
                }
                valStr = valStr.replace(/[^0-9.-]/g, '');
                lastQty = parseFloat(valStr) || 0;
                if (isNaN(lastQty)) lastQty = 0;
              }

              if (loc) {
                if (sku) {
                  mtsMapLocal.set(`${sku}_${loc}`, lastQty);
                  mtsMapLocal.set(`${loc}_${sku}`, lastQty);
                }
                if (name) {
                  mtsMapLocal.set(`${name}_${loc}`, lastQty);
                  mtsMapLocal.set(`${loc}_${name}`, lastQty);
                }
              }
            });
          }
      } catch (err) {
        console.error('Failed to fetch MTS database:', err);
      }
      
      setMtsMap(mtsMapLocal);

      const pMap = new Map<string, string>();
      const reversePMap = new Map<string, string>();
      const lMap = new Map<
        string,
        { nama: string; whType: string; area: string }
      >();
      const mappedRows: {
        tipe: string;
        pCode: string;
        pName: string;
        lCode: string;
        qty: number;
        source: string;
        area?: string;
        tanggal?: string;
        uom?: string;
      }[] = [];

      const processRows = (rows: any[], source: string, currentArea?: string) => {
        console.log(`Processing rows for ${source}:`, rows?.length);
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
          const pName = String(r[1] || "").trim();
          let pCode = String(r[9] || "").trim();
          const tipe = String(r[4] || "")
            .trim()
            .toUpperCase();
          const uom = String(r[3] || '').trim();

          if (!pName && !pCode) return;
          if (!pCode) {
            pCode = reversePMap.get(pName.toUpperCase()) || pName;
          }

          const qtyStr = String(r[2] || "0").replace(",", ".");
          let qty = parseFloat(qtyStr) || 0;
          if (isNaN(qty)) qty = 0;

          let fromLocator = String(r[5] || "").trim();
          let toLocator = String(r[6] || "").trim();

          if (!fromLocator && !toLocator) fromLocator = "UNKNOWN_L";

          if (tipe === "TRANSFER" || tipe === "TF") {
            mappedRows.push({
              tipe: "OUT",
              pCode,
              pName,
              lCode: fromLocator || "UNKNOWN_L",
              qty,
              uom,
              source,
              area: currentArea,
              tanggal,
            });
            if (toLocator) {
              mappedRows.push({
                tipe: "IN",
                pCode,
                pName,
                lCode: toLocator,
                qty,
                uom,
                source,
                area: currentArea,
                tanggal,
              });
            }
          } else {
            mappedRows.push({
              tipe: tipe || "IN",
              pCode,
              pName,
              lCode: fromLocator || toLocator || "UNKNOWN_L",
              qty,
              uom,
              source,
              area: currentArea,
              tanggal,
            });
          }
        });
      };

      if (
        area === "HQ" ||
        spreadsheetId === "HQ" ||
        area === "All Cabang" ||
        area.toLowerCase() === "all"
      ) {
        const urlEntries = Object.entries(AREA_URLS);
        // Process branches in batches of 4 to prevent network socket starvation
        for (let i = 0; i < urlEntries.length; i += 4) {
          const batch = urlEntries.slice(i, i + 4);
          await Promise.all(
            batch.map(async ([aName, aUrl]) => {
              try {
                const [tn, tr, tm, ts, pr, lr] = await Promise.all([
                  fetchSheetData(aUrl, "'INPUT'!A2:J", forceFresh).catch(() => []),
                  fetchSheetData(aUrl, "'INPUT RM'!A2:J", forceFresh).catch(() => []),
                  fetchSheetData(aUrl, "'INPUT MFG'!A2:J", forceFresh).catch(() => []),
                  fetchSheetData(aUrl, "'INPUT SUPPLIES'!A2:J", forceFresh).catch(() => []),
                  fetchSheetData(aUrl, "'MASTER_PRODUK'!A2:B", forceFresh).catch(() => []),
                  fetchSheetData(aUrl, "'MASTER_LOCATOR'!A2:E", forceFresh).catch(() => []),
                ]);

              // Merge products map
              pr.filter((r: any[]) => r.length > 0 && r[0]).forEach(
                (r: any[]) => {
                  const kode = String(r[0]).trim();
                  const nama = String(r[1] || "").trim();
                  pMap.set(kode, nama);
                  if (nama) reversePMap.set(nama.toUpperCase(), kode);
                },
              );

              // Merge locators map
              lr.filter((r: any[]) => r.length > 0 && (r[0] || r[1])).forEach(
                (r: any[]) => {
                  const val = {
                    nama: String(r[1] || r[0]).trim(),
                    whType: String(r[3] || "").trim(),
                    area: String(r[4] || aName).trim(),
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
                },
              );

              processRows(tn, "INPUT", aName);
              processRows(tr, "INPUT RM", aName);
              processRows(tm, "INPUT MFG", aName);
              processRows(ts, "INPUT SUPPLIES", aName);
            } catch (e) {
              console.error(`Error loading data for area ${aName}:`, e);
            }
          }),
        );
        }
      } else {
        let txRowsNormal: any[] = [];
        let txRowsRM: any[] = [];
        let txRowsMfg: any[] = [];
        let txRowsSupplies: any[] = [];
        let pRows: any[] = [];
        let lRows: any[] = [];

        try {
          [txRowsNormal, txRowsRM, txRowsMfg, txRowsSupplies, pRows, lRows] =
            await Promise.all([
              fetchSheetData(spreadsheetId, "'INPUT'!A2:J", forceFresh),
              fetchSheetData(spreadsheetId, "'INPUT RM'!A2:J", forceFresh),
              fetchSheetData(spreadsheetId, "'INPUT MFG'!A2:J", forceFresh),
              fetchSheetData(spreadsheetId, "'INPUT SUPPLIES'!A2:J", forceFresh),
              fetchSheetData(spreadsheetId, "'MASTER_PRODUK'!A2:B", forceFresh),
              fetchSheetData(spreadsheetId, "'MASTER_LOCATOR'!A2:E", forceFresh),
            ]);
        } catch (fetchErr: any) {
          if (retryOnMissing) {
            console.log(
              "StockOverview missing sheet, compiling or trying auto-init...",
            );
            try {
              const { initializeERPSpreadsheet } =
                await import("../../lib/sheets");
              await initializeERPSpreadsheet(spreadsheetId);
              return loadData(false);
            } catch (initErr: any) {
              const initErrMsg = String(initErr.message || "").toLowerCase();
              if (
                initErrMsg.includes("already exists") ||
                initErrMsg.includes("ada") ||
                initErrMsg.includes("exists") ||
                initErrMsg.includes("unknown get action")
              ) {
                console.log("Sheet already exists, continuing to load data.");
                return loadData(false);
              }
              console.warn("Auto-init from StockOverview note:", initErr);
            }
          }
          // Fallback to individual catches if init fails or retry is off
          txRowsNormal = await fetchSheetData(
            spreadsheetId,
            "'INPUT'!A2:J",
            forceFresh
          ).catch(() => []);
          txRowsRM = await fetchSheetData(
            spreadsheetId,
            "'INPUT RM'!A2:J",
            forceFresh
          ).catch(() => []);
          txRowsMfg = await fetchSheetData(
            spreadsheetId,
            "'INPUT MFG'!A2:J",
            forceFresh
          ).catch(() => []);
          txRowsSupplies = await fetchSheetData(
            spreadsheetId,
            "'INPUT SUPPLIES'!A2:J",
            forceFresh
          ).catch(() => []);
          pRows = await fetchSheetData(
            spreadsheetId,
            "'MASTER_PRODUK'!A2:B",
            forceFresh
          ).catch(() => []);
          lRows = await fetchSheetData(
            spreadsheetId,
            "'MASTER_LOCATOR'!A2:E",
            forceFresh
          ).catch(() => []);
        }

        pRows
          .filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A')
          .forEach((r: any[]) => {
            const kode = String(r[0]).trim();
            const nama = String(r[1] || "").trim();
            pMap.set(kode, nama);
            if (nama) reversePMap.set(nama.toUpperCase(), kode);
          });

        lRows
          .filter((r: any[]) => r.length > 0 && (r[0] || r[1]) && r[0] !== '#N/A' && r[1] !== '#N/A')
          .forEach((r: any[]) => {
            const val = {
              nama: String(r[1] || r[0]).trim(),
              whType: String(r[3] || "").trim(),
              area: String(r[4] || "").trim(),
            };
            if (r[0]) {
              lMap.set(String(r[0]).trim(), val);
              lMap.set(String(r[0]).trim().toUpperCase(), val);
            }
            if (r[1]) {
              lMap.set(String(r[1]).trim(), val);
              lMap.set(String(r[1]).trim().toUpperCase(), val);
            }
          });

        processRows(txRowsNormal, "INPUT", area);
        processRows(txRowsRM, "INPUT RM", area);
        processRows(txRowsMfg, "INPUT MFG", area);
        processRows(txRowsSupplies, "INPUT SUPPLIES", area);
      }

      setProductsMap(pMap);
      setLocatorsMap(lMap);
      console.log("mappedRows total:", mappedRows.length);
      setAllTransactions(mappedRows);
    } catch (err: any) {
      alert(`Gagal memuat overview stok: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    
    let intervalId: NodeJS.Timeout;
    if (autoRefresh) {
      intervalId = setInterval(() => {
        loadData(false, true); // retryOnMissing = false, forceFresh = true
      }, 5000); // Poll every 5 seconds for no delay real-time
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [spreadsheetId, area, autoRefresh]);

  useEffect(() => {
    const stockMap = new Map<string, StockSummary>(); // Key: kodeProduk_whGroup
    const selectedDate = (() => {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const localNow = new Date(now.getTime() - offset * 60 * 1000);
      return localNow.toISOString().split('T')[0];
    })();

    allTransactions.forEach((t) => {
      if (selectedSource !== "ALL" && t.source !== selectedSource) return;

      const { tipe, pCode, pName, lCode, qty, area: rowArea, tanggal } = t;

      const includeInCumulative = !tanggal || tanggal <= selectedDate;
      if (!includeInCumulative) return;

      const key = `${rowArea}_${lCode.toUpperCase()}_${pCode.toUpperCase()}`;
      if (!stockMap.has(key)) {
        const lookupKey = lCode.trim();
        const lData = locatorsMap.get(lookupKey) ||
          locatorsMap.get(lookupKey.toUpperCase()) || {
            nama: lCode,
            whType: "",
            area: rowArea,
          };
        stockMap.set(key, {
          kodeProduk: pCode === pName ? "" : pCode,
          namaProduk: productsMap.get(pCode) || pName || pCode,
          whGroup: lCode,
          namaLocator: lData.nama,
          whType: lData.whType,
          area: rowArea || lData.area || area,
          totalIn: 0,
          totalOut: 0,
          stock: 0,
        });
      }

      const summary = stockMap.get(key)!;
      const normalizedTipe = tipe.replace(/\s+/g, "").toUpperCase();
      const isIN = normalizedTipe === "IN" || normalizedTipe.includes("AWAL") || normalizedTipe === "MASUK" || normalizedTipe === "RECEIPT";
      const isOUT = normalizedTipe === "OUT" || normalizedTipe === "KELUAR" || normalizedTipe === "ISSUE" || normalizedTipe === "PEMAKAIAN" || normalizedTipe === "TRANSFER" || normalizedTipe === "TF";

      if (isIN) {
        summary.totalIn += qty;
        summary.stock += qty;
      } else if (isOUT) {
        summary.totalOut += qty;
        summary.stock -= qty;
      } else {
        if (qty > 0 && !["TRANSFER", "TF"].includes(normalizedTipe)) {
          summary.totalIn += qty;
          summary.stock += qty;
        }
      }
    });

    // Populate qtySistem and selisih
    stockMap.forEach((summary, key) => {
      const pCodeUpper = (summary.kodeProduk || '').toUpperCase().trim();
      const pNameUpper = (summary.namaProduk || '').toUpperCase().trim();
      const locKey = (summary.whGroup || '').toUpperCase().trim();

      let qtySistem = 0;
      if (mtsMap.has(`${pCodeUpper}_${locKey}`)) {
        qtySistem = mtsMap.get(`${pCodeUpper}_${locKey}`) || 0;
      } else if (mtsMap.has(`${pNameUpper}_${locKey}`)) {
        qtySistem = mtsMap.get(`${pNameUpper}_${locKey}`) || 0;
      } else if (mtsMap.has(`${pCodeUpper.replace(/\s+/g, '')}_${locKey}`)) {
        qtySistem = mtsMap.get(`${pCodeUpper.replace(/\s+/g, '')}_${locKey}`) || 0;
      } else if (mtsMap.has(`${locKey}_${pCodeUpper}`)) {
        qtySistem = mtsMap.get(`${locKey}_${pCodeUpper}`) || 0;
      } else if (mtsMap.has(`${locKey}_${pNameUpper}`)) {
        qtySistem = mtsMap.get(`${locKey}_${pNameUpper}`) || 0;
      } else if (mtsMap.has(`${locKey}_${pCodeUpper.replace(/\s+/g, '')}`)) {
        qtySistem = mtsMap.get(`${locKey}_${pCodeUpper.replace(/\s+/g, '')}`) || 0;
      } else if (mtsMap.has(`${key.toUpperCase().trim()}`)) {
        qtySistem = mtsMap.get(`${key.toUpperCase().trim()}`) || 0;
      }

      summary.qtySistem = qtySistem;
      // Round to avoid float issues
      summary.selisih = Math.round((summary.stock - qtySistem) * 1000) / 1000;
    });

    console.log("Stock map size:", stockMap.size);

    const filteredByArea = Array.from(stockMap.values());

    setStockSummary(filteredByArea);
  }, [allTransactions, productsMap, locatorsMap, selectedSource, area, mtsMap]);

  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLocators, setSelectedLocators] = useState<string[]>([]);
  const [locatorDropdownOpen, setLocatorDropdownOpen] = useState(false);
  const [locatorSearch, setLocatorSearch] = useState("");
  const locatorDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locatorDropdownRef.current && !locatorDropdownRef.current.contains(event.target as Node)) {
        setLocatorDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedLocators]);

  useEffect(() => {
    if (selectedLocators.length > 0) {
      const validLocators = new Set(stockSummary.map((s) => s.whGroup));
      const pruned = selectedLocators.filter((loc) => validLocators.has(loc));
      if (pruned.length !== selectedLocators.length) {
        setSelectedLocators(pruned);
      }
    }
  }, [stockSummary, selectedLocators]);

  const skuWithNoMovementCount = useMemo(() => {
    // 1. Filter rows in currently active stockSummary where totalOut is 0 (no out transactions)
    return stockSummary.filter((s) => s.totalOut === 0).length;
  }, [stockSummary]);

  const uniqueLocators = useMemo(
    () =>
      Array.from(
        new Map<string, { whGroup: string; nama: string }>(
          stockSummary.map((s) => [
            s.whGroup,
            { whGroup: s.whGroup, nama: s.namaLocator },
          ]),
        ).values(),
      ).sort((a, b) => a.whGroup.localeCompare(b.whGroup)),
    [stockSummary],
  );

  const uniqueProducts = useMemo(() => {
    const map = new Map<string, { kodeProduk: string; namaProduk: string }>();
    stockSummary.forEach((s) => {
      if (s.namaProduk || s.kodeProduk) {
        const key = `${s.kodeProduk || ""}__${s.namaProduk || ""}`;
        if (!map.has(key)) {
          map.set(key, { kodeProduk: s.kodeProduk, namaProduk: s.namaProduk });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.namaProduk.localeCompare(b.namaProduk),
    );
  }, [stockSummary]);

  const productSuggestions = useMemo(() => {
    if (!search || search.trim().length === 0) return [];
    const term = search.toLowerCase();
    return uniqueProducts
      .filter(
        (p) =>
          p.namaProduk.toLowerCase().includes(term) ||
          p.kodeProduk.toLowerCase().includes(term),
      )
      .slice(0, 15);
  }, [search, uniqueProducts]);

  const filtered = useMemo(() => {
    return stockSummary.filter((s) => {
      const matchSearch = selectedProduct
        ? s.kodeProduk === selectedProduct.kodeProduk
        : s.kodeProduk.toLowerCase().includes(search.toLowerCase()) ||
          s.namaProduk.toLowerCase().includes(search.toLowerCase()) ||
          s.whGroup.toLowerCase().includes(search.toLowerCase()) ||
          s.namaLocator.toLowerCase().includes(search.toLowerCase());

      const matchLocator =
        selectedLocators.length === 0 || selectedLocators.includes(s.whGroup);

      return matchSearch && matchLocator;
    });
  }, [stockSummary, selectedProduct, search, selectedLocators]);

  const topItems = useMemo(() => {
    const byProduct = new Map<string, { name: string; stock: number }>();
    filtered.forEach((s) => {
      const existing = byProduct.get(s.kodeProduk);
      if (existing) existing.stock += s.stock;
      else byProduct.set(s.kodeProduk, { name: s.namaProduk, stock: s.stock });
    });
    return Array.from(byProduct.values())
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10)
      .map((d) => ({
        ...d,
        name: d.name.length > 15 ? d.name.substring(0, 15) + "..." : d.name,
      }));
  }, [filtered]);

  const topOutItems = useMemo(() => {
    const byProduct = new Map<string, { name: string; totalOut: number }>();
    filtered.forEach((s) => {
      if (s.totalOut > 0) {
        const existing = byProduct.get(s.kodeProduk);
        if (existing) existing.totalOut += s.totalOut;
        else
          byProduct.set(s.kodeProduk, {
            name: s.namaProduk,
            totalOut: s.totalOut,
          });
      }
    });
    return Array.from(byProduct.values())
      .sort((a, b) => b.totalOut - a.totalOut)
      .slice(0, 10)
      .map((d) => ({
        ...d,
        name: d.name.length > 15 ? d.name.substring(0, 15) + "..." : d.name,
      }));
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const totalInFiltered = filtered.reduce((acc, s) => acc + s.totalIn, 0);
  const totalOutFiltered = filtered.reduce((acc, s) => acc + s.totalOut, 0);
  const stockRillFiltered = filtered.reduce((acc, s) => acc + s.stock, 0);

  return (
    <ExecutiveDashboard 
      stockSummary={stockSummary}
      allTransactions={allTransactions}
      area={area}
      loading={loading}
      onRefresh={() => loadData(true, true)}
      onNavigateToTab={onNavigateToTab || (() => {})}
    />
  );
}
export default memo(StockOverview);
