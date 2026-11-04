import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import type { AuditLog, WhatsAppLog, StockActivityLog } from '../types';

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Get Firestore reference with Database ID and force long polling
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

const LOCAL_STOCK_LOGS_KEY = 'mms_stock_activity_logs_v1';

// Stock Activity Logging helper
export async function logStockActivity(activity: Omit<StockActivityLog, 'id' | 'timestamp'> & { timestamp?: number }): Promise<StockActivityLog> {
  const timestamp = activity.timestamp || Date.now();
  const dateStr = activity.dateStr || new Date(timestamp).toISOString();
  const logEntry: StockActivityLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp,
    dateStr,
    username: activity.username || 'Petugas',
    area: activity.area || 'All Cabang',
    category: activity.category || 'Accessories',
    actionType: activity.actionType || 'IN',
    pCode: activity.pCode || '',
    pName: activity.pName || '',
    locator: activity.locator || '-',
    locatorTo: activity.locatorTo,
    qty: activity.qty ?? 0,
    uom: activity.uom || 'PCS',
    docNo: activity.docNo || '',
    notes: activity.notes || '',
    impactSummary: activity.impactSummary || ''
  };

  // 1. Immediately cache in localStorage for instant responsiveness
  try {
    const raw = localStorage.getItem(LOCAL_STOCK_LOGS_KEY);
    const list: StockActivityLog[] = raw ? JSON.parse(raw) : [];
    list.unshift(logEntry);
    if (list.length > 500) list.length = 500;
    localStorage.setItem(LOCAL_STOCK_LOGS_KEY, JSON.stringify(list));
  } catch (localErr) {
    console.warn('Gagal menyimpan log aktivitas ke localStorage:', localErr);
  }

  // 2. Persist to Firestore
  try {
    const coll = collection(db, 'stock_activity_logs');
    await addDoc(coll, logEntry);
  } catch (fireErr) {
    console.warn('Gagal menyimpan log aktivitas ke Firebase:', fireErr);
  }

  return logEntry;
}

// Fetch Stock Activity Logs with area filter & merge
export async function getStockActivityLogs(area?: string, maxCount = 100): Promise<StockActivityLog[]> {
  const logsMap = new Map<string, StockActivityLog>();

  // 1. Load local logs first
  try {
    const raw = localStorage.getItem(LOCAL_STOCK_LOGS_KEY);
    if (raw) {
      const localList: StockActivityLog[] = JSON.parse(raw);
      localList.forEach(l => {
        if (l && l.id) logsMap.set(l.id, l);
      });
    }
  } catch (e) {
    console.warn('Error reading local activity logs:', e);
  }

  // 2. Fetch from Firestore
  try {
    const coll = collection(db, 'stock_activity_logs');
    const q = query(coll, orderBy('timestamp', 'desc'), limit(maxCount));
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const data = docSnap.data() as StockActivityLog;
      const id = docSnap.id;
      logsMap.set(id, { ...data, id: data.id || id });
    });
  } catch (err) {
    console.warn('Gagal mengambil stock activity logs dari Firestore (fallback to local):', err);
  }

  let result = Array.from(logsMap.values());
  
  // Sort newest first
  result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Filter by area if specified and not ALL
  if (area && area !== 'ALL' && area !== 'All Cabang' && area !== 'HQ') {
    result = result.filter(l => (l.area || '').toUpperCase() === area.toUpperCase());
  }

  return result.slice(0, maxCount);
}

// Audit Logging helper
export async function logAudit(username: string, module: string, action: string, details: string) {
  try {
    const auditColl = collection(db, 'audit_logs');
    await addDoc(auditColl, {
      username,
      module,
      action,
      details,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn('Gagal mencatatkan audit log ke Firebase:', err);
  }
}

// WhatsApp Log helper
export async function logWhatsAppActivity(from: string, message: string, reply: string, status: 'sent' | 'received' | 'error') {
  try {
    const waColl = collection(db, 'whatsapp_logs');
    await addDoc(waColl, {
      from,
      message,
      reply,
      status,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn('Gagal mencatatkan WhatsApp activity ke Firebase:', err);
  }
}

// Fetch WhatsApp history logs
export async function getWhatsAppHistory(maxCount = 50): Promise<WhatsAppLog[]> {
  try {
    const waColl = collection(db, 'whatsapp_logs');
    const q = query(waColl, orderBy('timestamp', 'desc'), limit(maxCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  } catch (err) {
    console.error('Gagal mengambil riwayat WhatsApp:', err);
    return [];
  }
}

// Fetch Audit history logs
export async function getAuditHistory(maxCount = 50): Promise<AuditLog[]> {
  try {
    const auditColl = collection(db, 'audit_logs');
    const q = query(auditColl, orderBy('timestamp', 'desc'), limit(maxCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  } catch (err) {
    console.error('Gagal mengambil riwayat audit:', err);
    return [];
  }
}

export default db;
