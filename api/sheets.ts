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

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    let payload: any = {};
    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}));
    } else {
      const url = new URL(req.url);
      payload = {
        area: url.searchParams.get('area'),
        gasUrl: url.searchParams.get('gasUrl'),
        action: url.searchParams.get('action') || 'get',
        range: url.searchParams.get('range'),
      };
    }

    const { area, gasUrl, action = 'get', range, values } = payload;

    let targetUrl = '';
    if (area && AREA_GAS_ENDPOINTS[area]) {
      targetUrl = AREA_GAS_ENDPOINTS[area];
    } else if (gasUrl) {
      const trimmedGasUrl = String(gasUrl).trim();
      const isAllowlisted = Object.values(AREA_GAS_ENDPOINTS).some(
        (url) => url.trim() === trimmedGasUrl || url.split('?')[0].replace(/\/+$/, '') === trimmedGasUrl.split('?')[0].replace(/\/+$/, '')
      );
      if (isAllowlisted) {
        targetUrl = trimmedGasUrl;
      } else if (AREA_GAS_ENDPOINTS[trimmedGasUrl]) {
        targetUrl = AREA_GAS_ENDPOINTS[trimmedGasUrl];
      }
    }

    if (!targetUrl || !targetUrl.startsWith('https://script.google.com/')) {
      return new Response(JSON.stringify({ error: 'Akses ditolak: Endpoint Google Sheets tidak diizinkan.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanRange = String(range || '').trim();

    if (action === 'get') {
      const fetchUrl = `${targetUrl}?action=get&range=${encodeURIComponent(cleanRange)}&t=${Date.now()}`;
      try {
        const response = await fetch(fetchUrl, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (compatible; WMS-CommandCenter/1.0)',
          },
        });

        if (!response.ok) {
          return new Response(
            JSON.stringify({
              values: [],
              warning: `Sheets response HTTP ${response.status}`,
              isFallback: true,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=30, stale-while-revalidate' },
        });
      } catch (e: any) {
        return new Response(
          JSON.stringify({
            values: [],
            warning: `Gagal membaca sheet (${e.message || 'Network error'})`,
            isFallback: true,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Mutation actions: append, update, init
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify({ action, range: cleanRange, values }),
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: 'Respon tidak valid dari Google Sheets' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      status: response.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Error in /api/sheets edge function:', err);
    return new Response(JSON.stringify({ error: 'Gagal menghubungi server Google Sheets.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
