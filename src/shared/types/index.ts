export interface Product {
  kode: string;
  nama: string;
  satuan: string;
  kategori: string;
  rph?: number;
  minStock?: number; // Optional threshold
}

export interface Locator {
  whGroup: string;
  nama: string;
  deskripsi: string;
  whType: string;
  area: string;
}

export interface Transaction {
  rawIndex?: number;
  tanggal: string; // MM/DD/YYYY
  kodeProduk: string;
  namaBahan: string;
  kuantitas: number;
  uom: string;
  tipe: 'IN' | 'OUT' | 'AWAL' | 'TRANSFER' | 'TF';
  locator: string;
  locatorTo: string;
  noDocument: string;
  keterangan: string;
}

export interface StockSummary {
  kodeProduk: string;
  namaProduk: string;
  whGroup: string;
  namaLocator: string;
  whType: string;
  area: string;
  totalIn: number;
  totalOut: number;
  stock: number;
  qtySistem?: number;
  selisih?: number;
  rph?: number;
  source?: string;
}

export interface SavedReconciliation {
  id: string;
  name: string;
  type: 'daily' | 'monthly';
  date: string;
  timestamp: number;
  area: string;
  grandTotals: any;
  items: any[];
}

export interface WhatsAppLog {
  id: string;
  from: string;
  message: string;
  reply: string;
  timestamp: number;
  status: 'sent' | 'received' | 'error';
}

export interface AuditLog {
  id: string;
  username: string;
  action: string;
  module: string;
  details: string;
  timestamp: number;
}

export interface StockActivityLog {
  id: string;
  timestamp: number;
  dateStr?: string;
  username: string;
  area: string;
  category: string; // e.g., 'Accessories' | 'Raw Material' | 'Manufacturing' | 'Supplies & GA' | 'Pencocokan' | 'Master Data'
  actionType: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'RECONCILIATION' | 'MASTER_UPDATE';
  pCode: string;
  pName: string;
  locator: string;
  locatorTo?: string;
  qty: number;
  uom?: string;
  docNo?: string;
  notes?: string;
  impactSummary?: string;
}
