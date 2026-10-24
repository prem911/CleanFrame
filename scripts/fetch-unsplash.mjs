// Fetch wallpaper candidates for offline review: node scripts/fetch-unsplash.mjs "query" [count]
// Reads .local/unsplash.json; writes .local/unsplash/<slug>/. Nothing here ships to the TV.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const [query, count = '10'] = process.argv.slice(2);
if (!query) throw new Error('Usage: node scripts/fetch-unsplash.mjs "query" [count]');
const { access_key } = JSON.parse(readFileSync(root + '.local/unsplash.json', 'utf8'));
const headers = { Authorization: 'Client-ID ' + access_key, 'Accept-Version': 'v1' };
const api = async url => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
  return res.json();
};
const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = root + '.local/unsplash/' + slug + '/';
mkdirSync(out, { recursive: true });
const per = Math.min(30, Number(count));
const { results } = await api('https://api.unsplash.com/search/photos?orientation=landscape&content_filter=high&per_page=' + per + '&query=' + encodeURIComponent(query));
// ponytail: the 1920x1080 crop needs full-HD source width and a roughly 16:9 frame
const usable = results.filter(p => p.width >= 1920 && Math.abs(p.width / p.height - 16 / 9) < 0.35);
// Credits are saved per photo so a rate-limited run (50 requests/hour in demo mode) can resume.
const creditsFile = out + 'credits.json';
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];
for (const p of usable) {
  if (credits.some(c => c.id === p.id)) continue;
  await api(p.links.download_location); // Unsplash API guidelines: register the download
  const img = await fetch(p.urls.raw + '&w=3840&fm=jpg&q=92');
  if (!img.ok) throw new Error('Download failed for ' + p.id + ': ' + img.status);
  writeFileSync(out + p.id + '.jpg', Buffer.from(await img.arrayBuffer()));
  credits.push({ id: p.id, credit: p.user.name, source: p.links.html, width: p.width, height: p.height, description: p.alt_description });
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n');
  console.log(p.id, p.width + 'x' + p.height, p.user.name);
}
console.log(usable.length + ' of ' + results.length + ' kept in .local/unsplash/' + slug + '/');
