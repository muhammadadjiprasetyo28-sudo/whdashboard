import { GoogleGenAI } from "@google/genai";
import { CONFIG } from "../config";
import type { StockSummary } from "../shared/types";

export interface BotContext {
  stockSummary: StockSummary[];
  unpostedDocs?: Array<{
    menu: string;
    documentStatus: string;
    createdBy: string;
    documentNo: string;
    documentDate: string;
    area: string;
  }>;
}

/**
 * Format search results for product stock, SKU, and locator breakdown
 */
export function searchAndFormatStockData(
  queryProd: string,
  stockSummary: StockSummary[],
  showAll = false
): string | null {
  const query = queryProd.trim().toLowerCase();

  let matches = stockSummary;

  // Filter matching items if not showing all data
  if (!showAll && query) {
    matches = stockSummary.filter(
      (item) =>
        (item.namaProduk && item.namaProduk.toLowerCase().includes(query)) ||
        (item.kodeProduk && item.kodeProduk.toLowerCase().includes(query)) ||
        (item.whGroup && item.whGroup.toLowerCase().includes(query)) ||
        (item.namaLocator && item.namaLocator.toLowerCase().includes(query))
    );
  }

  if (matches.length === 0) {
    return null;
  }

  // Group matches by product name
  const grouped = new Map<
    string,
    { kode: string; totalStock: number; locators: Array<{ loc: string; qty: number }> }
  >();

  matches.forEach((m) => {
    const pName = m.namaProduk || m.kodeProduk || "Produk Tanpa Nama";
    if (!grouped.has(pName)) {
      grouped.set(pName, { kode: m.kodeProduk || "", totalStock: 0, locators: [] });
    }
    const entry = grouped.get(pName)!;
    if (!entry.kode && m.kodeProduk) {
      entry.kode = m.kodeProduk;
    }
    entry.totalStock += m.stock;

    const locName = m.whGroup || m.namaLocator || "Gudang Utama";

    // Consolidate quantity per locator name
    const existingLoc = entry.locators.find((l) => l.loc === locName);
    if (existingLoc) {
      existingLoc.qty += m.stock;
    } else {
      entry.locators.push({ loc: locName, qty: m.stock });
    }
  });

  const totalQty = Array.from(grouped.values()).reduce((acc, curr) => acc + curr.totalStock, 0);

  let reply = showAll
    ? `📦 *DAFTAR SEMUA DATA STOK & LOCATOR GUDANG WMS C3*\n` +
      `Total Jenis Produk: *${grouped.size}* | Total Akumulasi Stok: *${totalQty.toLocaleString("id-ID")}* unit\n\n`
    : `📦 *INFORMASI STOK & LOCATOR PRODUK*\n` +
      `Hasil Pencarian: *"${queryProd}"*\n\n`;

  let count = 1;
  const maxDisplay = showAll ? 100 : 25;

  grouped.forEach((data, pName) => {
    if (count <= maxDisplay) {
      reply += `${count}. *${pName}*\n`;
      if (data.kode) reply += `   • Kode SKU: *${data.kode}*\n`;
      reply += `   • Total Stok: *${data.totalStock.toLocaleString("id-ID")}* unit\n`;
      reply += `   • Posisi Locator:\n`;
      if (data.locators.length > 0) {
        data.locators.forEach((l) => {
          reply += `     📍 *${l.loc}*: ${l.qty.toLocaleString("id-ID")} unit\n`;
        });
      } else {
        reply += `     📍 *Gudang Utama*: ${data.totalStock.toLocaleString("id-ID")} unit\n`;
      }
      reply += `\n`;
    }
    count++;
  });

  if (grouped.size > maxDisplay) {
    reply += `_Menampilkan ${maxDisplay} dari ${grouped.size} jenis produk. Ketik nama produk spesifik untuk rincian lebih spesifik._\n\n`;
  }

  reply += `💡 Ketik *help* untuk melihat pilihan menu lainnya.`;
  return reply.trim();
}

/**
 * Format specific locator breakdown and all items inside that locator
 */
