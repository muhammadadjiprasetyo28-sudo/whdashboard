import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// ============================================================================
// SERVER-SIDE CREDENTIALS & ROLE MATRIX REPOSITORY (Never exposed to frontend)
// ============================================================================
interface ServerAccount {
  username: string;
  passwordHash: string; // Plaintext or hash check
  role: 'SUPER_ADMIN' | 'ADMIN_C3' | 'PETUGAS_C3' | 'HELPER' | 'HQ' | 'MP' | 'PPIC' | 'ADMIN_AREA';
  allowedArea: string; // 'ALL', 'All Cabang', or specific area name
  label: string;
  readonly?: boolean;
}

const SERVER_ACCOUNTS: ServerAccount[] = [
  { username: 'admin', passwordHash: 'admin123', role: 'SUPER_ADMIN', allowedArea: 'ALL', label: 'Super Admin (Semua Area)' },
  { username: 'adminc3', passwordHash: 'adminc3123', role: 'ADMIN_C3', allowedArea: 'ALL', label: 'Admin C3' },
  { username: 'petugasc3', passwordHash: 'petugasc3123', role: 'PETUGAS_C3', allowedArea: 'ALL', label: 'Petugas C3' },
  { username: 'admina5', passwordHash: 'admina5123', role: 'ADMIN_C3', allowedArea: 'ALL', label: 'Admin C3' },
  { username: 'petugasa5', passwordHash: 'petugasa5123', role: 'PETUGAS_C3', allowedArea: 'ALL', label: 'Petugas C3' },
  { username: 'helper', passwordHash: 'helper123', role: 'HELPER', allowedArea: 'ALL', label: 'Helper Operasional' },
  { username: 'hq', passwordHash: 'hq123', role: 'HQ', allowedArea: 'All Cabang', label: 'Admin All Cabang (Pusat)' },
  { username: 'admin_hq', passwordHash: 'hq123', role: 'HQ', allowedArea: 'All Cabang', label: 'Admin All Cabang' },
  { username: 'mp', passwordHash: 'mp123', role: 'MP', allowedArea: 'All Cabang', label: 'Material Planning (MP)', readonly: true },
  { username: 'ppic', passwordHash: 'ppic123', role: 'PPIC', allowedArea: 'All Cabang', label: 'PPIC', readonly: true },
  { username: 'jakarta', passwordHash: 'jakarta123', role: 'ADMIN_AREA', allowedArea: 'Jakarta', label: 'Admin Jakarta' },
  { username: 'admin_jakarta', passwordHash: 'jakarta123', role: 'ADMIN_AREA', allowedArea: 'Jakarta', label: 'Admin Jakarta' },
  { username: 'karawang', passwordHash: 'karawang123', role: 'ADMIN_AREA', allowedArea: 'Karawang', label: 'Admin Karawang' },
  { username: 'admin_karawang', passwordHash: 'karawang123', role: 'ADMIN_AREA', allowedArea: 'Karawang', label: 'Admin Karawang' },
  { username: 'semarang', passwordHash: 'semarang123', role: 'ADMIN_AREA', allowedArea: 'Semarang', label: 'Admin Semarang' },
  { username: 'admin_semarang', passwordHash: 'semarang123', role: 'ADMIN_AREA', allowedArea: 'Semarang', label: 'Admin Semarang' },
  { username: 'surabaya', passwordHash: 'surabaya123', role: 'ADMIN_AREA', allowedArea: 'Surabaya', label: 'Admin Surabaya' },
  { username: 'admin_surabaya', passwordHash: 'surabaya123', role: 'ADMIN_AREA', allowedArea: 'Surabaya', label: 'Admin Surabaya' },
  { username: 'jember', passwordHash: 'jember123', role: 'ADMIN_AREA', allowedArea: 'Jember', label: 'Admin Jember' },
  { username: 'admin_jember', passwordHash: 'jember123', role: 'ADMIN_AREA', allowedArea: 'Jember', label: 'Admin Jember' },
  { username: 'makassar', passwordHash: 'makassar111', role: 'ADMIN_AREA', allowedArea: 'Makassar', label: 'Admin Makassar' },
  { username: 'admin_makassar', passwordHash: 'makassar123', role: 'ADMIN_AREA', allowedArea: 'Makassar', label: 'Admin Makassar' },
  { username: 'pontianak', passwordHash: 'pontianak123', role: 'ADMIN_AREA', allowedArea: 'Pontianak', label: 'Admin Pontianak' },
  { username: 'admin_pontianak', passwordHash: 'pontianak123', role: 'ADMIN_AREA', allowedArea: 'Pontianak', label: 'Admin Pontianak' },
  { username: 'banjarmasin', passwordHash: 'banjarmasin123', role: 'ADMIN_AREA', allowedArea: 'Banjarmasin', label: 'Admin Banjarmasin' },
  { username: 'admin_banjarmasin', passwordHash: 'banjarmasin123', role: 'ADMIN_AREA', allowedArea: 'Banjarmasin', label: 'Admin Banjarmasin' },
  { username: 'palembang', passwordHash: 'palembang123', role: 'ADMIN_AREA', allowedArea: 'Palembang', label: 'Admin Palembang' },
  { username: 'admin_palembang', passwordHash: 'palembang123', role: 'ADMIN_AREA', allowedArea: 'Palembang', label: 'Admin Palembang' },
  { username: 'medan', passwordHash: 'medan123', role: 'ADMIN_AREA', allowedArea: 'Medan', label: 'Admin Medan' },
  { username: 'admin_medan', passwordHash: 'medan123', role: 'ADMIN_AREA', allowedArea: 'Medan', label: 'Admin Medan' },
  { username: 'pekanbaru', passwordHash: 'pekanbaru123', role: 'ADMIN_AREA', allowedArea: 'Pekanbaru', label: 'Admin Pekanbaru' },
  { username: 'admin_pekanbaru', passwordHash: 'pekanbaru123', role: 'ADMIN_AREA', allowedArea: 'Pekanbaru', label: 'Admin Pekanbaru' },
];

