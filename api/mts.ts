export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // Use hl=id to force Indonesian locale (DD/MM/YYYY) consistently regardless of Vercel/Local server location
  const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=263347272&single=true&output=csv&hl=id';
  
  try {
    const response = await fetch(csvUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Accept": "text/csv,application/csv,text/plain,*/*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    if (!response.ok) {
      return new Response(`Failed to fetch from Google Sheets: ${response.status} ${response.statusText}`, { status: response.status });
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
