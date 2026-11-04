import { useEffect, useState, type FormEvent, memo } from 'react';
import { fetchSheetData, appendSheetRow, updateSheetRow } from '../../lib/sheets';
import { Loader2, Plus, Search } from 'lucide-react';

interface LocalLocator {
  sheetRow: number;
  whGroup: string;
  nama: string;
  deskripsi: string;
  whType: string;
  area: string;
}

function MasterLocator({ 
  spreadsheetId, 
  isReadOnly = false, 
  activeUsername = '', 
  userRole = '' 
}: { 
  spreadsheetId: string; 
  isReadOnly?: boolean; 
  activeUsername?: string; 
  userRole?: string; 
}) {
  const [locators, setLocators] = useState<LocalLocator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [whGroup, setWhGroup] = useState('');
  const [nama, setNama] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [whType, setWhType] = useState('');
  const [area, setArea] = useState('');

  // Inline editing state
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editWhGroup, setEditWhGroup] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editDeskripsi, setEditDeskripsi] = useState('');
  const [editWhType, setEditWhType] = useState('');
  const [editArea, setEditArea] = useState('');

  const isAdminA5 = (activeUsername || '').toLowerCase() === 'admina5';
  const isSuperAdmin = userRole === 'ALL' || (activeUsername || '').toLowerCase() === 'admin' || isAdminA5;
  const canEdit = (!isReadOnly || isSuperAdmin) && !isAdminA5;
  const canAdd = (!isReadOnly || isSuperAdmin) && !isAdminA5;

  const loadData = async (forceFresh = false, retryOnMissing = true) => {
    try {
      setLoading(true);
      let rows: any[] = [];
      try {
        rows = await fetchSheetData(spreadsheetId, "'MASTER_LOCATOR'!A2:E", forceFresh);
      } catch (fetchErr: any) {
        const errorMsg = String(fetchErr.message || '').toLowerCase();
        const isMissingSheet = errorMsg.includes('not found') || errorMsg.includes('range') || errorMsg.includes('unparseable') || errorMsg.includes('cannot read');
        
        if (retryOnMissing && isMissingSheet) {
          console.log("MASTER_LOCATOR sheet not found, trying auto-init...");
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
            console.error("Auto-init from MasterLocator failed:", initErr);
            throw fetchErr;
          }
        } else {
          throw fetchErr;
        }
      }

      const mapped = rows.map((r: any[], i: number) => ({
        sheetRow: i + 2, // A2 is row index 2
        whGroup: String(r[0] || ''),
        nama: String(r[1] || ''),
        deskripsi: String(r[2] || ''),
        whType: String(r[3] || ''),
        area: String(r[4] || '')
      }));

      setLocators(mapped.filter(l => l.whGroup && l.nama && l.whGroup !== '#N/A' && l.nama !== '#N/A'));
    } catch (err: any) {
      alert(`Gagal memuat locator: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [spreadsheetId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!whGroup || !nama) return;
    setSubmitting(true);
    try {
      await appendSheetRow(spreadsheetId, "'MASTER_LOCATOR'!A:E", [
        [whGroup, nama, deskripsi, whType, area]
      ]);
      setFormOpen(false);
      setWhGroup(''); setNama(''); setDeskripsi(''); setWhType(''); setArea('');
      await loadData(true);
    } catch (err: any) {
      alert(`Gagal menyimpan locator: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (p: LocalLocator) => {
    setEditingRow(p.sheetRow);
    setEditWhGroup(p.whGroup);
    setEditNama(p.nama);
    setEditDeskripsi(p.deskripsi);
    setEditWhType(p.whType);
    setEditArea(p.area);
  };

  const handleSaveEdit = async (sheetRow: number) => {
    setSubmitting(true);
    try {
      await updateSheetRow(spreadsheetId, `'MASTER_LOCATOR'!A${sheetRow}:E${sheetRow}`, [
        [editWhGroup, editNama, editDeskripsi, editWhType, editArea]
      ]);
      setEditingRow(null);
      await loadData(true);
      alert('Locator berhasil diperbarui!');
    } catch (err: any) {
      alert(`Gagal memperbarui locator: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const filtered = locators.filter(p => 
    p.whGroup.toLowerCase().includes(search.toLowerCase()) || 
    p.nama.toLowerCase().includes(search.toLowerCase()) ||
    p.whType.toLowerCase().includes(search.toLowerCase()) ||
    p.area.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Master Locator</h2>
          <p className="text-sm text-slate-500">Daftar lokasi atau gudang penyimpanan.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => loadData(true)} className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Refresh
          </button>
          {canAdd && (
            <button 
              onClick={() => setFormOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> Tambah Locator
            </button>
          )}
        </div>
      </div>

      {formOpen && canAdd && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-semibold mb-4">Tambah Locator Baru</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gudang / Locator Group</label>
              <input required type="text" value={whGroup} onChange={e => setWhGroup(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Contoh: JAKARTA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lokasi</label>
              <input required type="text" value={nama} onChange={e => setNama(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Contoh: RACK A-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
              <input type="text" value={deskripsi} onChange={e => setDeskripsi(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Contoh: Penyimpanan Accessories" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipe Gudang</label>
              <input type="text" value={whType} onChange={e => setWhType(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Contoh: WH-ACCESSORIES" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Area</label>
              <input type="text" value={area} onChange={e => setArea(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Contoh: Jakarta" />
            </div>
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
        <div className="p-4 border-b border-slate-100">
           <div className="relative max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input type="text" placeholder="Cari locator..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
           </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (<>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-medium">Gudang Group</th>
                  <th className="px-5 py-4 font-medium">Nama Lokasi</th>
                  <th className="px-5 py-4 font-medium">Deskripsi</th>
                  <th className="px-5 py-4 font-medium">Tipe Gudang</th>
                  <th className="px-5 py-4 font-medium">Area</th>
                  {canEdit && <th className="px-5 py-4 font-medium text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((p, idx) => {
                  const isEditing = editingRow === p.sheetRow;
                  if (isEditing) {
                    return (
                      <tr key={`${p.nama}-${idx}`} className="bg-blue-50/20 text-slate-700">
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            value={editWhGroup} 
                            onChange={e => setEditWhGroup(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500 bg-white" 
                          />
                        </td>
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            value={editNama} 
                            onChange={e => setEditNama(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500 bg-white font-medium" 
                          />
                        </td>
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            value={editDeskripsi} 
                            onChange={e => setEditDeskripsi(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500 bg-white" 
                          />
                        </td>
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            value={editWhType} 
                            onChange={e => setEditWhType(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500 bg-white" 
                          />
                        </td>
                        <td className="px-5 py-3">
                          <input 
                            type="text" 
                            value={editArea} 
                            onChange={e => setEditArea(e.target.value)} 
                            className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500 bg-white" 
                          />
                        </td>
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
                    <tr key={`${p.nama}-${idx}`} className="hover:bg-blue-50/40 transition-colors text-slate-700">
                      <td className="px-5 py-4 text-slate-500 font-medium">{p.whGroup}</td>
                      <td className="px-5 py-4 font-bold text-slate-900">{p.nama}</td>
                      <td className="px-5 py-4 text-xs max-w-xs truncate" title={p.deskripsi}>{p.deskripsi || '-'}</td>
                      <td className="px-5 py-4"><span className="inline-flex bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs font-medium">{p.whType || '-'}</span></td>
                      <td className="px-5 py-4 font-medium text-slate-600">{p.area || '-'}</td>
                      {canEdit && (
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
                  <tr><td colSpan={canEdit ? 6 : 5} className="p-12 text-center text-slate-500">Tidak ada data locator ditemukan.</td></tr>
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

export default memo(MasterLocator);
