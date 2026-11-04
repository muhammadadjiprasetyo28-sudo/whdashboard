export const config = {
  runtime: 'edge',
};

interface AppAccount {
  username: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'ADMIN_C3' | 'PETUGAS_C3' | 'HELPER' | 'HQ' | 'MP' | 'PPIC' | 'ADMIN_AREA';
  allowedArea: string;
  label: string;
  readonly?: boolean;
}

const APP_ACCOUNTS: AppAccount[] = [
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

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username dan password wajib diisi.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const inputUser = String(username).trim().toLowerCase();
    const inputPass = String(password);

    const matched = APP_ACCOUNTS.find(
      (acc) => acc.username.toLowerCase() === inputUser && acc.passwordHash === inputPass
    );

    if (!matched) {
      return new Response(JSON.stringify({ error: 'Username atau password salah! Silakan periksa kembali.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Token for edge environment
    const token = `${matched.username}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: {
          username: matched.username,
          role: matched.role,
          allowedArea: matched.allowedArea,
          label: matched.label,
          readonly: !!matched.readonly,
        },
        expiresAt,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Terjadi kesalahan pada sistem otentikasi.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