// Server-side Apps Script URL Allowlist (Protects against Arbitrary SSRF)
const AREA_GAS_ENDPOINTS: Record<string, string> = {
  "Semarang": "https://script.google.com/macros/s/AKfycbyIIH9cK_28B_1snnP34O-sAYSbfD6AxKa469DpROT-bLusjZJVAalJC_287gG5IfN2/exec",
  "Medan": "https://script.google.com/macros/s/AKfycbztMdYKZVq9CzjyDV0hS4gIp28G2YYcJ06blnEX2R2TxNI7VakMMWWJWNtB02MT4h0kdg/exec",
  "Banjarmasin": "https://script.google.com/macros/s/AKfycbwBAHlRLcpd6ORSMHwHkil_YTR5sBWoFyCwpHA0ykAZeRXKEGcJL5sffVSx-wh_l8ZM/exec",
  "Jember": "https://script.google.com/macros/s/AKfycbxRo-cmtM1FdQgWSce2sR2BuGdCmSAau2F-3a9V4T26DgPpqCA2nDAy58wtablPqO4C/exec",
  "Makassar": "https://script.google.com/macros/s/AKfycbwDPpdlYvLcleIZ2oKrsVCTsI1sSv9k3auuaDmV7zcvH8Yf-hn6guJ9OCCBzM95tMeJ/exec",
  "Palembang": "https://script.google.com/macros/s/AKfycbwum8m0n6DhxPhAzQ1VvPf5HSfufJeX-Im_YUG88BjRIAHJlUVY2TS5Ba1vXGl4z5rD/exec",
  "Pekanbaru": "https://script.google.com/macros/s/AKfycbw_EWJWwwDfu184ZCje9ypcsoIcqliMlVuPhjiGikiFbvjtWBUpsxuThRp4_N0eeOycCw/exec",
  "Pontianak": "https://script.google.com/macros/s/AKfycbz2xTv0vr0iz6nQeLMPcW79oKtezE9l1gtlvdJUDUfccR2sGsMtMXn9MjvO-wJmoXA/exec",
  "Surabaya": "https://script.google.com/macros/s/AKfycbyNvvxxikV5eZE4eBqqH_H4Nhl6B7GJT1btQz9ncVih4FHvxnQE4kEQAM789LtUBBFmlg/exec",
  "Karawang": "https://script.google.com/macros/s/AKfycbwTI_3RCL4lle9lJei4qTv_Cm4VnCCFawNFLgZzJ_O83Y5T3qhHN6JxiX5QujfoRDegzQ/exec",
  "Jakarta": "https://script.google.com/macros/s/AKfycbwgor6oSmZzRE0MaFN51B2YaiDJe8dtV3guKrGdZLY9gLdQgFsk4tANGGm1B1aQMdZUFw/exec",
};