export function formatSingleLocatorDetails(
  locQuery: string,
  stockSummary: StockSummary[]
): string | null {
  const query = locQuery.trim().toLowerCase();
  if (!query) return null;

  // Filter items matching locator
  const matchingItems = stockSummary.filter((s) => {
    const loc1 = (s.whGroup || "").toLowerCase();
    const loc2 = (s.namaLocator || "").toLowerCase();
    return loc1.includes(query) || loc2.includes(query);
  });

  if (matchingItems.length === 0) return null;

  // Group by exact locator name found
  const locMap = new Map<
    string,
    { totalQty: number; items: Map<string, { kode: string; qty: number }> }
  >();

  matchingItems.forEach((s) => {
    const loc = s.whGroup || s.namaLocator || "Gudang Utama";
    if (!locMap.has(loc)) {
      locMap.set(loc, { totalQty: 0, items: new Map() });
    }
    const entry = locMap.get(loc)!;
    entry.totalQty += s.stock;

    const pName = s.namaProduk || "Produk Tanpa Nama";
    if (!entry.items.has(pName)) {
      entry.items.set(pName, { kode: s.kodeProduk || "-", qty: 0 });
    }
    entry.items.get(pName)!.qty += s.stock;
  });

  let reply = `📍 *RINCIAN ISI LOCATOR GUDANG*\n`;
  reply += `Hasil Pencarian Locator: *"${locQuery}"*\n\n`;

  locMap.forEach((data, locName) => {
    reply += `🏢 *LOCATOR: ${locName}*\n`;
    reply += `• Total Jenis Barang: *${data.items.size}* jenis\n`;
    reply += `• Akumulasi Stok Fisik: *${data.totalQty.toLocaleString("id-ID")}* unit\n\n`;
    reply += `*Daftar Barang Tersimpan di Locator ${locName}:*\n`;

    let num = 1;
    data.items.forEach((itemData, prodName) => {
      reply += `${num}. *${prodName}*\n`;
      if (itemData.kode && itemData.kode !== "-") {
        reply += `   • Kode SKU: *${itemData.kode}*\n`;
      }
      reply += `   • Jumlah Stok: *${itemData.qty.toLocaleString("id-ID")}* unit\n`;
      num++;
    });
    reply += `\n`;
  });

  reply += `💡 Ketik *locator* untuk melihat seluruh lokasi gudang.`;
  return reply.trim();
}

/**
 * Core Bot Engine to process user messages and return formatted WhatsApp text
 */
