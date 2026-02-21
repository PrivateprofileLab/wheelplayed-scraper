#!/usr/bin/env node
// ================================================================
// WheelPlayed Daily Scraper — Server-Side (GitHub Actions)
// Fetches latest draws for all 52 games, upserts to Supabase
// No CORS issues — runs on Node.js directly
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service role key for writes

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

// ================================================================
// GAME DEFINITIONS
// ================================================================
const GAMES = [
  // === GOV API (data.ny.gov — JSON) ===
  {id:'powerball',name:'Powerball',src:'gov',url:'https://data.ny.gov/resource/d6yy-54nr.json?$limit=50&$order=draw_date%20DESC',picks:5,max:69,bonus:true,bonusMax:26},
  {id:'mega',name:'Mega Millions',src:'gov',url:'https://data.ny.gov/resource/5xaw-6ayf.json?$limit=50&$order=draw_date%20DESC',picks:5,max:70,bonus:true,bonusMax:24},
  {id:'ny6',name:'Lotto New York',src:'gov',url:'https://data.ny.gov/resource/6nbc-h7bj.json?$limit=50&$order=draw_date%20DESC',picks:6,max:59,bonus:true,bonusMax:59},

  // === GOV CSV API (Take 5 NY — draws twice daily) ===
  {id:'ny',name:'Take 5 New York',src:'govcsv',url:'https://data.ny.gov/api/views/dg63-4siq/rows.csv?accessType=DOWNLOAD',picks:5,max:39},

  // === LOTTERY.NET — Multi-state ===
  {id:'lottoamerica',name:'Lotto America',src:'ln',state:'lotto-america',slug:'numbers',picks:5,max:52,bonus:true,bonusMax:10},

  // === LOTTERY.NET — Pick 5 state games ===
  {id:'az',name:'The Pick Arizona',src:'ln',state:'arizona/the-pick',slug:'numbers',picks:6,max:44},
  {id:'ar',name:'Natural State Jackpot',src:'ln',state:'arkansas/natural-state-jackpot',slug:'numbers',picks:5,max:39},
  {id:'ca',name:'Fantasy 5 California',src:'ln',state:'california/fantasy-5',slug:'numbers',picks:5,max:39},
  {id:'co',name:'Cash 5 Colorado',src:'ln',state:'colorado/cash-5',slug:'numbers',picks:5,max:32},
  {id:'ct',name:'Cash5 Connecticut',src:'ln',state:'connecticut/cash-5',slug:'numbers',picks:5,max:35},
  {id:'fl',name:'Fantasy 5 Florida',src:'ln',state:'florida/fantasy-5',slug:'numbers',picks:5,max:36},
  {id:'ga',name:'Fantasy 5 Georgia',src:'ln',state:'georgia/fantasy-5',slug:'numbers',picks:5,max:42},
  {id:'id5',name:'Idaho Cash',src:'ln',state:'idaho/cash',slug:'numbers',picks:5,max:45},
  {id:'il',name:'Lucky Day Lotto',src:'ln',state:'illinois/lucky-day-lotto-evening',slug:'numbers',picks:5,max:45},
  {id:'in5',name:'Cash 5 Indiana',src:'ln',state:'indiana/cash-5',slug:'numbers',picks:5,max:45},
  {id:'la',name:'Easy 5 Louisiana',src:'ln',state:'louisiana/easy-5',slug:'numbers',picks:5,max:37},
  {id:'md',name:'Bonus Match 5 Maryland',src:'ln',state:'maryland/bonus-match-5',slug:'numbers',picks:5,max:39,bonus:true,bonusMax:39},
  {id:'ma',name:'Mass Cash',src:'ln',state:'massachusetts/mass-cash',slug:'numbers',picks:5,max:35},
  {id:'mi',name:'Fantasy 5 Michigan',src:'ln',state:'michigan/fantasy-5',slug:'numbers',picks:5,max:39},
  {id:'mn_g5',name:'Gopher 5 Minnesota',src:'ln',state:'minnesota/gopher-5',slug:'numbers',picks:5,max:47},
  {id:'mn_n5',name:'Northstar Cash',src:'ln',state:'minnesota/north-5',slug:'numbers',picks:5,max:31},
  {id:'ms',name:'Match 5 Mississippi',src:'ln',state:'mississippi/match-5',slug:'numbers',picks:5,max:35},
  {id:'mo',name:'Show Me Cash',src:'ln',state:'missouri/show-me-cash',slug:'numbers',picks:5,max:39},
  {id:'mt',name:'Montana Cash',src:'ln',state:'montana/cash',slug:'numbers',picks:5,max:45},
  {id:'ne',name:'Pick 5 Nebraska',src:'ln',state:'nebraska/pick-5',slug:'numbers',picks:5,max:40},
  {id:'tristate',name:'Gimme 5',src:'ln',state:'new-hampshire/gimme-5',slug:'numbers',picks:5,max:39},
  {id:'ok',name:'Cash 5 Oklahoma',src:'ln',state:'oklahoma/cash-5',slug:'numbers',picks:5,max:36},
  {id:'nj5',name:'Cash Five NJ',src:'ln',state:'new-jersey/cash-5',slug:'numbers',picks:5,max:45},
  {id:'nm',name:'Roadrunner Cash',src:'ln',state:'new-mexico/roadrunner-cash',slug:'numbers',picks:5,max:37,altSlug:'results'},
  {id:'nc',name:'Cash 5 North Carolina',src:'ln',state:'north-carolina/cash-5',slug:'numbers',picks:5,max:43},
  {id:'oh5',name:'Rolling Cash 5 Ohio',src:'ln',state:'ohio/rolling-cash-5',slug:'numbers',picks:5,max:39},
  {id:'pa',name:'Cash 5 Pennsylvania',src:'ln',state:'pennsylvania/cash-5',slug:'numbers',picks:5,max:43},
  {id:'ri',name:'Wild Money RI',src:'ln',state:'rhode-island/wild-money',slug:'numbers',picks:5,max:38},
  {id:'sc',name:'Palmetto Cash 5',src:'ln',state:'south-carolina/palmetto-cash-5',slug:'numbers',picks:5,max:42},
  {id:'sd',name:'Dakota Cash',src:'ln',state:'south-dakota/cash',slug:'numbers',picks:5,max:35},
  {id:'tn',name:'Tennessee Cash',src:'ln',state:'tennessee/cash',slug:'numbers',picks:5,max:38},
  {id:'tx5',name:'Cash Five Texas',src:'ln',state:'texas/cash-five',slug:'numbers',picks:5,max:35},
  {id:'va',name:'Cash 5 Virginia',src:'ln',state:'virginia/cash-5',slug:'numbers',picks:5,max:45},
  {id:'wa',name:'Hit 5 Washington',src:'ln',state:'washington/hit-5',slug:'numbers',picks:5,max:42},
  {id:'wi5',name:'Badger 5 Wisconsin',src:'ln',state:'wisconsin/badger-5',slug:'numbers',picks:5,max:31},
  {id:'wy',name:'Cowboy Draw Wyoming',src:'ln',state:'wyoming/cowboy-draw',slug:'numbers',picks:5,max:45},

  // === LOTTERY.NET — Pick 6 / Lotto games ===
  {id:'ca6',name:'SuperLotto Plus CA',src:'ln',state:'california/superlotto-plus',slug:'numbers',picks:5,max:47,bonus:true,bonusMax:27},
  {id:'ct6',name:'Lotto Connecticut',src:'ln',state:'connecticut/lotto',slug:'numbers',picks:6,max:44},
  {id:'fl6',name:'Lotto Florida',src:'ln',state:'florida/lotto',slug:'numbers',picks:6,max:53},
  {id:'nj6',name:'Pick-6 NJ',src:'ln',state:'new-jersey/pick-6',slug:'numbers',picks:6,max:49},
  {id:'oh6',name:'Classic Lotto Ohio',src:'ln',state:'ohio/classic-lotto',slug:'numbers',picks:6,max:49},
  {id:'or6',name:'Megabucks Oregon',src:'ln',state:'oregon/megabucks',slug:'numbers',picks:6,max:48},
  {id:'pa6',name:'Match 6 Pennsylvania',src:'ln',state:'pennsylvania/match-6-lotto',slug:'numbers',picks:6,max:49},
  {id:'tx6',name:'Lotto Texas',src:'ln',state:'texas/lotto',slug:'numbers',picks:6,max:54},
  {id:'wa6',name:'Lotto Washington',src:'ln',state:'washington/lotto',slug:'numbers',picks:6,max:49},
  {id:'wi6',name:'Megabucks Wisconsin',src:'ln',state:'wisconsin/megabucks',slug:'numbers',picks:6,max:49},
  {id:'wi6s',name:'SuperCash Wisconsin',src:'ln',state:'wisconsin/super-cash',slug:'numbers',picks:6,max:39},
];

