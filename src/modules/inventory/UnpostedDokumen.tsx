import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { 
  FileText, 
  Search, 
  RefreshCw, 
  Filter, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  User, 
  Users,
  Check,
  ChevronDown,
  Calendar, 
  FileCheck,
  Building2,
  FileSpreadsheet,
  X,
  ExternalLink,
  Truck,
  Box,
  PackageCheck
} from 'lucide-react';
import { 
  fetchUnpostedDocuments, 
  filterDocsByArea, 
  UnpostedDoc, 
  IMDocDetailLine, 
  fetchIMDocDetails,
  JAKARTA_ALLOWED_CREATORS,
  isAllowedJakartaCreator
} from '../../lib/unpostedService';
import { AREAS } from '../../App';

interface Props {
  area: string;
  userRole?: string;
  activeUsername?: string;
}

const MENU_ICONS: Record<string, string> = {
  'Sales Order': '🛍️',
  'Shipment': '🚚',
  'Customer Return': '↩️',
  'Inventory Move': '📦',
  'Material Receipt': '📥',
  'Purchase Order': '🛒',
  'Purchase Requisition': '📝',
  'Production': '🏭',
  'Physical Inventory': '📋',
  'Route': '🗺️',
  'Vendor Return': '🏬'
};

const UnpostedDokumen = memo(function UnpostedDokumen({ area, userRole = '', activeUsername = '' }: Props) {
  const [documents, setDocuments] = useState<UnpostedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMenu, setSelectedMenu] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [creatorDropdownOpen, setCreatorDropdownOpen] = useState(false);
  const [creatorSearchQuery, setCreatorSearchQuery] = useState('');
  const creatorDropdownRef = useRef<HTMLDivElement>(null);
  const [filterArea, setFilterArea] = useState<string>(area);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail Modal State (Sheet IM)
  const [selectedDoc, setSelectedDoc] = useState<UnpostedDoc | null>(null);
  const [detailLines, setDetailLines] = useState<IMDocDetailLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const usernameLower = (activeUsername || '').toLowerCase();
  const isAdminA5 = usernameLower === 'admina5' || usernameLower === 'adminc3';
  const isSuperAdmin = userRole === 'ALL' || usernameLower === 'admin' || isAdminA5;
  const isHQ = userRole === 'HQ' || userRole === 'All Cabang' || usernameLower === 'hq' || usernameLower === 'admin_hq' || area === 'All Cabang' || area === 'HQ';
  const isPPICorMP = usernameLower === 'ppic' || usernameLower === 'mp' || userRole.toUpperCase().includes('PPIC') || userRole.toUpperCase().includes('MP');
  const isSuperAdminOrHq = isSuperAdmin || isHQ || isPPICorMP;

  // Close creator dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (creatorDropdownRef.current && !creatorDropdownRef.current.contains(event.target as Node)) {
        setCreatorDropdownOpen(false);
      }
    }
    if (creatorDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [creatorDropdownOpen]);

  useEffect(() => {
    setFilterArea(area);
    setSelectedCreators([]);
  }, [area]);

  const toggleCreator = (name: string) => {
    setSelectedCreators(prev => {
      if (prev.includes(name)) {
        return prev.filter(c => c !== name);
      } else {
        return [...prev, name];
      }
    });
  };

  const handleSelectAllCreators = (names: string[]) => {
    setSelectedCreators(prev => {
      const merged = new Set([...prev, ...names]);
      return Array.from(merged);
    });
  };

  const handleClearCreators = () => {
    setSelectedCreators([]);
  };

  const loadData = async (forceFresh = false) => {
    try {
      if (forceFresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const docs = await fetchUnpostedDocuments(forceFresh);
      setDocuments(docs);
    } catch (err: any) {
      console.error('Error loading unposted documents:', err);
      setError(err.message || 'Gagal memuat data Unposted Dokumen dari Google Sheets.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter docs by area based on user permissions
  const areaFilteredDocs = useMemo(() => {
    return filterDocsByArea(documents, filterArea, isSuperAdminOrHq && filterArea === 'All Cabang');
  }, [documents, filterArea, isSuperAdminOrHq]);

  // Calculate stats for creators in current area
  const creatorStats = useMemo(() => {
    const counts: Record<string, number> = {};
    areaFilteredDocs.forEach(d => {
      if (d.createdBy) {
        counts[d.createdBy] = (counts[d.createdBy] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [areaFilteredDocs]);

  // Filtered creators for search box inside creator dropdown
  const filteredCreatorStats = useMemo(() => {
    if (!creatorSearchQuery.trim()) return creatorStats;
    const q = creatorSearchQuery.toLowerCase().trim();
    return creatorStats.filter(c => c.name.toLowerCase().includes(q));
  }, [creatorStats, creatorSearchQuery]);

  // Calculate QTY counts for each menu
  const menuStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let totalDocs = 0;

    areaFilteredDocs.forEach(doc => {
      counts[doc.menu] = (counts[doc.menu] || 0) + 1;
      totalDocs++;
    });

    // Sort menu items by count descending
    const sortedMenus = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, qty]) => ({ name, qty }));

    return { totalDocs, sortedMenus, rawCounts: counts };
  }, [areaFilteredDocs]);

  // Apply search and dropdown filters
  const filteredDocuments = useMemo(() => {
    return areaFilteredDocs.filter(doc => {
      // Menu filter
      if (selectedMenu !== 'ALL' && doc.menu !== selectedMenu) return false;
      
      // Status filter
      if (selectedStatus !== 'ALL' && doc.documentStatus !== selectedStatus) return false;

      // Creator filter (Multi-select)
      if (selectedCreators.length > 0 && !selectedCreators.includes(doc.createdBy)) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchDocNo = doc.documentNo.toLowerCase().includes(query);
        const matchUser = doc.createdBy.toLowerCase().includes(query);
        const matchMenu = doc.menu.toLowerCase().includes(query);
        const matchArea = doc.area.toLowerCase().includes(query);
        const matchDate = doc.documentDate.toLowerCase().includes(query);
        if (!matchDocNo && !matchUser && !matchMenu && !matchArea && !matchDate) return false;
      }

      return true;
    });
  }, [areaFilteredDocs, selectedMenu, selectedStatus, selectedCreators, searchQuery]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedMenu, selectedStatus, selectedCreators, filterArea]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredDocuments.length / pageSize) || 1;
  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDocuments.slice(start, start + pageSize);
  }, [filteredDocuments, currentPage, pageSize]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredDocuments.length === 0) return;

    const headers = ['Menu', 'Document Status', 'Created By', 'Documentno', 'Document Date', 'Area'];
    const rows = filteredDocuments.map(d => [
      `"${d.menu}"`,
      `"${d.documentStatus}"`,
      `"${d.createdBy}"`,
      `"${d.documentNo}"`,
      `"${d.documentDate}"`,
      `"${d.area}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Unposted_Dokumen_${filterArea.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Document Detail Modal (Fetch from Sheet IM)
  const handleOpenDocDetail = async (doc: UnpostedDoc) => {
    setSelectedDoc(doc);
    setDetailLoading(true);
    setDetailLines([]);
    try {
      const lines = await fetchIMDocDetails(doc.documentNo);
      setDetailLines(lines);
    } catch (err) {
      console.error('Error fetching IM lines for doc:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Export Document Detail Line Items to CSV
  const handleExportDetailCSV = () => {
    if (!selectedDoc || detailLines.length === 0) return;
    const headers = ['No', 'Kode SKU', 'Nama Produk', 'Kategori', 'Qty', 'Satuan', 'Volume (M3)', 'Berat (Kg)', 'Locator Asal', 'Locator Tujuan', 'No Route', 'Kendaraan', 'Sopir'];
    const rows = detailLines.map((l, idx) => [
      idx + 1,
      `"${l.productCode}"`,
      `"${(l.productName || '').replace(/"/g, '""')}"`,
      `"${l.category}"`,
      l.qty,
      `"${l.uom}"`,
      l.volume,
      l.weight,
      `"${l.locatorFrom}"`,
      `"${l.locatorTo}"`,
      `"${l.routeNo}"`,
      `"${l.routeVehicle}"`,
      `"${l.routeDriver}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Detail_${selectedDoc.documentNo.replace(/[^a-zA-Z0-9]/g, '_')}_IM.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Unposted Dokumen</h2>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-200">
              {menuStats.totalDocs} Dokumen Outstanding
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Monitoring dokumen outstanding (Draft & In Progress) dari iDempiere sheet <span className="font-semibold text-slate-700">Tarikan</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Area Filter Selector (for HQ & Super Admin) */}
          {isSuperAdminOrHq && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
              <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs font-bold text-slate-500 uppercase">Area:</span>
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className="bg-transparent text-slate-900 font-bold text-xs sm:text-sm focus:outline-none cursor-pointer pr-1"
              >
                {AREAS.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Sync Real-Time</span>
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            disabled={filteredDocuments.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* QTY Masing Masing Menu (Metric Cards Grid) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Qty Masing-Masing Menu</h3>
          </div>
          <span className="text-xs text-slate-500">
            Klik kartu menu untuk memfilter tabel
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* "Semua Menu" Summary Card */}
            <button
              onClick={() => setSelectedMenu('ALL')}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 shadow-xs flex flex-col justify-between ${
                selectedMenu === 'ALL'
                  ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-400/50 shadow-md'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">📊</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  selectedMenu === 'ALL' ? 'bg-blue-500/40 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  Total
                </span>
              </div>
              <div className="mt-2">
                <div className={`text-2xl font-black ${selectedMenu === 'ALL' ? 'text-white' : 'text-slate-900'}`}>
                  {menuStats.totalDocs.toLocaleString('id-ID')}
                </div>
                <div className={`text-xs font-bold truncate mt-0.5 ${selectedMenu === 'ALL' ? 'text-blue-100' : 'text-slate-600'}`}>
                  Semua Menu
                </div>
              </div>
            </button>

            {/* Menu specific cards */}
            {menuStats.sortedMenus.map(({ name, qty }) => {
              const isSelected = selectedMenu === name;
              const icon = MENU_ICONS[name] || '📄';
              const percent = menuStats.totalDocs > 0 ? ((qty / menuStats.totalDocs) * 100).toFixed(1) : '0';

              return (
                <button
                  key={name}
                  onClick={() => setSelectedMenu(isSelected ? 'ALL' : name)}
                  className={`p-4 rounded-2xl border text-left transition-all duration-200 shadow-xs flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400/50 shadow-md'
                      : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xl">{icon}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-amber-600/40 text-white' : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {percent}%
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {qty.toLocaleString('id-ID')}
                    </div>
                    <div className={`text-xs font-bold truncate mt-0.5 ${isSelected ? 'text-amber-50' : 'text-slate-700'}`} title={name}>
                      {name}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter Controls Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Documentno, User Created By, atau Area..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Menu Dropdown */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedMenu}
                onChange={(e) => setSelectedMenu(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Menu ({areaFilteredDocs.length})</option>
                {Object.keys(menuStats.rawCounts).sort().map(m => (
                  <option key={m} value={m}>
                    {m} ({menuStats.rawCounts[m]})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Status Dropdown */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status</option>
                <option value="Draft">Draft</option>
                <option value="In Progress">In Progress</option>
              </select>
            </div>

            {/* Multi-Select Filter Created By Dropdown */}
            <div className="relative" ref={creatorDropdownRef}>
              <button
                type="button"
                onClick={() => setCreatorDropdownOpen(!creatorDropdownOpen)}
                className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 shadow-2xs text-xs font-medium transition-all cursor-pointer ${
                  selectedCreators.length > 0
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Users className={`w-3.5 h-3.5 shrink-0 ${selectedCreators.length > 0 ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="max-w-[160px] truncate text-left">
                  {selectedCreators.length === 0
                    ? `Semua PIC (${creatorStats.length})`
                    : selectedCreators.length === 1
                    ? selectedCreators[0]
                    : `${selectedCreators.length} PIC Terpilih`}
                </span>
                {selectedCreators.length > 0 && (
                  <span className="ml-0.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {selectedCreators.length}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${creatorDropdownOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} />
              </button>

              {/* Popover Panel */}
              {creatorDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      Pilih PIC ({selectedCreators.length > 0 ? `${selectedCreators.length}/` : ''}{creatorStats.length})
                    </span>
                    {selectedCreators.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCreators}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Hapus Pilihan
                      </button>
                    )}
                  </div>

                  {/* Search inside PIC list */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari nama PIC..."
                      value={creatorSearchQuery}
                      onChange={(e) => setCreatorSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500"
                    />
                    {creatorSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCreatorSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Quick Select/Deselect buttons */}
                  <div className="flex items-center justify-between gap-1 text-[11px] px-0.5">
                    <button
                      type="button"
                      onClick={() => handleSelectAllCreators(filteredCreatorStats.map(c => c.name))}
                      className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                      Pilih Semua ({filteredCreatorStats.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleClearCreators}
                      className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                    >
                      Reset (Semua)
                    </button>
                  </div>

                  {/* Scrollable Checkbox List */}
                  <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
                    {filteredCreatorStats.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400">
                        Tidak ada PIC ditemukan
                      </div>
                    ) : (
                      filteredCreatorStats.map(({ name, count }) => {
                        const isChecked = selectedCreators.includes(name);
                        return (
                          <label
                            key={name}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                              isChecked
                                ? 'bg-blue-50 text-blue-900 font-semibold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCreator(name)}
                                className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="truncate">{name}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                              isChecked ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {count}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {/* Footer status */}
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {selectedCreators.length === 0 ? 'Semua PIC aktif' : `${selectedCreators.length} dipilih`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCreatorDropdownOpen(false)}
                      className="px-2.5 py-1 bg-slate-900 text-white rounded-md text-[10px] font-bold hover:bg-slate-800 cursor-pointer"
                    >
                      Selesai
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Filters Button */}
            {(searchQuery || selectedMenu !== 'ALL' || selectedStatus !== 'ALL' || selectedCreators.length > 0) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedMenu('ALL');
                  setSelectedStatus('ALL');
                  setSelectedCreators([]);
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* All Cabang Multi-PIC Selection Banner */}
        {(filterArea.toLowerCase() === 'all cabang' || filterArea.toLowerCase() === 'hq' || filterArea.toLowerCase() === 'all') && (
          <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-blue-50/60 border-b border-indigo-100 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-indigo-600 text-white rounded-md text-xs">
                  <Users className="w-3 h-3" />
                </span>
                <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                  Filter Multi-PIC All Cabang
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  selectedCreators.length > 0 
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-200' 
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {selectedCreators.length > 0 
                    ? `${selectedCreators.length} PIC Terpilih (${filteredDocuments.length} Dokumen)` 
                    : `Semua PIC (${areaFilteredDocs.length} Total Dokumen)`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-indigo-700 font-medium hidden sm:inline">
                  Klik nama untuk memilih beberapa PIC sekaligus
                </span>
                {selectedCreators.length > 0 && (
                  <button
                    onClick={handleClearCreators}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Reset PIC
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                onClick={handleClearCreators}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                  selectedCreators.length === 0
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200 shadow-2xs'
                }`}
              >
                Semua PIC ({creatorStats.length})
              </button>

              {/* Show top 14 creators in All Cabang, plus any selected creators not in top 14 */}
              {(() => {
                const top14 = creatorStats.slice(0, 14);
                const top14Names = new Set(top14.map(c => c.name));
                const extraSelected = creatorStats.filter(c => selectedCreators.includes(c.name) && !top14Names.has(c.name));
                const listToRender = [...top14, ...extraSelected];

                return listToRender.map(({ name, count }) => {
                  const isSelected = selectedCreators.includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggleCreator(name)}
                      className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white font-bold shadow-xs'
                          : 'bg-white text-slate-800 hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 shadow-2xs'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                      <span>{name}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Jakarta PIC Quick Selection Banner */}
        {filterArea.toLowerCase() === 'jakarta' && (
          <div className="p-3.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 border-b border-blue-100 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-blue-600 text-white rounded-md text-xs">
                  <User className="w-3 h-3" />
                </span>
                <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider">
                  Daftar 9 PIC Resmi Area Jakarta
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  selectedCreators.length > 0 
                    ? 'bg-blue-200 text-blue-900 border-blue-300 font-bold' 
                    : 'bg-blue-100 text-blue-800 border-blue-200'
                }`}>
                  {selectedCreators.length > 0 
                    ? `${selectedCreators.length} PIC Terpilih (${filteredDocuments.length} Dokumen)` 
                    : `${areaFilteredDocs.length} Total Dokumen`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-blue-700 font-medium hidden sm:inline">
                  Klik nama untuk memilih satu atau beberapa PIC
                </span>
                {selectedCreators.length > 0 && (
                  <button
                    onClick={handleClearCreators}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Reset PIC
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                onClick={handleClearCreators}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                  selectedCreators.length === 0
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-blue-100/70 border border-slate-200 shadow-2xs'
                }`}
              >
                Semua ({areaFilteredDocs.length})
              </button>
              {JAKARTA_ALLOWED_CREATORS.map(name => {
                const count = areaFilteredDocs.filter(d => d.createdBy.toLowerCase().trim() === name.toLowerCase().trim()).length;
                const isSelected = selectedCreators.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => toggleCreator(name)}
                    className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'bg-white text-slate-800 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                    <span>{name}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Menu</th>
                <th className="py-3 px-4">Document Status</th>
                <th className="py-3 px-4">Created By</th>
                <th className="py-3 px-4">Documentno</th>
                <th className="py-3 px-4">Document Date</th>
                <th className="py-3 px-4">Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="font-medium text-sm">Memuat data Unposted Dokumen...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-slate-300" />
                      <span className="font-bold text-slate-700 text-base">Tidak ada dokumen ditemukan</span>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {searchQuery || selectedMenu !== 'ALL' || selectedStatus !== 'ALL'
                          ? 'Coba atur ulang kata kunci pencarian atau filter yang Anda gunakan.'
                          : `Tidak ada dokumen unposted untuk area ${filterArea}.`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Menu */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <span>{MENU_ICONS[doc.menu] || '📄'}</span>
                        <span>{doc.menu}</span>
                      </div>
                    </td>

                    {/* Document Status */}
                    <td className="py-3 px-4">
                      {doc.documentStatus.toLowerCase() === 'draft' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Draft
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {doc.documentStatus}
                        </span>
                      )}
                    </td>

                    {/* Created By */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{doc.createdBy}</span>
                      </div>
                    </td>

                    {/* Documentno (Clickable to view Sheet IM details) */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleOpenDocDetail(doc)}
                        className="font-mono font-bold text-blue-600 hover:text-blue-800 bg-blue-50/80 hover:bg-blue-100/90 active:bg-blue-200 px-2.5 py-1 rounded-lg border border-blue-200 hover:border-blue-300 tracking-tight transition-all flex items-center gap-1.5 group cursor-pointer text-left shadow-2xs"
                        title="Klik untuk melihat rincian item dokumen dari Sheet IM"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform shrink-0" />
                        <span className="underline decoration-blue-300 underline-offset-2">{doc.documentNo}</span>
                      </button>
                    </td>

                    {/* Document Date */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{doc.documentDate}</span>
                      </div>
                    </td>

                    {/* Area */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <MapPin className="w-3 h-3 text-blue-500" />
                        {doc.area}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Pagination */}
        {!loading && filteredDocuments.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Menampilkan {Math.min((currentPage - 1) * pageSize + 1, filteredDocuments.length)} - {Math.min(currentPage * pageSize, filteredDocuments.length)} dari <strong>{filteredDocuments.length}</strong> dokumen</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value={25}>25 per halaman</option>
                <option value={50}>50 per halaman</option>
                <option value={100}>100 per halaman</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <span className="px-3 font-semibold text-slate-800">
                Halaman {currentPage} dari {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detail Dokumen (Data dari Sheet IM Google Sheets) */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xl">{MENU_ICONS[selectedDoc.menu] || '📄'}</span>
                  <h3 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight font-mono">
                    {selectedDoc.documentNo}
                  </h3>
                  {selectedDoc.documentStatus.toLowerCase() === 'draft' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Draft
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {selectedDoc.documentStatus}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-0.5">
                  <span>Menu: <strong className="text-slate-700">{selectedDoc.menu}</strong></span>
                  <span>&bull;</span>
                  <span>Area: <strong className="text-slate-700">{selectedDoc.area}</strong></span>
                  <span>&bull;</span>
                  <span>User: <strong className="text-slate-700">{selectedDoc.createdBy}</strong></span>
                  <span>&bull;</span>
                  <span>Tanggal: <strong className="text-slate-700">{selectedDoc.documentDate}</strong></span>
                </div>
              </div>

              <button
                onClick={() => setSelectedDoc(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {detailLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-xs font-semibold text-slate-600">Memuat rincian item dokumen dari Sheet IM...</span>
                </div>
              ) : detailLines.length === 0 ? (
                <div className="py-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-800 text-sm">Tidak Ada Rincian Barang di Sheet IM</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      Dokumen <strong>{selectedDoc.documentNo}</strong> ({selectedDoc.menu}) belum memiliki baris mutasi terdata di sheet <strong>IM</strong>. Dokumen ini saat ini berstatus <strong>{selectedDoc.documentStatus}</strong> di iDempiere.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Route & Locator Info Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Asal (From)</span>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {detailLines[0]?.branchFrom || selectedDoc.area} &bull; <span className="font-mono text-blue-600">{detailLines[0]?.locatorFrom || '-'}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Tujuan (To)</span>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {detailLines[0]?.branchTo || '-'} &bull; <span className="font-mono text-emerald-600">{detailLines[0]?.locatorTo || '-'}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Kendaraan / Rute</span>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {detailLines[0]?.routeVehicle && detailLines[0].routeVehicle !== '-' ? (
                          <span>{detailLines[0].routeVehicle} ({detailLines[0].routeDriver || 'Sopir'})</span>
                        ) : (
                          <span className="text-slate-400">Tidak ada rute ekspedisi</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-blue-600" />
                        <span>Daftar Barang ({detailLines.length} Item)</span>
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        Sumber data: Sheet <strong>IM</strong> Google Sheets
                      </span>
                    </div>

                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-left text-xs text-slate-700">
                        <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0 shadow-2xs">
                          <tr>
                            <th className="py-2.5 px-3">No</th>
                            <th className="py-2.5 px-3">Kode SKU</th>
                            <th className="py-2.5 px-4">Nama Produk</th>
                            <th className="py-2.5 px-3">Kategori</th>
                            <th className="py-2.5 px-3 text-right">Movement Qty</th>
                            <th className="py-2.5 px-3">Satuan</th>
                            <th className="py-2.5 px-3 text-right">Volume (M3)</th>
                            <th className="py-2.5 px-3 text-right">Berat (Kg)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailLines.map((line, idx) => (
                            <tr key={line.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {line.productCode || '-'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-slate-800">{line.productName}</td>
                              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{line.category || '-'}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700 bg-blue-50/40 whitespace-nowrap">
                                {line.qty.toLocaleString('id-ID')}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">{line.uom}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                {line.volume > 0 ? line.volume.toLocaleString('id-ID') : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                {line.weight > 0 ? line.weight.toLocaleString('id-ID') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600 font-medium">
                {detailLines.length > 0 && (
                  <span>
                    Total Qty: <strong className="text-slate-900 font-bold">{detailLines.reduce((acc, l) => acc + l.qty, 0).toLocaleString('id-ID')} Unit</strong> &bull; Total Item: <strong className="text-slate-900 font-bold">{detailLines.length} SKU</strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {detailLines.length > 0 && (
                  <button
                    onClick={handleExportDetailCSV}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ekspor CSV</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default UnpostedDokumen;