export async function processWhatsAppCommand(
  userText: string,
  context: BotContext
): Promise<string> {
  const cleanText = userText.trim().toLowerCase();
  const { stockSummary = [], unpostedDocs = [] } = context;

  // 1. HELP / MENU / BANTUAN
  if (
    cleanText === "help" ||
    cleanText === "bantuan" ||
    cleanText === "menu" ||
    cleanText === "h" ||
    cleanText === "?"
  ) {
    return (
      `🤖 *ASISTEN BOT WMS C3 SMART INVENTORY*\n\n` +
      `Silakan pilih atau ketik perintah berikut:\n\n` +
      `📦 *Pencarian Stok & Locator:*\n` +
      `• *semua data* : tampilkan seluruh data produk, locator & stok\n` +
      `• *[nama produk]* : contoh: *semen*, *paku*, *cat*\n` +
      `• *[kode locator]* : contoh: *A01*, *B02* (melihat isi di locator tersebut)\n` +
      `• *stok* : ringkasan total stok gudang\n` +
      `• *stok rendah* : daftar barang kritis (&le; limit)\n\n` +
      `📋 *Informasi & Katalog:*\n` +
      `• *produk* : katalog produk & total stok\n` +
      `• *locator* : daftar locator gudang & isi barangnya\n` +
      `• *unposted* : dokumen outstanding / draft\n\n` +
      `💡 *Petunjuk Cepat:* Ketik kode locator (contoh: *A01*) untuk melihat semua isi barang di locator tersebut!`
    );
  }

  // 2. SHOW ALL DATA ("semua data" / "stok semua" / "semua stok" / "semua" / "all")
  if (
    cleanText === "semua data" ||
    cleanText === "semua" ||
    cleanText === "stok semua" ||
    cleanText === "semua stok" ||
    cleanText === "all data" ||
    cleanText === "all" ||
    cleanText === "tampilkan semua"
  ) {
    const allDataFormatted = searchAndFormatStockData("", stockSummary, true);
    if (allDataFormatted) {
      return allDataFormatted;
    } else {
      return `📦 *DAFTAR SEMUA DATA STOK*\n\nBelum ada data stok tersimpan di sistem.`;
    }
  }

  // 3. UNPOSTED DOCUMENTS
  if (
    cleanText === "unposted" ||
    cleanText === "dokumen" ||
    cleanText === "tarikan" ||
    cleanText === "draft"
  ) {
    if (unpostedDocs.length === 0) {
      return (
        `📄 *UNPOSTED DOKUMEN*\n\n` +
        `Saat ini tidak ada dokumen outstanding (Draft / In Progress) yang menggantung. Semua dokumen telah diposting dengan rapi!`
      );
    }

    const menuCounts: Record<string, number> = {};
    unpostedDocs.forEach((d) => {
      menuCounts[d.menu] = (menuCounts[d.menu] || 0) + 1;
    });

    let reply = `📄 *RINGKASAN UNPOSTED DOKUMEN*\n`;
    reply += `Total Dokumen Outstanding: *${unpostedDocs.length}*\n\n`;
    reply += `*Rincian Per Menu:*\n`;

    Object.entries(menuCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([menu, count]) => {
        reply += `• ${menu}: *${count}* dokumen\n`;
      });

    reply += `\nKetik *help* untuk melihat menu lainnya.`;
    return reply;
  }

  // 4. STOK RENDAH / KRITIS / ALARM
  if (
    cleanText === "stok rendah" ||
    cleanText === "stok limit" ||
    cleanText === "rendah" ||
    cleanText === "kritis" ||
    cleanText === "min stock"
  ) {
    const minLimit = CONFIG.DEFAULT_MIN_STOCK || 10;

    // Group stock by product name first
    const productGroupMap = new Map<string, { totalStock: number; locators: string[] }>();
    stockSummary.forEach((s) => {
      const name = s.namaProduk || "Produk Tanpa Nama";
      if (!productGroupMap.has(name)) {
        productGroupMap.set(name, { totalStock: 0, locators: [] });
      }
      const item = productGroupMap.get(name)!;
      item.totalStock += s.stock;
      if (s.whGroup) item.locators.push(`${s.whGroup} (${s.stock})`);
    });

    const lowStockItems = Array.from(productGroupMap.entries())
      .filter(([_, data]) => data.totalStock <= minLimit)
      .sort((a, b) => a[1].totalStock - b[1].totalStock);

    if (lowStockItems.length === 0) {
      return (
        `✅ *STATUS STOK AMAN*\n\n` +
        `Tidak ada produk dengan stok di bawah batas minimum (*${minLimit} unit*). Seluruh inventaris dalam kondisi cukup.`
      );
    }

    let reply = `🚨 *PERINGATAN STOK RENDAH (&le; ${minLimit} Unit)*\n\n`;
    lowStockItems.slice(0, 15).forEach(([name, data], idx) => {
      reply += `${idx + 1}. *${name}*\n`;
      reply += `   • Sisa Stok: *${data.totalStock}* unit\n`;
      reply += `   • Locator: ${data.locators.length > 0 ? data.locators.join(", ") : "N/A"}\n\n`;
    });

    if (lowStockItems.length > 15) {
      reply += `_...dan ${lowStockItems.length - 15} produk kritis lainnya._\n\n`;
    }

    reply += `💡 Segera lakukan reorder / pembuatan dokumen penerimaan (Material Receipt).`;
    return reply;
  }

  // 5. GENERAL STOK SUMMARY
  if (cleanText === "stok" || cleanText === "cek stok" || cleanText === "info stok") {
    const totalItems = stockSummary.length;
    const totalQty = stockSummary.reduce((acc, s) => acc + (s.stock > 0 ? s.stock : 0), 0);
    const uniqueProducts = new Set(stockSummary.map((s) => s.namaProduk)).size;

    return (
      `📊 *RINGKASAN TOTAL STOK GUDANG*\n\n` +
      `• Total Jenis Produk: *${uniqueProducts}* jenis\n` +
      `• Total Record Stock: *${totalItems}* lot/locator\n` +
      `• Akumulasi Fisik Stok: *${totalQty.toLocaleString("id-ID")}* unit\n\n` +
      `💡 *Pencarian Stok & Locator:*\n` +
      `• Ketik nama produk langsung: contoh *semen*, *cat*, *paku*\n` +
      `• Ketik kode locator langsung: contoh *A01*, *B02*\n` +
      `• Ketik *semua data* untuk daftar lengkap seluruh produk & locator`
    );
  }

  // 6. SPECIFIC LOCATOR QUERY (e.g. "locator A01", "isi locator A01", "isi A01")
  if (
    cleanText.startsWith("locator ") ||
    cleanText.startsWith("isi locator ") ||
    cleanText.startsWith("isi ")
  ) {
    const locQuery = cleanText
      .replace("isi locator ", "")
      .replace("locator ", "")
      .replace("isi ", "")
      .trim();

    if (locQuery) {
      const locDetails = formatSingleLocatorDetails(locQuery, stockSummary);
      if (locDetails) return locDetails;
    }
  }

  // 7. STOK WITH QUERY (e.g. "stok semen" or "stok A01")
  if (cleanText.startsWith("stok ")) {
    const queryProd = cleanText.substring(5).trim();
    if (queryProd) {
      // Check if it matches a locator first
      const locMatch = formatSingleLocatorDetails(queryProd, stockSummary);
      if (locMatch) return locMatch;

      const searchResult = searchAndFormatStockData(queryProd, stockSummary, false);
      if (searchResult) return searchResult;
    }
  }

  // 8. DIRECT SEARCH (Match direct product name OR direct locator code like "A01")
  const directLocDetails = formatSingleLocatorDetails(cleanText, stockSummary);
  if (directLocDetails) {
    return directLocDetails;
  }

  const directSearchResult = searchAndFormatStockData(cleanText, stockSummary, false);
  if (directSearchResult) {
    return directSearchResult;
  }

  // 9. KATALOG PRODUK
  if (
    cleanText === "produk" ||
    cleanText === "katalog" ||
    cleanText === "list produk" ||
    cleanText === "daftar produk"
  ) {
    const productGroup = new Map<string, number>();
    stockSummary.forEach((s) => {
      const name = s.namaProduk || "Tanpa Nama";
      productGroup.set(name, (productGroup.get(name) || 0) + s.stock);
    });

    const sortedProducts = Array.from(productGroup.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    if (sortedProducts.length === 0) {
      return `📋 *KATALOG PRODUK*\n\nBelum ada data produk tersimpan di database.`;
    }

    let reply = `📋 *KATALOG PRODUK (${sortedProducts.length} Jenis)*\n\n`;
    sortedProducts.slice(0, 20).forEach(([name, qty], idx) => {
      reply += `${idx + 1}. *${name}* — Stok: *${qty.toLocaleString("id-ID")}*\n`;
    });

    if (sortedProducts.length > 20) {
      reply += `\n_...dan ${sortedProducts.length - 20} produk lainnya._\n`;
    }

    reply += `\n💡 Ketik nama produk langsung untuk detail locator per produk, atau ketik *semua data*.`;
    return reply;
  }

  // 10. LOCATOR / POSISI SUMMARY LIST WITH ITEM BREAKDOWNS
  if (
    cleanText === "locator" ||
    cleanText === "posisi" ||
    cleanText === "wh" ||
    cleanText === "area" ||
    cleanText === "list locator" ||
    cleanText === "daftar locator"
  ) {
    const locGroup = new Map<
      string,
      { totalQty: number; items: Map<string, { kode: string; qty: number }> }
    >();

    stockSummary.forEach((s) => {
      const loc = s.whGroup || s.namaLocator || "Lainnya / General";
      if (!locGroup.has(loc)) {
        locGroup.set(loc, { totalQty: 0, items: new Map() });
      }
      const entry = locGroup.get(loc)!;
      entry.totalQty += s.stock;

      const pName = s.namaProduk || "Produk Tanpa Nama";
      if (!entry.items.has(pName)) {
        entry.items.set(pName, { kode: s.kodeProduk || "-", qty: 0 });
      }
      entry.items.get(pName)!.qty += s.stock;
    });

    const sortedLocs = Array.from(locGroup.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    if (sortedLocs.length === 0) {
      return `📍 *DAFTAR LOCATOR GUDANG*\n\nBelum ada data locator tersimpan.`;
    }

    let reply = `📍 *DAFTAR LOCATOR GUDANG & ISI BARANG (${sortedLocs.length} Area)*\n\n`;

    sortedLocs.forEach(([locName, data], idx) => {
      reply += `${idx + 1}. 📍 *${locName}*\n`;
      reply += `   • Total Barang: *${data.items.size}* jenis (${data.totalQty.toLocaleString("id-ID")} unit)\n`;
      reply += `   • Isi Barang:\n`;

      let itemIdx = 0;
      data.items.forEach((itemData, prodName) => {
        if (itemIdx < 5) {
          reply += `     - *${prodName}* ${itemData.kode !== "-" ? `(${itemData.kode})` : ""}: *${itemData.qty.toLocaleString("id-ID")}* unit\n`;
        }
        itemIdx++;
      });

      if (data.items.size > 5) {
        reply += `     - _+${data.items.size - 5} jenis barang lainnya_\n`;
      }
      reply += `\n`;
    });

    reply += `💡 Ketik kode locator spesifik (contoh: *A01*) untuk melihat rincian isi barang di locator tersebut.`;
    return reply.trim();
  }

  // 11. GEMINI AI SMART FALLBACK FOR NATURAL LANGUAGE QUESTIONS
  try {
    const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const summaryContext = stockSummary.slice(0, 150).map((s) => ({
        produk: s.namaProduk,
        kode: s.kodeProduk,
        stok: s.stock,
        locator: s.whGroup
      }));

      const prompt = `Anda adalah Asisten WhatsApp Bot Resmi WMS C3 Smart Inventory.
Pengguna mengirim pesan berikut melalui WhatsApp: "${userText}"

Data Stok Gudang Terkini (Ringkasan):
${JSON.stringify(summaryContext)}

Instruksi:
1. Jawab pesan pengguna dalam Bahasa Indonesia secara ramah, profesional, singkat, dan tepat untuk format WhatsApp (gunakan bold dengan bintang *teks*).
2. Jika pengguna menanyakan stok barang, locator, atau isi locator, sebutkan nama produk, kode SKU, locator, dan stok secara spesifik.
3. Maksimal 150 kata. Sertakan icon emoji yang relevan.
4. Jika pertanyaan tidak relevan dengan inventaris/gudang, jelaskan dengan sopan fungsi bot ini dan sarankan mengetik *locator* atau *help*.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt
      });

      if (response.text && response.text.trim()) {
        return response.text.trim();
      }
    }
  } catch (err) {
    console.warn("Gemini fallback in WhatsApp command failed:", err);
  }

  // Default fallback if query is unknown and no stock match
  return (
    `🤖 *BARANG / LOCATOR TIDAK DITEMUKAN*\n\n` +
    `Pencarian untuk *"${userText}"* tidak cocok dengan data produk, locator, atau perintah di sistem.\n\n` +
    `Silakan pilih perintah di bawah ini:\n` +
    `• *locator* : daftar lokasi gudang & isi barangnya\n` +
    `• *[kode locator]* : contoh *A01*, *B02* (melihat isi di locator tersebut)\n` +
    `• *[nama produk]* : contoh *semen*, *paku*, *cat*\n` +
    `• *semua data* : tampilkan seluruh data produk & locator\n` +
    `• *help* : panduan lengkap`
  );
}
