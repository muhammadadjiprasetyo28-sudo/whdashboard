import { fetchAndParseCSV } from "../../lib/csvCache";
import { useEffect, useState, useMemo , memo, useRef} from "react";
import { Loader2, Search, FileSpreadsheet, RefreshCw, ChevronUp, ChevronDown, Info, Download } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function MtsData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const csvUrl = `/api/stock-summary?t=${Date.now()}`;
      
      const data = await fetchAndParseCSV<string[]>('/api/stock-summary', false, 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=263347272&single=true&output=csv');

      let headerIndex = 0;
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const nonEmpCount = data[i].filter(val => String(val).trim().length > 0).length;
        if (nonEmpCount > 3) {
          headerIndex = i;
          break;
        }
      }

      const rawHeaders = data[headerIndex] || [];
      const cleanedHeaders = rawHeaders.map(h => String(h).trim());
      
      const rawRows = data.slice(headerIndex + 1);
      const cleanedRows = rawRows.filter(row => {
        return row.some(cell => String(cell).trim().length > 0);
      });

      setHeaders(cleanedHeaders);
      setRows(cleanedRows);
    } catch (err: any) {
      console.error('Error fetching MTS CSV:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat data MTS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const displayIndices = useMemo(() => {
    const targets = ["Locator", "Search Key", "Name", "UOM", "START QTY", "LAST QTY"];
    return targets.map(target => {
      const exactIdx = headers.findIndex(h => h.trim().toLowerCase() === target.toLowerCase());
      if (exactIdx !== -1) return { label: target, originalIndex: exactIdx };
      const partialIdx = headers.findIndex(h => h.trim().toLowerCase().includes(target.toLowerCase()));
      if (partialIdx !== -1) return { label: target, originalIndex: partialIdx };
      return null;
    }).filter((item): item is { label: string; originalIndex: number } => item !== null);
  }, [headers]);

  const handleSort = (index: number) => {
    if (sortColumn === index) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(index);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(row => 
      row.some(cell => String(cell).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    if (sortColumn === null) return filteredRows;
    
    return [...filteredRows].sort((a, b) => {
      const aVal = String(a[sortColumn] || '').trim();
      const bVal = String(b[sortColumn] || '').trim();

      const aNum = parseFloat(aVal.replace(/[,.]/g, ''));
      const bNum = parseFloat(bVal.replace(/[,.]/g, ''));
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    if (sortedRows.length === 0 || headers.length === 0) {
      alert("Tidak ada data untuk diekspor");
      return;
    }
    const dataToExport = sortedRows.map(row => {
      const obj: any = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MTS Data");
    XLSX.writeFile(wb, `Data_MTS_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Data MTS (Material Transfer Slip)
          </h2>
          <p className="text-sm text-slate-500">
            Arsip pelacakan pengiriman & transfer material real-time dari multi-wilayah.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={exportToExcel} 
            disabled={loading || sortedRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button 
            type="button"
            onClick={loadData} 
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
            Segarkan Data
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl text-rose-800 text-sm flex gap-3 items-start shadow-sm">
          <span className="font-bold text-base mt-[-2px]">⚠️</span>
          <div>
            <span className="font-semibold">Sambungan Gagal:</span> {error}. 
            Pastikan koneksi internet lancar atau muat ulang dashboard.
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Cari data MTS..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400" 
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 self-start sm:self-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Total Records: {rows.length} baris
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <div className="text-sm font-semibold text-slate-600">Menghubungkan ke Google Docs Feed...</div>
              <div className="text-xs text-slate-400 max-w-xs text-center">Megunduh file CSV and menguraikan data baris dengan PapaParse.</div>
            </div>
          ) : (
            <>
              <table className="w-full text-left text-sm whitespace-nowrap divide-y divide-slate-150">
                <thead className="bg-slate-50/85 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    {displayIndices.map((col) => (
                      <th 
                        key={`${col.label}-${col.originalIndex}`} 
                        onClick={() => handleSort(col.originalIndex)}
                        className="px-5 py-4 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.label}
                          {sortColumn === col.originalIndex ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <span className="opacity-20 hover:opacity-100"><ChevronDown className="w-3.5 h-3.5" /></span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={displayIndices.length || 1} className="p-16 text-center text-slate-500 italic">
                        Tidak ada data MTS yang cocok dengan pencarian Anda.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, rowIdx) => (
                      <tr 
                        key={rowIdx} 
                        className="hover:bg-blue-50/20 active:bg-blue-50/40 transition-colors text-slate-700 font-medium"
                      >
                        {displayIndices.map((col, cIdx) => (
                          <td 
                            key={`${rowIdx}-${col.originalIndex}`} 
                            className={cn(
                              "px-5 py-3.5 max-w-xs truncate text-xs sm:text-sm",
                              cIdx === 0 && "font-mono font-bold text-slate-800",
                              String(row[col.originalIndex]).trim().toLowerCase() === 'selesai' && "text-emerald-600 font-semibold",
                              String(row[col.originalIndex]).trim().toLowerCase() === 'pending' && "text-amber-600 font-semibold"
                            )}
                            title={String(row[col.originalIndex])}
                          >
                            {row[col.originalIndex] !== undefined ? String(row[col.originalIndex]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {sortedRows.length > 0 && (
                <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50">
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <select 
                      value={pageSize} 
                      onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={15}>15 baris</option>
                      <option value={50}>50 baris</option>
                      <option value={100}>100 baris</option>
                      <option value={200}>200 baris</option>
                    </select>
                    <span>Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedRows.length)} dari {sortedRows.length} baris</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3.5 py-1.5 border border-slate-200 rounded-md bg-white text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                    >
                      Sebelumnya
                    </button>
                    <div className="text-xs text-slate-500 px-2 font-semibold">
                      Halaman {currentPage} dari {totalPages || 1}
                    </div>
                    <button 
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="px-3.5 py-1.5 border border-slate-200 rounded-md bg-white text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-slate-600 text-xs sm:text-sm">
        <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-800">Operasional HQ:</span> Tabel di atas ditarik langsung dari lembar kerja MTS khusus di Google Sheets secara real-time. Anda dapat menyaring data instan melalui kotak pencarian atau mengurutkan nilai secara alfabetis/numeris dengan mengklik tajuk kolom.
        </div>
      </div>
    </div>
  );
}

export default memo(MtsData);
