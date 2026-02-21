#!/usr/bin/env node
// ================================================================
// WheelPlayed BACKFILL — 3 Problem Games (Gimme 5, Cash 5 OK, Montana Cash)
// Run once to fill historical data, then daily scraper handles updates
// Server-side — no CORS issues
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'WheelPlayed-Scraper/1.0 (lottery data aggregator)' },
        signal: AbortSignal.timeout(30000)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

// Same parser as daily scraper
function parseLotteryNet(html, picks, hasBonus) {
  const draws = [];
  const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};

  // Strategy 1: <tr> rows
  const rows = html.split(/<tr[\s>]/i);
  for (const row of rows) {
    const hrefMatch = row.match(/(?:numbers|results)\/(\d{2})-(\d{2})-(\d{4})/);
    const textMatch = row.match(/(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
    let dateStr = null;
    if (hrefMatch) {
      dateStr = `${hrefMatch[3]}-${hrefMatch[1]}-${hrefMatch[2]}`;
    } else if (textMatch) {
      const mnum = months[textMatch[1].toLowerCase()];
      if (mnum) dateStr = `${textMatch[3]}-${String(mnum).padStart(2,'0')}-${String(parseInt(textMatch[2])).padStart(2,'0')}`;
    }
    if (!dateStr) continue;

    const liNums = [];
    let m;
    const liRegex = /<li[^>]*>\s*(\d{1,2})\s*<\/li>/gi;
    while ((m = liRegex.exec(row)) !== null) liNums.push(parseInt(m[1]));
    if (liNums.length < picks) {
      const spanRegex = /<span[^>]*(?:class="[^"]*(?:ball|number|result)[^"]*")[^>]*>\s*(\d{1,2})\s*<\/span>/gi;
      while ((m = spanRegex.exec(row)) !== null) liNums.push(parseInt(m[1]));
    }
    if (liNums.length < picks) {
      const tdRegex = /<td[^>]*>\s*(\d{1,2})\s*<\/td>/gi;
      while ((m = tdRegex.exec(row)) !== null) {
        const n = parseInt(m[1]);
        if (n >= 1 && n <= 70) liNums.push(n);
      }
    }
    if (liNums.length < picks) continue;
    const main = liNums.slice(0, picks).sort((a,b)=>a-b);
    const bonus = hasBonus && liNums.length > picks ? liNums[picks] : null;
    if (new Set(main).size !== picks) continue;
    if (main.some(n => n < 1 || n > 99)) continue;
    draws.push({ date: dateStr, numbers: main, bonus });
  }

  if (draws.length > 0) return draws;

  // Strategy 2: Section-based
  const dateRegex = /(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi;
  const datePositions = [];
  let dm;
  while ((dm = dateRegex.exec(html)) !== null) {
    const mnum = months[dm[1].toLowerCase()];
    if (mnum) {
      datePositions.push({
        pos: dm.index,
        date: `${dm[3]}-${String(mnum).padStart(2,'0')}-${String(parseInt(dm[2])).padStart(2,'0')}`
      });
    }
  }
  const hrefDateRegex = /(?:numbers|results)\/(\d{2})-(\d{2})-(\d{4})/g;
  while ((dm = hrefDateRegex.exec(html)) !== null) {
    datePositions.push({ pos: dm.index, date: `${dm[3]}-${dm[1]}-${dm[2]}` });
  }
  datePositions.sort((a,b) => a.pos - b.pos);
  const dedupDates = [];
  for (const dp of datePositions) {
    if (dedupDates.length === 0 || dp.date !== dedupDates[dedupDates.length-1].date || Math.abs(dp.pos - dedupDates[dedupDates.length-1].pos) > 50) {
      dedupDates.push(dp);
    }
  }
  for (let i = 0; i < dedupDates.length; i++) {
    const start = dedupDates[i].pos;
    const end = i + 1 < dedupDates.length ? dedupDates[i+1].pos : start + 2000;
    const chunk = html.substring(start, Math.min(end, start + 2000));
    const liNums = [];
    const liRegex2 = /<li[^>]*>\s*(\d{1,2})\s*<\/li>/gi;
    let lm;
    while ((lm = liRegex2.exec(chunk)) !== null) {
      const n = parseInt(lm[1]);
      if (n >= 1 && n <= 70) liNums.push(n);
    }
    if (liNums.length < picks) {
      const spanRegex2 = /<span[^>]*>\s*(\d{1,2})\s*<\/span>/gi;
      while ((lm = spanRegex2.exec(chunk)) !== null) {
        const n = parseInt(lm[1]);
        if (n >= 1 && n <= 70) liNums.push(n);
      }
    }
    if (liNums.length >= picks) {
      const main = liNums.slice(0, picks).sort((a,b)=>a-b);
      const bonus = hasBonus && liNums.length > picks ? liNums[picks] : null;
      if (new Set(main).size === picks && main.every(n => n >= 1 && n <= 70)) {
        draws.push({ date: dedupDates[i].date, numbers: main, bonus });
      }
    }
  }
  return draws;
}

async function upsertDraws(draws, gameId) {
  if (!draws.length) return 0;
  let upserted = 0;
  for (let i = 0; i < draws.length; i += 500) {
    const batch = draws.slice(i, i + 500).map(d => ({
      game_id: gameId,
      draw_date: d.date,
      numbers: d.numbers,
      bonus: d.bonus
    }));
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/draws`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(batch)
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`  Supabase error: ${resp.status} — ${body}`);
    } else {
      upserted += batch.length;
    }
  }
  return upserted;
}

// ================================================================
// BACKFILL GAMES
// ================================================================
const BACKFILL_GAMES = [
  { id: 'tristate', name: 'Gimme 5', state: 'new-hampshire/gimme-5', slug: 'numbers', picks: 5, max: 39, startYear: 2012 },
  { id: 'ok', name: 'Cash 5 Oklahoma', state: 'oklahoma/cash-5', slug: 'numbers', picks: 5, max: 36, startYear: 2010 },
  { id: 'mt', name: 'Montana Cash', state: 'montana/cash', slug: 'numbers', picks: 5, max: 45, startYear: 2014 },
];

async function backfillGame(game) {
  console.log(`\n🔄 Backfilling ${game.name} (${game.id})...`);
  const currentYear = new Date().getFullYear();
  let allDraws = [];
  let consecutiveEmpty = 0;

  for (let year = currentYear; year >= game.startYear; year--) {
    const url = `https://www.lottery.net/${game.state}/${game.slug}/${year}`;
    try {
      const html = await fetchText(url);
      if (!html || html.length < 500) {
        console.log(`  ${year}: empty response`);
        consecutiveEmpty++;
        if (consecutiveEmpty >= 5) { console.log('  5 consecutive empty, stopping.'); break; }
        continue;
      }

      const draws = parseLotteryNet(html, game.picks, false);
      const valid = draws.filter(d => d.numbers.every(n => n >= 1 && n <= game.max));

      if (valid.length > 0) {
        allDraws = allDraws.concat(valid);
        consecutiveEmpty = 0;
        console.log(`  ${year}: ${valid.length} draws (total: ${allDraws.length})`);
      } else {
        // Debug: show HTML structure
        const liCount = (html.match(/<li/gi)||[]).length;
        const trCount = (html.match(/<tr/gi)||[]).length;
        const dateCount = (html.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+\d/gi)||[]).length;
        const hrefDateCount = (html.match(/(?:numbers|results)\/\d{2}-\d{2}-\d{4}/gi)||[]).length;
        console.log(`  ${year}: 0 draws (${Math.round(html.length/1024)}KB, ${trCount} tr, ${liCount} li, ${dateCount} text dates, ${hrefDateCount} href dates)`);

        // If first year with 0, dump a sample
        if (allDraws.length === 0 && year === currentYear) {
          console.log(`  --- HTML Sample (first 1000 chars) ---`);
          console.log(html.substring(0, 1000));
          console.log(`  --- End Sample ---`);
        }

        consecutiveEmpty++;
        if (consecutiveEmpty >= 8) { console.log('  8 consecutive empty, stopping.'); break; }
      }

      await sleep(800); // Be polite

    } catch (e) {
      console.log(`  ${year}: ERROR — ${e.message}`);
      consecutiveEmpty++;
      if (consecutiveEmpty >= 5) { console.log('  5 consecutive failures, stopping.'); break; }
    }
  }

  // Dedup
  allDraws.sort((a, b) => b.date.localeCompare(a.date));
  const seen = new Set();
  const unique = allDraws.filter(d => {
    const key = d.date + '_' + d.numbers.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length > 0) {
    console.log(`\n  📊 ${game.id}: ${unique.length} unique draws (${unique[unique.length-1]?.date} → ${unique[0]?.date})`);
    const upserted = await upsertDraws(unique, game.id);
    console.log(`  ✅ ${upserted} rows upserted to Supabase`);
  } else {
    console.log(`\n  ❌ ${game.id}: NO draws parsed — lottery.net may not have parseable data for this game`);
  }

  return unique.length;
}

async function main() {
  console.log('🎯 WheelPlayed BACKFILL — 3 Problem Games');
  console.log(`📅 ${new Date().toISOString()}\n`);

  let totalDraws = 0;
  for (const game of BACKFILL_GAMES) {
    const count = await backfillGame(game);
    totalDraws += count;
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Backfill complete — ${totalDraws} total draws across ${BACKFILL_GAMES.length} games`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
