const axios = require('axios');
const cheerio = require('cheerio');

// The home-page tracker also shows the Thai last-mile carrier (e.g. Flash);
// /public/queryresult.html stops at "ถึงโกดังไทย".
const CNS_URL = 'https://cnscargo.com/home/index';
const NOT_FOUND_TEXT = 'ไม่พบรายการที่ค้นหา';

const FOUND_TTL_MS = 15 * 60 * 1000;
const NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const MAX_NUMBERS_PER_SEARCH = 10;
const TRACKING_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,40}$/;

// CNS spells some statuses wrong; show the correct spelling to customers.
const STATUS_FIXES = {
  'ผ่านพิธิศุลกากรไทยเรียบร้อย': 'ผ่านพิธีศุลกากรไทยเรียบร้อย',
};

// Split "A, B  C" into unique numbers, in the order the customer typed them.
function splitTrackingNumbers(input) {
  const parts = String(input || '').split(/[\s,，]+/).filter(Boolean);
  return [...new Set(parts)];
}

function isValidTrackingNumber(number) {
  return TRACKING_NUMBER_PATTERN.test(number);
}

const clean = text => text.replace(/\s+/g, ' ').trim();

// "22/10/2026 19:09" -> "2026/10/22 19:09", so plain string order is time order.
const sortKey = date => date.replace(/^(\d{2})\/(\d{2})\/(\d{4})/, '$3/$2/$1');

// The tracker is the .TrackTrace widget. Each step is a div holding
// <i class="cur_circle|circle">, then a date div, then a status div.
// A red note above the steps says either "not found" or which Thai carrier took over.
// Returns null when CNS says the number does not exist.
function parseCnsPage(html) {
  const $ = cheerio.load(html);
  const tracker = $('.TrackTrace').first();
  const markers = tracker.find('i.cur_circle, i.circle');
  const note = clean(tracker.find('div[style*="color: red"]').first().text());
  if (note.includes(NOT_FOUND_TEXT) && markers.length === 0) return null;

  const steps = [];
  markers.each((_, marker) => {
    const cells = $(marker).siblings('div');
    const date = clean(cells.eq(0).text());
    const rawStatus = clean(cells.eq(1).text());
    if (!rawStatus) return;
    steps.push({
      date,
      description: STATUS_FIXES[rawStatus] || rawStatus,
      done: $(marker).hasClass('cur_circle'),
    });
  });
  // Newest first. Array sort is stable, so steps with the same time keep page order.
  steps.sort((a, b) => sortKey(b.date).localeCompare(sortKey(a.date)));
  return { note, steps };
}

const cache = new Map();

function readCache(number) {
  const hit = cache.get(number);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(number);
    return undefined;
  }
  return hit.value;
}

// Returns { note, steps } (steps newest first), or null when CNS has no such number.
// Network errors are thrown and never cached.
async function fetchCnsTracking(number) {
  const cached = readCache(number);
  if (cached !== undefined) return cached;

  const response = await axios.get(CNS_URL, {
    params: { waybillNo: number },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KotRhamruayTracking/1.0)' },
    timeout: 10000,
  });
  const result = parseCnsPage(response.data);
  const ttl = result && result.steps.length ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
  cache.set(number, { value: result, expiresAt: Date.now() + ttl });
  return result;
}

module.exports = {
  MAX_NUMBERS_PER_SEARCH,
  splitTrackingNumbers,
  isValidTrackingNumber,
  parseCnsPage,
  fetchCnsTracking,
};
