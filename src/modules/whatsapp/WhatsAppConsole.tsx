import { memo } from "react";
import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import { Bot, Send, MessageSquare, ShieldAlert, History, AlertTriangle, ArrowRight, HelpCircle, CheckCheck, Landmark, Loader2, Sparkles, PackageCheck, Layers, FileText, Search } from 'lucide-react';
import { CONFIG } from '../../config';
import { cn, formatDate } from '../../shared/utils';
import type { StockSummary } from '../../shared/types';
import { db, logWhatsAppActivity, logAudit } from '../../shared/services/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { fetchSheetData } from '../../lib/sheets';
import { AREA_URLS } from '../../App';
import { processWhatsAppCommand } from '../../lib/whatsappBot';
import { fetchUnpostedDocuments, UnpostedDoc } from '../../lib/unpostedService';

interface WhatsAppConsoleProps {
  stockSummary?: StockSummary[];
  area: string;
}

// Render *bold* and _italic_ formatting natively in WhatsApp chat bubbles
function renderFormattedMessage(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g);
    return (
      <div key={lineIdx} className="min-h-[1.25em]">
        {parts.map((part, partIdx) => {
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return <strong key={partIdx} className="font-bold text-slate-950">{part.slice(1, -1)}</strong>;
          }
          if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
            return <em key={partIdx} className="italic">{part.slice(1, -1)}</em>;
          }
          return part;
        })}
      </div>
    );
  });
}