// ================================================================
// HELPERS
// ================================================================
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

async function fetchJSON(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

// ================================================================
// PARSERS
// ================================================================

// Parse lottery.net HTML — server-side, no CORS proxy needed
function parseLotteryNet(html, picks, hasBonus) {
  const draws = [];
  const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};

  // CRITICAL: Normalize HTML before parsing
  // lottery.net uses <br> between day name and month: "Thursday <br>February 19, 2026"
  // Also normalize &nbsp; entities and non-breaking spaces
  html = html.replace(/<br\s*\/?>/gi, ' ').replace(/&nbsp;/gi, ' ').replace(/&#160;/g, ' ').replace(/\xA0/g, ' ');

  // Strategy 1: Split by <tr> rows and find date + numbers
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

    // Extract numbers from <li> tags
    const liNums = [];
    const liRegex = /<li[^>]*>\s*(\d{1,2})\s*<\/li>/gi;
    let m;
    while ((m = liRegex.exec(row)) !== null) liNums.push(parseInt(m[1]));

    // Fallback: span with ball/number class
    if (liNums.length < picks) {
      const spanRegex = /<span[^>]*(?:class="[^"]*(?:ball|number|result)[^"]*")[^>]*>\s*(\d{1,2})\s*<\/span>/gi;
      while ((m = spanRegex.exec(row)) !== null) liNums.push(parseInt(m[1]));
    }

    // Fallback: <td> cells with just numbers
    if (liNums.length < picks) {
      const tdRegex = /<td[^>]*>\s*(\d{1,2})\s*<\/td>/gi;
      while ((m = tdRegex.exec(row)) !== null) {
        const n = parseInt(m[1]);
        if (n >= 1 && n <= 70) liNums.push(n);
      }
    }

    if (liNums.length < picks) continue;

    const main = liNums.slice(0, picks).sort((a, b) => a - b);
    const bonus = hasBonus && liNums.length > picks ? liNums[picks] : null;
    if (new Set(main).size !== picks) continue;
    if (main.some(n => n < 1 || n > 99)) continue;

    draws.push({ date: dateStr, numbers: main, bonus });
  }

  if (draws.length > 0) return draws;

  // Strategy 2: Section-based — find date headers anywhere, grab nearby <li> numbers
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

  // Also try href-based dates
  const hrefDateRegex = /(?:numbers|results)\/(\d{2})-(\d{2})-(\d{4})/g;
  while ((dm = hrefDateRegex.exec(html)) !== null) {
    datePositions.push({ pos: dm.index, date: `${dm[3]}-${dm[1]}-${dm[2]}` });
  }

  datePositions.sort((a, b) => a.pos - b.pos);

  // Dedup nearby dates
  const dedupDates = [];
  for (const dp of datePositions) {
    if (dedupDates.length === 0 || dp.date !== dedupDates[dedupDates.length - 1].date || Math.abs(dp.pos - dedupDates[dedupDates.length - 1].pos) > 50) {
      dedupDates.push(dp);
    }
  }

  for (let i = 0; i < dedupDates.length; i++) {
    const start = dedupDates[i].pos;
    const end = i + 1 < dedupDates.length ? dedupDates[i + 1].pos : start + 2000;
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
      const main = liNums.slice(0, picks).sort((a, b) => a - b);
      const bonus = hasBonus && liNums.length > picks ? liNums[picks] : null;
      if (new Set(main).size === picks && main.every(n => n >= 1 && n <= 70)) {
        draws.push({ date: dedupDates[i].date, numbers: main, bonus });
      }
    }
  }

  return draws;
}

