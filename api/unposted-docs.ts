export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5e6Qk2aV16v8WlC2a9_0Q2K7dK-aM8e5lFkE2L0d0kY7W4pM3zL4v9b2X1kQ5e6/pub?gid=0&single=true&output=csv&hl=id';

  try {
    const response = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/csv,application/csv,text/plain,*/*',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      return new Response(`Failed to fetch: ${response.status}`, { status: response.status });
    }

    const text = await response.text();
    return new Response(text, {
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 's-maxage=60, stale-while-revalidate',
      },
    });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