function WhatsAppConsole({ stockSummary: initialStockSummary, area }: WhatsAppConsoleProps) {
  const [stockSummary, setStockSummary] = useState<StockSummary[]>(initialStockSummary || []);
  const [unpostedDocs, setUnpostedDocs] = useState<UnpostedDoc[]>([]);
  const [loading, setLoading] = useState(!initialStockSummary || initialStockSummary.length === 0);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Array<{
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
    status?: 'sent' | 'received';
  }>>([
    {
      id: 'welcome',
      sender: 'bot',
      text: `👋 *Halo! Saya adalah Asisten Bot WMS C3 Smart Inventory.*\n\nKirim pesan ke saya untuk melacak stok, melihat barang kritis, katalog produk, locator gudang, atau dokumen unposted.\n\nContoh perintah:\n• *stok*\n• *stok semen*\n• *stok rendah*\n• *produk*\n• *locator*\n• *unposted*\n• *help*`,
      timestamp: Date.now() - 1000 * 60 * 5,
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'simulator' | 'history'>('simulator');
  const [waNumber, setWaNumber] = useState('+6281234567890');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto Scroll
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // Load unposted documents for bot context
  useEffect(() => {
    fetchUnpostedDocuments().then(docs => setUnpostedDocs(docs)).catch(() => []);
  }, []);

  // Load live stock data directly from Sheet
  useEffect(() => {
    if (initialStockSummary && initialStockSummary.length > 0) {
      setStockSummary(initialStockSummary);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const pMap = new Map<string, string>();
        const lMap = new Map<string, { nama: string; whType: string; area: string }>();
        const mappedRows: any[] = [];

        const processRows = (rows: any[], source: string) => {
          const validRows = (rows || []).filter((r: any[]) => {
            if (r.length === 0) return false;
            const tanggal = String(r[0] || '').trim();
            const nama = String(r[1] || '').trim();
            const kode = String(r[9] || '').trim();
            return tanggal !== '' && nama !== '' && kode !== '#N/A' && nama !== '#N/A' && tanggal !== '#N/A';
          });
          validRows.forEach((r: any[]) => {
             const pName = String(r[1] || '').trim();
             let pCode = String(r[9] || '').trim();
             const tipe = String(r[4] || '').trim().toUpperCase();
             if (!pName && !pCode) return;
             if (!pCode) pCode = pName;

             const qtyStr = String(r[2] || '0').replace(',', '.');
             let qty = parseFloat(qtyStr) || 0;
             if (isNaN(qty)) qty = 0;

             let fromLocator = String(r[5] || '').trim();
             let toLocator = String(r[6] || '').trim();

             if (!fromLocator && !toLocator) fromLocator = 'UNKNOWN_L';

             if (tipe === 'TRANSFER' || tipe === 'TF') {
               mappedRows.push({ tipe: 'OUT', pCode, pName, lCode: fromLocator || toLocator || 'UNKNOWN_L', qty, source });
             } else {
               mappedRows.push({ tipe: tipe || 'IN', pCode, pName, lCode: fromLocator || toLocator || 'UNKNOWN_L', qty, source });
             }
          });
        };

        const currentUrl = AREA_URLS[area] || '';
        if (area === 'HQ' || !currentUrl) {
          const urlEntries = Object.entries(AREA_URLS);
          await Promise.all(urlEntries.map(async ([aName, aUrl]) => {
            try {
              const [tn, tr, tm, ts, pr, lr] = await Promise.all([
                fetchSheetData(aUrl, "'INPUT'!A2:J").catch(() => []),
                fetchSheetData(aUrl, "'INPUT RM'!A2:J").catch(() => []),
                fetchSheetData(aUrl, "'INPUT MFG'!A2:J").catch(() => []),
                fetchSheetData(aUrl, "'INPUT SUPPLIES'!A2:J").catch(() => []),
                fetchSheetData(aUrl, "'MASTER_PRODUK'!A2:B").catch(() => []),
                fetchSheetData(aUrl, "'MASTER_LOCATOR'!A2:E").catch(() => [])
              ]);

              pr.filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
                pMap.set(String(r[0]).trim(), String(r[1] || '').trim());
              });

              lr.filter((r: any[]) => r.length > 0 && (r[0] || r[1]) && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
                const val = { nama: String(r[1] || r[0]).trim(), whType: String(r[3] || '').trim(), area: String(r[4] || aName).trim() };
                if (r[0]) { lMap.set(String(r[0]).trim(), val); lMap.set(String(r[0]).trim().toUpperCase(), val); }
                if (r[1]) { lMap.set(String(r[1]).trim(), val); lMap.set(String(r[1]).trim().toUpperCase(), val); }
              });

              processRows(tn, 'INPUT');
              processRows(tr, 'INPUT RM');
              processRows(tm, 'INPUT MFG');
              processRows(ts, 'INPUT SUPPLIES');
            } catch (e) {
              console.error(e);
            }
          }));
        } else {
          const [tn, tr, tm, ts, pr, lr] = await Promise.all([
            fetchSheetData(currentUrl, "'INPUT'!A2:J").catch(() => []),
            fetchSheetData(currentUrl, "'INPUT RM'!A2:J").catch(() => []),
            fetchSheetData(currentUrl, "'INPUT MFG'!A2:J").catch(() => []),
            fetchSheetData(currentUrl, "'INPUT SUPPLIES'!A2:J").catch(() => []),
            fetchSheetData(currentUrl, "'MASTER_PRODUK'!A2:B").catch(() => []),
            fetchSheetData(currentUrl, "'MASTER_LOCATOR'!A2:E").catch(() => [])
          ]);

          pr.filter((r: any[]) => r.length > 0 && r[0] && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
            pMap.set(String(r[0]).trim(), String(r[1] || '').trim());
          });

          lr.filter((r: any[]) => r.length > 0 && (r[0] || r[1]) && r[0] !== '#N/A' && r[1] !== '#N/A').forEach((r: any[]) => {
            const val = { nama: String(r[1] || r[0]).trim(), whType: String(r[3] || '').trim(), area: String(r[4] || '').trim() };
            if (r[0]) { lMap.set(String(r[0]).trim(), val); lMap.set(String(r[0]).trim().toUpperCase(), val); }
            if (r[1]) { lMap.set(String(r[1]).trim(), val); lMap.set(String(r[1]).trim().toUpperCase(), val); }
          });

          processRows(tn, 'INPUT');
          processRows(tr, 'INPUT RM');
          processRows(tm, 'INPUT MFG');
          processRows(ts, 'INPUT SUPPLIES');
        }

        const stockMap = new Map<string, StockSummary>();
        mappedRows.forEach((t) => {
          const { tipe, pCode, pName, lCode, qty } = t;
          const key = `${pCode}_${lCode}`;
          if (!stockMap.has(key)) {
            const lookupKey = lCode.trim();
            const lData = lMap.get(lookupKey) || lMap.get(lookupKey.toUpperCase()) || { nama: lCode, whType: '', area: '' };
            stockMap.set(key, {
              kodeProduk: pCode === pName ? '' : pCode,
              namaProduk: pMap.get(pCode) || pName || pCode,
              whGroup: lCode,
              namaLocator: lData.nama,
              whType: lData.whType,
              area: lData.area,
              totalIn: 0,
              totalOut: 0,
              stock: 0
            });
          }
          const summary = stockMap.get(key)!;
          const normalizedTipe = tipe.replace(/\s+/g, '').toUpperCase();
          const isIN = normalizedTipe === 'IN' || normalizedTipe.includes('AWAL') || normalizedTipe === 'MASUK' || normalizedTipe === 'RECEIPT';
          const isOUT = normalizedTipe === 'OUT' || normalizedTipe === 'KELUAR' || normalizedTipe === 'ISSUE' || normalizedTipe === 'PEMAKAIAN' || normalizedTipe === 'TRANSFER' || normalizedTipe === 'TF';
          
          if (isIN) {
            summary.totalIn += qty;
            summary.stock += qty;
          } else if (isOUT) {
            summary.totalOut += qty;
            summary.stock -= qty;
          } else {
            if (qty > 0 && !['TRANSFER', 'TF'].includes(normalizedTipe)) {
               summary.totalIn += qty;
               summary.stock += qty;
            }
          }
        });

        const list = Array.from(stockMap.values()).filter(s => s.totalIn > 0 || s.totalOut > 0 || s.stock !== 0);
        setStockSummary(list);
      } catch (e) {
        console.error("Error direct loading in whatsapp console:", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [initialStockSummary, area]);

  // Subscribe to WhatsApp logs in Firestore for history tab
  useEffect(() => {
    try {
      const q = query(collection(db, 'whatsapp_logs'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setHistoryLogs(logs);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Unable to load firestore live whatsapp logs subscriptions:", e);
    }
  }, []);

  // Send WhatsApp message and trigger Bot engine
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || inputValue).trim();
    if (!messageText) return;

    const msgId = Math.random().toString();

    // Append user message
    setMessages(prev => [...prev, {
      id: msgId,
      sender: 'user',
      text: messageText,
      timestamp: Date.now()
    }]);

    if (!textToSend) setInputValue('');
    setIsTyping(true);

    try {
      const reply = await processWhatsAppCommand(messageText, {
        stockSummary,
        unpostedDocs
      });

      setIsTyping(false);

      const botMsgId = Math.random().toString();
      setMessages(prev => [...prev, {
        id: botMsgId,
        sender: 'bot',
        text: reply,
        timestamp: Date.now()
      }]);

      // Fire Firestore Logger asynchronously for persistence
      await logWhatsAppActivity(
        waNumber,
        messageText,
        reply,
        'sent'
      ).catch(() => {});

      // Audit Log track
      await logAudit('System (WhatsApp Bot)', 'WHATSAPP_BOT', 'RECEIVE_&_REPLY', `WhatsApp query from ${waNumber}: "${messageText}"`).catch(() => {});
    } catch (err) {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'bot',
        text: '❌ Terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi.',
        timestamp: Date.now()
      }]);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  const QUICK_COMMANDS = [
    { label: '📦 Semua Data', cmd: 'semua data' },
    { label: '📊 Stok Ringkasan', cmd: 'stok' },
    { label: '🚨 Stok Rendah', cmd: 'stok rendah' },
    { label: '📋 Katalog Produk', cmd: 'produk' },
    { label: '📍 Locator Gudang', cmd: 'locator' },
    { label: '📄 Unposted Dokumen', cmd: 'unposted' },
    { label: '❓ Bantuan', cmd: 'help' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Columns: Simulator (2 cols) */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm lg:col-span-2 flex flex-col min-h-[550px] max-h-[680px]">
        {/* Console Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center font-black shadow-inner shrink-0">
              <Bot className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <p className="font-extrabold text-sm tracking-tight leading-none">WMS C3 WhatsApp Auto-Bot</p>
              <div className="flex items-center gap-1.5 mt-1 leading-none">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                <span className="text-[10px] text-slate-350 font-bold">Online & AI Smart Engine Active</span>
              </div>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('simulator')}
              className={cn("px-3 py-1 text-xs font-bold rounded transition-colors", activeTab === 'simulator' ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:text-white")}
            >
              Simulator
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn("px-3 py-1 text-xs font-bold rounded transition-colors", activeTab === 'history' ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:text-white")}
            >
              Log Server ({historyLogs.length})
            </button>
          </div>
        </div>

        {activeTab === 'simulator' ? (
          <>
            {/* Meta Control Widget (Allows simulating different phone numbers) */}
            <div className="bg-slate-50 border-b border-slate-150 p-2.5 px-4 flex flex-wrap gap-2 items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <span>Simulasi Nomor Pengirim WA:</span>
              </div>
              <input
                type="text"
                value={waNumber}
                onChange={e => setWaNumber(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-bold font-mono text-slate-800 outline-none w-36 focus:border-emerald-500 shadow-2xs"
              />
            </div>

            {/* Quick Action Command Chips */}
            <div className="bg-slate-100/70 border-b border-slate-200 p-2 px-3 flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
              {QUICK_COMMANDS.map((qc) => (
                <button
                  key={qc.cmd}
                  onClick={() => handleSendMessage(qc.cmd)}
                  disabled={isTyping}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 text-[11px] font-bold rounded-lg transition-all shadow-2xs whitespace-nowrap flex items-center gap-1 shrink-0 disabled:opacity-50"
                >
                  {qc.label}
                </button>
              ))}
            </div>

            {/* Chat Messages Panel */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2] space-y-3 flex flex-col">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs transition-all",
                    msg.sender === 'user'
                      ? "bg-[#d9fdd3] text-slate-900 ml-auto rounded-tr-none border border-emerald-100"
                      : "bg-white text-slate-900 rounded-tl-none mr-auto border border-slate-100"
                  )}
                >
                  {/* Message body formatted natively */}
                  <div className="font-medium text-slate-800 leading-relaxed">
                    {renderFormattedMessage(msg.text)}
                  </div>
                  
                  {/* Timestamp & Status */}
                  <div className="flex items-center gap-1 justify-end text-[9px] text-slate-400 mt-1 select-none">
                    <span>{new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.sender === 'user' && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="bg-white text-slate-500 rounded-2xl rounded-tl-none p-3 text-xs shadow-xs mr-auto flex items-center gap-2 max-w-[60%]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span className="italic font-medium text-slate-600">Bot sedang mengetik...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input Form Footer */}
            <form onSubmit={handleFormSubmit} className="p-3 bg-white border-t border-slate-200 flex gap-2 items-center shrink-0">
              <input
                type="text"
                placeholder="Ketik pesan... (Contoh: stok semen, stok rendah, help)"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={isTyping}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-800"
              />
              <button
                type="submit"
                disabled={isTyping || !inputValue.trim()}
                className="w-10 h-10 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 rounded-full flex items-center justify-center text-slate-950 transition-colors shadow shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          /* Live Webhook Server Log Panel */
          <div className="flex-1 overflow-y-auto p-4 bg-slate-950 text-slate-300 font-mono text-xs space-y-4">
            <div className="border-b border-slate-800 pb-2 flex justify-between items-center text-[10px]">
              <span className="text-emerald-400 font-bold font-mono">📡 LIVE SERVER WEBHOOK TRAFFIC ({historyLogs.length})</span>
              <span className="text-slate-500">Auto-Refreshed via Cloud Firestore</span>
            </div>

            {historyLogs.length === 0 ? (
              <div className="text-center py-16 text-slate-600 italic">
                Belum ada aktivitas traffic webhook WhatsApp yang tercatat.<br />Kirim pesan di Tab Simulator untuk memicu log server.
              </div>
            ) : (
              historyLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex justify-between text-[10px] border-b border-slate-800 pb-1.5 font-bold">
                    <span className="text-blue-400 font-bold font-mono">PENGIRIM: {log.from}</span>
                    <span className="text-slate-500 font-mono">{formatDate(log.timestamp)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase tracking-widest font-black text-[9px]">REQUEST IN:</span>
                    <p className="text-white bg-slate-950 p-1.5 rounded border border-slate-800/50 mt-1">{log.message}</p>
                  </div>
                  <div>
                    <span className="text-emerald-500 uppercase tracking-widest font-black text-[9px]">RESPONSE OUT (BOT REPLY):</span>
                    <p className="text-emerald-300 bg-slate-950 p-1.5 rounded border border-emerald-900/20 mt-1 whitespace-pre-line leading-relaxed">
                      {log.reply}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Column: API & Webhook documentation (1 col) */}
      <div className="space-y-6">
        {/* Twilio Production Guide Card */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold w-fit border border-emerald-500/30">
            <MessageSquare className="w-3.5 h-3.5" />
            Integrasi Webhook Real Twilio
          </div>
          <h4 className="font-extrabold text-base tracking-tight text-white leading-tight">Konfigurasi Webhook WhatsApp Target</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Untuk menyambungkan nomor WhatsApp bisnis Anda di Twilio asli ke asisten WMS C3, silakan hubungkan webhook di Twilio Console ke URL endpoint produksi:
          </p>

          <div className="bg-black/40 rounded-xl p-3 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block">ENDPOINT TARGET URL:</span>
            <code className="text-emerald-400 text-xs font-mono break-all font-bold block">
              {window.location.protocol}//{window.location.host}/api/whatsapp
            </code>
          </div>

          <p className="text-[11px] text-slate-300 leading-normal">
            ⚙️ <strong>Cara Pengaturan:</strong><br />
            1. Buka dashboard Twilio Console Anda.<br />
            2. Ke tab <strong>Messaging &gt; Try It Out &gt; Send a WhatsApp Message</strong>.<br />
            3. Paste URL di atas pada kolom <strong>"WHEN A MESSAGE COMES IN"</strong>.<br />
            4. Pilih metode <strong>HTTP POST</strong> dan klik <strong>Save</strong>. Setiap chat fisik otomatis dijawab oleh bot asisten ini.
          </p>
        </div>

        {/* Low Stock Alert Settings */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-semibold w-fit border border-rose-100">
              <ShieldAlert className="w-3.5 h-3.5" />
              Notifikasi Low Stock Alert
            </div>

            <h4 className="font-extrabold text-[#0f172a] text-sm leading-tight pt-1">Batas Minimum Pemicu Notifikasi</h4>
            <p className="text-xs text-slate-500 leading-normal">
              Bot asisten stok WhatsApp akan mendeteksi unit yang berada di bawah batas minimum pengaman global:
            </p>

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-150 justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">BATAS AMAN</span>
                <span className="text-base font-extrabold text-slate-800">{CONFIG.DEFAULT_MIN_STOCK} Unit</span>
              </div>
              <span className="text-xs text-slate-400 font-bold">&rarr;</span>
              <div className="text-right">
                <span className="text-[10px] text-rose-500 font-bold block uppercase tracking-wider">KRITIS / ALARM</span>
                <span className="text-base font-extrabold text-rose-600">&le; {CONFIG.DEFAULT_MIN_STOCK} Unit</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            💡 <strong>Rekomendasi Action:</strong> Ketik *stok rendah* di WhatsApp untuk melihat daftar lengkap produk yang membutuhkan reorder secepatnya.
          </p>
        </div>
      </div>
    </div>
  );
}

export default memo(WhatsAppConsole);