// Parse NY Gov JSON API
function parseGovJSON(raw, picks, hasBonus, max) {
  const draws = [];
  for (const row of raw) {
    try {
      const dateStr = row.draw_date.split('T')[0];
      const parts = row.winning_numbers.trim().split(/\s+/).map(Number);
      const main = parts.slice(0, picks).sort((a, b) => a - b);
      const bonus = hasBonus ? (parts[picks] || null) : null;
      if (main.length !== picks) continue;
      if (main.some(n => n < 1 || n > max)) continue;
      if (new Set(main).size !== picks) continue;
      draws.push({ date: dateStr, numbers: main, bonus });
    } catch (e) { continue; }
  }
  return draws;
}

// Parse Take 5 NY CSV (columns: Draw Date, Evening Winning Numbers, Evening Bonus #, Midday Winning Numbers, Midday Bonus #)
function parseTake5CSV(csv) {
  const draws = [];
  const lines = csv.split('\n');
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV format: "Draw Date","Evening Winning Numbers","Evening Bonus #","Midday Winning Numbers","Midday Bonus #"
    // Dates are MM/DD/YYYY
    const parts = line.split(',');
    if (parts.length < 2) continue;

    const dateRaw = parts[0].replace(/"/g, '').trim();
    const dateMatch = dateRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dateMatch) continue;
    const dateStr = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;

    // Evening numbers (column 1)
    const eveningRaw = parts[1]?.replace(/"/g, '').trim();
    if (eveningRaw) {
      const nums = eveningRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 39);
      if (nums.length === 5) {
        const sorted = [...nums].sort((a, b) => a - b);
        if (new Set(sorted).size === 5) {
          draws.push({ date: dateStr, numbers: sorted, bonus: null });
        }
      }
    }

    // Midday numbers (column 3) — Take 5 draws twice daily
    const middayRaw = parts[3]?.replace(/"/g, '').trim();
    if (middayRaw) {
      const nums = middayRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 39);
      if (nums.length === 5) {
        const sorted = [...nums].sort((a, b) => a - b);
        if (new Set(sorted).size === 5) {
          draws.push({ date: dateStr, numbers: sorted, bonus: null });
        }
      }
    }
  }
  return draws;
}

