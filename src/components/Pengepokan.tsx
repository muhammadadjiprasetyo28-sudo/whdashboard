import { fetchAndParseCSV } from "../lib/csvCache";
import { useEffect, useState, useMemo , memo} from "react";
import { Loader2, AlertTriangle, RefreshCw, BarChart3, ArrowDownToLine, CheckCircle2, CircleAlert, Percent, Box, MapPin, Search } from 'lucide-react';
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

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

interface TableRowData {
  locator: string;
  searchKey: string;
  name: string;
  uom: string;
  startQty: number;
  mr: number;
  crPlus: number;
  matToPlus: number;
  prodPlus: number;
  shipMinus: number;
  vendRetMinus: number;
  matFromMinus: number;
  pMinus: number;
  adjPlus: number;
  lastQty: number;
  moveQty: number;
  selisih: number;
  noDocument: string;
  cabang: string;
  movementDate: string;
}

interface CabangSummary {
  cabang: string;
  totalLastQty: number;
  totalMoveQty: number;
  totalSelisih: number;
  skuSelisih: number;
}

function Pengepokan() {
  const [loading, setLoading] = useState(true);
  const [rawRows, setRawRows] = useState<TableRowData[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCabangFilter, setSelectedCabangFilter] = useState('ALL');
  const [selectedSelisihFilter, setSelectedSelisihFilter] = useState('ALL');

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCabangFilter, searchQuery, selectedSelisihFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Construct Google Sheet CSV URL with explicit GID for the "Update MTS POK" sheet tab
      const data = await fetchAndParseCSV<any[]>('https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=32687697&single=true&output=csv&hl=id');

      if (data.length === 0) {
        throw new Error('Data sheet kosong.');
      }

      // Detect header row (usually contains Locator, Search Key, Name, UOM, etc.)
      let headerIndex = -1;
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const rowString = data[i].map(val => String(val).toLowerCase());
        const hasLocator = rowString.some(val => val.includes('locator'));
        const hasSearchKey = rowString.some(val => val.includes('search key') || val.includes('sku'));
        if (hasLocator || hasSearchKey) {
          headerIndex = i;
          break;
        }
      }

      // Default fallback fallback to 0 if not found
      if (headerIndex === -1) {
        headerIndex = 0;
      }

      const headers = data[headerIndex].map((h: any) => String(h).trim());

      // Helper to find exact column index of variations
      const getColIndex = (names: string[]) => {
        return headers.findIndex(h => 
          names.some(name => h.toLowerCase() === name.toLowerCase())
        );
      };

      // Map headers to respective indices
      const idxLocator = getColIndex(['locator']);
      const idxSearchKey = getColIndex(['search key', 'sku']);
      const idxName = getColIndex(['name', 'nama', 'nama bahan']);
      const idxUom = getColIndex(['uom', 'satuan']);
      const idxStartQty = getColIndex(['start qty', 'start_qty']);
      const idxMr = getColIndex(['mr']);
      const idxCrPlus = getColIndex(['cr+', 'cr +']);
      const idxMatToPlus = getColIndex(['matto+', 'matto +', 'mat to+', 'mat to +']);
      const idxProdPlus = getColIndex(['prod +', 'prod+', 'prod_plus']);
      const idxShipMinus = getColIndex(['ship -', 'ship-', 'ship_minus']);
      const idxVendRetMinus = getColIndex(['vendret -', 'vendret-', 'vend ret -', 'vend ret-']);
      const idxMatFromMinus = getColIndex(['matfrom -', 'matfrom-', 'mat from -', 'mat from-']);
      const idxPMinus = getColIndex(['p-', 'p -']);
      const idxAdjPlus = getColIndex(['adj+', 'adj +']);
      const idxLastQty = getColIndex(['last qty', 'last_qty']);
      const idxMoveQty = getColIndex(['move qty', 'move_qty']);
      const idxSelisih = getColIndex(['selisih', 'selisih qty']);
      const idxNoDoc = getColIndex(['no. document', 'no document', 'document number', 'no_doc']);
      const idxCabang = getColIndex(['cabang', 'area', 'branch']);
      const idxMvDate = getColIndex(['movement date', 'movement_date', 'date']);

      const parsedRows: TableRowData[] = [];

      const parseNumber = (val: any): number => {
        if (val === undefined || val === null) return 0;
        let str = String(val).trim().replace(/[^0-9.-]/g, '');
        if (str.startsWith('.')) str = '0' + str;
        const parsedVal = parseFloat(str);
        return isNaN(parsedVal) ? 0 : parsedVal;
      };

      for (let i = headerIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (row.length === 0 || !row.some((val: any) => String(val).trim() !== '')) {
          continue; // Skip empty rows
        }

        const locator = idxLocator !== -1 ? String(row[idxLocator] || '').trim() : '';
        const searchKey = idxSearchKey !== -1 ? String(row[idxSearchKey] || '').trim() : '';
        const name = idxName !== -1 ? String(row[idxName] || '').trim() : '';
        const uom = idxUom !== -1 ? String(row[idxUom] || '').trim() : '';
        const startQty = idxStartQty !== -1 ? parseNumber(row[idxStartQty]) : 0;
        const mr = idxMr !== -1 ? parseNumber(row[idxMr]) : 0;
        const crPlus = idxCrPlus !== -1 ? parseNumber(row[idxCrPlus]) : 0;
        const matToPlus = idxMatToPlus !== -1 ? parseNumber(row[idxMatToPlus]) : 0;
        const prodPlus = idxProdPlus !== -1 ? parseNumber(row[idxProdPlus]) : 0;
        const shipMinus = idxShipMinus !== -1 ? parseNumber(row[idxShipMinus]) : 0;
        const vendRetMinus = idxVendRetMinus !== -1 ? parseNumber(row[idxVendRetMinus]) : 0;
        const matFromMinus = idxMatFromMinus !== -1 ? parseNumber(row[idxMatFromMinus]) : 0;
        const pMinus = idxPMinus !== -1 ? parseNumber(row[idxPMinus]) : 0;
        const adjPlus = idxAdjPlus !== -1 ? parseNumber(row[idxAdjPlus]) : 0;
        const lastQty = idxLastQty !== -1 ? parseNumber(row[idxLastQty]) : 0;
        const moveQty = idxMoveQty !== -1 ? parseNumber(row[idxMoveQty]) : 0;
        const selisih = idxSelisih !== -1 ? parseNumber(row[idxSelisih]) : 0;
        const noDocument = idxNoDoc !== -1 ? String(row[idxNoDoc] || '').trim() : '';
        const cabang = idxCabang !== -1 ? String(row[idxCabang] || '').trim() : 'Cabang Utama';
        const movementDate = idxMvDate !== -1 ? String(row[idxMvDate] || '').trim() : '';

        // Exclude all sub total and total rows
        const locatorLower = locator.toLowerCase();
        const searchKeyLower = searchKey.toLowerCase();
        const nameLower = name.toLowerCase();
        const cabangLower = cabang.toLowerCase();

        const isSubTotal = 
          locatorLower === 'total' || locatorLower.includes('subtotal') || locatorLower.includes('sub total') ||
          searchKeyLower === 'total' || searchKeyLower.includes('subtotal') || searchKeyLower.includes('sub total') ||
          nameLower === 'total' || nameLower.includes('subtotal') || nameLower.includes('sub total') || nameLower.startsWith('total ') ||
          cabangLower === 'total' || cabangLower.includes('subtotal') || cabangLower.includes('sub total');

        if (isSubTotal) {
          continue;
        }

        // Only insert if there's representative data
        if (locator || searchKey || name || cabang) {
          parsedRows.push({
            locator,
            searchKey,
            name,
            uom,
            startQty,
            mr,
            crPlus,
            matToPlus,
            prodPlus,
            shipMinus,
            vendRetMinus,
            matFromMinus,
            pMinus,
            adjPlus,
            lastQty,
            moveQty,
            selisih,
            noDocument,
            cabang,
            movementDate
          });
        }
      }

      setRawRows(parsedRows);

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Gagal memuat data Pengepokan: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Aggregated summaries per cabang for Chart and Cards
  const cabangSummaries = useMemo<CabangSummary[]>(() => {
    const summaryMap = new Map<string, { lastQty: number; moveQty: number; selisih: number; skuSelisih: number }>();

    rawRows.forEach(row => {
      const cab = row.cabang || 'Lainnya';
      if (!summaryMap.has(cab)) {
        summaryMap.set(cab, { lastQty: 0, moveQty: 0, selisih: 0, skuSelisih: 0 });
      }

      const entry = summaryMap.get(cab)!;
      entry.lastQty += row.lastQty;
      entry.moveQty += row.moveQty;
      entry.selisih += row.selisih;
      if (row.selisih !== 0) {
        entry.skuSelisih += 1;
      }
    });

    const list: CabangSummary[] = [];
    summaryMap.forEach((val, cab) => {
      list.push({
        cabang: cab,
        totalLastQty: val.lastQty,
        totalMoveQty: val.moveQty,
        totalSelisih: val.selisih,
        skuSelisih: val.skuSelisih
      });
    });

    // Sort by cabang name alphabetically
    return list.sort((a, b) => a.cabang.localeCompare(b.cabang));
  }, [rawRows]);

  // Unique list of cabang names for drop-down filter
  const uniqueCabangNames = useMemo(() => {
    return Array.from(new Set(rawRows.map(r => r.cabang))).filter(Boolean).sort();
  }, [rawRows]);

  // Filtered Table Data
  const filteredTableData = useMemo(() => {
    return rawRows.filter(row => {
      const matchCabang = selectedCabangFilter === 'ALL' || row.cabang === selectedCabangFilter;
      const matchSearch = !searchQuery || 
        row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.locator.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.searchKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.noDocument.toLowerCase().includes(searchQuery.toLowerCase());

      let matchSelisih = true;
      if (selectedSelisihFilter === 'HAVE_DISCREPANCY') {
        matchSelisih = row.selisih !== 0;
      } else if (selectedSelisihFilter === 'NO_DISCREPANCY') {
        matchSelisih = row.selisih === 0;
      } else if (selectedSelisihFilter === 'OVER_STOCK') {
        matchSelisih = row.selisih > 0;
      } else if (selectedSelisihFilter === 'UNDER_STOCK') {
        matchSelisih = row.selisih < 0;
      }

      return matchCabang && matchSearch && matchSelisih;
    });
  }, [rawRows, selectedCabangFilter, searchQuery, selectedSelisihFilter]);

  // Paginated Table Data
  const paginatedTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTableData.slice(startIndex, startIndex + pageSize);
  }, [filteredTableData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTableData.length / pageSize);

  // Combined metrics
  const totalLastQtyAll = useMemo(() => rawRows.reduce((a, b) => a + b.lastQty, 0), [rawRows]);
  const totalMoveQtyAll = useMemo(() => rawRows.reduce((a, b) => a + b.moveQty, 0), [rawRows]);
  const totalSelisihAll = useMemo(() => rawRows.reduce((a, b) => a + b.selisih, 0), [rawRows]);
  const totalSkuSelisihAll = useMemo(() => {
    // Count of rows/SKUs having discrepancy in the active dataset
    return rawRows.filter(row => row.selisih !== 0).length;
  }, [rawRows]);

  const exportTableToExcel = async () => {
    const XLSX = await import("xlsx");
    try {
      const dataToExport = filteredTableData.map(item => ({
        'Locator': item.locator,
        'Search Key': item.searchKey,
        'Name': item.name,
        'UOM': item.uom,
        'Start Qty': item.startQty,
        'MR': item.mr,
        'CR+': item.crPlus,
        'MatTO+': item.matToPlus,
        'Prod +': item.prodPlus,
        'Ship -': item.shipMinus,
        'VendRet -': item.vendRetMinus,
        'MatFrom -': item.matFromMinus,
        'P-': item.pMinus,
        'Adj+': item.adjPlus,
        'Last Qty': item.lastQty,
        'Move Qty': item.moveQty,
        'Selisih': item.selisih,
        'No. Document': item.noDocument,
        'Cabang': item.cabang,
        'Movement Date': item.movementDate
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pengepokan_Update_MTS');

      const colWidths = [
        { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 8 }, { wch: 10 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 15 }
      ];
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, `Laporan_Pengepokan_${selectedCabangFilter === 'ALL' ? 'ALL_CABANG' : selectedCabangFilter}.xlsx`);
    } catch (e: any) {
      alert('Ekspor Excel Gagal: ' + e.message);
    }
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Box className="w-6 h-6 text-green-600" />
            Laporan Pengepokan (Update MTS POK)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Data rekapitulasi pergerakan stok, verifikasi "Last Qty" vs "Move Qty", serta analisis selisih di seluruh Cabang.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition duration-200 active:bg-slate-200/50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Sinkronisasi Data
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Last Qty</span>
            <div className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : totalLastQtyAll.toLocaleString()}</div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Akumulasi sistem akhir</span>
          </div>
          <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center">
            <Box className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Move Qty</span>
            <div className="text-2xl font-black text-indigo-600 mt-1">{loading ? '...' : totalMoveQtyAll.toLocaleString()}</div>
            <span className="text-[10px] text-indigo-400 mt-0.5 block">Perubahan fisik riil</span>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Selisih</span>
            <div className={cn("text-2xl font-black mt-1", totalSelisihAll !== 0 ? "text-rose-600" : "text-emerald-600")}>
              {loading ? '...' : (totalSelisihAll > 0 ? `+${totalSelisihAll.toLocaleString()}` : totalSelisihAll.toLocaleString())}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Netto ketidaksesuaian</span>
          </div>
          <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">SKU Selisih</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{loading ? '...' : totalSkuSelisihAll.toLocaleString()}</div>
            <span className="text-[10px] text-emerald-400 mt-0.5 block">Jumlah SKU yang memiliki selisih</span>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 flex flex-col items-center justify-center shadow-sm">
          <Loader2 className="w-10 h-10 text-green-600 animate-spin mb-4" />
          <p className="text-slate-600 font-semibold text-sm">Menghubungi Google Drive & Mengunduh Update MTS POK...</p>
          <p className="text-slate-400 text-xs mt-1">Mengonversi format data transaksional Pengepokan secara instant.</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-8 text-center text-rose-800">
          <CircleAlert className="w-10 h-10 mx-auto mb-3 text-rose-600" />
          <p className="font-bold text-sm">{errorMsg}</p>
          <p className="text-xs text-rose-500 mt-1">Gagal membaca data dari tautan eksternal. Pastikan pengaturan privasi lembar kerja telah disetel "Dipublikasikan ke Web (Web Published)".</p>
          <button onClick={loadData} className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition duration-200">
            Segarkan Kembali
          </button>
        </div>
      ) : (
        <>
          {/* Charts Segment */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Grafik Komparatif Pengepokan per Cabang
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">Membandingkan Last Qty, Move Qty, Selisih, dan SKU Selisih di setiap Cabang aktif.</p>
            </div>

            <div className="w-full h-80 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cabangSummaries} margin={{ top: 20, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="cabang" 
                    tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    yAxisId="left" 
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{ value: 'Kuantitas Unit (Stok)', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 11, fontWeight: 600 } }}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    domain={[0, 'auto']}
                    tick={{ fill: '#10b981', fontSize: 10 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{ value: 'SKU Selisih (Count)', angle: 90, position: 'insideRight', style: { fill: '#10b981', fontSize: 11, fontWeight: 600 } }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px -2px rgba(0,0,0,0.05)' }}
                    formatter={(value: any, name: string) => {
                      if (name === 'totalLastQty') return [`${value.toLocaleString()} Qty`, 'Total Last Qty'];
                      if (name === 'totalMoveQty') return [`${value.toLocaleString()} Qty`, 'Total Move Qty'];
                      if (name === 'totalSelisih') return [`${value.toLocaleString()} Qty`, 'Total Selisih'];
                      if (name === 'skuSelisih') return [`${value} SKU`, 'SKU Selisih'];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 10 }} />
                  <Bar yAxisId="left" dataKey="totalLastQty" name="Last Qty" fill="#4f46e5" radius={[3, 3, 0, 0]} barSize={20} />
                  <Bar yAxisId="left" dataKey="totalMoveQty" name="Move Qty" fill="#06b6d4" radius={[3, 3, 0, 0]} barSize={20} />
                  <Bar yAxisId="left" dataKey="totalSelisih" name="Selisih" fill="#f43f5e" radius={[3, 3, 0, 0]} barSize={20} />
                  <Line yAxisId="right" type="monotone" dataKey="skuSelisih" name="SKU selisih" stroke="#10b981" strokeWidth={3} dot={{ r: 4, stroke: '#10b981', fill: '#fff' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table Area */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col lm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Box className="w-5 h-5 text-green-500" />
                  Tabel Rinci Rekapitulasi Pengepokan
                </h3>
                <p className="text-xs text-slate-500 mt-1">Ditemukan {filteredTableData.length} item data, membandingkan data mutasi MTS (Update POK).</p>
              </div>

              {/* Filtering Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Kode, bahan, No Dok..."
                    className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500/20 w-44 font-semibold text-slate-700"
                  />
                </div>

                <select
                  value={selectedCabangFilter}
                  onChange={e => setSelectedCabangFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold text-slate-700 bg-white cursor-pointer"
                >
                  <option value="ALL">Semua Cabang (Filter)</option>
                  {uniqueCabangNames.map(cab => (
                    <option key={cab} value={cab}>{cab}</option>
                  ))}
                </select>

                <select
                  value={selectedSelisihFilter}
                  onChange={e => setSelectedSelisihFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold text-slate-700 bg-white cursor-pointer"
                >
                  <option value="ALL">Semua Selisih (Filter)</option>
                  <option value="HAVE_DISCREPANCY">Ada Selisih (⚠️)</option>
                  <option value="NO_DISCREPANCY">Sesuai (✅)</option>
                  <option value="OVER_STOCK">Selisih Lebih (&gt; 0)</option>
                  <option value="UNDER_STOCK">Selisih Kurang (&lt; 0)</option>
                </select>

                <button
                  onClick={exportTableToExcel}
                  disabled={filteredTableData.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  Ekspor Excel
                </button>
              </div>
            </div>

            {filteredTableData.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700 text-xs">Data Pengepokan Tidak Ditemukan</p>
                <p className="text-slate-400 text-[11px] mt-1">Silakan sesuaikan filter pencarian atau pastikan sheet update terisi.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 select-none text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                      <th className="px-3 py-3.5">Branch</th>
                      <th className="px-3 py-3.5">Locator</th>
                      <th className="px-3 py-3.5">Search Key</th>
                      <th className="px-3 py-3.5">Name</th>
                      <th className="px-3 py-3.5">UOM</th>
                      <th className="px-3 py-3.5 text-right">Start Qty</th>
                      <th className="px-2 py-3.5 text-right">MR</th>
                      <th className="px-2 py-3.5 text-right">CR+</th>
                      <th className="px-2 py-3.5 text-right">M-TO+</th>
                      <th className="px-2 py-3.5 text-right">Prod+</th>
                      <th className="px-2 py-3.5 text-right">Ship-</th>
                      <th className="px-2 py-3.5 text-right">V-Ret-</th>
                      <th className="px-2 py-3.5 text-right">M-Fr-</th>
                      <th className="px-2 py-3.5 text-right">P-</th>
                      <th className="px-2 py-3.5 text-right">Adj+</th>
                      <th className="px-3 py-3.5 text-right">Last Qty</th>
                      <th className="px-3 py-3.5 text-right">Move Qty</th>
                      <th className="px-3 py-3.5 text-right">Selisih</th>
                      <th className="px-3 py-3.5">No. Document</th>
                      <th className="px-3 py-3.5">Movement Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-[11px] text-slate-600">
                    {paginatedTableData.map((item, idx) => {
                      const isOver = item.selisih > 0;
                      const hasSelisih = item.selisih !== 0;
                      return (
                        <tr key={idx} className={cn("hover:bg-slate-50 transition-colors", hasSelisih ? "bg-rose-50/20" : "")}>
                          <td className="px-3 py-2.5 font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                            {item.cabang}
                          </td>
                          <td className="px-3 py-2.5"><span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold">{item.locator}</span></td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{item.searchKey}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis" title={item.name}>{item.name}</td>
                          <td className="px-3 py-2.5"><span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-extrabold">{item.uom}</span></td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-500">{item.startQty.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500">{item.mr !== 0 ? item.mr.toLocaleString() : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-green-600">{item.crPlus !== 0 ? `+${item.crPlus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-green-600">{item.matToPlus !== 0 ? `+${item.matToPlus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-green-600">{item.prodPlus !== 0 ? `+${item.prodPlus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-rose-500">{item.shipMinus !== 0 ? `-${item.shipMinus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-rose-500">{item.vendRetMinus !== 0 ? `-${item.vendRetMinus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-rose-500">{item.matFromMinus !== 0 ? `-${item.matFromMinus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-rose-500">{item.pMinus !== 0 ? `-${item.pMinus.toLocaleString()}` : '-'}</td>
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 text-green-600">{item.adjPlus !== 0 ? `+${item.adjPlus.toLocaleString()}` : '-'}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800 font-mono">{item.lastQty.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800 font-mono">{item.moveQty.toLocaleString()}</td>
                          <td className={cn("px-3 py-2.5 text-right font-black font-mono", hasSelisih ? (isOver ? "text-green-600" : "text-rose-600") : "text-slate-400")}>
                            {hasSelisih ? (isOver ? `+${item.selisih.toLocaleString()}` : item.selisih.toLocaleString()) : '0'}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis" title={item.noDocument}>{item.noDocument || '-'}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.movementDate || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Tampilkan:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-slate-700 font-bold bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value={30}>30 baris</option>
                    <option value={50}>50 baris</option>
                    <option value={100}>100 baris</option>
                  </select>
                  <span className="text-slate-400 font-medium">
                    Menampilkan {filteredTableData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(filteredTableData.length, currentPage * pageSize)} dari {filteredTableData.length} baris
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed select-none"
                  >
                    Sebelumnya
                  </button>
                  <div className="flex items-center gap-1 font-mono text-xs">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5 && currentPage > 3) {
                        if (currentPage + 2 <= totalPages) {
                          pageNum = currentPage - 3 + i + 1;
                        } else {
                          pageNum = totalPages - 5 + i + 1;
                        }
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center border font-bold transition",
                            currentPage === pageNum
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 5 && currentPage + 2 < totalPages && (
                      <span className="text-slate-400 px-1">...</span>
                    )}
                    {totalPages > 5 && currentPage + 3 <= totalPages && (
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center border font-bold transition",
                          currentPage === totalPages
                            ? "bg-green-600 text-white border-green-600"
                            : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
                        )}
                      >
                        {totalPages}
                      </button>
                    )}
                  </div>
                  <button
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed select-none"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            </>)}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(Pengepokan);
