import Papa from 'papaparse';

export interface InventoryItem {
  kode: string;
  nama: string;
  uom: string;
  awal: number;
  in: number;
  out: number;
  currentStock: number;
}

export async function fetchInventoryData(): Promise<InventoryItem[]> {
  const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgbLymOhUPywO3s0Rq-ThI-X9itRvHbxgerC1DhSsjkpjXDU1uXXV1N_ybnN3eMfBKM4wMDro-VlsH/pub?output=csv';
  
  const res = await fetch(url);
  const text = await res.text();
  
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const data = parsed.data;

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (row[1] === 'Kode' && row[2] === 'NAMA BAHAN') {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Could not find header row in spreadsheet.');
  }

  const superHeader = data[headerRowIdx - 1]; // Contains AWAL, IN, OUT
  const headers = data[headerRowIdx];
  const items: InventoryItem[] = [];

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1] && !row[2]) continue;
    if (row[0] && row[0].includes('Total Result')) break;

    const kode = row[1]?.trim() || '';
    const nama = row[2]?.trim() || '';
    const uom = row[3]?.trim() || '';
    
    let awal = 0;
    let totalIn = 0;
    let totalOut = 0;
    
    // Find "Total Result" column intelligently
    let resultIdx = headers.findIndex(h => h.includes('Total Result'));
    if (resultIdx === -1) {
       resultIdx = superHeader.findIndex(h => h.includes('Total Result'));
    }
    const currentStock = resultIdx !== -1 ? (parseFloat(row[resultIdx]) || 0) : 0;

    let currentCategory = '';
    for (let c = 4; c < row.length; c++) {
      const spHeader = superHeader[c]?.trim();
      
      if (spHeader === '(empty)' || spHeader === 'Total Result') {
        currentCategory = '';
      } else if (spHeader) {
        currentCategory = spHeader;
      }
      
      const val = parseFloat(row[c]) || 0;
      if (currentCategory === 'AWAL') {
        awal += val;
      } else if (currentCategory === 'IN') {
        totalIn += val;
      } else if (currentCategory === 'OUT') {
        totalOut += val;
      }
    }

    items.push({
      kode,
      nama,
      uom,
      awal,
      in: totalIn,
      out: Math.abs(totalOut), // absolute to show count smoothly
      currentStock
    });
  }

  return items;
}
