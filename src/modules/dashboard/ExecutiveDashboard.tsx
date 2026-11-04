import React, { useMemo, useState, useEffect, memo, ComponentType } from "react";
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { StockSummary } from '../../shared/types';
import { CONFIG } from '../../config';
import { cn, formatNumber } from '../../shared/utils';
import { Calendar, Package, MapPin, Layers, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Loader2, FileText, Clock, ShieldAlert, FileCheck, ClipboardList } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchUnpostedDocuments, filterDocsByArea } from '../../lib/unpostedService';
import CategoryDiscrepancyChart from './CategoryDiscrepancyChart';
import CategoryMovementChart from './CategoryMovementChart';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  iconBgClass?: string;
  hoverBorderClass?: string;
  onClick?: () => void;
  onClickLabel?: string;
  footerText?: string;
  className?: string;
}

const DashboardCard = memo(function DashboardCard({
  title,
  value,
  icon: Icon,
  iconBgClass = "bg-blue-50 text-blue-600",
  hoverBorderClass = "hover:border-blue-200",
  onClick,
  onClickLabel,
  footerText,
  className
}: DashboardCardProps) {
  return (
    <div className={cn("bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between transition-colors group", hoverBorderClass, className)}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">{value}</h3>
        </div>
        <div className={cn("p-2.5 rounded-xl group-hover:scale-110 transition-transform", iconBgClass)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {onClick && onClickLabel ? (
        <button onClick={onClick} className="text-left text-xs font-bold mt-3 flex items-center gap-1 text-slate-600 hover:text-slate-900 transition-colors">
          {onClickLabel} &rarr;
        </button>
      ) : footerText ? (
        <span className="text-xs font-medium text-slate-500 mt-3">
          {footerText}
        </span>
      ) : (
        <div className="mt-3 h-4" />
      )}
    </div>
  );
});

interface StockDistributionChartProps {
  chartData: any[];
}

const StockDistributionChart = memo(function StockDistributionChart({ chartData }: StockDistributionChartProps) {
  return (
    <div className="h-80 w-full min-h-[320px]">
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300} minHeight={250}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
            />
            <Bar dataKey="stock" fill="#3b82f6" name="Stok Rill" radius={[6, 6, 0, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
          Tidak ada data stok rill positif untuk disajikan dalam grafik.
        </div>
      )}
    </div>
  );
});

interface ExecutiveDashboardProps {

  stockSummary: StockSummary[];
  allTransactions: any[];
  area: string;
  loading: boolean;
  onRefresh: () => void;
  onNavigateToTab: (tabId: string) => void;
}

