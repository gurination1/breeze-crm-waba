/**
 * jobs_engine.js
 * Real-time Live Jobs Aggregator & Channel Broadcaster
 * Scrapes & aggregates real working government & private jobs from verified portals:
 * - SarkariResult.com.cm (Latest Jobs, Admit Cards, Results)
 * - PunjabJobAlert.com (PSSSB, Punjab Govt, GADVASU, University, Teaching/Non-Teaching)
 * - FreeJobAlert.com (All India Govt, Railway, Banking, Defense, Central)
 */

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

const FEEDS = [
  { name: 'SarkariResult Latest', url: 'https://sarkariresult.com.cm/feed/', weight: 1 },
  { name: 'SarkariResult Jobs', url: 'https://sarkariresult.com.cm/category/latest-job/feed/', weight: 2 },
  { name: 'Punjab Job Alert', url: 'https://punjabjobalert.com/feed/', weight: 3 },
  { name: 'FreeJobAlert', url: 'https://freejobalert.com/feed/', weight: 4 }
];

let cachedJobs = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(raw) {
  if (!raw) return '';
  let t = decodeHtmlEntities(raw);
  // Remove trailing decorative dashes e.g. "– Out", "– Start"
  t = t.replace(/\s*–\s*(Out|Start|Apply Online|Online Form)?$/i, '');
  return t.trim();
}

function classifyJob(title = '', categories = []) {
  const text = (title + ' ' + (Array.isArray(categories) ? categories.join(' ') : String(categories))).toLowerCase();
  const tags = [];

  if (/psssb|punjab\s*subordinate/i.test(text)) tags.push('psssb', 'punjab');
  if (/dsssb|delhi\s*subordinate/i.test(text)) tags.push('dsssb', 'delhi');
  if (/railway|rrb|rrc|alp|ntpc/i.test(text)) tags.push('railway');
  if (/bank|ibps|sbi|rbi|nabard|nicl/i.test(text)) tags.push('banking');
  if (/teach|lecturer|professor|prt|tgt|pgt|school\s*teacher|bpsc.*teacher|upessc/i.test(text)) tags.push('teaching');
  if (/non[-\s]*teaching|clerk|peon|sewadar|chowkidar|safai|mali|attendant|typist/i.test(text)) tags.push('non_teaching');
  if (/university|college|gadvasu|pau|pu|gndu/i.test(text)) tags.push('university');
  if (/ssc|cgl|chsl|mts|constable|cpo/i.test(text)) tags.push('ssc');
  if (/upsc|ias|ips|cds|nda/i.test(text)) tags.push('upsc');
  if (/police|constable|sub[-\s]*inspector|si\s*bharti/i.test(text)) tags.push('police');
  if (/army|navy|air\s*force|defense|defence|agniveer/i.test(text)) tags.push('defense');
  if (/result|score\s*card|merit\s*list/i.test(text)) tags.push('result');
  if (/admit\s*card|hall\s*ticket|city\s*details/i.test(text)) tags.push('admit_card');
  if (/answer\s*key/i.test(text)) tags.push('answer_key');
  if (/online\s*form|recruitment|apply\s*online|vacancy|bharti/i.test(text)) tags.push('latest_job');

  return tags;
}

/**
 * Fetch and aggregate freshest real jobs from live feeds
 */
async function fetchLatestJobs(force = false) {
  const now = Date.now();
  if (!force && cachedJobs.length > 0 && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedJobs;
  }

  const allItems = [];
  const seenUrls = new Set();
  const seenTitles = new Set();

  await Promise.allSettled(
    FEEDS.map(async (f) => {
      try {
        const res = await axios.get(f.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 8000
        });

        if (!res.data) return;
        const parsed = parser.parse(res.data);
        const rawItems = parsed.rss?.channel?.item || [];
        const items = Array.isArray(rawItems) ? rawItems : [rawItems];

        for (const item of items) {
          if (!item || !item.title || !item.link) continue;
          const link = String(item.link).trim();
          const title = cleanTitle(item.title);
          const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');

          if (seenUrls.has(link) || seenTitles.has(normalizedTitle)) continue;
          seenUrls.add(link);
          seenTitles.add(normalizedTitle);

          let categories = [];
          if (item.category) {
            categories = Array.isArray(item.category) ? item.category : [item.category];
          }

          const tags = classifyJob(title, categories);

          allItems.push({
            title,
            link,
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            source: f.name,
            categories,
            tags
          });
        }
      } catch (err) {
        console.warn(`[JobsEngine] Warning: Feed "${f.name}" fetch error:`, err.message);
      }
    })
  );

  // Sort by pubDate descending
  allItems.sort((a, b) => b.pubDate - a.pubDate);

  if (allItems.length > 0) {
    cachedJobs = allItems;
    lastFetchTime = now;
    console.log(`✅ [JobsEngine] Refreshed ${cachedJobs.length} real job notifications.`);
  }

  return cachedJobs;
}

