import { fetchAndParseCSV } from "../lib/csvCache";
import { useEffect, useState, useMemo, useCallback , memo} from "react";
import { 
  Loader2, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  TrendingUp, 
  Package, 
  CheckCircle2, 
  CircleAlert, 
  TrendingDown,
  Download,
  Filter,
  MapPin,
  ListFilter
} from "lucide-react";
import { fetchSheetData, fetchCombinedProducts } from "../lib/sheets";
import { AREA_URLS } from "../config/areas";

interface Props {
  spreadsheetId: string;
  area: string;
  activeUsername: string;
  userRole: string;
}

interface MappedTransaction {
  tipe: string;
  pCode: string;
  pName: string;
  lCode: string;
  qty: number;
  source: string;
  area: string;
}

interface DoiMpRow {
  area: string;
  kodeProduk: string;
  namaProduk: string;
  totalIn: number;
  totalOut: number;
  stock: number;
  rph?: number;
  source?: string;
  hasPidLocator: boolean;
}

function DoiMp({ spreadsheetId, area, activeUsername, userRole }: Props) {
  const [allTransactions, setAllTransactions] = useState<MappedTransaction[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, { nama: string; rph?: number }>>(new Map());
  const [pengepokanMap, setPengepokanMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search States
  const [search, setSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [selectedDoiStatus, setSelectedDoiStatus] = useState<string>("ALL");

  // Pagination State
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize selectedArea filter based on user role and area
  useEffect(() => {
    if (area && area !== "All Cabang" && area !== "HQ") {
      setSelectedArea(area);
    } else {
      setSelectedArea("ALL");
    }
  }, [area]);

  const loadAllData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    const pMap = new Map<string, { nama: string; rph?: number }>();
    try {
      const combinedProds = await fetchCombinedProducts(isManual).catch(() => []);
      combinedProds.forEach(p => {
        const pCodeClean = p.kode.toUpperCase().trim();
        pMap.set(pCodeClean, {
          nama: p.nama,
          rph: p.rphMap[(area || "Jakarta").toUpperCase().trim()] || 0
        });
        Object.entries(p.rphMap).forEach(([aName, val]) => {
          const areaKey = `${aName.toUpperCase().trim()}||${pCodeClean}`;
          pMap.set(areaKey, {
            nama: p.nama,
            rph: val as number
          });
        });
      });
    } catch (err) {
      console.error("Gagal memuat produk gabungan:", err);
    }
    const mappedRows: MappedTransaction[] = [];

    const processRows = (rows: any[], source: string, sourceAreaName: string) => {
      const validRows = (rows || []).filter((r: any[]) => {
        if (r.length === 0) return false;
        const tanggal = String(r[0] || "").trim();
        const nama = String(r[1] || "").trim();
        const kode = String(r[9] || "").trim();
        return (
          tanggal !== "" &&
          nama !== "" &&
          kode !== "#N/A" &&
          nama !== "#N/A" &&
          tanggal !== "#N/A"
        );
      });

      validRows.forEach((r: any[]) => {
        const pName = String(r[1] || "").trim();
        let pCode = String(r[9] || "").trim();
        const tipe = String(r[4] || "").trim().toUpperCase();

        if (!pName && !pCode) return;
        if (!pCode) {
          pCode = pName;
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
            source,
            area: sourceAreaName,
          });
          if (toLocator) {
            mappedRows.push({
              tipe: "IN",
              pCode,
              pName,
              lCode: toLocator,
              qty,
              source,
              area: sourceAreaName,
            });
          }
        } else {
          mappedRows.push({
            tipe: tipe || "IN",
            pCode,
            pName,
            lCode: fromLocator || toLocator || "UNKNOWN_L",
            qty,
            source,
            area: sourceAreaName,
          });
        }
      });
    };

    try {
      const isGlobal =
        area === "HQ" ||
        spreadsheetId === "HQ" ||
        area === "All Cabang" ||
        area.toLowerCase() === "all";

      if (isGlobal) {
        const urlEntries = Object.entries(AREA_URLS);
        await Promise.all(
          urlEntries.map(async ([aName, aUrl]) => {
            try {
              const [tn, tr, tm, ts] = await Promise.all([
                fetchSheetData(aUrl, "'INPUT'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'INPUT RM'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'INPUT MFG'!A2:J", isManual).catch(() => []),
                fetchSheetData(aUrl, "'INPUT SUPPLIES'!A2:J", isManual).catch(() => []),
              ]);

              processRows(tn, "INPUT", aName);
              processRows(tr, "INPUT RM", aName);
              processRows(tm, "INPUT MFG", aName);
              processRows(ts, "INPUT SUPPLIES", aName);
            } catch (e) {
              console.error(`Error loading data for area ${aName}:`, e);
            }
          })
        );
      } else {
        const [tn, tr, tm, ts] = await Promise.all([
          fetchSheetData(spreadsheetId, "'INPUT'!A2:J", isManual).catch(() => []),
          fetchSheetData(spreadsheetId, "'INPUT RM'!A2:J", isManual).catch(() => []),
          fetchSheetData(spreadsheetId, "'INPUT MFG'!A2:J", isManual).catch(() => []),
          fetchSheetData(spreadsheetId, "'INPUT SUPPLIES'!A2:J", isManual).catch(() => []),
        ]);

        processRows(tn, "INPUT", area);
        processRows(tr, "INPUT RM", area);
        processRows(tm, "INPUT MFG", area);
        processRows(ts, "INPUT SUPPLIES", area);
      }

      // Fetch Pengepokan Move Qty
      const penMap = new Map<string, number>();
      try {
        const pokData = await fetchAndParseCSV<any[]>('https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=32687697&single=true&output=csv&hl=id');
          if (pokData.length > 0) {
            let headerIdx = 0;
            for (let i = 0; i < Math.min(10, pokData.length); i++) {
              const rowString = pokData[i].map(val => String(val).toLowerCase());
              if (rowString.some(val => val.includes('locator')) || rowString.some(val => val.includes('sku') || val.includes('search key'))) {
                headerIdx = i;
                break;
              }
            }
            const pokHeaders = pokData[headerIdx].map((h: any) => String(h).trim().toLowerCase());
            const colIdxSearchKey = pokHeaders.findIndex(h => h.includes('search key') || h === 'sku');
            const colIdxMoveQty = pokHeaders.findIndex(h => h.includes('move qty') || h.includes('move_qty'));
            const colIdxCabang = pokHeaders.findIndex(h => h.includes('cabang') || h.includes('area') || h.includes('branch'));

            if (colIdxSearchKey !== -1 && colIdxMoveQty !== -1 && colIdxCabang !== -1) {
              for (let i = headerIdx + 1; i < pokData.length; i++) {
                const row = pokData[i];
                if (!row || row.length <= Math.max(colIdxSearchKey, colIdxMoveQty, colIdxCabang)) continue;
                const searchKey = String(row[colIdxSearchKey]).trim().toUpperCase();
                const moveQtyStr = String(row[colIdxMoveQty]).trim().replace(/,/g, '');
                const moveQty = parseFloat(moveQtyStr) || 0;
                const cabang = String(row[colIdxCabang]).trim().toUpperCase();

                if (searchKey && cabang) {
                  const key = `${cabang}||${searchKey}`;
                  const currentVal = penMap.get(key) || 0;
                  penMap.set(key, currentVal + moveQty);
                }
              }
            }
        }
      } catch (e) {
        console.error("Error loading Pengepokan Move Qty in DoiMp:", e);
      }

      setAllTransactions(mappedRows);
      setProductsMap(pMap);
      setPengepokanMap(penMap);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error("Critical error in DoiMp loading:", err);
      setError(err.message || "Gagal memuat data stock untuk DOI MP");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [spreadsheetId, area]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Aggregate stock and transactions per Area + Product (SKU)
  const productSummary = useMemo(() => {
    const summaryMap = new Map<string, DoiMpRow>();

    allTransactions.forEach((t) => {
      const pCodeClean = t.pCode.toUpperCase().trim();
      const tAreaClean = (t.area || area).toUpperCase().trim();
      const key = `${tAreaClean}||${pCodeClean}`;

      const lCodeUpper = t.lCode.toUpperCase().trim();
      const isPidLocator = lCodeUpper.startsWith("PID");

      if (!summaryMap.has(key)) {
        const areaProdKey = `${tAreaClean}||${pCodeClean}`;
        const prodFromMap = productsMap.get(areaProdKey) || productsMap.get(pCodeClean);
        const prodNameFromMap = prodFromMap?.nama || t.pName;
        const prodRph = prodFromMap?.rph;

        summaryMap.set(key, {
          area: t.area || area,
          kodeProduk: t.pCode,
          namaProduk: prodNameFromMap,
          totalIn: 0,
          totalOut: 0,
          stock: 0,
          rph: prodRph,
          source: t.source,
          hasPidLocator: isPidLocator,
        });
      }

      const summary = summaryMap.get(key)!;
      if (isPidLocator) {
        summary.hasPidLocator = true;
      }

      const normalizedTipe = t.tipe.replace(/\s+/g, "").toUpperCase();
      const isIN = normalizedTipe === "IN" || normalizedTipe.includes("AWAL") || normalizedTipe === "MASUK" || normalizedTipe === "RECEIPT";
      const isOUT = normalizedTipe === "OUT" || normalizedTipe === "KELUAR" || normalizedTipe === "ISSUE" || normalizedTipe === "PEMAKAIAN" || normalizedTipe === "TRANSFER" || normalizedTipe === "TF";

      if (isIN) {
        summary.totalIn += t.qty;
        summary.stock += t.qty;
      } else if (isOUT) {
        summary.totalOut += t.qty;
        summary.stock -= t.qty;
      } else {
        if (t.qty > 0) {
          summary.totalIn += t.qty;
          summary.stock += t.qty;
        }
      }
    });

    return Array.from(summaryMap.values());
  }, [allTransactions, productsMap, area]);

  // Filter and compute statistics
  const filteredAndAnalyzedData = useMemo(() => {
    return productSummary.filter((s) => {
      // Search filter
      const searchLower = search.toLowerCase().trim();
      if (searchLower) {
        const matchSku = s.kodeProduk.toLowerCase().includes(searchLower);
        const matchName = s.namaProduk.toLowerCase().includes(searchLower);
        if (!matchSku && !matchName) return false;
      }

      // Area filter
      if (selectedArea !== "ALL" && s.area.toUpperCase().trim() !== selectedArea.toUpperCase().trim()) {
        return false;
      }

      // Source filter
      if (selectedSource !== "ALL" && s.source !== selectedSource) {
        return false;
      }

      // DOI Status calculation and filter
      const rph = s.rph;
      const isRphValid = rph !== undefined && !isNaN(rph) && rph > 0;

      const pCodeClean = s.kodeProduk.toUpperCase().trim();
      const areaClean = s.area.toUpperCase().trim();
      const key = `${areaClean}||${pCodeClean}`;
      const moveQty = pengepokanMap.get(key) || 0;
      const stockRiil = s.stock;
      const doi = isRphValid ? Math.max(0, (stockRiil - moveQty) / rph) : NaN;

      if (selectedDoiStatus !== "ALL") {
        if (!isRphValid || isNaN(doi)) {
          return selectedDoiStatus === "TANPA_RPH";
        }
        if (selectedDoiStatus === "TIDAK_AMAN") {
          return doi < 45;
        }
        if (selectedDoiStatus === "OVER") {
          return doi > 60;
        }
        if (selectedDoiStatus === "AMAN") {
          return doi >= 45 && doi <= 60;
        }
      }

      return true;
    });
  }, [productSummary, search, selectedArea, selectedSource, selectedDoiStatus, pengepokanMap]);

  // Statistics for Stock Over and Stock Tidak Aman
  const stats = useMemo(() => {
    let totalStockOver = 0;
    let totalStockTidakAman = 0;
    let totalStockAman = 0;
    let totalSkuCount = 0;

    productSummary.forEach((s) => {
      // Respect Area and Source filters for stats
      if (selectedArea !== "ALL" && s.area.toUpperCase().trim() !== selectedArea.toUpperCase().trim()) {
        return;
      }
      if (selectedSource !== "ALL" && s.source !== selectedSource) {
        return;
      }

      totalSkuCount++;

      const rph = s.rph;
      const isRphValid = rph !== undefined && !isNaN(rph) && rph > 0;

      if (isRphValid) {
        const pCodeClean = s.kodeProduk.toUpperCase().trim();
        const areaClean = s.area.toUpperCase().trim();
        const key = `${areaClean}||${pCodeClean}`;
        const moveQty = pengepokanMap.get(key) || 0;
        const stockRiil = s.stock;
        const doi = Math.max(0, (stockRiil - moveQty) / rph);

        if (!isNaN(doi)) {
          if (doi < 45) {
            totalStockTidakAman++;
          } else if (doi > 60) {
            totalStockOver++;
          } else {
            totalStockAman++;
          }
        }
      }
    });

    return {
      totalStockOver,
      totalStockTidakAman,
      totalStockAman,
      totalSkuCount
    };
  }, [productSummary, selectedArea, selectedSource, pengepokanMap]);

  // Unique lists for filters
  const uniqueAreas = useMemo(() => {
    const set = new Set<string>();
    productSummary.forEach((s) => {
      if (s.area) {
        set.add(s.area);
      }
    });
    return Array.from(set).sort();
  }, [productSummary]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAndAnalyzedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndAnalyzedData.slice(startIndex, startIndex + pageSize);
  }, [filteredAndAnalyzedData, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedArea, selectedSource, selectedDoiStatus]);

  // Export to Excel handler
  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    try {
      const dataToExport = filteredAndAnalyzedData.map((s) => {
        const rph = s.rph;
        const isRphValid = rph !== undefined && !isNaN(rph) && rph > 0;

        const pCodeClean = s.kodeProduk.toUpperCase().trim();
        const areaClean = s.area.toUpperCase().trim();
        const key = `${areaClean}||${pCodeClean}`;
        const moveQty = pengepokanMap.get(key) || 0;
        const stockRiil = s.stock;
        const doi = isRphValid ? Math.max(0, (stockRiil - moveQty) / rph) : NaN;

        let doiStatus = "-";
        if (isRphValid && !isNaN(doi)) {
          if (doi < 45) doiStatus = "Stock Tidak Aman";
          else if (doi > 60) doiStatus = "Stock Over";
          else doiStatus = "Stock Aman";
        }

        return {
          "Area/Cabang": s.area,
          "Kode Produk (SKU)": s.kodeProduk,
          "Nama Produk": s.namaProduk,
          "Kategori Sumber": s.source || "-",
          "Volume In": s.totalIn,
          "Volume Out": s.totalOut,
          "Stok Riil Saat Ini": s.stock,
          "Pengepokan Move Qty": moveQty,
          "RPH": isRphValid ? rph : "-",
          "Days Of Inventory (DOI)": isRphValid && !isNaN(doi) ? doi.toFixed(1) : "-",
          "Status DOI": doiStatus
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "DOI MP Analysis");
      
      // Auto-fit column widths
      const maxLens = dataToExport.reduce((acc, row) => {
        Object.keys(row).forEach((key) => {
          const val = String((row as any)[key] || "");
          acc[key] = Math.max(acc[key] || key.length, val.length);
        });
        return acc;
      }, {} as Record<string, number>);
      worksheet["!cols"] = Object.keys(maxLens).map((key) => ({ wch: maxLens[key] + 3 }));

      XLSX.writeFile(workbook, `DOI_MP_Rincian_Analisis_Stok_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Gagal mengunduh berkas Excel:", err);
      alert("Gagal mengunduh berkas Excel. Silakan coba kembali.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <h3 className="font-bold text-lg text-slate-800">Memproses Analisis DOI MP...</h3>
        <p className="text-sm text-slate-500 mt-2 text-center max-w-sm">
          Sistem sedang memuat, memetakan semua transaksi in/out, data RPH, dan Pengepokan Move Qty. Silakan tunggu beberapa saat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title Header Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 font-black" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Analisis DOI MP</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
                Material Planning &amp; Inventory KPI Panel
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed max-w-2xl">
            Sistem pengawasan berkala Days of Inventory (DOI) terpusat untuk memantau status persediaan aman, over, maupun tidak aman yang dihitung berdasarkan <strong>(Stok Riil - Pengepokan Move Qty) / RPH</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lastRefresh && (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-150 rounded px-2.5 py-1.5 flex items-center gap-1.5 shadow-inner">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              Update: {lastRefresh.toLocaleTimeString("id-ID")}
            </span>
          )}
          <button
            onClick={() => loadAllData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-500" : ""}`} />
            {isRefreshing ? "Sedang Memperbarui..." : "Perbarui Data"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-rose-900">Gagal Sinkronisasi Analisis DOI</h4>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
            <button 
              onClick={() => loadAllData(true)} 
              className="mt-3 text-xs font-bold text-rose-900 hover:underline flex items-center gap-1"
            >
              Coba Lagi <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total SKU Over */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Stock Over (DOI &gt; 60)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-amber-600 tracking-tight">{stats.totalStockOver}</span>
              <span className="text-xs font-bold text-slate-400">SKU</span>
            </div>
            <span className="text-[11px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded font-medium inline-block">
              Butuh Penyesuaian Penjualan
            </span>
          </div>
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Total SKU Tidak Aman */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Tidak Aman (DOI &lt; 45)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-rose-600 tracking-tight">{stats.totalStockTidakAman}</span>
              <span className="text-xs font-bold text-slate-400">SKU</span>
            </div>
            <span className="text-[11px] text-rose-500 bg-rose-50 px-2 py-0.5 rounded font-medium inline-block">
              Butuh Pengisian Cepat / Reorder
            </span>
          </div>
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        {/* Total SKU Aman */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Stock Aman (45 &lt;= DOI &lt;= 60)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-emerald-600 tracking-tight">{stats.totalStockAman}</span>
              <span className="text-xs font-bold text-slate-400">SKU</span>
            </div>
            <span className="text-[11px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded font-medium inline-block">
              Persediaan Optimal
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Total Di bawah Pengawasan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total SKU Terhitung</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-800 tracking-tight">{stats.totalSkuCount}</span>
              <span className="text-xs font-bold text-slate-400">SKU</span>
            </div>
            <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-medium inline-block">
              Semua Jenis Material
            </span>
          </div>
          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-500">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Control Filters Area */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-slate-800 uppercase tracking-wide">Penyaringan Rincian Analisis</span>
          </div>
          <button
            onClick={() => {
              setSearch("");
              setSelectedSource("ALL");
              setSelectedDoiStatus("ALL");
              if (area === "All Cabang" || area === "HQ") {
                setSelectedArea("ALL");
              }
            }}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Box */}
          <div className="relative">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cari Produk (SKU / Nama)</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Masukkan kode SKU atau nama..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-800 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-medium"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Area Filter */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Area / Cabang</label>
            <div className="relative">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                disabled={area !== "All Cabang" && area !== "HQ"}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="ALL">Semua Cabang (All)</option>
                {uniqueAreas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <MapPin className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Category/Source Filter */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kategori Material</label>
            <div className="relative">
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-bold"
              >
                <option value="ALL">Semua Kategori (All)</option>
                <option value="INPUT">Accessories (INPUT)</option>
                <option value="INPUT RM">Raw Material</option>
                <option value="INPUT MFG">Manufacturing</option>
                <option value="INPUT SUPPLIES">Supplies &amp; GA</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ListFilter className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* DOI Status Filter */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status Kriteria DOI</label>
            <div className="relative">
              <select
                value={selectedDoiStatus}
                onChange={(e) => setSelectedDoiStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-bold"
              >
                <option value="ALL">Semua Status DOI</option>
                <option value="AMAN">Stock Aman (DOI 45-60)</option>
                <option value="OVER">Stock Over (DOI &gt; 60)</option>
                <option value="TIDAK_AMAN">Stock Tidak Aman (DOI &lt; 45)</option>
                <option value="TANPA_RPH">Tanpa DOI (Belum Ada RPH)</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <CircleAlert className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Analysis Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-5 border-b border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="font-extrabold text-sm text-slate-800 block">Rincian Analisis Stok</span>
            <span className="text-xs text-slate-400">
              Menampilkan {filteredAndAnalyzedData.length} dari total {productSummary.length} SKU terdaftar
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportToExcel}
              disabled={filteredAndAnalyzedData.length === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-extrabold text-xs px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor Hasil ke Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#FAFBFD] border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-4">Area / Cabang</th>
                <th className="px-5 py-4">Nama &amp; Kode Produk (SKU)</th>
                <th className="px-5 py-4 text-right">Volume In</th>
                <th className="px-5 py-4 text-right">Volume Out</th>
                <th className="px-5 py-4 text-right">Stok Riil Saat Ini</th>
                <th className="px-5 py-4 text-right">Pengepokan Move</th>
                <th className="px-5 py-4 text-right">RPH</th>
                <th className="px-5 py-4 text-right">DOI (Status)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Package className="w-10 h-10 text-slate-300" />
                      <span className="font-bold text-slate-600">Tidak Ada Data Ditemukan</span>
                      <span className="text-xs max-w-sm">
                        Coba periksa kembali query pencarian Anda atau ubah filter cabang/kriteria DOI.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((s, idx) => {
                  const rph = s.rph;
                  const isRphValid = rph !== undefined && !isNaN(rph) && rph > 0;

                  const pCodeClean = s.kodeProduk.toUpperCase().trim();
                  const areaClean = s.area.toUpperCase().trim();
                  const key = `${areaClean}||${pCodeClean}`;
                  const moveQty = pengepokanMap.get(key) || 0;
                  const stockRiil = s.stock;
                  const doi = isRphValid ? Math.max(0, (stockRiil - moveQty) / rph) : NaN;

                  let doiClass = "px-5 py-4 text-right text-slate-400";
                  let statusLabel = "-";
                  let statusComp = <span className="text-slate-400 font-mono">-</span>;

                  if (isRphValid && !isNaN(doi)) {
                    if (doi < 45) {
                      doiClass = "px-5 py-4 text-right bg-rose-50 text-rose-900 font-medium transition-colors border-l-4 border-rose-500";
                      statusLabel = "Stock Tidak Aman";
                    } else if (doi > 60) {
                      doiClass = "px-5 py-4 text-right bg-amber-50 text-amber-900 font-medium transition-colors border-l-4 border-amber-500";
                      statusLabel = "Stock Over";
                    } else {
                      doiClass = "px-5 py-4 text-right bg-emerald-50 text-emerald-900 font-medium transition-colors border-l-4 border-emerald-500";
                      statusLabel = "Stock Aman";
                    }

                    statusComp = (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-[13px] font-black">{doi.toFixed(1)}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-95">{statusLabel}</span>
                      </div>
                    );
                  }

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors text-slate-700">
                      {/* Area */}
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs bg-blue-50 border border-blue-100 text-blue-700 rounded-full px-2.5 py-0.5 font-extrabold uppercase tracking-wide">
                            {s.area}
                          </span>
                        </div>
                      </td>

                      {/* Nama & SKU */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 leading-tight max-w-xs truncate" title={s.namaProduk}>
                          {s.namaProduk}
                        </div>
                        <div className="text-[10.5px] text-slate-400 mt-1 font-mono flex items-center gap-1">
                          <span>SKU: {s.kodeProduk}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[9.5px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded border border-slate-200">
                            {s.source || "Unknown"}
                          </span>
                        </div>
                      </td>

                      {/* Volume In */}
                      <td className="px-5 py-4 text-right text-emerald-600 font-bold font-mono">
                        {s.totalIn > 0 ? `+${s.totalIn.toLocaleString()}` : "-"}
                      </td>

                      {/* Volume Out */}
                      <td className="px-5 py-4 text-right text-rose-600 font-bold font-mono">
                        {s.totalOut > 0 ? `-${s.totalOut.toLocaleString()}` : "-"}
                      </td>

                      {/* Stok Riil */}
                      <td className={`px-5 py-4 text-right font-extrabold text-[15px] font-mono ${s.stock < 0 ? "text-rose-600" : "text-slate-900"}`}>
                        {s.stock.toLocaleString()}
                      </td>

                      {/* Pengepokan Move */}
                      <td className="px-5 py-4 text-right text-slate-500 font-medium font-mono">
                        {moveQty > 0 ? moveQty.toLocaleString() : "-"}
                      </td>

                      {/* RPH */}
                      <td className="px-5 py-4 text-right text-slate-500 font-medium font-mono">
                        {rph !== undefined && rph > 0 ? rph.toLocaleString() : "-"}
                      </td>

                      {/* DOI (Status) */}
                      <td className={doiClass}>
                        {statusComp}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredAndAnalyzedData.length > 0 && (
          <div className="p-5 border-t border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Baris per halaman:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-250 text-slate-700 font-bold text-xs rounded px-2 py-1 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 justify-center">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="p-1 px-2 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-all border border-slate-200 rounded"
              >
                « First
              </button>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1 px-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-all border border-slate-200 rounded"
              >
                ‹ Prev
              </button>
              <span className="text-xs font-extrabold text-slate-700 bg-blue-50 px-3 py-1.5 rounded border border-blue-100">
                {currentPage} / {totalPages || 1}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1 px-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-all border border-slate-200 rounded"
              >
                Next ›
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1 px-2 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-all border border-slate-200 rounded"
              >
                Last »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(DoiMp);