// ================================================================
// FETCH FUNCTIONS
// ================================================================

// Fetch from NY Gov JSON API (Powerball, Mega, NY Lotto)
async function fetchGov(game) {
  const raw = await fetchJSON(game.url);
  const draws = parseGovJSON(raw, game.picks, game.bonus, game.max);
  // Dedup by date
  const seen = new Set();
  return draws.filter(d => {
    if (seen.has(d.date)) return false;
    seen.add(d.date);
    return true;
  });
}

// Fetch Take 5 NY from CSV (only recent — last 50 draws)
async function fetchGovCSV(game) {
  // For daily updates, just fetch the full CSV and take last 50 unique dates
  const csv = await fetchText(game.url);
  const draws = parseTake5CSV(csv);
  // Dedup by date+numbers combo
  const seen = new Set();
  const unique = draws.filter(d => {
    const key = d.date + '_' + d.numbers.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Return latest 100 (covers recent draws)
  return unique.slice(0, 100);
}

// Fetch from lottery.net — current year only (daily update just needs recent draws)
async function fetchLotteryNet(game) {
  const year = new Date().getFullYear();
  let slug = game.slug;

  let url = `https://www.lottery.net/${game.state}/${slug}/${year}`;
  let html;
  try {
    html = await fetchText(url);
  } catch (e) {
    // Try alt slug
    if (game.altSlug) {
      url = `https://www.lottery.net/${game.state}/${game.altSlug}/${year}`;
      html = await fetchText(url);
    } else {
      throw e;
    }
  }

  if (!html || html.length < 500) return [];

  const draws = parseLotteryNet(html, game.picks, game.bonus);
  const valid = draws.filter(d => d.numbers.every(n => n >= 1 && n <= game.max));

  // Dedup
  const seen = new Set();
  return valid.filter(d => {
    const key = d.date + '_' + d.numbers.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ================================================================
// SUPABASE UPSERT
// ================================================================
async function upsertDraws(draws, gameId) {
  if (!draws.length) return 0;

  // Batch upsert in chunks of 500
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
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (resp.ok || resp.status === 201) {
      upserted += batch.length;
    } else if (resp.status === 409) {
      // Conflict — insert one by one, skipping duplicates
      for (const row of batch) {
        const r2 = await fetch(`${SUPABASE_URL}/rest/v1/draws`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(row)
        });
        if (r2.ok || r2.status === 201) upserted++;
      }
    } else {
      const body = await resp.text();
      console.error(`  Supabase error for ${gameId}: ${resp.status} — ${body}`);
    }
  }
  return upserted;
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  const mode = process.argv[2] || 'daily'; // 'daily' or 'backfill'
  console.log(`\n🎯 WheelPlayed Scraper — ${mode} mode`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`📊 ${GAMES.length} games configured\n`);

  const results = { success: 0, failed: 0, newDraws: 0, errors: [] };
  const startTime = Date.now();

  for (const game of GAMES) {
    try {
      let draws;

      if (game.src === 'gov') {
        draws = await fetchGov(game);
      } else if (game.src === 'govcsv') {
        draws = await fetchGovCSV(game);
      } else if (game.src === 'ln') {
        draws = await fetchLotteryNet(game);
      }

      if (!draws || draws.length === 0) {
        console.log(`⚠️  ${game.id.padEnd(12)} ${game.name.padEnd(28)} — 0 draws fetched`);
        results.failed++;
        results.errors.push(`${game.id}: 0 draws`);
        continue;
      }

      const upserted = await upsertDraws(draws, game.id);
      console.log(`✅ ${game.id.padEnd(12)} ${game.name.padEnd(28)} — ${draws.length} fetched, ${upserted} upserted (${draws[draws.length-1]?.date} → ${draws[0]?.date})`);
      results.success++;
      results.newDraws += upserted;

      // Be nice to lottery.net — small delay between games
      if (game.src === 'ln') await sleep(500);

    } catch (e) {
      console.error(`❌ ${game.id.padEnd(12)} ${game.name.padEnd(28)} — ERROR: ${e.message}`);
      results.failed++;
      results.errors.push(`${game.id}: ${e.message}`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ ${results.success} games updated | ❌ ${results.failed} failed | ${results.newDraws} rows upserted`);
  console.log(`⏱️  ${elapsed}s elapsed`);

  if (results.errors.length > 0) {
    console.log(`\n⚠️  Errors:`);
    results.errors.forEach(e => console.log(`   ${e}`));
  }

  // === JACKPOT SCRAPING ===
  console.log('\n💰 Updating jackpot amounts...');
  await updateJackpots();

  console.log('');

  // Exit with error if more than 25% of games failed
  if (results.failed > GAMES.length * 0.25) {
    console.error('🚨 Too many failures — exiting with error code');
    process.exit(1);
  }
}

// Scrape current jackpot amounts from lotteryusa.com and upsert to Supabase
async function updateJackpots() {
  const jackpots = [];

  // Powerball jackpot from lotteryusa.com
  try {
    const html = await fetchText('https://www.lotteryusa.com/powerball/');
    // Target "Next est. jackpot" section specifically
    const jpMatch = html.match(/Next\s+est\.?\s+jackpot[\s\S]{0,200}?\$\s*([\d,.]+)\s*(Million|Billion)/i);
    if (jpMatch) {
      const num = parseFloat(jpMatch[1].replace(/,/g, ''));
      const unit = jpMatch[2].toLowerCase();
      const display = unit === 'billion' ? `$${num}B` : `$${Math.round(num)}M`;
      // Find next draw day — PB draws Mon/Wed/Sat
      const nextDraw = computeNextPBDraw();
      jackpots.push({ game: 'powerball', amount: display, next_draw: nextDraw });
      console.log(`  PB: ${display} (next: ${nextDraw})`);
    } else {
      console.log('  PB: could not parse jackpot from lotteryusa.com');
    }
  } catch(e) { console.warn('  PB jackpot fetch failed:', e.message); }

  await sleep(500);

  // Mega Millions jackpot from lotteryusa.com
  try {
    const html = await fetchText('https://www.lotteryusa.com/mega-millions/');
    const jpMatch = html.match(/Next\s+est\.?\s+jackpot[\s\S]{0,200}?\$\s*([\d,.]+)\s*(Million|Billion)/i);
    if (jpMatch) {
      const num = parseFloat(jpMatch[1].replace(/,/g, ''));
      const unit = jpMatch[2].toLowerCase();
      const display = unit === 'billion' ? `$${num}B` : `$${Math.round(num)}M`;
      const nextDraw = computeNextMMDraw();
      jackpots.push({ game: 'megamillions', amount: display, next_draw: nextDraw });
      console.log(`  MM: ${display} (next: ${nextDraw})`);
    } else {
      console.log('  MM: could not parse jackpot from lotteryusa.com');
    }
  } catch(e) { console.warn('  MM jackpot fetch failed:', e.message); }

  // Upsert to Supabase jackpots table
  for (const jp of jackpots) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/jackpots`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          game: jp.game,
          amount: jp.amount,
          next_draw: jp.next_draw,
          updated_at: new Date().toISOString()
        })
      });
      if (!resp.ok && resp.status !== 201) {
        const body = await resp.text();
        console.warn(`  Jackpot upsert failed for ${jp.game}: ${resp.status} — ${body}`);
      }
    } catch(e) {
      console.warn(`  Jackpot upsert error for ${jp.game}:`, e.message);
    }
  }
}

// Compute next Powerball draw date (Mon/Wed/Sat)
function computeNextPBDraw() {
  const now = new Date();
  const drawDays = [1, 3, 6]; // Mon, Wed, Sat
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    if (drawDays.includes(d.getDay()) && (i > 0 || d.getHours() < 23)) {
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

// Compute next Mega Millions draw date (Tue/Fri)
function computeNextMMDraw() {
  const now = new Date();
  const drawDays = [2, 5]; // Tue, Fri
