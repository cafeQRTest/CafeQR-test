// utils/istTime.js
const IST_OFFSET = '+05:30';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function istYmdFromDate(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(d);
  const y = p.find(x=>x.type==='year').value;
  const m = p.find(x=>x.type==='month').value;
  const dd = p.find(x=>x.type==='day').value;
  return `${y}-${m}-${dd}`;
}

// Given 'YYYY-MM-DD' (intended as IST), return half-open UTC range [start, end)
export function istDayRangeUtcISO(ymd) {
  const startUtc = new Date(`${ymd}T00:00:00${IST_OFFSET}`).toISOString();
  const endUtc = new Date(new Date(`${ymd}T00:00:00${IST_OFFSET}`).getTime() + ONE_DAY_MS).toISOString();
  return { startUtc, endUtc };
}

// Given two IST days (YYYY-MM-DD), return [start, endNextDay) in UTC
export function istSpanUtcISO(fromYmd, toYmd) {
  const { startUtc } = istDayRangeUtcISO(fromYmd);
  const { endUtc } = istDayRangeUtcISO(toYmd);
  return { startUtc, endUtc };
}

// From two Date objects (any tz), build the IST-day-bounded UTC span
export function istSpanFromDatesUtcISO(startDate, endDate) {
  const fromYmd = istYmdFromDate(startDate);
  const toYmd   = istYmdFromDate(endDate);
  return istSpanUtcISO(fromYmd, toYmd);
}