// In-Memory Active Sessions Store
interface SessionInfo {
  token: string;
  user: {
    username: string;
    role: ServerAccount['role'];
    allowedArea: string;
    label: string;
    readonly: boolean;
  };
  createdAt: number;
  expiresAt: number;
}

const activeSessions = new Map<string, SessionInfo>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt <= now) {
      activeSessions.delete(token);
    }
  }
}

// Clean sessions periodically
setInterval(cleanExpiredSessions, 15 * 60 * 1000);

// Helper for XML escaping to prevent XML injection
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Rate Limiter Helper
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitBucket>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = rateLimits.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + windowMs };
    rateLimits.set(key, bucket);
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count++;
  return true;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middleware to authenticate requests
  function getSessionFromRequest(req: Request): SessionInfo | null {
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-session-token']) {
      token = String(req.headers['x-session-token']).trim();
    }

    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      activeSessions.delete(token);
      return null;
    }
    return session;
  }

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: "Sesi tidak valid atau telah berakhir. Silakan login kembali." });
    }
    (req as any).user = session.user;
    next();
  }

  // ============================================================================
  // AUTHENTICATION API ROUTES
  // ============================================================================

  app.post("/api/auth/login", (req, res) => {
    try {
      const { username, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      // Rate limit login attempts: max 15 attempts per minute per IP
      if (!checkRateLimit(`login_${clientIp}`, 15, 60000)) {
        return res.status(429).json({ error: "Terlalu banyak percobaan login. Silakan tunggu 1 menit." });
      }

      if (!username || !password) {
        return res.status(400).json({ error: "Username dan password wajib diisi." });
      }

      const inputUser = String(username).trim().toLowerCase();
      const inputPass = String(password);

      const matched = SERVER_ACCOUNTS.find(
        acc => acc.username.toLowerCase() === inputUser && acc.passwordHash === inputPass
      );

      if (!matched) {
        return res.status(401).json({ error: "Username atau password salah! Silakan periksa kembali." });
      }

      // Create cryptographically secure session
      const token = generateSecureToken();
      const sessionInfo: SessionInfo = {
        token,
        user: {
          username: matched.username,
          role: matched.role,
          allowedArea: matched.allowedArea,
          label: matched.label,
          readonly: !!matched.readonly,
        },
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      };

      activeSessions.set(token, sessionInfo);

      return res.json({
        success: true,
        token,
        user: sessionInfo.user,
        expiresAt: sessionInfo.expiresAt,
      });
    } catch (err: any) {
      console.error("Auth login error:", err);
      return res.status(500).json({ error: "Terjadi kesalahan pada sistem otentikasi." });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ authenticated: false, error: "Session invalid or expired" });
    }
    return res.json({
      authenticated: true,
      user: session.user,
      expiresAt: session.expiresAt,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-session-token']) {
      token = String(req.headers['x-session-token']).trim();
    }
    if (token) {
      activeSessions.delete(token);
    }
    return res.json({ success: true });
  });

  // ============================================================================
  // WHATSAPP WEBHOOK (Secure, XML-escaped, size-capped)
  // ============================================================================
  app.post("/api/whatsapp", async (req, res) => {
    try {
      const incomingMsg = String(req.body.Body || req.body.body || req.body.message || req.body.text || "help").substring(0, 500);
      const sender = String(req.body.From || req.body.from || "WhatsApp User").substring(0, 100);
      const cleanMsg = incomingMsg.trim().toLowerCase();

      let reply = "";

      if (cleanMsg === "help" || cleanMsg === "bantuan" || cleanMsg === "menu" || cleanMsg === "h" || cleanMsg === "?") {
        reply = `🤖 *ASISTEN BOT WMS C3 SMART INVENTORY*\n\n` +
                `Silakan pilih atau ketik perintah berikut:\n\n` +
                `📦 *Pencarian Stok:*\n` +
                `• *stok* : ringkasan total stok gudang\n` +
                `• *stok [nama/kode]* : contoh: *stok semen*, *stok A01*\n` +
                `• *stok rendah* : daftar barang kritis/di bawah limit\n\n` +
                `📋 *Informasi & Katalog:*\n` +
                `• *produk* : katalog produk & total stok\n` +
                `• *locator* : daftar locator gudang & isi barang\n` +
                `• *unposted* : dokumen outstanding / draft\n\n` +
                `💡 Buka dashboard WMS C3 untuk simulator interaktif.`;
      } else if (cleanMsg === "stok" || cleanMsg === "info stok") {
        reply = `📊 *RINGKASAN STOK WMS C3*\n\nSistem online dan aktif.\nKetik *stok [nama barang]* untuk cek stok spesifik (contoh: *stok semen*).`;
      } else if (cleanMsg === "stok rendah" || cleanMsg === "kritis") {
        reply = `🚨 *PERINGATAN STOK RENDAH*\n\nSistem mendeteksi produk dengan stok di bawah batas pengaman (≤ 10 unit).\nKetik *stok [nama]* atau buka dashboard simulator untuk rincian lengkap.`;
      } else if (cleanMsg === "produk" || cleanMsg === "katalog") {
        reply = `📋 *KATALOG PRODUK WMS C3*\n\nMaster produk terintegrasi dengan Google Sheets & iDempiere.\nKetik *stok [nama]* untuk cek posisi locator per produk.`;
      } else if (cleanMsg === "locator") {
        reply = `📍 *LOCATOR GUDANG WMS C3*\n\nSemua area locator terpeta secara real-time.\nKetik *stok [kode locator]* (contoh: *stok A01*) untuk cek barang di locator tersebut.`;
      } else if (cleanMsg === "unposted" || cleanMsg === "dokumen") {
        reply = `📄 *UNPOSTED DOKUMEN*\n\nMonitoring dokumen draft & in-progress aktif di sheet Tarikan.`;
      } else {
        reply = `🤖 Halo! Pesan "${escapeXml(incomingMsg)}" diterima.\n\nKetik *help* untuk melihat daftar perintah WhatsApp Bot WMS C3.`;
      }

      // Check if request expects XML (Twilio webhook standard)
      if (req.headers["content-type"]?.includes("x-www-form-urlencoded") || req.headers["accept"]?.includes("xml") || req.body.AccountSid) {
        res.setHeader("Content-Type", "text/xml; charset=utf-8");
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
</Response>`);
      }

      return res.json({ from: sender, message: incomingMsg, reply });
    } catch (err: any) {
      console.error("Error in /api/whatsapp webhook:", err);
      res.status(500).json({ error: "WhatsApp webhook error" });
    }
  });

  // ============================================================================
  // GOOGLE APPS SCRIPT PROXY (Hardened with Allowlist, Validation, Retries & Cache)
  // ============================================================================
  interface SheetCacheEntry {
    timestamp: number;
    data: any;
  }
  const serverSheetCache = new Map<string, SheetCacheEntry>();
  const serverInFlightSheets = new Map<string, Promise<any>>();
  const SERVER_SHEET_CACHE_TTL = 45 * 1000; // 45 seconds cache for identical reads

  // Concurrency limiter to prevent Google Apps Script overload and cold-start timeouts
  class GasConcurrencyLimiter {
    private running = 0;
    private queue: (() => void)[] = [];
    constructor(private limit: number) {}

    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (this.running >= this.limit) {
        await new Promise<void>((resolve) => this.queue.push(resolve));
      }
      this.running++;
      try {
        return await fn();
      } finally {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }
  const gasLimiter = new GasConcurrencyLimiter(12);

  function getFreshUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      parsed.searchParams.set('t', String(Date.now()));
      return parsed.toString();
    } catch {
      return urlStr;
    }
  }

  async function fetchGasWithRetry(url: string, options: RequestInit, maxAttempts = 2, timeoutMs = 35000): Promise<globalThis.Response> {
    let lastResponse: globalThis.Response | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const currentUrl = attempt === 1 ? url : getFreshUrl(url);
      try {
        const response = await fetch(currentUrl, {
          ...options,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          return response;
        }

        lastResponse = response;
        // If Google serverless instance returned 404 (stale echo token / redirect glitch), 429, or 500-504, retry with fresh URL
        if ([404, 429, 500, 502, 503, 504].includes(response.status) && attempt < maxAttempts) {
          console.info(`[Apps Script Proxy] HTTP ${response.status} on attempt ${attempt}. Reconnecting in 1.5s...`);
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        return response;
      } catch (err: any) {
        lastError = err;
        const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('timeout');
        if (attempt < maxAttempts) {
          console.info(`[Apps Script Proxy] Attempt ${attempt} incomplete (${isTimeout ? 'latency limit' : 'network'}). Reconnecting in 1.5s...`);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    if (lastResponse) return lastResponse;
    throw lastError;
  }

  const handleSheetsProxy = async (req: Request, res: Response) => {
    const payload = req.method === 'GET' ? req.query : req.body;
    const area = (payload?.area || req.query?.area) as string | undefined;
    const gasUrl = (payload?.gasUrl || req.query?.gasUrl) as string | undefined;
    const action = (payload?.action || req.query?.action || (req.method === 'GET' ? 'get' : undefined)) as string | undefined;
    const range = (payload?.range || req.query?.range) as string | undefined;
    const values = payload?.values;

    try {
      // 1. Resolve target Apps Script URL from strict server-side allowlist
      let targetUrl = '';
      if (area && AREA_GAS_ENDPOINTS[area]) {
        targetUrl = AREA_GAS_ENDPOINTS[area];
      } else if (gasUrl) {
        const trimmedGasUrl = String(gasUrl).trim();
        // Check exact match or normalized URL
        const isAllowlisted = Object.values(AREA_GAS_ENDPOINTS).some(url =>
          url.trim() === trimmedGasUrl ||
          url.split('?')[0].replace(/\/+$/, '') === trimmedGasUrl.split('?')[0].replace(/\/+$/, '')
        );

        if (!isAllowlisted) {
          // Check if area name was passed in gasUrl
          if (AREA_GAS_ENDPOINTS[trimmedGasUrl]) {
            targetUrl = AREA_GAS_ENDPOINTS[trimmedGasUrl];
          } else {
            console.warn(`[Security Alert] Blocked attempt to proxy non-allowlisted URL: ${gasUrl}`);
            return res.status(403).json({ error: "Akses ditolak: Target endpoint Google Sheets tidak terdaftar dalam allowlist resmi." });
          }
        } else {
          // Use canonical allowlisted URL to prevent subtle URL variations
          const foundKey = Object.keys(AREA_GAS_ENDPOINTS).find(k =>
            AREA_GAS_ENDPOINTS[k].trim() === trimmedGasUrl ||
            AREA_GAS_ENDPOINTS[k].split('?')[0].replace(/\/+$/, '') === trimmedGasUrl.split('?')[0].replace(/\/+$/, '')
          );
          targetUrl = foundKey ? AREA_GAS_ENDPOINTS[foundKey] : trimmedGasUrl;
        }
      }

      if (!targetUrl || !targetUrl.startsWith("https://script.google.com/")) {
        return res.status(400).json({ error: "Area atau endpoint tidak valid atau belum dikonfigurasi." });
      }

      // 2. Validate action parameter
      const allowedActions = ['get', 'append', 'update', 'init'];
      if (!action || !allowedActions.includes(action)) {
        return res.status(400).json({ error: `Aksi tidak valid: ${action}. Hanya get, append, update, init yang diizinkan.` });
      }

      // 3. Validate range parameter
      const cleanRange = String(range || '').trim();
      if (action !== 'init') {
        if (!cleanRange || !/^[A-Za-z0-9_\s'!:-]+$/.test(cleanRange) || cleanRange.length > 120) {
          return res.status(400).json({ error: "Format range spreadsheet tidak valid." });
        }
      }

      // 4. Validate values for mutation actions
      if ((action === 'append' || action === 'update') && (!Array.isArray(values) || values.length === 0)) {
        return res.status(400).json({ error: "Data 'values' harus berupa array tidak kosong." });
      }
      if (Array.isArray(values) && values.length > 5000) {
        return res.status(413).json({ error: "Ukuran data terlalu besar. Maksimum 5.000 baris per request." });
      }

      // Invalidate server cache for this endpoint on mutations
      if (action === 'append' || action === 'update' || action === 'init') {
        for (const key of serverSheetCache.keys()) {
          if (key.startsWith(targetUrl)) {
            serverSheetCache.delete(key);
          }
        }
      }

      // 5. Execute GET action with server cache & promise coalescing
      if (action === 'get') {
        const cacheKey = `${targetUrl}||${cleanRange}`;
        const cached = serverSheetCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < SERVER_SHEET_CACHE_TTL)) {
          return res.json(cached.data);
        }

        // Deduplicate in-flight requests for the same range & target
        if (serverInFlightSheets.has(cacheKey)) {
          try {
            const coalescedData = await serverInFlightSheets.get(cacheKey)!;
            return res.json(coalescedData);
          } catch (e: any) {
            // If the in-flight failed, proceed to fresh fetch below
          }
        }

        const getUrl = `${targetUrl}?action=get&range=${encodeURIComponent(cleanRange)}&t=${Date.now()}`;
        const fetchPromise = (async () => {
          try {
            const response = await gasLimiter.run(() =>
              fetchGasWithRetry(getUrl, {
                method: 'GET',
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'User-Agent': 'Mozilla/5.0 (compatible; WMS-CommandCenter/1.0)'
                },
                redirect: 'follow',
              }, 1, 28000)
            );

            if (!response.ok) {
              console.info(`[Proxy Handled] Sheets GET returned HTTP ${response.status} for range: ${cleanRange}`);
              const fallback = {
                values: [],
                warning: response.status === 404
                  ? `Range "${cleanRange}" tidak ditemukan di spreadsheet cabang ini.`
                  : `Google Sheets mengembalikan HTTP ${response.status} untuk range "${cleanRange}".`,
                isFallback: true
              };
              // Cache temporary fallback for 15s to prevent retry storms
              serverSheetCache.set(cacheKey, { timestamp: Date.now() - (SERVER_SHEET_CACHE_TTL - 15000), data: fallback });
              return fallback;
            }

            const text = await response.text();
            let parsedData: any;
            try {
              parsedData = JSON.parse(text);
            } catch {
              console.info(`[Proxy Handled] Respon non-JSON dari Google Sheets untuk range: ${cleanRange}`);
              const fallback = { values: [], warning: "Respon non-JSON dari Google Sheets", isFallback: true };
              return fallback;
            }

            if (parsedData?.error && (String(parsedData.error).toLowerCase().includes("range") || String(parsedData.error).toLowerCase().includes("not found"))) {
              parsedData = { values: [], warning: parsedData.error, isFallback: true };
            }

            // Cache parsed data
            serverSheetCache.set(cacheKey, {
              timestamp: Date.now(),
              data: parsedData,
            });

            return parsedData;
          } catch (fetchErr: any) {
            const isTimeout = fetchErr?.name === 'TimeoutError' || fetchErr?.name === 'AbortError' || String(fetchErr?.message || '').toLowerCase().includes('timeout');
            console.info(`[Proxy Handled] Sheets GET fallback activated for ${cleanRange} (${isTimeout ? 'latency' : 'unreachable'}).`);
            const fallback = {
              values: [],
              warning: isTimeout
                ? `Waktu tunggu pembacaan data "${cleanRange}" habis. Menampilkan data kosong sementara.`
                : `Gagal membaca spreadsheet "${cleanRange}" (${fetchErr?.message || 'Jaringan'}).`,
              isFallback: true
            };
            // Cache fallback for 15s to throttle retries
            serverSheetCache.set(cacheKey, { timestamp: Date.now() - (SERVER_SHEET_CACHE_TTL - 15000), data: fallback });
            return fallback;
          }
        })();

        serverInFlightSheets.set(cacheKey, fetchPromise);
        try {
          const result = await fetchPromise;
          return res.json(result);
        } finally {
          serverInFlightSheets.delete(cacheKey);
        }
      }

      // 6. Execute POST actions (append, update, init)
      const response = await gasLimiter.run(() =>
        fetchGasWithRetry(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (compatible; WMS-CommandCenter/1.0)"
          },
          redirect: 'follow',
          body: JSON.stringify({ action, range: cleanRange, values })
        }, 2, 40000)
      );

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        console.warn("Non-JSON response from Apps Script POST:", text.slice(0, 200));
        return res.status(502).json({
          error: "Respon tidak valid dari server Google Sheets. Pastikan deployment memiliki izin 'Anyone'."
        });
      }

      if (!response.ok || data.error) {
        if (action === 'init' && data?.error && String(data.error).toLowerCase().includes('unknown get action')) {
          return res.json({ success: true, note: "Spreadsheet already initialized" });
        }
        return res.status(response.ok ? 400 : response.status).json({
          error: data.error || `Apps Script HTTP ${response.status}`
        });
      }

      return res.json(data);
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('timeout');
      console.warn(`[Proxy Error] in /api/sheets (${action || 'request'}):`, err.message || err);

      if (isTimeout) {
        return res.status(504).json({
          error: "Permintaan ke server Google Sheets melebihi batas waktu (timeout). Server Google Apps Script sedang sibuk atau membutuhkan waktu lebih lama. Silakan coba kembali.",
          isTimeout: true
        });
      }

      return res.status(502).json({
        error: `Gagal menghubungi server Google Sheets (${err?.message || 'Gangguan jaringan'}). Silakan coba kembali.`
      });
    }
  };

  app.post("/api/sheets", handleSheetsProxy);
  app.get("/api/sheets", handleSheetsProxy);

  // Helper to fetch CSV with timeout and retry to handle Google Sheets network socket resets
  async function fetchCsvWithRetry(csvUrl: string, maxRetries = 3): Promise<string> {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(csvUrl, {
          signal: AbortSignal.timeout(35000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "Accept": "text/csv,application/csv,text/plain,*/*",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
          }
        });
        if (response.ok) {
          return await response.text();
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      } catch (err: any) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }
    throw lastErr;
  }

  // Cache MTS data in memory for 10 minutes (600,000 ms)
  let cachedMts: string | null = null;
  let cacheTime = 0;

  // API Route to proxy the MTS CSV
  app.get("/api/stock-summary", async (req, res) => {
    try {
      const now = Date.now();
      const forceRefresh = !!req.query.t;
      if (!forceRefresh && cachedMts && now - cacheTime < 600000) {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        return res.send(cachedMts);
      }

      console.log("Fetching fresh MTS CSV from Google Sheets...");
      const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=263347272&single=true&output=csv&hl=id';
      const data = await fetchCsvWithRetry(csvUrl);
      cachedMts = data;
      cacheTime = now;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(data);
    } catch (err: any) {
      console.warn("Soft error in /api/stock-summary proxy:", err.message || err);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      if (cachedMts) {
        return res.send(cachedMts);
      }
      return res.send("");
    }
  });

  let cachedUnposted: string | null = null;
  let cacheTimeUnposted = 0;

  // API Route to proxy the Unposted Dokumen CSV (sheet Tarikan, gid=1541449669)
  app.get("/api/unposted-docs", async (req, res) => {
    try {
      const now = Date.now();
      const forceRefresh = !!req.query.t;
      if (!forceRefresh && cachedUnposted && now - cacheTimeUnposted < 300000) {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        return res.send(cachedUnposted);
      }

      console.log("Fetching fresh Unposted Dokumen CSV from Google Sheets...");
      const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv&hl=id';
      const data = await fetchCsvWithRetry(csvUrl);
      cachedUnposted = data;
      cacheTimeUnposted = now;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(data);
    } catch (err: any) {
      console.warn("Soft error in /api/unposted-docs proxy:", err.message || err);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      if (cachedUnposted) {
        return res.send(cachedUnposted);
      }
      return res.send("");
    }
  });

  let cachedImDocs: string | null = null;
  let cacheTimeImDocs = 0;

  // API Route to proxy the IM (Inventory Move) CSV from Google Sheets
  app.get("/api/im-docs", async (req, res) => {
    try {
      const now = Date.now();
      const forceRefresh = !!req.query.t;
      if (!forceRefresh && cachedImDocs && now - cacheTimeImDocs < 300000) {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        return res.send(cachedImDocs);
      }

      console.log("Fetching fresh IM CSV from Google Sheets...");
      const imUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=978352399&single=true&output=csv&hl=id';
      const imIpUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=39909118&single=true&output=csv&hl=id';

      const [dataIm, dataImIp] = await Promise.all([
        fetchCsvWithRetry(imUrl).catch(() => ""),
        fetchCsvWithRetry(imIpUrl).catch(() => "")
      ]);

      const combined = (dataIm || "") + "\n" + (dataImIp || "");
      cachedImDocs = combined;
      cacheTimeImDocs = now;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(combined);
    } catch (err: any) {
      console.warn("Soft error in /api/im-docs proxy:", err.message || err);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      if (cachedImDocs) {
        return res.send(cachedImDocs);
      }
      return res.send("");
    }
  });

  // ============================================================================
  // AI ENDPOINTS (Protected with Session Auth, Rate Limit, Input Validation)
  // ============================================================================

  app.post("/api/gemini/predict-cycle-count", requireAuth, async (req, res) => {
    try {
      const clientIp = req.ip || 'session';
      if (!checkRateLimit(`ai_predict_${clientIp}`, 20, 60000)) {
        return res.status(429).json({ error: "Batas permintaan analisis AI tercapai. Silakan coba 1 menit lagi." });
      }

      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Daftar barang inventaris tidak valid." });
      }

      // Limit payload sent to Gemini to max 300 items
      const trimmedItems = items.slice(0, 300);

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Analisis data pergerakan stok inventaris berikut dan prediksikan 5 barang yang paling berisiko tinggi mengalami selisih (discrepancy) untuk cycle counting hari ini. Prioritaskan barang dengan jumlah transaksi tinggi, mutasi besar, dan histori selisih sebelumnya.\n\nData:\n${JSON.stringify(trimmedItems).substring(0, 40000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                kodeProduk: { type: Type.STRING },
                namaProduk: { type: Type.STRING },
                riskScore: { type: Type.NUMBER, description: "Skor risiko 1-100" },
                reason: { type: Type.STRING, description: "Alasan mengapa barang ini berisiko" }
              },
              required: ["kodeProduk", "namaProduk", "riskScore", "reason"]
            }
          }
        }
      });

      res.json({ predictions: JSON.parse(response.text || "[]") });
    } catch (err: any) {
      console.error("Gemini predict-cycle-count error:", err.message || err);
      res.status(503).json({ error: "Layanan prediksi AI sedang tidak dapat diakses." });
    }
  });

  app.post("/api/gemini/detect-anomaly", requireAuth, async (req, res) => {
    try {
      const clientIp = req.ip || 'session';
      if (!checkRateLimit(`ai_anomaly_${clientIp}`, 20, 60000)) {
        return res.status(429).json({ error: "Batas permintaan analisis AI tercapai." });
      }

      const { transaction, history } = req.body;
      if (!transaction) {
        return res.status(400).json({ error: "Data transaksi diperlukan." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Saya memiliki sebuah transaksi inventaris baru dan data historis. Evaluasi apakah transaksi baru ini merupakan anomali (kemungkinan salah ketik atau tidak normal) berdasarkan tren historis.\n\nTransaksi Baru:\n${JSON.stringify(transaction).substring(0, 5000)}\n\nHistoris (Rata-rata/Rentang):\n${JSON.stringify(history).substring(0, 10000)}\n\nJawab dengan status anomali dan alasan singkat.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isAnomaly: { type: Type.BOOLEAN },
              confidence: { type: Type.NUMBER, description: "Tingkat keyakinan 0-100" },
              reason: { type: Type.STRING }
            },
            required: ["isAnomaly", "confidence", "reason"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (err: any) {
      console.error("Gemini detect-anomaly error:", err.message || err);
      res.status(503).json({ error: "Layanan deteksi anomali AI sedang tidak dapat diakses." });
    }
  });

  app.post("/api/gemini/ocr-tally-sheet", requireAuth, async (req, res) => {
    try {
      const clientIp = req.ip || 'session';
      if (!checkRateLimit(`ai_ocr_${clientIp}`, 10, 60000)) {
        return res.status(429).json({ error: "Batas ekstraksi OCR tercapai. Silakan coba sebentar lagi." });
      }

      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: "Gambar tally sheet wajib dilampirkan." });
      }

      // Max base64 size check: ~7MB
      if (imageBase64.length > 7 * 1024 * 1024) {
        return res.status(413).json({ error: "Ukuran gambar terlalu besar. Maksimal 5MB." });
      }

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const resolvedMime = allowedMimes.includes(mimeType) ? mimeType : 'image/jpeg';

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: resolvedMime
              }
            },
            { text: "Ekstrak data dari tally sheet atau surat jalan ini menjadi format tabel terstruktur. Ambil tanggal, nama barang, kode barang, locator/area, kuantitas, dan tipe pergerakan (IN/OUT/TRANSFER). Abaikan coretan yang tidak relevan." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tanggal: { type: Type.STRING },
                namaProduk: { type: Type.STRING },
                kodeProduk: { type: Type.STRING },
                lCode: { type: Type.STRING, description: "Locator/Area" },
                qty: { type: Type.NUMBER },
                tipe: { type: Type.STRING, description: "IN, OUT, atau TRANSFER" }
              },
              required: ["namaProduk", "qty", "tipe"]
            }
          }
        }
      });

      res.json({ extractedData: JSON.parse(response.text || "[]") });
    } catch (err: any) {
      console.error("Gemini ocr-tally-sheet error:", err.message || err);
      res.status(503).json({ error: "Gagal memproses ekstraksi OCR dokumen." });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      optimizeDeps: { force: true },
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
