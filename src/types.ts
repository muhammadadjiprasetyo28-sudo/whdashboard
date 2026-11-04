export interface Product {
  kode: string;
  nama: string;
  satuan: string;
  kategori: string;
  rph?: number;
}

export interface Locator {
  whGroup: string;
  nama: string;
  deskripsi: string;
  whType: string;
  area: string;
}

export interface Transaction {
  tanggal: string; // Mm/Dd/Yy
  kodeProduk: string;
  namaBahan: string;
  kuantitas: number;
  uom: string;
  tipe: 'IN' | 'OUT' | 'AWAL';
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
  uom?: string;
}

export interface StockActivityLog {
  id: string;
  timestamp: number;
  dateStr?: string;
  username: string;
  area: string;
  category: string;
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
