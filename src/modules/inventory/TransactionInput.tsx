import React, { useEffect, useState, useMemo, useRef, type FormEvent , memo} from "react";
import { fetchSheetData, appendSheetRow, fetchCombinedProducts } from '../../lib/sheets';
import type { Transaction, Product, Locator } from '../../shared/types';
import { logStockActivity } from '../../shared/services/firebase';
import { Loader2, Plus, Search, Package, MapPin, Calendar, FileText, ArrowDownRight, ArrowUpRight, CheckCircle2, Trash2, X, Download } from 'lucide-react';
import { getParsedDateValue, displayTanggalIndonesian, parseToIsoDate } from '../../lib/dateUtils';
export { getParsedDateValue, displayTanggalIndonesian, parseToIsoDate };

interface Props {
  spreadsheetId: string;
  sheetName: string;
  title: string;
  description: string;
  isReadOnly?: boolean;
  activeUsername?: string;
  area?: string;
}

function TransactionInput({ spreadsheetId, sheetName, title, description, isReadOnly = false, activeUsername, area }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  const [selectedLocator, setSelectedLocator] = useState('ALL');
  const [selectedLocatorTo, setSelectedLocatorTo] = useState('ALL');

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formTanggal, setFormTanggal] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedProductIndex, setSelectedProductIndex] = useState('');
  const [formNamaBahan, setFormNamaBahan] = useState('');
  const [formKodeProduk, setFormKodeProduk] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formUom, setFormUom] = useState('');
  const [formTipe, setFormTipe] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN');
  const [formLocator, setFormLocator] = useState('');
  const [formLocatorTo, setFormLocatorTo] = useState('');
  const [formNoDocument, setFormNoDocument] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Multi-item / Batch Input states
  interface PendingItem {
    id: string;
    kodeProduk: string;
    namaBahan: string;
    kuantitas: number;
    uom: string;
    locator: string;
    locatorTo: string;
  }
  const [itemsList, setItemsList] = useState<PendingItem[]>([]);

  const handleProductSelection = (val: string) => {
    setSelectedProductIndex(val);
    if (val === 'NEW') {
      setFormNamaBahan('');
      setFormKodeProduk('');
      setFormUom('');
      setProductSearchQuery('Tambah Manual');
    } else if (val === '') {
      setFormNamaBahan('');
      setFormKodeProduk('');
      setFormUom('');
      setProductSearchQuery('');
    } else {
      const idx = parseInt(val, 10);
      const prod = products[idx];
      if (prod) {
        setFormNamaBahan(prod.nama);
        setFormKodeProduk(prod.kode);
        setFormUom(prod.satuan);
        setProductSearchQuery(`${prod.kode} - ${prod.nama}`);
      }
    }
  };

  const handleAddItem = () => {
    if (!formNamaBahan.trim() || !formKodeProduk.trim() || !formQty || !formUom.trim() || !formLocator.trim()) {
      alert('Mohon lengkapi Detail Barang (Pilih Produk, Kode, Nama, Satuan, Qty, dan Locator)!');
      return;
    }
    const parsedQty = parseFloat(formQty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      alert('Kuantitas harus berupa angka positif!');
      return;
    }
    if (formTipe === 'TRANSFER' && !formLocatorTo) {
      alert('Mohon tentukan locator tujuan untuk transaksi transfer!');
      return;
    }
    if (formTipe === 'TRANSFER' && formLocator === formLocatorTo) {
      alert('Locator asal dan locator tujuan tidak boleh sama!');
      return;
    }

    // Add to itemsList
    const newItem: PendingItem = {
      id: Math.random().toString(36).substring(2, 9),
      kodeProduk: formKodeProduk.trim(),
      namaBahan: formNamaBahan.trim(),
      kuantitas: parsedQty,
      uom: formUom.trim().toUpperCase(),
      locator: formLocator.trim(),
      locatorTo: formTipe === 'TRANSFER' ? formLocatorTo.trim() : ''
    };

    setItemsList(prev => [...prev, newItem]);

    // Reset item entry form fields
    setSelectedProductIndex('');
    setFormKodeProduk('');
    setFormNamaBahan('');
    setFormUom('');
    setFormQty('');
    setProductSearchQuery('');
    setDropdownOpen(false);
  };

  
  const [ocrLoading, setOcrLoading] = useState(false);
  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setOcrLoading(true);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          const mimeType = file.type;
          
          const res = await fetch('/api/gemini/ocr-tally-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType })
          });
          
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          
          const extracted = data.extractedData;
          if (!Array.isArray(extracted) || extracted.length === 0) {
            alert("Tidak ada data yang berhasil diekstrak.");
            return;
          }
          
          const newItems = extracted.map((item: any) => ({
            id: Math.random().toString(36).substring(2, 9),
            kodeProduk: item.kodeProduk || 'UNKNOWN',
            namaBahan: item.namaProduk || '',
            kuantitas: parseFloat(item.qty) || 0,
            uom: 'Pcs',
            locator: item.lCode || formLocator || 'UNKNOWN',
            locatorTo: ''
          }));
          setItemsList(prev => [...prev, ...newItems]);
          alert(`Berhasil mengekstrak ${newItems.length} barang dari dokumen! Silakan lengkapi kode/locator bila perlu.`);
        } catch(err:any) {
           alert("Gagal OCR: " + err.message);
        } finally {
          setOcrLoading(false);
        }
      };
    } catch (err: any) {
      alert("Gagal melakukan OCR: " + err.message);
      setOcrLoading(false);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveItem = (id: string) => {
    setItemsList(prev => prev.filter(item => item.id !== id));
  };

  const handleOpenForm = () => {
    setItemsList([]);
    setFormOpen(true);
    setProductSearchQuery('');
    setDropdownOpen(false);
  };

  
  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (itemsList.length === 0) {
      alert('Mohon masukkan minimal 1 barang ke dalam daftar dengan mengklik tombol "+ Tambahkan ke Daftar"!');
      return;
    }
    if (!formTanggal) {
      alert('Mohon tentukan tanggal transaksi!');
      return;
    }

    setSubmitting(true);
    try {
      // AI Anomaly Detection
      try {
        const historyData = transactions.slice(0, 50).map(t => ({qty: t.kuantitas, tipe: t.tipe}));
        const checkRes = await fetch('/api/gemini/detect-anomaly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction: itemsList, history: historyData })
        });
        const anomalyData = await checkRes.json();
        if (anomalyData.isAnomaly) {
           const proceed = window.confirm(`[AI Anomaly Alert] ${anomalyData.reason}\n\nYakin ingin melanjutkan menyimpan data ini?`);
           if (!proceed) {
             setSubmitting(false);
             return;
           }
        }
      } catch (err) {
        console.warn("Anomaly detection failed", err);
      }

      const rows = itemsList.map(item => [

        formTanggal,
        item.namaBahan,
        item.kuantitas,
        item.uom,
        formTipe,
        item.locator,
        formTipe === 'TRANSFER' ? item.locatorTo : '',
        formNoDocument.trim(),
        formKeterangan.trim(),
        item.kodeProduk
      ]);

      await appendSheetRow(spreadsheetId, `'${sheetName}'!A:J`, rows);
      
      // Asynchronously log to Stock Activity Log for SKU discrepancy tracking & transparency
      try {
        for (const item of itemsList) {
          const impact = formTipe === 'IN'
            ? `Penambahan stok fisik +${item.kuantitas} ${item.uom} di locator ${item.locator}`
            : formTipe === 'OUT'
            ? `Pengurangan stok fisik -${item.kuantitas} ${item.uom} di locator ${item.locator}`
            : `Transfer antar locator ${item.locator} -> ${item.locatorTo} (${item.kuantitas} ${item.uom})`;

          logStockActivity({
            username: activeUsername || 'Petugas',
            area: area || 'Cabang',
            category: title || sheetName,
            actionType: formTipe as 'IN' | 'OUT' | 'TRANSFER',
            pCode: item.kodeProduk,
            pName: item.namaBahan,
            locator: item.locator,
            locatorTo: formTipe === 'TRANSFER' ? item.locatorTo : undefined,
            qty: formTipe === 'OUT' ? -Math.abs(item.kuantitas) : item.kuantitas,
            uom: item.uom,
            docNo: formNoDocument.trim(),
            notes: formKeterangan.trim(),
            impactSummary: impact
          }).catch(e => console.warn('Gagal log stock activity:', e));
        }
      } catch (logErr) {
        console.warn('Logging activity failed:', logErr);
      }

      // Reset form states on success
      setFormOpen(false);
      setItemsList([]);
      setFormNoDocument('');
      setFormKeterangan('');
      setSelectedProductIndex('');
      setFormNamaBahan('');
      setFormKodeProduk('');
      setFormUom('');
      setFormQty('');
      setFormLocator('');
      setFormLocatorTo('');
      setProductSearchQuery('');
      setDropdownOpen(false);
      
      // Reload the main list
      try {
        await loadData(true);
      } catch (reloadErr) {
        console.warn("Reload data usai simpan transaksi gagal:", reloadErr);
      }
      alert("Transaksi berhasil disimpan!");
    } catch (err: any) {
      alert(`Gagal menyimpan transaksi: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const loadData = async (forceFresh = false, retryOnMissing = true) => {
    try {
      setLoading(true);
      
      let txRows: any[] = [];
      let pRows: any[] = [];
      let lRows: any[] = [];
      
      try {
        const [combined, loadedLRows] = await Promise.all([
          fetchCombinedProducts(forceFresh).catch(() => []),
          fetchSheetData(spreadsheetId, "'MASTER_LOCATOR'!A2:E", forceFresh)
        ]);
        pRows = combined.map(p => [p.kode, p.nama, p.satuan]);
        lRows = loadedLRows;
        txRows = await fetchSheetData(spreadsheetId, `'${sheetName}'!A2:J`, forceFresh).catch((err: any) => {
          const errMsg = String(err.message || '');
          if (errMsg.includes('Kisaran tidak ditemukan') || errMsg.includes('not found') || errMsg.includes('Range not found')) {
            console.warn(`Sheet ${sheetName} tidak ditemukan. Menggunakan array kosong.`);
            alert(`Sheet '${sheetName}' belum ada di Spreadsheet Anda. Silakan buat sheet dengan nama '${sheetName}' secara manual di Google Sheets.`);
            return [];
          }
          throw err;
        });
      } catch (fetchErr: any) {
        if (retryOnMissing) {
          console.log("Error fetching transactions or master data. Attempting auto-initialization...");
          try {
            const { initializeERPSpreadsheet } = await import('../../lib/sheets');
            await initializeERPSpreadsheet(spreadsheetId);
            return loadData(forceFresh, false);
          } catch (initErr: any) {
            const initErrMsg = String(initErr.message || '').toLowerCase();
            if (initErrMsg.includes('already exists') || initErrMsg.includes('ada') || initErrMsg.includes('exists')) {
              console.log("Sheet already exists, continuing to load data.");
              return loadData(forceFresh, false);
            }
            console.error("Auto-initialization fallback failed:", initErr);
            throw fetchErr;
          }
        } else {
          throw fetchErr;
        }
      }

      const uniqueP = Array.from(new Map(
        pRows
          .filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A')
          .map((r: any[]) => [String(r[0]).trim(), { kode: String(r[0]).trim(), nama: String(r[1] || '').trim(), satuan: String(r[2] || '').trim(), kategori: '' }])
      ).values());
      const uniqueL = Array.from(new Map(
        lRows
          .filter((r: any[]) => r.length > 0 && (r[0] || r[1]) && r[0] !== '#N/A' && r[1] !== '#N/A')
          .map((r: any[]) => {
            const whGroup = String(r[0] || '').trim();
            const nama = String(r[1] || whGroup).trim();
            return [whGroup || nama, { whGroup, nama, deskripsi: String(r[2] || '').trim(), whType: String(r[3] || '').trim(), area: String(r[4] || '').trim() }];
          })
      ).values());

      const reversePMap = new Map<string, string>();
      uniqueP.forEach(p => {
        if (p.nama && p.kode) {
          reversePMap.set(p.nama.toUpperCase().trim(), p.kode.trim());
        }
      });

      const parsedTransactions = txRows
        .filter((r: any[]) => {
          if (r.length === 0) return false;
          const tanggal = String(r[0] || '').trim();
          const nama = String(r[1] || '').trim();
          const kode = String(r[9] || '').trim();
          return tanggal !== '' && (nama !== '' || kode !== '') && kode !== '#N/A' && nama !== '#N/A' && tanggal !== '#N/A';
        })
        .map((r: any[]) => {
          const rawNama = String(r[1] || '').trim();
          let rawKode = String(r[9] || '').trim();
          if ((!rawKode || rawKode === '#N/A') && rawNama) {
            rawKode = reversePMap.get(rawNama.toUpperCase()) || '';
          }
          return {
            tanggal: String(r[0] || '').trim(),
            namaBahan: rawNama,
            kuantitas: parseFloat(String(r[2] || '0').replace(',', '.')) || 0,
            uom: String(r[3] || '').trim(),
            tipe: String(r[4] || '').trim().toUpperCase() as 'IN'|'OUT'|'AWAL',
            locator: String(r[5] || '').trim(),
            locatorTo: String(r[6] || '').trim(),
            noDocument: String(r[7] || '').trim(),
            keterangan: String(r[8] || '').trim(),
            kodeProduk: rawKode
          };
        });

      // Sort chronological ascending (oldest on top, newest at the bottom)
      parsedTransactions.sort((a, b) => getParsedDateValue(a.tanggal) - getParsedDateValue(b.tanggal));

      setTransactions(parsedTransactions);
      setProducts(uniqueP as Product[]);
      setLocators(uniqueL as Locator[]);

    } catch (err: any) {
      const errMsg = String(err.message || '');
      if (errMsg.includes('Kisaran tidak ditemukan') || errMsg.includes('not found') || errMsg.includes('Range not found')) {
        alert(`Sheet '${sheetName}' belum ada di Spreadsheet Anda. Silakan buat sheet dengan nama '${sheetName}' secara manual di Google Sheets Anda, atau perbarui/deploy ulang kode Apps Script.`);
      } else {
        alert(`Gagal memuat transaksi dari ${sheetName}: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [spreadsheetId, sheetName]);

  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Extract unique locators dynamically from transaction table records as requested
  const uniqueLocatorsFromTable = Array.from(new Set(transactions.map(t => t.locator).filter(Boolean))).sort() as string[];
  const uniqueLocatorTosFromTable = Array.from(new Set(transactions.map(t => t.locatorTo).filter(Boolean))).sort() as string[];

  const getLocatorDisplayName = (code: string) => {
    const found = locators.find(l => l.whGroup === code || l.nama === code);
    return found ? found.nama : code;
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedProduct, selectedLocator, selectedLocatorTo, startDate, endDate]);

  const uniqueProducts = useMemo(() => {
    const map = new Map<string, { kodeProduk: string; namaProduk: string }>();
    transactions.forEach((t) => {
      if (t.namaBahan || t.kodeProduk) {
        const key = `${t.kodeProduk || ''}__${t.namaBahan || ''}`;
        if (!map.has(key)) {
          map.set(key, { kodeProduk: t.kodeProduk, namaProduk: t.namaBahan });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.namaProduk.localeCompare(b.namaProduk)
    );
  }, [transactions]);

  const productSuggestions = useMemo(() => {
    if (!search || search.trim().length === 0) return [];
    const term = search.toLowerCase();
    return uniqueProducts
      .filter(
        (p) =>
          p.namaProduk.toLowerCase().includes(term) ||
          p.kodeProduk.toLowerCase().includes(term)
      )
      .slice(0, 15);
  }, [search, uniqueProducts]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const q = search.toLowerCase().trim();
      const matchesSearch = selectedProduct
        ? (t.kodeProduk.toUpperCase() === selectedProduct.kodeProduk.toUpperCase() || 
           (t.namaBahan && selectedProduct.namaProduk && t.namaBahan.toLowerCase() === selectedProduct.namaProduk.toLowerCase()))
        : !q || 
          t.kodeProduk.toLowerCase().includes(q) || 
          t.namaBahan.toLowerCase().includes(q) || 
          t.locator.toLowerCase().includes(q) ||
          t.locatorTo.toLowerCase().includes(q) ||
          t.noDocument.toLowerCase().includes(q) ||
          t.keterangan.toLowerCase().includes(q);

      const norm = (t.tipe || '').replace(/\s+/g, '').toUpperCase();
      const isTransfer = norm === 'TRANSFER' || norm === 'TF';

      const matchesLocator = 
        selectedLocator === 'ALL' || 
        t.locator === selectedLocator ||
        (isTransfer && t.locatorTo === selectedLocator);

      const matchesLocatorTo = 
        selectedLocatorTo === 'ALL' || 
        t.locatorTo === selectedLocatorTo;

      // Timezone & format consistent parsing using getParsedDateValue
      const matchesDateRange = (() => {
        if (!startDate && !endDate) return true;
        const val = getParsedDateValue(t.tanggal);
        if (!val) return false;
        if (startDate) {
          const startVal = getParsedDateValue(startDate);
          if (val < startVal) return false;
        }
        if (endDate) {
          const endVal = getParsedDateValue(endDate);
          if (val > endVal) return false;
        }
        return true;
      })();

      return matchesSearch && matchesLocator && matchesLocatorTo && matchesDateRange;
    });
  }, [transactions, selectedProduct, search, selectedLocator, selectedLocatorTo, startDate, endDate]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const { totalIn, totalOut, totalAwal, stokRill } = useMemo(() => {
    let sumIn = 0;
    let sumOut = 0;
    let sumAwal = 0;

    filtered.forEach(t => {
      const norm = (t.tipe || '').replace(/\s+/g, '').toUpperCase();
      const isTransfer = norm === 'TRANSFER' || norm === 'TF';
      const isAwal = norm.includes('AWAL') || norm === 'SALDO' || norm === 'INITIAL';
      const isNormalIN = (norm === 'IN' || norm === 'MASUK' || norm === 'RECEIPT') && !isAwal;
      const isNormalOUT = norm === 'OUT' || norm === 'KELUAR' || norm === 'ISSUE' || norm === 'PEMAKAIAN';

      if (selectedLocator === 'ALL') {
        if (isAwal) {
          sumAwal += t.kuantitas;
        } else if (isNormalIN) {
          sumIn += t.kuantitas;
        } else if (isNormalOUT) {
          sumOut += t.kuantitas;
        } else if (isTransfer) {
          // Internal warehouse transfer: Net 0 change to overall warehouse stock
        } else if (t.kuantitas > 0) {
          sumIn += t.kuantitas;
        }
      } else {
        // Specific locator filter
        if (t.locator === selectedLocator) {
          if (isAwal) {
            sumAwal += t.kuantitas;
          } else if (isNormalIN) {
            sumIn += t.kuantitas;
          } else if (isNormalOUT || isTransfer) {
            sumOut += t.kuantitas;
          } else if (t.kuantitas > 0) {
            sumIn += t.kuantitas;
          }
        } else if (isTransfer && t.locatorTo === selectedLocator) {
          sumIn += t.kuantitas;
        }
      }
    });

    const realStock = Math.round((sumAwal + sumIn - sumOut) * 1000) / 1000;
    return {
      totalIn: Math.round(sumIn * 1000) / 1000,
      totalOut: Math.round(sumOut * 1000) / 1000,
      totalAwal: Math.round(sumAwal * 1000) / 1000,
      stokRill: realStock
    };
  }, [filtered, selectedLocator]);

  const grandTotalQty = filtered.reduce((sum, t) => sum + t.kuantitas, 0);

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    if (filtered.length === 0) {
      alert("Tidak ada data untuk diekspor");
      return;
    }
    const dataToExport = filtered.map(t => ({
      "Tanggal": t.tanggal,
      "Kode Produk": t.kodeProduk,
      "Nama Bahan": t.namaBahan,
      "Kuantitas": t.kuantitas,
      "UOM": t.uom,
      "I/O/A": t.tipeIOA || t.tipe,
      "Locator Asal": t.locator,
      "Locator Tujuan": t.locatorTo || "-",
      "No. Document": t.noDocument || "-",
      "Keterangan": t.keterangan || "-"
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Pergerakan");
    XLSX.writeFile(wb, `Data_Pergerakan_${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const locatorsWithStock = useMemo(() => {
    if (!formKodeProduk) return [];
    const stockMap: Record<string, number> = {};
    
    transactions.forEach(t => {
      if (t.kodeProduk === formKodeProduk) {
        const typeNorm = (t.tipe || '').replace(/\s+/g, '').toUpperCase();
        const rawQtyStr = t.qty !== undefined ? String(t.qty) : String(t.kuantitas || 0);
        const qty = parseFloat(rawQtyStr.replace(/,/g, '')) || 0;

        const locAsal = t.locator;
        const locTujuan = t.locatorTo;

        const isIN = typeNorm === 'IN' || typeNorm.includes('AWAL') || typeNorm === 'MASUK' || typeNorm === 'RECEIPT';
        const isOUT = typeNorm === 'OUT' || typeNorm === 'KELUAR' || typeNorm === 'ISSUE' || typeNorm === 'PEMAKAIAN' || typeNorm === 'TRANSFER' || typeNorm === 'TF';

        if (isIN) {
          if (locAsal) stockMap[locAsal] = (stockMap[locAsal] || 0) + qty;
        } else if (isOUT) {
          if (locAsal) stockMap[locAsal] = (stockMap[locAsal] || 0) - qty;
          if ((typeNorm === 'TRANSFER' || typeNorm === 'TF') && locTujuan) {
             stockMap[locTujuan] = (stockMap[locTujuan] || 0) + qty;
          }
        }
      }
    });

    return Object.entries(stockMap)
      .filter(([loc, qty]) => qty > 0 && loc !== 'UNKNOWN_L')
      .map(([loc]) => loc)
      .sort();
  }, [transactions, formKodeProduk]);

  const filteredProductsForDropdown = products
    .map((p, i) => ({ product: p, index: i }))
    .filter(({ product }) => {
      const q = productSearchQuery.toLowerCase();
      return (
        product.kode.toLowerCase().includes(q) ||
        product.nama.toLowerCase().includes(q)
      );
    });



  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => loadData(true)} className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200">
            Refresh Data
          </button>
          {!isReadOnly && (
            <button 
              onClick={handleOpenForm}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Tambah Transaksi
            </button>
          )}
        </div>
      </div>

      {formOpen && !isReadOnly && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-md animate-in fade-in slide-in-from-top-4 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Input Transaksi Multi-Item Baru ({title})
            </h3>
            <div className="flex items-center gap-3">
              <label className={`cursor-pointer px-4 py-1.5 border border-purple-200 bg-purple-50 text-purple-700 rounded-lg text-sm font-semibold shadow-sm hover:bg-purple-100 transition-colors flex items-center gap-2 ${ocrLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {ocrLoading ? 'Ekstrak AI...' : 'Scan Tally Sheet (AI OCR)'}
                <input type="file" accept="image/*" className="hidden" onChange={handleOcrUpload} disabled={ocrLoading} />
              </label>
              <button 
                type="button" 
                onClick={() => setFormOpen(false)} 
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold hover:underline"
              >
                Batal / Tutup
              </button>
            </div>

          </div>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            {/* SECTION 1: HEADER TRANSAKSI */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-4">
              <h4 className="text-sm font-semibold text-slate-800 tracking-wide uppercase flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" /> 1. Informasi Dokumen / Transaksi
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Tipe Transaksi */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tipe Transaksi *</label>
                  <select 
                    required 
                    value={formTipe} 
                    onChange={e => {
                      const val = e.target.value as 'IN' | 'OUT' | 'TRANSFER';
                      setFormTipe(val);
                      setItemsList([]);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  >
                    <option value="IN">IN (Masuk Warehouse)</option>
                    <option value="OUT">OUT (Keluar Warehouse)</option>
                    <option value="TRANSFER">TRANSFER (Pindah Lokasi / Locator)</option>
                  </select>
                </div>

                {/* Tanggal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tanggal *</label>
                  <input 
                    required 
                    type="date" 
                    value={formTanggal} 
                    onChange={e => setFormTanggal(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-sm" 
                  />
                </div>

                {/* No Document */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">No. Document (Optional)</label>
                  <input 
                    type="text" 
                    value={formNoDocument} 
                    onChange={e => setFormNoDocument(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 text-sm" 
                    placeholder="e.g., BK-26-0001"
                  />
                </div>

                {/* Keterangan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Keterangan / Catatan (Optional)</label>
                  <input 
                    type="text" 
                    value={formKeterangan} 
                    onChange={e => setFormKeterangan(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 text-sm" 
                    placeholder="Catatan dokumen..."
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: ENTRY FORM BARANG */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-800 tracking-wide uppercase flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" /> 2. Form Input Barang (Satu-per-Satu)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 items-end">
                {/* Pilih Produk */}
                <div className="relative">
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Pilih Produk (Bisa Diketik) *</label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Ketik kode atau nama produk..."
                      value={productSearchQuery}
                      onFocus={() => setDropdownOpen(true)}
                      onChange={e => {
                        setProductSearchQuery(e.target.value);
                        setDropdownOpen(true);
                        if (!e.target.value) {
                          setSelectedProductIndex('');
                          setFormNamaBahan('');
                          setFormKodeProduk('');
                          setFormUom('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-sm pr-8"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                      {productSearchQuery && (
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedProductIndex('');
                            setFormNamaBahan('');
                            setFormKodeProduk('');
                            setFormUom('');
                            setProductSearchQuery('');
                            setDropdownOpen(false);
                          }}
                          className="hover:text-slate-600 focus:outline-none text-xs font-semibold"
                        >
                          ✕
                        </button>
                      )}
                      <Search className="w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                      <div className="absolute z-50 left-0 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-150">
                        {filteredProductsForDropdown.length === 0 ? (
                          <div className="px-3 py-2.5 text-xs text-slate-500 italic">Produk tidak ditemukan</div>
                        ) : (
                          filteredProductsForDropdown.map(({ product, index }) => (
                            <button
                              key={`${product.kode}-${index}`}
                              type="button"
                              onClick={() => {
                                handleProductSelection(String(index));
                                setDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 hover:text-blue-700 transition-colors flex flex-col gap-0.5"
                            >
                              <span className="font-mono font-semibold text-slate-900">{product.kode}</span>
                              <span className="text-slate-600 truncate">{product.nama}</span>
                            </button>
                          ))
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleProductSelection('NEW');
                            setDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors border-t border-slate-100"
                        >
                          + Tambah Manual (Ketik Sendiri)
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Kode Produk */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Kode Produk *</label>
                  <input 
                    disabled={selectedProductIndex !== '' && selectedProductIndex !== 'NEW' && formKodeProduk.trim() !== ''}
                    type="text" 
                    value={formKodeProduk} 
                    onChange={e => setFormKodeProduk(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-sm font-mono" 
                    placeholder="e.g., ACC-FH-075"
                  />
                </div>

                {/* Nama Bahan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Nama Produk / Bahan *</label>
                  <input 
                    disabled={selectedProductIndex !== '' && selectedProductIndex !== 'NEW' && formNamaBahan.trim() !== ''}
                    type="text" 
                    value={formNamaBahan} 
                    onChange={e => setFormNamaBahan(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-sm" 
                    placeholder="e.g., Flexible Hose 3/4"
                  />
                </div>

                {/* UOM */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Satuan (UOM) *</label>
                  <input 
                    disabled={selectedProductIndex !== '' && selectedProductIndex !== 'NEW' && formUom.trim() !== ''}
                    type="text" 
                    value={formUom} 
                    onChange={e => setFormUom(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-sm" 
                    placeholder="e.g., SET, PCS, Box"
                  />
                </div>

                {/* Kuantitas */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Kuantitas (Qty) *</label>
                  <input 
                    type="number" 
                    min="0.001" 
                    step="any"
                    value={formQty} 
                    onChange={e => setFormQty(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 text-sm" 
                    placeholder="Jumlah kuantitas"
                  />
                </div>

                {/* Locator */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    {formTipe === 'TRANSFER' ? 'Locator Asal *' : 'Locator *'}
                  </label>
                  <input 
                    list={formTipe === 'IN' ? "locators-list-options-all" : "locators-list-options-with-stock"}
                    type="text"
                    value={formLocator} 
                    onChange={e => setFormLocator(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    placeholder="Pilih atau ketik nama locator (cth: RAK-A1)"
                  />
                </div>

                {/* Locator To */}
                {formTipe === 'TRANSFER' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Locator Tujuan *</label>
                    <input 
                      list="locators-list-options-all"
                      type="text"
                      value={formLocatorTo} 
                      onChange={e => setFormLocatorTo(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      placeholder="Pilih atau ketik locator tujuan"
                    />
                  </div>
                ) : <div className="hidden xl:block" />}

                {/* Shared Datalist for Locators */}
                <datalist id="locators-list-options-all">
                  {locators.map(loc => (
                    <option key={`${loc.whGroup}-${loc.nama}`} value={loc.nama} />
                  ))}
                  <option value="Gudang Utama" />
                  <option value="Gudang Produksi" />
                  <option value="Area Transit" />
                </datalist>

                <datalist id="locators-list-options-with-stock">
                  {locatorsWithStock.length > 0 ? (
                    locatorsWithStock.map(loc => (
                      <option key={loc} value={loc} />
                    ))
                  ) : (
                    <>
                      {locators.map(loc => (
                        <option key={`${loc.whGroup}-${loc.nama}`} value={loc.nama} />
                      ))}
                      <option value="Gudang Utama" />
                      <option value="Gudang Produksi" />
                      <option value="Area Transit" />
                    </>
                  )}
                </datalist>

                {/* Button to Append */}
                <div className="sm:col-span-2 md:col-span-1">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-4 border border-slate-200 rounded-md flex items-center justify-center gap-2 transition-colors text-sm h-[38px]"
                  >
                    <Plus className="w-4 h-4 text-emerald-600" /> Tambah ke Daftar
                  </button>
                </div>
              </div>
            </div>

            {/* SECTION 3: LIST OF ADDED ITEMS */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800 tracking-wide uppercase flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 3. Daftar Barang yang Diinput ({itemsList.length} Item)
                </h4>
                {itemsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItemsList([])}
                    className="text-xs text-red-600 hover:text-red-800 font-medium underline flex items-center gap-1"
                  >
                    Resikan Daftar
                  </button>
                )}
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">#</th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kode Produk</th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Bahan</th>
                      <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">UOM</th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Loc Asal</th>
                      {formTipe === 'TRANSFER' && (
                        <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Loc Tujuan</th>
                      )}
                      <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                    {itemsList.length === 0 ? (
                      <tr>
                        <td colSpan={formTipe === 'TRANSFER' ? 8 : 7} className="px-5 py-8 text-center text-slate-400 bg-slate-50/50">
                          <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-medium text-slate-500">Belum ada barang di daftar input.</p>
                          <p className="text-xs text-slate-400 mt-1">Silakan isi detail di form &quot;Form Input Barang&quot; di atas, lalu klik &quot;Tambah ke Daftar&quot;.</p>
                        </td>
                      </tr>
                    ) : (
                      itemsList.map((item, index) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 font-mono text-slate-900">{item.kodeProduk}</td>
                          <td className="px-4 py-3 font-medium">{item.namaBahan}</td>
                          <td className="px-4 py-3 text-right font-semibold text-blue-700">{item.kuantitas.toLocaleString('id-ID')}</td>
                          <td className="px-4 py-3 font-semibold text-slate-500">{item.uom}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">
                              {item.locator}
                            </span>
                          </td>
                          {formTipe === 'TRANSFER' && (
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-mono text-[11px]">
                                {item.locatorTo}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors focus:outline-none"
                              title="Hapus item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Submit / Cancel Buttons */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setFormOpen(false)} 
                className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                disabled={submitting}
              >
                Batal / Tutup
              </button>
              <button 
                type="submit" 
                disabled={submitting || itemsList.length === 0}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    Simpan {itemsList.length} Transaksi
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters Panel */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div ref={dropdownRef} className="relative max-w-sm w-full z-30">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Cari transaksi, kode/nama produk..." 
                value={search} 
                onChange={e => {
                  const val = e.target.value;
                  setSearch(val);
                  setShowDropdown(true);
                  if (selectedProduct && val !== selectedProduct.namaProduk) {
                    setSelectedProduct(null);
                  }
                }} 
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm bg-white" 
              />
              {search && (
                <button 
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSelectedProduct(null);
                    setShowDropdown(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {showDropdown && productSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-50 divide-y divide-slate-100">
                  {productSuggestions.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex flex-col focus:outline-none transition-colors border-none cursor-pointer text-slate-700 bg-transparent"
                      onClick={() => {
                        setSelectedProduct(p);
                        setSearch(p.namaProduk);
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

            {/* Date range inputs */}
            <div className="flex flex-wrap items-center gap-3 bg-white px-3 py-1.5 border border-slate-200 rounded-lg shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Filter Tanggal:
              </span>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  title="Tanggal Mulai"
                />
                <span className="text-slate-400 text-xs font-medium">s.d</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  title="Tanggal Selesai"
                />
              </div>
              {(startDate || endDate) && (
                <button 
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline px-1 shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
             <div className="flex items-center gap-2">
               <span className="text-sm font-medium text-slate-600 shrink-0">Filter Locator:</span>
               <select 
                 value={selectedLocator} 
                 onChange={e => setSelectedLocator(e.target.value)}
                 className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm min-w-[150px] max-w-[240px]"
               >
                 <option value="ALL">Semua Locator</option>
                 {uniqueLocatorsFromTable.map(loc => (
                   <option key={loc} value={loc}>
                     {getLocatorDisplayName(loc)}
                   </option>
                 ))}
               </select>
             </div>

             <div className="flex items-center gap-2">
               <span className="text-sm font-medium text-slate-600 shrink-0">Filter Locator To:</span>
               <select 
                 value={selectedLocatorTo} 
                 onChange={e => setSelectedLocatorTo(e.target.value)}
                 className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm min-w-[150px] max-w-[240px]"
               >
                 <option value="ALL">Semua Locator To</option>
                 {uniqueLocatorTosFromTable.map(loc => (
                   <option key={loc} value={loc}>
                     {getLocatorDisplayName(loc)}
                   </option>
                 ))}
               </select>
             </div>

             <div className="ml-auto">
               <button
                 type="button"
                 onClick={exportToExcel}
                 className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold shadow-sm"
                 title="Ekspor data pergerakan ke Microsoft Excel (.xlsx)"
               >
                 <Download className="w-4 h-4" />
                 Export Excel
               </button>
             </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center text-blue-600 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm font-medium text-slate-500">Memuat data transaksi dari {sheetName}...</p>
            </div>
          ) : (<>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">#</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kode Produk</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Bahan</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">UOM</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Loc Asal</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Loc Tujuan</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">No. Doc</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Keterangan</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((t, idx) => {
                  return (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors text-slate-700 group">
                      <td className="px-3 py-3 text-center text-slate-500 font-medium text-xs">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                           const norm = (t.tipe || '').replace(/\s+/g, '').toUpperCase();
                           const isAwal = norm.includes('AWAL');
                           const isIN = norm === 'IN' || norm === 'MASUK' || norm === 'RECEIPT';
                           const isOUT = norm === 'OUT' || norm === 'KELUAR' || norm === 'ISSUE' || norm === 'PEMAKAIAN' || norm === 'TRANSFER' || norm === 'TF';
                           
                           return (
                             <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                                isIN ? 'bg-emerald-100 text-emerald-700' : 
                                isAwal ? 'bg-blue-100 text-blue-700' : 
                                'bg-rose-100 text-rose-700'
                             }`}>
                               {isIN && <ArrowDownRight className="w-3 h-3" />}
                               {isOUT && <ArrowUpRight className="w-3 h-3" />}
                               {isAwal && <CheckCircle2 className="w-3 h-3" />}
                               {t.tipe}
                             </span>
                           );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-500 tabular-nums">
                        <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                           <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                           {displayTanggalIndonesian(t.tanggal)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 text-xs font-medium">
                        {t.kodeProduk}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors whitespace-nowrap">{t.namaBahan}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-medium">
                        {t.uom}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[15px] tabular-nums">
                        <div className={
                           (() => {
                             const norm = (t.tipe || '').replace(/\s+/g, '').toUpperCase();
                             const isIN = norm === 'IN' || norm.includes('AWAL') || norm === 'MASUK' || norm === 'RECEIPT';
                             const isOUT = norm === 'OUT' || norm === 'KELUAR' || norm === 'ISSUE' || norm === 'PEMAKAIAN' || norm === 'TRANSFER' || norm === 'TF';
                             return isIN ? 'text-emerald-600' : isOUT ? 'text-rose-600' : 'text-slate-700';
                           })()
                        }>{t.kuantitas.toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700 text-xs flex items-center gap-1 whitespace-nowrap">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {t.locator}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {t.locatorTo ? (
                          <div className="font-medium text-slate-700 text-xs flex items-center gap-1 whitespace-nowrap">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {t.locatorTo}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">
                        {t.noDocument || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]" title={t.keterangan}>
                        {t.keterangan || <span className="text-slate-300 italic">Tidak ada catatan</span>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length > 0 && (
                  <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200 text-slate-900 sticky bottom-0 z-10 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
                    <td className="px-4 py-4 text-slate-800" colSpan={6}>Grand Total (Filtered)</td>
                    <td className="px-4 py-4 text-right font-bold text-[15px] tabular-nums text-blue-600">
                      {grandTotalQty.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-slate-500 text-sm" colSpan={4}>
                      <span className="inline-flex flex-wrap items-center gap-4 text-xs font-semibold tracking-wider">
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md border border-emerald-100">Total IN: {totalIn.toLocaleString()}</span>
                        <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-md border border-rose-100">Total OUT: {totalOut.toLocaleString()}</span>
                        {totalAwal > 0 && <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-100">Total AWAL: {totalAwal.toLocaleString()}</span>}
                        <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md border border-indigo-150 font-bold">Stok Rill: {stokRill.toLocaleString()}</span>
                      </span>
                    </td>
                  </tr>
                )}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                         <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                            <Search className="w-6 h-6" />
                         </div>
                         <p className="font-medium text-slate-700">Tidak ada data transaksi</p>
                         <p className="text-sm mt-1">Coba sesuaikan filter pencarian atau tambahkan transaksi baru.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {filtered.length > 0 && (
              <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
                 <div className="flex items-center gap-3 text-sm text-slate-600">
                   <div className="flex items-center gap-2">
                     Tampilkan
                     <select 
                       value={pageSize} 
                       onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                       className="border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
                     >
                       <option value={10}>10</option>
                       <option value={50}>50</option>
                       <option value={100}>100</option>
                       <option value={10000}>Semua</option>
                     </select>
                     baris
                   </div>
                   <div className="hidden sm:block text-slate-300">|</div>
                   <span className="hidden sm:block">Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filtered.length)} dari {filtered.length} transaksi</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="px-4 py-1.5 border border-slate-200 rounded-lg bg-white text-sm font-medium text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                   >
                     Sebelumnya
                   </button>
                   <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages || totalPages === 0}
                     className="px-4 py-1.5 border border-slate-200 rounded-lg bg-white text-sm font-medium text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                   >
                     Selanjutnya
                   </button>
                 </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}

export default memo(TransactionInput);
