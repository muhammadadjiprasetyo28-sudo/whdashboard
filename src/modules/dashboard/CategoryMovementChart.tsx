import React, { useState, useMemo, memo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import {
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Layers,
  BarChart3,
  Calendar,
  Filter,
  ArrowUpRight,
  PackageCheck
} from 'lucide-react';
import { formatNumber, cn } from '../../shared/utils';

interface CategoryMovementChartProps {
  area: string;
  allTransactions?: any[];
  onNavigateToTab?: (tabId: string) => void;
}

const CATEGORY_CONFIG = [
  {
    id: 'accessories',
    sourceKey: 'INPUT',
    name: 'Accessories',
    colorIn: '#10b981', // Emerald
    colorOut: '#ef4444', // Red
    mainColor: '#3b82f6', // Blue
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'raw_material',
    sourceKey: 'INPUT RM',
    name: 'Raw Material',
    colorIn: '#059669', // Dark Emerald
    colorOut: '#dc2626', // Dark Red
    mainColor: '#10b981', // Emerald
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    id: 'manufacturing',
    sourceKey: 'INPUT MFG',
    name: 'Manufacturing',
    colorIn: '#047857',
    colorOut: '#b91c1c',
    mainColor: '#8b5cf6', // Purple
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200'
  },
  {
    id: 'supplies',
    sourceKey: 'INPUT SUPPLIES',
    name: 'Supplies & GA',
    colorIn: '#15803d',
    colorOut: '#991b1b',
    mainColor: '#f59e0b', // Amber
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200'
  }
];

const CategoryMovementChart = memo(function CategoryMovementChart({
  area,
  allTransactions = [],
  onNavigateToTab
}: CategoryMovementChartProps) {
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Filter transactions by area
  const filteredTx = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) return [];
    if (area === 'ALL' || area === 'All Cabang' || area === 'HQ') {
      return allTransactions;
    }
    const targetArea = area.toUpperCase();
    return allTransactions.filter(t => {
      const txArea = (t.area || '').toUpperCase();
      return txArea === targetArea || txArea.includes(targetArea);
    });
  }, [allTransactions, area]);

  // Aggregate Movement per Category
  const categoryStats = useMemo(() => {
    return CATEGORY_CONFIG.map(cat => {
      let totalIn = 0;
      let totalOut = 0;
      let countIn = 0;
      let countOut = 0;

      filteredTx.forEach(t => {
        const src = (t.source || 'INPUT').toUpperCase().trim();
        const catKey = cat.sourceKey.toUpperCase().trim();

        const matches =
          src === catKey ||
          (cat.sourceKey === 'INPUT' && (src === 'INPUT' || src === 'ACCESSORIES'));

        if (matches) {
          const qty = Number(t.qty) || 0;
          const tipe = (t.tipe || 'IN').toUpperCase().trim();
          if (tipe === 'IN' || tipe.includes('MASUK') || tipe.includes('AWAL') || tipe.includes('RECEIPT')) {
            totalIn += qty;
            countIn++;
          } else if (tipe === 'OUT' || tipe.includes('KELUAR') || tipe.includes('TRANSFER') || tipe === 'TF' || tipe.includes('ISSUE')) {
            totalOut += qty;
            countOut++;
          } else {
            if (qty > 0) {
              totalIn += qty;
              countIn++;
            }
          }
        }
      });

      const totalMovement = totalIn + totalOut;

      return {
        ...cat,
        totalIn: Math.round(totalIn * 100) / 100,
        totalOut: Math.round(totalOut * 100) / 100,
        countIn,
        countOut,
        totalMovement: Math.round(totalMovement * 100) / 100,
        netMovement: Math.round((totalIn - totalOut) * 100) / 100
      };
    });
  }, [filteredTx]);

  // Data for Bar Chart comparison (In vs Out per Category)
  const barChartData = useMemo(() => {
    const data = categoryStats.map(c => ({
      category: c.name,
      'Barang Masuk (IN)': c.totalIn,
      'Barang Keluar (OUT)': c.totalOut,
      totalMovement: c.totalMovement,
      netMovement: c.netMovement,
      colorIn: c.colorIn,
      colorOut: c.colorOut,
      badgeBg: c.badgeBg
    }));

    if (selectedCategoryFilter !== 'ALL') {
      return data.filter(d => d.category.toLowerCase().includes(selectedCategoryFilter.toLowerCase()));
    }
    return data;
  }, [categoryStats, selectedCategoryFilter]);

  // Data for Line Chart (Movement timeline grouped by date or categories)
  const lineChartData = useMemo(() => {
    // Group transactions by date
    const dateMap = new Map<string, Record<string, { inQty: number; outQty: number }>>();

    filteredTx.forEach(t => {
      const rawDate = t.tanggal || 'Terbaru';
      if (!dateMap.has(rawDate)) {
        dateMap.set(rawDate, {
          Accessories: { inQty: 0, outQty: 0 },
          'Raw Material': { inQty: 0, outQty: 0 },
          Manufacturing: { inQty: 0, outQty: 0 },
          'Supplies & GA': { inQty: 0, outQty: 0 }
        });
      }

      const dayObj = dateMap.get(rawDate)!;
      const src = (t.source || 'INPUT').toUpperCase().trim();
      let catName = 'Accessories';
      if (src.includes('RM')) catName = 'Raw Material';
      else if (src.includes('MFG')) catName = 'Manufacturing';
      else if (src.includes('SUPPLIES')) catName = 'Supplies & GA';

      const qty = Number(t.qty) || 0;
      const tipe = (t.tipe || 'IN').toUpperCase().trim();
      const isIN = tipe === 'IN' || tipe.includes('MASUK') || tipe.includes('AWAL') || tipe.includes('RECEIPT');

      if (dayObj[catName]) {
        if (isIN) dayObj[catName].inQty += qty;
        else dayObj[catName].outQty += qty;
      }
    });

    // Sort dates
    const sortedDates = Array.from(dateMap.keys()).sort().slice(-14); // Last 14 dates

    return sortedDates.map(d => {
      const dayData = dateMap.get(d)!;
      return {
        date: d.length > 10 ? d.substring(5) : d,
        'Accessories IN': dayData.Accessories.inQty,
        'Accessories OUT': dayData.Accessories.outQty,
        'Raw Material IN': dayData['Raw Material'].inQty,
        'Raw Material OUT': dayData['Raw Material'].outQty,
        'Manufacturing IN': dayData.Manufacturing.inQty,
        'Manufacturing OUT': dayData.Manufacturing.outQty,
        'Supplies IN': dayData['Supplies & GA'].inQty,
        'Supplies OUT': dayData['Supplies & GA'].outQty,
        'Total IN': dayData.Accessories.inQty + dayData['Raw Material'].inQty + dayData.Manufacturing.inQty + dayData['Supplies & GA'].inQty,
        'Total OUT': dayData.Accessories.outQty + dayData['Raw Material'].outQty + dayData.Manufacturing.outQty + dayData['Supplies & GA'].outQty
      };
    });
  }, [filteredTx]);

  // Overall Totals
  const totalInSum = useMemo(() => categoryStats.reduce((sum, c) => sum + c.totalIn, 0), [categoryStats]);
  const totalOutSum = useMemo(() => categoryStats.reduce((sum, c) => sum + c.totalOut, 0), [categoryStats]);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col space-y-5">
      {/* Title & Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-base tracking-tight">
                Tren Pergerakan Barang (In / Out) per Kategori
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualisasi volume penerimaan (IN) vs pengeluaran (OUT) area <span className="font-bold text-emerald-600">{area === 'ALL' ? 'Semua Cabang' : area}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="accessories">Accessories</option>
              <option value="raw_material">Raw Material</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="supplies">Supplies & GA</option>
            </select>
          </div>

          {/* Chart Type Toggle Button */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setChartType('bar')}
              className={cn(
                "px-3 py-1 rounded-md transition-all flex items-center gap-1.5",
                chartType === 'bar' ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Grafik Batang</span>
            </button>
            <button
              onClick={() => setChartType('line')}
              className={cn(
                "px-3 py-1 rounded-md transition-all flex items-center gap-1.5",
                chartType === 'line' ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              <span>Grafik Garis</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards per Category */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categoryStats.map(cat => (
          <div
            key={cat.id}
            className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">{cat.name}</span>
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border", cat.badgeBg)}>
                {cat.totalMovement > 0 ? `${formatNumber(cat.totalMovement)} Unit` : "0 Unit"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-50/80 border border-emerald-100 p-2 rounded-lg">
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 uppercase">
                  <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>IN (Masuk)</span>
                </div>
                <div className="text-sm font-black text-emerald-900 mt-1">
                  {formatNumber(cat.totalIn)}
                </div>
              </div>

              <div className="bg-rose-50/80 border border-rose-100 p-2 rounded-lg">
                <div className="flex items-center gap-1 text-[10px] font-bold text-rose-700 uppercase">
                  <TrendingDown className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>OUT (Keluar)</span>
                </div>
                <div className="text-sm font-black text-rose-900 mt-1">
                  {formatNumber(cat.totalOut)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Recharts Container */}
      <div className="h-72 w-full min-h-[300px] pt-2">
        {chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barChartData}
              margin={{ top: 15, right: 15, left: -15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="category"
                tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-2 min-w-[190px]">
                        <div className="font-black text-sm text-slate-100 border-b border-slate-700 pb-1.5 flex items-center justify-between">
                          <span>{data.category}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Total Mutasi</span>
                        </div>
                        <div className="flex justify-between items-center text-emerald-400 font-bold">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> Barang Masuk (IN):
                          </span>
                          <span>{formatNumber(data['Barang Masuk (IN)'])} Unit</span>
                        </div>
                        <div className="flex justify-between items-center text-rose-400 font-bold">
                          <span className="flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" /> Barang Keluar (OUT):
                          </span>
                          <span>{formatNumber(data['Barang Keluar (OUT)'])} Unit</span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-800 flex justify-between text-slate-300 font-medium">
                          <span>Arah Net Pergerakan:</span>
                          <span className={data.netMovement >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {data.netMovement >= 0 ? `+${formatNumber(data.netMovement)}` : formatNumber(data.netMovement)} Unit
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{ fontSize: '12px', fontWeight: 700, paddingBottom: '8px' }}
              />
              <Bar dataKey="Barang Masuk (IN)" fill="#10b981" name="Barang Masuk (IN)" radius={[6, 6, 0, 0]} barSize={32} />
              <Bar dataKey="Barang Keluar (OUT)" fill="#ef4444" name="Barang Keluar (OUT)" radius={[6, 6, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={lineChartData.length > 0 ? lineChartData : [{ date: 'Terbaru', 'Total IN': totalInSum, 'Total OUT': totalOutSum }]}
              margin={{ top: 15, right: 15, left: -15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  borderColor: '#cbd5e1',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  fontSize: '11px'
                }}
                labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingBottom: '8px' }}
              />
              {selectedCategoryFilter === 'ALL' ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="Total IN"
                    name="Akumulasi Barang Masuk (IN)"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#10b981' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Total OUT"
                    name="Akumulasi Barang Keluar (OUT)"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#ef4444' }}
                  />
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey={`${CATEGORY_CONFIG.find(c => c.id === selectedCategoryFilter)?.name || 'Accessories'} IN`}
                    name={`${CATEGORY_CONFIG.find(c => c.id === selectedCategoryFilter)?.name || 'Accessories'} (IN)`}
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#10b981' }}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${CATEGORY_CONFIG.find(c => c.id === selectedCategoryFilter)?.name || 'Accessories'} OUT`}
                    name={`${CATEGORY_CONFIG.find(c => c.id === selectedCategoryFilter)?.name || 'Accessories'} (OUT)`}
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#ef4444' }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary Footer */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/60 p-3 rounded-xl">
        <div className="flex items-center gap-2 font-medium">
          <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Total Volume Pergerakan di area <strong>{area === 'ALL' ? 'Semua Cabang' : area}</strong>: <strong className="text-emerald-700">+{formatNumber(totalInSum)} Unit Masuk</strong> &bull; <strong className="text-rose-700">-{formatNumber(totalOutSum)} Unit Keluar</strong>.
          </span>
        </div>

        {onNavigateToTab && (
          <button
            onClick={() => onNavigateToTab('activity_log')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 shrink-0 px-3 py-1 bg-emerald-100/70 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
          >
            <span>Log Pergerakan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

export default CategoryMovementChart;
