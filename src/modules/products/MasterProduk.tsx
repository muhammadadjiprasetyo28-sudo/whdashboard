import { useEffect, useState, type FormEvent, memo } from 'react';
import { fetchCombinedProducts, saveProductOverride, CombinedProduct } from '../../lib/sheets';
import { Loader2, Plus, Search } from 'lucide-react';

interface LocalProduct {
  sheetRow: number;
  kode: string;
  nama: string;
  satuan: string;
  kategori: string;
  rphMap: Record<string, number>;
}

const RPH_AREAS = [
  "Jakarta", "Karawang", "Semarang", "Surabaya", "Jember", "Palembang", 
  "Medan", "Pekanbaru", "Pontianak", "Banjarmasin", "Makassar"
];

function MasterProduk({ 
  spreadsheetId, 
  area, 
  isReadOnly = false, 
  activeUsername = '', 
  userRole = '' 
}: { 
  spreadsheetId: string; 
  area?: string; 
  isReadOnly?: boolean; 
  activeUsername?: string; 
  userRole?: string; 
}) {
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [satuan, setSatuan] = useState('');
  const [kategori, setKategori] = useState('');
  const [rph, setRph] = useState('');

  // RPH Area Selector
  const [selectedRphArea, setSelectedRphArea] = useState<string>('Jakarta');

  // Inline editing state
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editKode, setEditKode] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editSatuan, setEditSatuan] = useState('');
  const [editKategori, setEditKategori] = useState('');
  const [editRph, setEditRph] = useState('');

  const showRph = true;

  const isAdminA5 = (activeUsername || '').toLowerCase() === 'admina5';
  const isSuperAdmin = userRole === 'ALL' || (activeUsername || '').toLowerCase() === 'admin' || userRole === 'All Cabang' || userRole === 'HQ' || isAdminA5;
  const isMP = (activeUsername || '').toLowerCase() === 'mp';
  
  // Can add a new product (only Super Admin or standard non-readonly write users can add)
  const canAddProduct = (!isReadOnly || isSuperAdmin) && !isAdminA5;
  
  // Can edit everything in a product (only Super Admin or normal write-enabled users)
  const canEditAll = (!isReadOnly || isSuperAdmin) && !isAdminA5;
  
  // MP can only edit the RPH column
  const canEditRphOnly = isMP && !isAdminA5;
  
  // Can perform any edit action (either can edit all or edit RPH only)
  const canEditAny = (canEditAll || canEditRphOnly) && !isAdminA5;

  const canChangeRphArea = (isSuperAdmin || isMP) && !isAdminA5;

  useEffect(() => {
    if (area && area !== "All Cabang" && area !== "HQ") {
      const mapped = area;
      setSelectedRphArea(mapped);
    }
  }, [area]);

  const loadData = async (forceFresh = false) => {
    try {
      setLoading(true);
      const list = await fetchCombinedProducts(forceFresh);
      const mapped = list.map((p, idx) => ({
        sheetRow: idx + 2, // Unique row ID in list
        kode: p.kode,
        nama: p.nama,
        satuan: p.satuan,
        kategori: p.isCustom ? 'Custom' : 'Standard',
        rphMap: p.rphMap || {}
      }));
      setProducts(mapped);
    } catch (err: any) {
      alert(`Gagal memuat produk: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [spreadsheetId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kode || !nama) return;
    setSubmitting(true);
    try {
      const numericRph = parseFloat(rph) || 0;
      const rphMap: Record<string, number> = {};
      RPH_AREAS.forEach(areaName => {
        rphMap[areaName.toUpperCase()] = 0;
      });
      rphMap[selectedRphArea.toUpperCase()] = numericRph;

      await saveProductOverride(kode, {
        kode,
        nama,
        satuan,
        rphMap
      });

      setFormOpen(false);
      setKode(''); setNama(''); setSatuan(''); setKategori(''); setRph('');
      await loadData(true);
    } catch (err: any) {
      alert(`Gagal menyimpan produk: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (p: LocalProduct) => {
    setEditingRow(p.sheetRow);
    setEditKode(p.kode);
    setEditNama(p.nama);
    setEditSatuan(p.satuan);
    setEditKategori(p.kategori);
    
    // Load existing RPH for selected area
    const currentRphVal = p.rphMap[selectedRphArea.toUpperCase()] ?? 0;
    setEditRph(String(currentRphVal));
  };

  const handleSaveEdit = async (sheetRow: number) => {
    setSubmitting(true);
    try {
      const originalProduct = products.find(p => p.sheetRow === sheetRow);
      if (!originalProduct) return;

      const finalKode = originalProduct.kode;
      const finalNama = canEditAll ? editNama : originalProduct.nama;
      const finalSatuan = canEditAll ? editSatuan : originalProduct.satuan;
      
      const originalRphMap = originalProduct.rphMap || {};
      const updatedRphMap = { ...originalRphMap };
      
      const numericRph = parseFloat(editRph);
      updatedRphMap[selectedRphArea.toUpperCase()] = !isNaN(numericRph) ? numericRph : 0;

      await saveProductOverride(finalKode, {
        kode: finalKode,
        nama: finalNama,
        satuan: finalSatuan,
        rphMap: updatedRphMap
      });
      
      setEditingRow(null);
      await loadData(true);
      alert('Produk berhasil diperbarui!');
    } catch (err: any) {
      alert(`Gagal memperbarui produk: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedRphArea]);

  const filtered = products.filter(p => 
    p.kode.toLowerCase().includes(search.toLowerCase()) || 
    p.nama.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Master Produk</h2>
          <p className="text-sm text-slate-500">Kelola daftar produk yang disinkronisasi dari Google Sheets.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => loadData(true)} className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Refresh
          </button>
          {canAddProduct && (
            <button 
              onClick={() => setFormOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> Tambah Produk
            </button>
          )}
        </div>
      </div>

      {formOpen && canAddProduct && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-semibold mb-4">Tambah Produk Baru</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kode Produk</label>
              <input required type="text" value={kode} onChange={e => setKode(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Produk</label>
              <input required type="text" value={nama} onChange={e => setNama(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Satuan (UOM)</label>
              <input type="text" value={satuan} onChange={e => setSatuan(e.target.value)} className="w-full px-3 py-2 border rounded-md placeholder:text-slate-400" placeholder="pcs, kg, liter..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
              <input type="text" value={kategori} onChange={e => setKategori(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
            </div>
            {showRph && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RPH ({selectedRphArea})</label>
                <input type="number" step="any" value={rph} onChange={e => setRph(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Contoh: 10.5" />
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Batal</button>
              <button disabled={submitting} type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin"/>} Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="relative max-w-md w-full">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input type="text" placeholder="Cari produk..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
           </div>
           
           {/* Dropdown to select RPH area */}
           {canChangeRphArea ? (
             <div className="flex items-center gap-2">
               <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Tampilkan RPH Area:</span>
               <select 
                 value={selectedRphArea} 
                 onChange={e => setSelectedRphArea(e.target.value)}
                 className="border border-slate-200 rounded-md px-3 py-1.5 bg-white text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-550/20 focus:outline-none"
               >
                 {RPH_AREAS.map(areaName => (
                   <option key={areaName} value={areaName}>{areaName}</option>
                 ))}
               </select>
             </div>
           ) : (
             <div className="flex items-center gap-2">
               <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">RPH Area:</span>
               <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-md border border-blue-100 uppercase">
                 {selectedRphArea}
               </span>
             </div>
           )}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (<>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-medium">Kode</th>
                  <th className="px-5 py-4 font-medium">Nama Produk</th>
                  <th className="px-5 py-4 font-medium">Satuan</th>
                  <th className="px-5 py-4 font-medium">Tipe Data</th>
                  {showRph && <th className="px-5 py-4 font-medium">RPH ({selectedRphArea})</th>}
                  {canEditAny && <th className="px-5 py-4 font-medium text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((p, idx) => {
                  const isEditing = editingRow === p.sheetRow;
                  const currentRphVal = p.rphMap[selectedRphArea.toUpperCase()] ?? 0;
                  
                  if (isEditing) {
                    return (
                      <tr key={`${p.kode}-${idx}`} className="bg-blue-50/20 text-slate-700">
                        <td className="px-5 py-3 font-mono text-xs">
                          <input 
                            type="text" 
                            disabled={true} // Kode is a unique key, edit not allowed
                            value={editKode} 
                            onChange={e => setEditKode(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-550 bg-slate-100 text-slate-400" 
                          />
                        </td>
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            disabled={canEditRphOnly && !canEditAll} 
                            value={editNama} 
                            onChange={e => setEditNama(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-555 bg-white disabled:bg-slate-50 disabled:text-slate-400 font-medium" 
                          />
                        </td>
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            disabled={canEditRphOnly && !canEditAll} 
                            value={editSatuan} 
                            onChange={e => setEditSatuan(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-555 bg-white disabled:bg-slate-50 disabled:text-slate-400" 
                          />
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">
                          <span className="inline-flex bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{p.kategori}</span>
                        </td>
                        {showRph && (
                          <td className="px-5 py-3">
                            <input 
                              type="number" 
                              step="any" 
                              value={editRph} 
                              onChange={e => setEditRph(e.target.value)} 
                              className="w-24 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-555 bg-white font-medium" 
                            />
                          </td>
                        )}
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => handleSaveEdit(p.sheetRow)} 
                              disabled={submitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition"
                            >
                              Simpan
                            </button>
                            <button 
                              onClick={() => setEditingRow(null)} 
                              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-semibold transition"
                            >
                              Batal
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`${p.kode}-${idx}`} className="hover:bg-blue-50/40 transition-colors text-slate-700">
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">{p.kode}</td>
                      <td className="px-5 py-4 font-medium text-slate-900">{p.nama}</td>
                      <td className="px-5 py-4">{p.satuan || '-'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${p.kategori === 'Custom' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                          {p.kategori}
                        </span>
                      </td>
                      {showRph && (
                        <td className="px-5 py-4 font-semibold text-blue-600 tabular-nums bg-blue-50/10">
                          {currentRphVal > 0 ? currentRphVal : '-'}
                        </td>
                      )}
                      {canEditAny && (
                        <td className="px-5 py-4 text-center">
                          <button 
                            onClick={() => startEdit(p)} 
                            className="px-3 py-1 bg-slate-100 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded text-xs font-semibold transition"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={showRph ? (canEditAny ? 6 : 5) : (canEditAny ? 5 : 4)} className="p-12 text-center text-slate-500">Tidak ada data produk ditemukan.</td></tr>
                )}
              </tbody>
            </table>
            
            {filtered.length > 0 && (
              <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 rounded-b-xl">
                 <div className="flex items-center gap-2 text-sm text-slate-500">
                   <select 
                     value={pageSize} 
                     onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                     className="border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-550/20 focus:outline-none"
                   >
                     <option value={10}>10 Baris</option>
                     <option value={50}>50 Baris</option>
                     <option value={100}>100 Baris</option>
                     <option value={10000}>Semua</option>
                   </select>
                   <span>Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filtered.length)} dari {filtered.length} data</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="px-3 py-1.5 border border-slate-200 rounded-md bg-white text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                   >
                     Sebelumnya
                   </button>
                   <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages || totalPages === 0}
                     className="px-3 py-1.5 border border-slate-200 rounded-md bg-white text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
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

export default memo(MasterProduk);
