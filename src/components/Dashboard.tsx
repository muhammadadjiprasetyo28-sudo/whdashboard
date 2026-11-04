import { useState, lazy, Suspense, memo, useMemo, useEffect } from 'react';
import {
  LogOut,
  Package,
  MapPin,
  ArrowRightLeft,
  LayoutDashboard,
  X,
  Box,
  Beaker,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Scale,
  FileSpreadsheet,
  MessageSquare,
  ExternalLink,
  BarChart3,
  TrendingUp,
  Loader2,
  Clock,
  ClipboardList,
  ShieldCheck,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AREAS } from '../config/areas';
import type { UserSession } from '../config/permissions';
import { MonogramLogo, MonogramBrand } from './ui/MonogramLogo';

const MasterProduk = lazy(() => import('./MasterProduk'));
const MasterLocator = lazy(() => import('./MasterLocator'));
const TransactionInput = lazy(() => import('./TransactionInput'));
const StockOverview = lazy(() => import('./StockOverview'));
const PencocokanData = lazy(() => import('./PencocokanData'));
const MtsData = lazy(() => import('./MtsData'));
const WhatsAppConsole = lazy(() => import('../modules/whatsapp/WhatsAppConsole'));
const AkurasiStock = lazy(() => import('./AkurasiStock'));
const Pengepokan = lazy(() => import('./Pengepokan'));
const CekStock = lazy(() => import('./CekStock'));
const DoiMp = lazy(() => import('./DoiMp'));
const UnpostedDokumen = lazy(() => import('../modules/inventory/UnpostedDokumen'));
const StockActivityLogView = lazy(() => import('../modules/inventory/StockActivityLogView'));

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  spreadsheetId?: string;
  gasUrl?: string;
  area: string;
  onLogout: () => void;
  userRole?: string;
  onAreaChange?: (newArea: string) => void;
  isReadOnly?: boolean;
  activeUsername?: string;
  session?: UserSession;
}

type TabKey =
  | 'stock'
  | 'activity_log'
  | 'pencocokan'
  | 'produk'
  | 'locator'
  | 'input'
  | 'input_rm'
  | 'input_mfg'
  | 'input_supplies'
  | 'mts'
  | 'whatsapp'
  | 'akurasi'
  | 'pengepokan'
  | 'cek_stock'
  | 'doi_mp'
  | 'unposted';