const ExecutiveDashboard = memo(function ExecutiveDashboard({
  stockSummary,
  allTransactions,
  area,
  loading,
  onRefresh,
  onNavigateToTab
}: ExecutiveDashboardProps) {

  const [unpostedCount, setUnpostedCount] = useState<number>(0);
  const [loadingUnposted, setLoadingUnposted] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const getUnposted = async () => {
      try {
        setLoadingUnposted(true);
        const docs = await fetchUnpostedDocuments();
        if (isMounted) {
          const filtered = filterDocsByArea(docs, area, area === 'All Cabang' || area === 'HQ' || area === 'ALL');
          setUnpostedCount(filtered.length);
        }
      } catch (err) {
        console.error('Error fetching unposted count for dashboard:', err);
      } finally {
        if (isMounted) setLoadingUnposted(false);
      }
    };
    getUnposted();
    return () => { isMounted = false; };
  }, [area]);

  // Calculate aggregated summary metrics
  const stats = useMemo(() => {
    // Total unique SKUs/combinations (matching PencocokanData)
    const uniqueProducts = stockSummary.length;
    
    // Total locator groups
    const uniqueLocators = new Set(stockSummary.map(s => s.whGroup)).size;
    
    // Cumulative stock
    let totalStock = 0;
    let totalIn = 0;
    let totalOut = 0;

    stockSummary.forEach(item => {
      totalStock += item.stock;
      totalIn += item.totalIn;
      totalOut += item.totalOut;
    });

    // Products with discrepancies (Selisih)
    const discrepancyItems = stockSummary.filter(item => Math.abs(item.selisih || 0) >= 0.001);

    // Stale/unmoved products: Active products that have no transactions today
    const unmovedItems = stockSummary.filter(item => item.totalIn === 0 && item.totalOut === 0);

    return {
      uniqueProducts,
      uniqueLocators,
      totalStock,
      totalIn,
      totalOut,
      lowStockCount: discrepancyItems.length,
      lowStockList: discrepancyItems,
      unmovedCount: unmovedItems.length
    };
  }, [stockSummary]);

  const topTransactionProducts = useMemo(() => {
    if (stockSummary.length === 0) return [];
    
    const withTrans = stockSummary.map(item => ({
      ...item,
      totalTrans: item.totalIn + item.totalOut
    })).filter(item => item.totalTrans > 0);

    return withTrans.sort((a, b) => b.totalTrans - a.totalTrans).slice(0, 3);
  }, [stockSummary]);

  // Extract recent activities for Today or current period
  const recentActivities = useMemo(() => {
    return allTransactions
      .slice(0, 8) // Show top 8 recent transactions
      .map((t, idx) => ({
        id: idx,
        kodeProduk: t.pCode,
        namaProduk: t.pName,
        locator: t.lCode,
        qty: t.qty,
        tipe: t.tipe || 'IN',
        source: t.source || 'INPUT',
        timestamp: t.tanggal || 'Hari Ini'
      }));
  }, [allTransactions]);

  // Top Stock Distribution Chart data
  const chartData = useMemo(() => {
    return stockSummary
      .filter(item => item.stock > 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10)
      .map(item => ({
        name: item.namaProduk.length > 15 ? item.namaProduk.substring(0, 15) + '...' : item.namaProduk,
        stock: item.stock,
        in: item.totalIn,
        out: item.totalOut
      }));
  }, [stockSummary]);

  return (
    <div className="space-y-6">
      {/* Upper Title Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Executive Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">
            Status logistik dan pergudangan area <span className="font-bold text-blue-600">{area}</span> secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Sync Real-Time
          </button>
        </div>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI: Total Produk */}
        <DashboardCard
          title="Total SKU / Kombinasi"
          value={formatNumber(stats.uniqueProducts)}
          icon={Package}
          iconBgClass="bg-blue-50 text-blue-600"
          hoverBorderClass="hover:border-blue-200"
          onClick={() => onNavigateToTab('produk')}
          onClickLabel="Lihat daftar produk"
        />

        {/* KPI: QTY Unposted Dokumen */}
        <DashboardCard
          title="QTY Unposted Dokumen"
          value={loadingUnposted ? "..." : formatNumber(unpostedCount)}
          icon={Clock}
          iconBgClass="bg-amber-50 text-amber-650"
          hoverBorderClass="hover:border-amber-200"
          onClick={() => onNavigateToTab('unposted')}
          onClickLabel="Lihat unposted dokumen"
          footerText={`Draft & In Progress (${area === 'ALL' || area === 'All Cabang' ? 'Semua Area' : area})`}
        />

        {/* KPI: Total Locator */}
        <DashboardCard
          title="Total Locator"
          value={formatNumber(stats.uniqueLocators)}
          icon={MapPin}
          iconBgClass="bg-indigo-50 text-indigo-600"
          hoverBorderClass="hover:border-indigo-200"
          onClick={() => onNavigateToTab('locator')}
          onClickLabel="Petakan tata ruang"
        />

        {/* KPI: Total Stok */}
        <DashboardCard
          title={`Stok Akumulatif ${area === 'ALL' ? 'Semua Area' : area}`}
          value={formatNumber(stats.totalStock)}
          icon={Layers}
          iconBgClass="bg-emerald-50 text-emerald-650"
          hoverBorderClass="hover:border-emerald-200"
          onClick={() => onNavigateToTab('stock')}
          onClickLabel="Lihat rincian saldo"
        />

        {/* KPI: Stok Minimum Alert */}
        <DashboardCard
          title={`Selisih Stock ${area === 'ALL' ? 'Semua Area' : area}`}
          value={stats.lowStockCount > 0 ? `${stats.lowStockCount} Selisih` : "0 Selisih"}
          icon={ShieldAlert}
          iconBgClass={stats.lowStockCount > 0 ? "bg-rose-100 text-rose-650 animate-pulse" : "bg-emerald-50 text-emerald-600"}
          hoverBorderClass={stats.lowStockCount > 0 ? "hover:border-rose-300" : "hover:border-emerald-100"}
          className={stats.lowStockCount > 0 ? "bg-rose-50 border-rose-100 text-rose-950" : ""}
          footerText={stats.lowStockCount > 0 ? "Terdapat perbedaan qty fisik vs sistem" : "Fisik & Sistem telah selaras"}
        />
      </div>

      {/* Primary Row: Chart & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Column (2 cols size span) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">Top 10 Sebaran Saldo Produk</h4>
              <p className="text-xs text-slate-500 mt-0.5">Produk dengan kuantitas stok rill terbanyak saat ini</p>
            </div>
          </div>

          <StockDistributionChart chartData={chartData} />
        </div>

        {/* Recent Transactions Stream Feed */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">Aktivitas & Alur Barang</h4>
              <p className="text-xs text-slate-500 mt-0.5">Transaksi inventaris terbaru di cabang</p>
            </div>
            <button
              onClick={() => onNavigateToTab('activity_log')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              title="Lihat riwayat log aktivitas lengkap"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Semua Log &rarr;</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-80 pr-1 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-slate-300" />
                <span className="text-xs">Menyinkronkan feed aktivitas...</span>
              </div>
            ) : recentActivities.length > 0 ? (
              recentActivities.map((act) => (
                <div key={act.id} className="flex gap-3 text-xs items-start border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                  <div className={cn(
                    "p-1.5 rounded-lg shrink-0 mt-0.5",
                    act.tipe === 'OUT' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {act.tipe === 'OUT' ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 leading-tight truncate">
                      {act.namaProduk}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                      <span className="font-semibold text-slate-500 bg-slate-100 px-1 rounded">{act.locator}</span>
                      <span>&bull;</span>
                      <span>Qty: <strong>{act.qty}</strong></span>
                      <span>&bull;</span>
                      <span className="truncate">{act.source}</span>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 leading-none shrink-0 pt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-300" />
                    {act.timestamp}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 italic text-xs">
                Belum ada rekaman transaksi di log pergerakan.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Row: Discrepancy & Top Transaction Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Discrepancy (Selisih) Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="border-b border-slate-100 pb-3 mb-4 flex justify-between items-center">
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">Selisih Stock {area !== 'ALL' ? area : ''}</h4>
              <p className="text-xs text-slate-500 mt-0.5">Produk dengan selisih kuantitas fisik dan sistem</p>
            </div>
            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-black rounded-full select-none shrink-0 ml-2">
              Beda Qty
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
            {stats.lowStockList.length > 0 ? (
              stats.lowStockList.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-red-50/50 hover:bg-red-50 border border-red-100/50 rounded-xl transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-800 leading-none">{item.namaProduk}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Locator: <span className="font-bold text-slate-600 bg-white border border-slate-150 px-1 rounded">{item.whGroup}</span></p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-black leading-none", (item.selisih || 0) > 0 ? "text-blue-600" : "text-rose-600")}>
                      {(item.selisih || 0) > 0 ? `+${item.selisih}` : item.selisih}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Qty Selisih</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-28 text-slate-400 text-xs italic">
                Seluruh produk telah selaras dengan sistem.
              </div>
            )}
          </div>
        </div>

        {/* Top Transaction Details */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-bold border border-blue-500/30">
                <TrendingUp className="w-3.5 h-3.5" />
                Transaksi Terbanyak
              </div>
              <span className="text-[10px] text-slate-350 bg-white/10 px-2 py-0.5 rounded-full font-mono uppercase">
                Perputaran Barang
              </span>
            </div>

            <h4 className="text-lg font-black tracking-tight pt-1">Aktivitas Tertinggi</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Produk dengan frekuensi keluar/masuk (mutasi) paling tinggi saat ini, menunjukkan perputaran stok paling aktif di area {area}.
            </p>

            <div className="space-y-2 mt-2">
              {topTransactionProducts.length > 0 ? (
                topTransactionProducts.map((product, idx) => (
                  <div key={idx} className="bg-black/20 rounded-xl p-3 text-xs border border-white/5 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">Nama Produk</span>
                        <span className="font-bold text-white leading-tight">{product.namaProduk}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">Locator</span>
                        <span className="font-bold text-blue-300">{product.whGroup}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">Total Mutasi</span>
                        <span className="font-bold text-emerald-400">{formatNumber(product.totalTrans)} Unit</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-black/20 rounded-xl p-4 text-xs border border-white/5 text-slate-400 text-center italic mt-2">
                  Belum ada data transaksi yang cukup.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 mt-4 flex items-center justify-between gap-4">
            <div className="text-[10px] text-slate-350">
              Periode Real-Time
            </div>
            <button
              onClick={() => onNavigateToTab('cek_stock')}
              className="px-3.5 py-1.5 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white text-xs font-black rounded-lg transition-colors shadow"
            >
              Lihat Detail Stok &rarr;
            </button>
          </div>
        </div>
  
      </div>

      {/* Category Goods Movement (In/Out) Trend Visualization (Recharts) */}
      <CategoryMovementChart
        area={area}
        allTransactions={allTransactions}
        onNavigateToTab={onNavigateToTab}
      />

      {/* Category SKU Discrepancy Trend Visualization (Recharts) */}
      <CategoryDiscrepancyChart
        area={area}
        stockSummary={stockSummary}
        allTransactions={allTransactions}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
});

export default ExecutiveDashboard;