/**
 * Format a single job item to match Bal Krishan Sir's exact WhatsApp channel layout
 */
function formatJobPost(item) {
  const title = item.title;
  const link = item.link;
  const lower = title.toLowerCase();

  let actionText = '*Click Below Link To Apply* 👇';
  let statusEmoji = 'New Form Active';

  if (lower.includes('result') || item.tags.includes('result')) {
    actionText = '*Click Below Link To Download Result* 👇';
    statusEmoji = 'हुआ जारी';
  } else if (lower.includes('admit card') || lower.includes('city details') || item.tags.includes('admit_card')) {
    actionText = '*Click Below Link To Download Admit Card* 👇';
    statusEmoji = 'हुआ जारी';
  } else if (lower.includes('answer key') || item.tags.includes('answer_key')) {
    actionText = '*Click Below Link To Check Answer Key* 👇';
    statusEmoji = 'हुआ जारी';
  } else if (lower.includes('revised') || lower.includes('update')) {
    actionText = '*Click Below Link To View Update* 👇';
    statusEmoji = 'हुआ जारी';
  }

  // Tags line
  const tagsSet = new Set(['#AllIndiaGovtJobs', '#SarkariResult']);
  if (item.tags.includes('ssc')) tagsSet.add('#SSC');
  if (item.tags.includes('railway')) { tagsSet.add('#Railway'); tagsSet.add('#RRB'); }
  if (item.tags.includes('psssb')) { tagsSet.add('#PSSSB'); tagsSet.add('#PunjabJobs'); }
  if (item.tags.includes('dsssb')) { tagsSet.add('#DSSSB'); tagsSet.add('#DelhiJobs'); }
  if (item.tags.includes('teaching')) tagsSet.add('#TeachingJobs');
  if (item.tags.includes('non_teaching')) tagsSet.add('#NonTeachingJobs');
  if (item.tags.includes('university')) tagsSet.add('#UniversityJobs');
  if (item.tags.includes('banking')) { tagsSet.add('#BankingJobs'); tagsSet.add('#IBPS'); }
  if (item.tags.includes('police')) tagsSet.add('#PoliceBharti');

  const hashtags = Array.from(tagsSet).slice(0, 4).join(' ');

  return `*${title} - ${statusEmoji}* 🔥🔥
${hashtags}

*(Official All India Govt Jobs & Private Jobs Channel)* 👈

${actionText}

${link}

*Join Us On Official Jobs Channel* 👇
https://www.instagram.com/sarkariresult.com.cm_?igsh=MXF4a3Jtb3lmNmI1cw==`;
}

/**
 * Filter jobs according to user query (or return latest general batch)
 */
async function searchJobs(queryText = '', limit = 3) {
  const jobs = await fetchLatestJobs();
  const q = (queryText || '').toLowerCase().trim();

  if (!q || /^(jobs?\s*channel|latest|all|jobs|job|updates?|new|sabse\s*naye)$/i.test(q)) {
    return jobs.slice(0, limit);
  }

  // Check specific category matches
  let filtered = [];

  if (/psssb|punjab/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('psssb') || j.tags.includes('punjab') || /punjab|psssb/i.test(j.title));
  } else if (/dsssb|delhi/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('dsssb') || j.tags.includes('delhi') || /dsssb|delhi/i.test(j.title));
  } else if (/railway|rrb|rrc|alp|ntpc/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('railway') || /railway|rrb|rrc|alp|ntpc/i.test(j.title));
  } else if (/bank|ibps|sbi|rbi/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('banking') || /bank|ibps|sbi|rbi/i.test(j.title));
  } else if (/non[-\s]*teaching|clerk|peon|safai|attendant/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('non_teaching') || /non[-\s]*teaching/i.test(j.title));
  } else if (/teach|teacher|lecturer|professor/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('teaching') || /teach|teacher|lecturer/i.test(j.title));
  } else if (/university|college/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('university') || /university|college/i.test(j.title));
  } else if (/ssc|cgl|chsl|constable/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('ssc') || /ssc/i.test(j.title));
  } else if (/result/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('result') || /result/i.test(j.title));
  } else if (/admit\s*card/i.test(q)) {
    filtered = jobs.filter(j => j.tags.includes('admit_card') || /admit/i.test(j.title));
  }

  // If specific filter yielded results, return them
  if (filtered.length > 0) {
    return filtered.slice(0, limit);
  }

  // Fallback to fuzzy text search across title and categories
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const keywordMatches = jobs.filter(j => {
    const full = (j.title + ' ' + (j.tags || []).join(' ')).toLowerCase();
    return words.some(w => full.includes(w));
  });

  if (keywordMatches.length > 0) {
    return keywordMatches.slice(0, limit);
  }

  // If nothing matched, return the freshest 2 jobs
  return jobs.slice(0, limit);
}

