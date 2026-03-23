const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WORKER_URL = process.env.ALERTS_WORKER_URL;
const ALERTS_SECRET = process.env.ALERTS_SECRET;

const SOURCES = [
  { name: 'DLUHC', url: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-levelling-up-housing-and-communities', type: 'Planning Policy', region: 'UK' },
  { name: 'ONS Housing', url: 'https://www.ons.gov.uk/rss/householdspricesandhousing.xml', type: 'Housing Data', region: 'UK' },
  { name: 'FRED Housing', url: 'https://fred.stlouisfed.org/graph/fredgraph.rss?id=HOUST', type: 'Housing Data', region: 'US' },
  { name: 'NBER', url: 'https://www.nber.org/rss/new_working_papers.rss', type: 'Academic', region: 'Global' },
];

const KEYWORDS = ['housing','planning','zoning','land','property','rent','mortgage','development','affordability','urban','construction','residential'];

async function main() {
  const items = [];
  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, { headers: { 'User-Agent': 'I3SkylineEconomics/1.0' }, signal: AbortSignal.timeout(10000) });
      const xml = await res.text();
      const itemRegex = /<(item|entry)[\s>]([\s\S]*?)<\/(item|entry)>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[2];
        const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s) || [])[1] || '';
        const description = (block.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s) || [])[1] || '';
        const link = (block.match(/<link[^>]*>(.*?)<\/link>/s) || [])[1] || '';
        const pubDate = (block.match(/<pubDate[^>]*>(.*?)<\/pubDate>/s) || [])[1] || '';
        if (pubDate && Date.now() - new Date(pubDate).getTime() > 7 * 24 * 60 * 60 * 1000) continue;
        const clean = (s) => s.replace(/<[^>]+>/g, '').trim();
        if (title && KEYWORDS.some(k => (title + description).toLowerCase().includes(k))) {
          items.push({ title: clean(title), description: clean(description).substring(0, 400), url: clean(link), source: source.name, type: source.type, region: source.region });
        }
      }
    } catch(e) { console.error(source.name, e.message); }
  }
  if (!items.length) { console.log('No items'); return; }
  const prompt = `You are the editor of I3 Skyline Economics Weekly. Review these items and identify up to 5 that are genuinely significant for land economists and property professionals. Return ONLY a JSON array, no markdown:\n[{"type":"...","source":"...","headline":"...","summary":"2-3 sentences on significance","url":"..."}]\nIf nothing significant, return []\n\nItems:\n${items.slice(0,8).map((i,n)=>`[${n+1}] ${i.source} (${i.region}): ${i.title}\n${i.description}`).join('\n\n')}`;
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }) });
  const aiData = await aiRes.json();
  const text = aiData.content?.[0]?.text || '[]';
  let alerts;
  try { alerts = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch(e) { console.error('Parse error', text); return; }
  if (!alerts.length) { console.log('Nothing significant'); return; }
  const sendRes = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-alerts-secret': ALERTS_SECRET }, body: JSON.stringify({ alerts }) });
  const result = await sendRes.json();
  console.log('Sent:', result);
}

main().catch(e => { console.error(e); process.exit(1); });