const Dashboard = memo(function Dashboard({
  spreadsheetId: propSpreadsheetId,
  gasUrl,
  area,
  onLogout,
  userRole = '',
  onAreaChange,
  isReadOnly = false,
  activeUsername = '',
  session,
}: Props) {
  const spreadsheetId = gasUrl || propSpreadsheetId || '';
  const [activeTab, setActiveTab] = useState<TabKey>('stock');
  const [isSidebarHidden, setIsSidebarHidden] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem('wms_sidebar_hidden') === 'true';
    } catch {
      return false;
    }
  });
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem('wms_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['stock']));
  const [pergerakanOpen, setPergerakanOpen] = useState(true);

  const toggleSidebarHidden = () => {
    setIsSidebarHidden((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('wms_sidebar_hidden', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarHidden();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleDesktopCollapse = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('wms_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set(prev).add(tab));
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarHidden(true);
    }
  };

  const usernameLower = (activeUsername || '').toLowerCase();
  const isAdminA5 = usernameLower === 'admina5' || usernameLower === 'adminc3';
  const isPetugasA5 = usernameLower === 'petugasa5' || usernameLower === 'petugasc3';
  const isHelper = usernameLower === 'helper';

  const isSuperAdmin = userRole === 'ALL' || usernameLower === 'admin' || isAdminA5;
  const isHQ = userRole === 'HQ' || userRole === 'All Cabang' || usernameLower === 'hq' || usernameLower === 'admin_hq';
  const isSuperAdminOrHq = (isSuperAdmin || isHQ) && !isPetugasA5 && !isHelper;
  const isMP = usernameLower === 'mp';

  const isAuthorizedForPencocokan = !isPetugasA5 && !isHelper;

  const getSafeActiveTab = (): TabKey => {
    if (activeTab === 'pencocokan' && !isAuthorizedForPencocokan) return 'stock';
    if (activeTab === 'akurasi' && (isPetugasA5 || isHelper)) return 'stock';
    if (activeTab === 'pengepokan' && (isPetugasA5 || isHelper)) return 'stock';
    if (activeTab === 'doi_mp' && (isPetugasA5 || isHelper)) return 'stock';
    if (activeTab === 'whatsapp' && !isSuperAdminOrHq) return 'stock';
    if (activeTab === 'mts' && ((area !== 'HQ' && area !== 'All Cabang') || isReadOnly || isPetugasA5 || isHelper)) return 'stock';
    if ((activeTab === 'produk' || activeTab === 'locator') && (isPetugasA5 || isHelper)) return 'stock';
    if (isHelper && ['input', 'input_rm', 'input_mfg', 'input_supplies'].includes(activeTab)) return 'stock';
    return activeTab;
  };
  const safeActiveTab = getSafeActiveTab();

  const isAuthorizedForDoiMp =
    !isPetugasA5 &&
    !isHelper &&
    (['mp', 'ppic', 'hq', 'admin'].includes(usernameLower) || usernameLower.startsWith('admin'));

  const isAuthorizedForPengepokan =
    !isPetugasA5 &&
    !isHelper &&
    (area === 'All Cabang' || ['mp', 'ppic', 'hq', 'admin'].includes(usernameLower) || usernameLower.startsWith('admin'));

  // Group 1: Executive & Operasional
  const executiveTabs = useMemo(() => [
    { id: 'stock' as TabKey, label: 'Executive Dashboard', icon: LayoutDashboard, badge: 'LIVE', badgeColor: 'bg-emerald-500/20 text-emerald-400' },
    { id: 'activity_log' as TabKey, label: 'Log Aktivitas Stok', icon: ClipboardList, badge: null, badgeColor: '' },
    { id: 'unposted' as TabKey, label: 'Unposted Dokumen', icon: Clock, badge: 'DOCS', badgeColor: 'bg-amber-500/20 text-amber-300' },
  ], []);

  // Group 2: Audit & Rekonsiliasi
  const auditTabs = useMemo(() => [
    ...(!isReadOnly && isAuthorizedForPencocokan ? [{ id: 'pencocokan' as TabKey, label: 'Pencocokan Data', icon: Scale, badge: 'RECON', badgeColor: 'bg-blue-500/20 text-blue-300' }] : []),
    ...(!isReadOnly && area === 'All Cabang' && !isPetugasA5 && !isHelper ? [{ id: 'akurasi' as TabKey, label: 'Akurasi Stock', icon: BarChart3, badge: 'AUDIT', badgeColor: 'bg-indigo-500/20 text-indigo-300' }] : []),
    { id: 'cek_stock' as TabKey, label: 'Cek Stock', icon: Package, badge: null, badgeColor: '' },
    ...(isAuthorizedForDoiMp ? [{ id: 'doi_mp' as TabKey, label: 'DOI MP', icon: TrendingUp, badge: null, badgeColor: '' }] : []),
    ...(isAuthorizedForPengepokan ? [{ id: 'pengepokan' as TabKey, label: 'Pengepokan', icon: Box, badge: null, badgeColor: '' }] : []),
    ...(((area === 'HQ' || area === 'All Cabang') && !isReadOnly && !isPetugasA5 && !isHelper) ? [{ id: 'mts' as TabKey, label: 'Data MTS (ERP)', icon: FileSpreadsheet, badge: 'ERP', badgeColor: 'bg-violet-500/20 text-violet-300' }] : []),
  ], [area, isAuthorizedForDoiMp, isAuthorizedForPencocokan, isAuthorizedForPengepokan, isHelper, isPetugasA5, isReadOnly]);

  // Group 3: Data Pergerakan
  const pergerakanTabs = useMemo(() => {
    if (isHelper) return [];
    return [
      { id: 'input' as TabKey, label: 'Accessories', icon: ArrowRightLeft, badge: null, badgeColor: '' },
      { id: 'input_rm' as TabKey, label: 'Raw Material', icon: Beaker, badge: null, badgeColor: '' },
      { id: 'input_mfg' as TabKey, label: 'Manufacturing', icon: Box, badge: null, badgeColor: '' },
      { id: 'input_supplies' as TabKey, label: 'Supplies & GA', icon: Package, badge: null, badgeColor: '' },
    ];
  }, [isHelper]);

  // Group 4: Master Data
  const masterTabs = useMemo(() => {
    if (((!isReadOnly || isSuperAdmin || isMP) && !isPetugasA5 && !isHelper)) {
      return [
        { id: 'produk' as TabKey, label: 'Master Produk', icon: Package, badge: null, badgeColor: '' },
        { id: 'locator' as TabKey, label: 'Master Locator', icon: MapPin, badge: null, badgeColor: '' },
      ];
    }
    return [];
  }, [isHelper, isMP, isPetugasA5, isReadOnly, isSuperAdmin]);

  // All tabs flattened for lookup & search
  const allNavTabs = useMemo(() => {
    return [
      ...executiveTabs,
      ...auditTabs,
      ...pergerakanTabs,
      ...masterTabs,
      ...(isSuperAdminOrHq ? [{ id: 'whatsapp' as TabKey, label: 'WhatsApp Console', icon: MessageSquare, badge: 'BOT', badgeColor: 'bg-emerald-500/20 text-emerald-300' }] : [])
    ];
  }, [executiveTabs, auditTabs, pergerakanTabs, masterTabs, isSuperAdminOrHq]);

  const activeTabMeta = useMemo(() => {
    return allNavTabs.find((t) => t.id === safeActiveTab) || {
      id: 'stock',
      label: 'Executive Dashboard',
      icon: LayoutDashboard,
    };
  }, [allNavTabs, safeActiveTab]);

  // Search filtered tabs
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return allNavTabs.filter((t) => t.label.toLowerCase().includes(q));
  }, [allNavTabs, searchQuery]);

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop Overlay */}
      {!isSidebarHidden && (
        <div
          className="sidebar-overlay md:hidden"
          onClick={() => setIsSidebarHidden(true)}
        />
      )}

      {/* Sidebar Component */}
      <aside
        className={cn(
          'app-sidebar',
          isSidebarHidden
            ? 'sidebar-hidden sidebar-desktop-hidden'
            : isDesktopCollapsed
            ? 'sidebar-collapsed sidebar-desktop-collapsed'
            : 'sidebar-expanded sidebar-desktop-expanded'
        )}
      >
          {/* Sidebar Top Header */}
          <div className="sidebar-header">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative group shrink-0">
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-600 opacity-60 blur-xs animate-pulse pointer-events-none" />
                <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-600/30">
                  <div className="w-full h-full bg-[#080d19] rounded-[10px] flex items-center justify-center text-indigo-400 group-hover:text-cyan-300 transition-colors">
                    <MonogramLogo className="w-4 h-4" />
                  </div>
                </div>
              </div>
              <div className="sidebar-brand-copy min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <strong className="text-white text-xs font-black tracking-tight">DASHBOARD</strong>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-black">WH</span>
                </div>
                <span className="truncate text-slate-400 text-[10px] font-semibold">{area}</span>
              </div>
            </div>
            {/* Hide button */}
            <button
              onClick={toggleSidebarHidden}
              className="icon-button icon-button-dark inline-flex shrink-0"
              title="Sembunyikan sidebar navigasi (Ctrl+B)"
              aria-label="Sembunyikan sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Search Filter (Hidden in collapsed mode) */}
          {!isDesktopCollapsed && (
            <div className="sidebar-search-box">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Cari modul / menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Navigation Items List */}
          <div className="sidebar-nav-scroll">
            <nav className="sidebar-nav">
              {filteredTabs ? (
                // Filtered Results View
                <div className="sidebar-section">
                  <div className="sidebar-section-title">
                    <span>Hasil Pencarian</span>
                    <span className="sidebar-section-badge">{filteredTabs.length}</span>
                  </div>
                  {filteredTabs.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-slate-500">
                      Tidak ada menu sesuai kata kunci
                    </div>
                  ) : (
                    filteredTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={cn(
                          'nav-item sidebar-nav-item-glass',
                          safeActiveTab === tab.id
                            ? 'nav-item-active sidebar-nav-item-glass-active active'
                            : 'nav-item-idle sidebar-nav-item-glass-idle idle'
                        )}
                        title={tab.label}
                      >
                        <div className="nav-item-icon-wrap">
                          <tab.icon className="w-4 h-4" />
                        </div>
                        <span className="nav-item-text">{tab.label}</span>
                        {tab.badge && (
                          <span className={cn('nav-item-badge', tab.badgeColor)}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                // Categorized Standard View
                <>
                  {/* Category 1: Ringkasan & Operasi */}
                  <div className="sidebar-section">
                    <div className="sidebar-section-title">
                      <span>Ringkasan & Operasi</span>
                      <span className="sidebar-section-badge">{executiveTabs.length}</span>
                    </div>
                    {executiveTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={cn(
                          'nav-item sidebar-nav-item-glass',
                          safeActiveTab === tab.id
                            ? 'nav-item-active sidebar-nav-item-glass-active active'
                            : 'nav-item-idle sidebar-nav-item-glass-idle idle'
                        )}
                        title={tab.label}
                      >
                        <div className="nav-item-icon-wrap">
                          <tab.icon className="w-4 h-4" />
                        </div>
                        <span className="nav-item-text">{tab.label}</span>
                        {tab.badge && (
                          <span className={cn('nav-item-badge', tab.badgeColor)}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Category 2: Audit & Rekonsiliasi */}
                  {auditTabs.length > 0 && (
                    <div className="sidebar-section">
                      <div className="sidebar-section-title">
                        <span>Audit & Rekonsiliasi</span>
                        <span className="sidebar-section-badge">{auditTabs.length}</span>
                      </div>
                      {auditTabs.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={cn(
                            'nav-item sidebar-nav-item-glass',
                            safeActiveTab === tab.id
                              ? 'nav-item-active sidebar-nav-item-glass-active active'
                              : 'nav-item-idle sidebar-nav-item-glass-idle idle'
                          )}
                          title={tab.label}
                        >
                          <div className="nav-item-icon-wrap">
                            <tab.icon className="w-4 h-4" />
                          </div>
                          <span className="nav-item-text">{tab.label}</span>
                          {tab.badge && (
                            <span className={cn('nav-item-badge', tab.badgeColor)}>
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Category 3: Data Pergerakan & Mutasi */}
                  {pergerakanTabs.length > 0 && (
                    <div className="sidebar-section">
                      <button
                        type="button"
                        onClick={() => setPergerakanOpen(!pergerakanOpen)}
                        className="sidebar-section-title w-full hover:text-slate-300 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <span>Data Pergerakan</span>
                          {pergerakanOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </span>
                        <span className="sidebar-section-badge">{pergerakanTabs.length}</span>
                      </button>
                      {(pergerakanOpen || isDesktopCollapsed) &&
                        pergerakanTabs.map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={cn(
                              'nav-item sidebar-nav-item-glass',
                              safeActiveTab === tab.id
                                ? 'nav-item-active sidebar-nav-item-glass-active active'
                                : 'nav-item-idle sidebar-nav-item-glass-idle idle'
                            )}
                            title={tab.label}
                          >
                            <div className="nav-item-icon-wrap">
                              <tab.icon className="w-4 h-4" />
                            </div>
                            <span className="nav-item-text">{tab.label}</span>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Category 4: Master Data */}
                  {masterTabs.length > 0 && (
                    <div className="sidebar-section">
                      <div className="sidebar-section-title">
                        <span>Master Data</span>
                        <span className="sidebar-section-badge">{masterTabs.length}</span>
                      </div>
                      {masterTabs.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={cn(
                            'nav-item sidebar-nav-item-glass',
                            safeActiveTab === tab.id
                              ? 'nav-item-active sidebar-nav-item-glass-active active'
                              : 'nav-item-idle sidebar-nav-item-glass-idle idle'
                          )}
                          title={tab.label}
                        >
                          <div className="nav-item-icon-wrap">
                            <tab.icon className="w-4 h-4" />
                          </div>
                          <span className="nav-item-text">{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Category 5: Integrasi & Dukungan */}
                  <div className="sidebar-section">
                    <div className="sidebar-section-title">
                      <span>Integrasi & Dukungan</span>
                    </div>
                    {isSuperAdminOrHq && (
                      <button
                        onClick={() => handleTabChange('whatsapp')}
                        className={cn(
                          'nav-item sidebar-nav-item-glass',
                          safeActiveTab === 'whatsapp'
                            ? 'nav-item-active sidebar-nav-item-glass-active active'
                            : 'nav-item-idle sidebar-nav-item-glass-idle idle'
                        )}
                        title="WhatsApp Console"
                      >
                        <div className="nav-item-icon-wrap">
                          <MessageSquare className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="nav-item-text">WhatsApp Console</span>
                        <span className="nav-item-badge bg-emerald-500/20 text-emerald-300">
                          BOT
                        </span>
                      </button>
                    )}

                    {(userRole === 'ALL' ||
                      userRole === 'HQ' ||
                      userRole === 'All Cabang' ||
                      isAdminA5) && (
                      <a
                        href="https://wmsc3.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nav-item sidebar-nav-item-glass nav-item-idle sidebar-nav-item-glass-idle idle"
                        title="Portal WMS C3 Eksternal"
                      >
                        <div className="nav-item-icon-wrap">
                          <ExternalLink className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="nav-item-text text-emerald-300 font-bold">Portal WMS C3</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 ml-auto" />
                      </a>
                    )}
                  </div>
                </>
              )}
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="sidebar-footer">
            {/* Desktop Hide Button */}
            <button
              onClick={toggleSidebarHidden}
              className="sidebar-hide-btn hidden lg:flex"
              title="Sembunyikan sidebar navigasi"
            >
              <PanelLeftClose className="w-4 h-4 shrink-0" />
              <span className="sidebar-footer-text">Sembunyikan Menu</span>
            </button>

            <button
              onClick={onLogout}
              className="logout-button"
              title="Keluar dari sesi WMS"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="sidebar-footer-text">Keluar Sesi</span>
            </button>
          </div>
        </aside>

        {/* Main Right Column: Topbar + Main Content Viewport */}
        <div className="app-main-column">
          {/* Top Header / Responsive Navbar */}
          <header className="app-topbar">
            <div className="topbar-left flex items-center gap-2 sm:gap-3 min-w-0">
              {/* When Sidebar is Hidden, show 'Buka Menu' button + compact Brand lockup */}
              {isSidebarHidden ? (
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  <button
                    onClick={toggleSidebarHidden}
                    className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all cursor-pointer"
                    title="Tampilkan kembali sidebar navigasi (Ctrl+B)"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                    <span>Buka Menu</span>
                  </button>
                  <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                    <MonogramBrand animated={true} compact={false} subtitle={area} theme="light" />
                  </div>
                </div>
              ) : (
                /* When Sidebar is Visible, show sidebar toggle button + optional collapse */
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={toggleSidebarHidden}
                    className="icon-button text-slate-600 hover:text-slate-900"
                    aria-label="Sembunyikan sidebar"
                    title="Sembunyikan sidebar navigasi (Ctrl+B)"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggleDesktopCollapse}
                    className="icon-button text-slate-600 hover:text-slate-900 hidden xl:inline-flex"
                    aria-label={isDesktopCollapsed ? 'Perlebar sidebar' : 'Ciutkan sidebar'}
                    title={isDesktopCollapsed ? 'Perlebar sidebar' : 'Ciutkan ke mode ikon'}
                  >
                    {isDesktopCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    ) : (
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                </div>
              )}

              {/* Mobile Brand (only when on mobile since sidebar is in off-canvas drawer) */}
              <div className="flex lg:hidden items-center gap-2 min-w-0">
                <MonogramBrand animated={true} compact={false} subtitle={area} theme="light" />
              </div>

              {/* Breadcrumb trail on tablet / desktop */}
              <div className="hidden md:flex items-center gap-2 pl-2.5 ml-1 border-l border-slate-200 text-xs shrink-0 min-w-0">
                <span className="text-slate-400 font-semibold tracking-wide uppercase text-[10px]">Cabang</span>
                <span className="text-slate-700 font-bold px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60 truncate max-w-[120px]">{area}</span>
                <span className="text-slate-300">/</span>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                  <activeTabMeta.icon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate">{activeTabMeta.label}</span>
                </div>
              </div>
            </div>

            {/* Topbar Quick Segmented Tabs for 4 most-used modules (Large screens >= 1440px) */}
            <div className="hidden 2xl:flex items-center shrink-0">
              <div className="topbar-quick-tabs">
                <button
                  onClick={() => handleTabChange('stock')}
                  className={cn('quick-tab-btn', safeActiveTab === 'stock' && 'active')}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => handleTabChange('activity_log')}
                  className={cn('quick-tab-btn', safeActiveTab === 'activity_log' && 'active')}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Log Mutasi</span>
                </button>
                {isAuthorizedForPencocokan && !isReadOnly && (
                  <button
                    onClick={() => handleTabChange('pencocokan')}
                    className={cn('quick-tab-btn', safeActiveTab === 'pencocokan' && 'active')}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Pencocokan</span>
                  </button>
                )}
                <button
                  onClick={() => handleTabChange('cek_stock')}
                  className={cn('quick-tab-btn', safeActiveTab === 'cek_stock' && 'active')}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Cek Stock</span>
                </button>
              </div>
            </div>

            <div className="topbar-right">
              {(userRole === 'ALL' || userRole === 'HQ' || userRole === 'All Cabang') && onAreaChange ? (
                <label className="area-switcher">
                  <span className="hidden sm:inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> Area
                  </span>
                  <select
                    value={area}
                    onChange={(e) => onAreaChange(e.target.value)}
                    aria-label="Pilih area gudang"
                  >
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="topbar-context hidden sm:flex">
                  <span className="topbar-kicker">Area aktif</span>
                  <strong>{area}</strong>
                </div>
              )}

              <div className="profile-chip">
                <div className="profile-avatar shrink-0">
                  {isAdminA5
                    ? 'C3'
                    : isPetugasA5
                    ? 'PC'
                    : isHelper
                    ? 'HP'
                    : userRole === 'ALL'
                    ? 'SA'
                    : userRole === 'HQ' || userRole === 'All Cabang'
                    ? 'AC'
                    : area.substring(0, 2)}
                </div>
                <div className="profile-copy hidden md:flex">
                  <strong>{activeUsername || 'Administrator'}</strong>
                  <span>
                    {isAdminA5
                      ? 'Admin C3'
                      : isPetugasA5
                      ? 'Petugas C3'
                      : isHelper
                      ? 'Helper'
                      : userRole === 'ALL'
                      ? 'Super Admin'
                      : userRole === 'HQ' || userRole === 'All Cabang'
                      ? 'Admin All Cabang'
                      : 'Admin Area'}
                  </span>
                </div>
                <ShieldCheck className="profile-status hidden md:block shrink-0" title="Sesi Terverifikasi" />
              </div>
            </div>
          </header>

          {/* Main Content Viewport */}
          <main className="app-main">
          <div className="app-content">
            <div className={cn(safeActiveTab !== 'stock' && 'hidden')}>
              {visitedTabs.has('stock') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <StockOverview
                    spreadsheetId={spreadsheetId}
                    area={area}
                    onNavigateToTab={handleTabChange as any}
                  />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'activity_log' && 'hidden')}>
              {visitedTabs.has('activity_log') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <StockActivityLogView
                    spreadsheetId={spreadsheetId}
                    currentArea={area}
                    activeUsername={activeUsername}
                    onNavigateToTab={handleTabChange}
                  />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'unposted' && 'hidden')}>
              {visitedTabs.has('unposted') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <UnpostedDokumen
                    area={area}
                    userRole={userRole}
                    activeUsername={activeUsername}
                  />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'cek_stock' && 'hidden')}>
              {visitedTabs.has('cek_stock') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <CekStock spreadsheetId={spreadsheetId} area={area} />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'doi_mp' && 'hidden')}>
              {visitedTabs.has('doi_mp') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <DoiMp
                    spreadsheetId={spreadsheetId}
                    area={area}
                    activeUsername={activeUsername}
                    userRole={userRole}
                  />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'pencocokan' && 'hidden')}>
              {visitedTabs.has('pencocokan') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <PencocokanData spreadsheetId={spreadsheetId} area={area} />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'akurasi' && 'hidden')}>
              {visitedTabs.has('akurasi') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <AkurasiStock />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'pengepokan' && 'hidden')}>
              {visitedTabs.has('pengepokan') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <Pengepokan />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'mts' && 'hidden')}>
              {visitedTabs.has('mts') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <MtsData />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'input' && 'hidden')}>
              {visitedTabs.has('input') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  {area === 'HQ' || area === 'All Cabang' ? (
                    <HQReadOnlyPlaceholder title="Accessories" />
                  ) : (
                    <TransactionInput
                      spreadsheetId={spreadsheetId}
                      sheetName="INPUT"
                      title="Accessories"
                      description="Catat transaksi barang Masuk (IN), Keluar (OUT), dan Transfer."
                      isReadOnly={isReadOnly}
                      activeUsername={activeUsername}
                      area={area}
                    />
                  )}
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'input_rm' && 'hidden')}>
              {visitedTabs.has('input_rm') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  {area === 'HQ' || area === 'All Cabang' ? (
                    <HQReadOnlyPlaceholder title="Raw Material" />
                  ) : (
                    <TransactionInput
                      spreadsheetId={spreadsheetId}
                      sheetName="INPUT RM"
                      title="Raw Material"
                      description="Catat transaksi untuk Raw Material Masuk (IN), Keluar (OUT), dan Transfer."
                      isReadOnly={isReadOnly}
                      activeUsername={activeUsername}
                      area={area}
                    />
                  )}
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'input_mfg' && 'hidden')}>
              {visitedTabs.has('input_mfg') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  {area === 'HQ' || area === 'All Cabang' ? (
                    <HQReadOnlyPlaceholder title="Manufacturing" />
                  ) : (
                    <TransactionInput
                      spreadsheetId={spreadsheetId}
                      sheetName="INPUT MFG"
                      title="Manufacturing"
                      description="Catat transaksi untuk Manufacturing Masuk (IN), Keluar (OUT), dan Transfer."
                      isReadOnly={isReadOnly}
                      activeUsername={activeUsername}
                      area={area}
                    />
                  )}
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'input_supplies' && 'hidden')}>
              {visitedTabs.has('input_supplies') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  {area === 'HQ' || area === 'All Cabang' ? (
                    <HQReadOnlyPlaceholder title="Supplies & GA" />
                  ) : (
                    <TransactionInput
                      spreadsheetId={spreadsheetId}
                      sheetName="INPUT SUPPLIES"
                      title="Supplies & GA"
                      description="Catat transaksi untuk Supplies & GA Masuk (IN), Keluar (OUT), dan Transfer."
                      isReadOnly={isReadOnly}
                      activeUsername={activeUsername}
                      area={area}
                    />
                  )}
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'produk' && 'hidden')}>
              {visitedTabs.has('produk') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <MasterProduk
                    spreadsheetId={spreadsheetId}
                    area={area}
                    isReadOnly={isReadOnly}
                    activeUsername={activeUsername}
                    userRole={userRole}
                  />
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'locator' && 'hidden')}>
              {visitedTabs.has('locator') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  {area === 'HQ' || area === 'All Cabang' ? (
                    <HQReadOnlyPlaceholder title="Master Locator" />
                  ) : (
                    <MasterLocator
                      spreadsheetId={spreadsheetId}
                      isReadOnly={isReadOnly}
                      activeUsername={activeUsername}
                      userRole={userRole}
                    />
                  )}
                </Suspense>
              )}
            </div>
            <div className={cn(safeActiveTab !== 'whatsapp' && 'hidden')}>
              {visitedTabs.has('whatsapp') && (
                <Suspense
                  fallback={
                    <div className="p-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  }
                >
                  <WhatsAppConsole area={area} />
                </Suspense>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
});

function HQReadOnlyPlaceholder({ title }: { title: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 shadow-sm text-center max-w-xl mx-auto my-8">
      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
        <Scale className="w-8 h-8" style={{ transform: 'rotate(-10deg)' }} />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">Menu {title} Dinonaktifkan di Area All Cabang</h3>
      <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto mb-6">
        Gudang pusat All Cabang / HQ beroperasi dalam mode Agregasi Multi-Area (Read-Only) untuk memantau performa inventaris di seluruh 11 gudang cabang secara real-time. 
        Anda tidak dapat mengubah data individual dari mode ini. Gunakan area cabang tertentu saat membutuhkan penginputan transaksi atau perubahan master data.
      </p>
    </div>
  );
}

export default Dashboard;