// ==========================================
// CHANNEL SUBSCRIBER & BROADCASTER ENGINE
// ==========================================
const fs = require('fs');
const path = require('path');
const SUBSCRIBERS_FILE = path.join(__dirname, 'data', 'jobs_subscribers.json');

function loadSubscribersData() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('[JobsEngine] Error reading subscribers file:', e.message);
  }
  return { subscribers: {}, lastBroadcastLinks: [] };
}

function saveSubscribersData(data) {
  try {
    const dataDir = path.dirname(SUBSCRIBERS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[JobsEngine] Error saving subscribers file:', e.message);
  }
}

function addSubscriber(phone, phoneNumberId = '1351625371363106', tenantId = 'edufun') {
  const cleanPhone = String(phone).replace(/\D/g, '');
  const data = loadSubscribersData();
  data.subscribers[cleanPhone] = {
    phone: cleanPhone,
    phoneNumberId,
    tenantId,
    subscribedAt: new Date().toISOString()
  };
  saveSubscribersData(data);
  console.log(`📢 [JobsEngine] Added subscriber ${cleanPhone} to Jobs Channel.`);
}

function removeSubscriber(phone) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  const data = loadSubscribersData();
  if (data.subscribers[cleanPhone]) {
    delete data.subscribers[cleanPhone];
    saveSubscribersData(data);
    console.log(`🛑 [JobsEngine] Removed subscriber ${cleanPhone} from Jobs Channel.`);
  }
}

function isSubscriber(phone) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  const data = loadSubscribersData();
  return !!data.subscribers[cleanPhone];
}

function getSubscribers() {
  const data = loadSubscribersData();
  return Object.values(data.subscribers);
}

let broadcasterInterval = null;

function startJobsBroadcaster(whatsappApi) {
  if (broadcasterInterval) return;
  console.log('📡 [JobsEngine] Auto Jobs Channel Broadcaster initialized (15m interval).');

  broadcasterInterval = setInterval(async () => {
    try {
      const subs = getSubscribers();
      if (subs.length === 0) return;

      const jobs = await fetchLatestJobs(true);
      if (!jobs || jobs.length === 0) return;

      const data = loadSubscribersData();
      const broadcastedSet = new Set(data.lastBroadcastLinks || []);

      // Find top fresh job not yet broadcast
      const freshJob = jobs.find(j => !broadcastedSet.has(j.link));
      if (!freshJob) return;

      const postText = formatJobPost(freshJob);
      console.log(`🚀 [JobsBroadcaster] Auto-broadcasting new job alert: "${freshJob.title}" to ${subs.length} subscribers...`);

      for (const sub of subs) {
        try {
          await whatsappApi.sendTextMessage(sub.phoneNumberId, sub.phone, postText);
          await new Promise(r => setTimeout(r, 400));
        } catch (sendErr) {
          console.warn(`[JobsBroadcaster] Failed to send to ${sub.phone}:`, sendErr.message);
        }
      }

      broadcastedSet.add(freshJob.link);
      data.lastBroadcastLinks = Array.from(broadcastedSet).slice(-200); // keep last 200 links
      saveSubscribersData(data);
    } catch (bErr) {
      console.error('[JobsBroadcaster] Error during periodic broadcast:', bErr.message);
    }
  }, 15 * 60 * 1000); // 15 minutes
}

module.exports = {
  fetchLatestJobs,
  formatJobPost,
  searchJobs,
  classifyJob,
  addSubscriber,
  removeSubscriber,
  isSubscriber,
  getSubscribers,
  startJobsBroadcaster
};
