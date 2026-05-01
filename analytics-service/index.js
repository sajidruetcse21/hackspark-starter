import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import {
  parse,
  isValid,
  isAfter,
  differenceInMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  eachMonthOfInterval,
  differenceInDays,
  subYears,
  subDays,
  addDays
} from 'date-fns';

dotenv.config({ path: '../.env' });

const app = express();
app.use(express.json());

const centralApi = axios.create({
  baseURL: process.env.CENTRAL_API_URL || 'https://technocracy.brittoo.xyz',
  headers: { Authorization: `Bearer ${process.env.CENTRAL_API_TOKEN}` }
});

// P11: The Seven-Day Rush
app.get('/analytics/peak-window', async (req, res) => {
  const { from, to } = req.query;

  // --- 1. Strict Validation ---
  const yyyyMmRegex = /^\d{4}-\d{2}$/;
  if (!from || !to || !yyyyMmRegex.test(from) || !yyyyMmRegex.test(to)) {
    return res.status(400).json({ error: "from and to must be valid YYYY-MM strings" });
  }

  const fromDate = parse(from, 'yyyy-MM', new Date());
  const toDate = parse(to, 'yyyy-MM', new Date());

  if (isAfter(fromDate, toDate)) {
    return res.status(400).json({ error: "from cannot be after to" });
  }

  // Max range is 12 months (0 to 11 months difference)
  if (differenceInMonths(toDate, fromDate) > 11) {
    return res.status(400).json({ error: "Maximum range is 12 months" });
  }

  const startDay = startOfMonth(fromDate);
  const endDay = endOfMonth(toDate);

  if (differenceInDays(endDay, startDay) + 1 < 7) {
    return res.status(400).json({ error: "Not enough data for a 7-day window" });
  }

  try {
    // --- 2. Build the Complete Timeline (Handling Missing Dates) ---
    // Create an array with EVERY calendar day set to 0 rentals
    const daysArray = eachDayOfInterval({ start: startDay, end: endDay }).map(d => ({
      date: format(d, 'yyyy-MM-dd'),
      count: 0
    }));

    // Create a fast lookup map: date string -> array index
    const dayIndexMap = new Map();
    daysArray.forEach((dayObj, index) => dayIndexMap.set(dayObj.date, index));

    // --- 3. Fetch Data & Populate Timeline ---
    // The API requires fetching month by month
    const monthsToFetch = eachMonthOfInterval({ start: startDay, end: endDay });

    for (const month of monthsToFetch) {
      const monthStr = format(month, 'yyyy-MM');
      const centralRes = await centralApi.get('/api/data/rentals/stats', {
        params: { group_by: 'date', month: monthStr }
      });

      // Inject the counts into our complete timeline
      const records = centralRes.data.data || [];
      for (const record of records) {
        const idx = dayIndexMap.get(record.date);
        if (idx !== undefined) {
          daysArray[idx].count = record.count;
        }
      }
    }

    // --- 4. The O(n) Sliding Window Algorithm ---
    let currentWindowSum = 0;

    // Initialize the first window (Days 0 to 6)
    for (let i = 0; i < 7; i++) {
      currentWindowSum += daysArray[i].count;
    }

    let maxSum = currentWindowSum;
    let maxStartIndex = 0;

    // Slide the window forward one day at a time
    for (let i = 7; i < daysArray.length; i++) {
      // Add the new day coming into the window, subtract the day falling out
      currentWindowSum = currentWindowSum + daysArray[i].count - daysArray[i - 7].count;

      if (currentWindowSum > maxSum) {
        maxSum = currentWindowSum;
        maxStartIndex = i - 6; // The start of the current 7-day window
      }
    }

    // --- 5. Return Result ---
    res.json({
      from,
      to,
      peakWindow: {
        from: daysArray[maxStartIndex].date,
        to: daysArray[maxStartIndex + 6].date,
        totalRentals: maxSum
      }
    });

  } catch (error) {
    console.error("Central API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal server error fetching stats" });
  }
});

// P13: Chasing the Surge
app.get('/analytics/surge-days', async (req, res) => {
  const { month } = req.query;

  // --- 1. Strict Validation ---
  const yyyyMmRegex = /^\d{4}-\d{2}$/;
  if (!month || !yyyyMmRegex.test(month)) {
    return res.status(400).json({ error: "month must be a valid YYYY-MM string" });
  }

  // Ensure it's an actually valid calendar month
  const monthDate = parse(month, 'yyyy-MM', new Date());
  if (!isValid(monthDate)) {
    return res.status(400).json({ error: "Invalid calendar month" });
  }

  try {
    // --- 2. Build the Full Calendar Month (Zero-Filled) ---
    const startDay = startOfMonth(monthDate);
    const endDay = endOfMonth(monthDate);

    const daysArray = eachDayOfInterval({ start: startDay, end: endDay }).map(d => ({
      date: format(d, 'yyyy-MM-dd'),
      count: 0, // Fill missing dates with 0 as requested
      nextSurgeDate: null,
      daysUntil: null
    }));

    const dayIndexMap = new Map();
    daysArray.forEach((dayObj, index) => dayIndexMap.set(dayObj.date, index));

    // --- 3. Fetch Data & Populate ---
    const centralRes = await centralApi.get('/api/data/rentals/stats', {
      params: { group_by: 'date', month }
    });

    const records = centralRes.data.data || [];
    for (const record of records) {
      const idx = dayIndexMap.get(record.date);
      if (idx !== undefined) {
        daysArray[idx].count = record.count;
      }
    }

    // --- 4. The Algorithm: Monotonic Decreasing Stack O(n) ---
    const stack = []; // Stores the INDICES of days waiting for a surge

    for (let i = 0; i < daysArray.length; i++) {
      const currentCount = daysArray[i].count;

      // While stack has items AND current day's count is strictly greater than the top of the stack
      while (stack.length > 0 && currentCount > daysArray[stack[stack.length - 1]].count) {
        const poppedIndex = stack.pop(); // We found the surge for this day!

        daysArray[poppedIndex].nextSurgeDate = daysArray[i].date;
        daysArray[poppedIndex].daysUntil = i - poppedIndex;
      }

      // Push current day onto the stack to wait for its own future surge
      stack.push(i);
    }

    // (Any indices left in the stack automatically keep their initialized 'null' values)

    // --- 5. Return Results ---
    res.json({
      month,
      data: daysArray
    });

  } catch (error) {
    console.error("Central API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal server error processing surge days" });
  }
});

// p14
// Helper function to paginate Central API rentals for a specific date window
async function fetchRentalsInWindow(from, to) {
  let allRentals = [];
  let page = 1;
  while (true) {
    const res = await centralApi.get('/api/data/rentals', {
      params: { from, to, limit: 100, page }
    });
    const data = res.data.data;
    allRentals = allRentals.concat(data);
    if (data.length < 100) break;
    page++;
  }
  return allRentals;
}

// P14: What's In Season?
app.get('/analytics/recommendations', async (req, res) => {
  const { date, limit: limitStr } = req.query;

  // --- 1. Strict Validation ---
  const yyyyMmDdRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!date || !yyyyMmDdRegex.test(date)) {
    return res.status(400).json({ error: "date must be a valid YYYY-MM-DD string" });
  }

  const targetDate = parse(date, 'yyyy-MM-dd', new Date());
  if (!isValid(targetDate)) {
    return res.status(400).json({ error: "Invalid calendar date" });
  }

  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit <= 0 || limit > 50) {
    return res.status(400).json({ error: "limit must be a positive integer, max 50" });
  }

  try {
    // --- 2. Calculate the 15-day seasonal windows (Safe Date Math) ---
    const year1Date = subYears(targetDate, 1);
    const year2Date = subYears(targetDate, 2);

    // Window 1: Last Year (+/- 7 days = 15 day window)
    const w1From = format(subDays(year1Date, 7), 'yyyy-MM-dd');
    const w1To = format(addDays(year1Date, 7), 'yyyy-MM-dd');

    // Window 2: Two Years Ago (+/- 7 days = 15 day window)
    const w2From = format(subDays(year2Date, 7), 'yyyy-MM-dd');
    const w2To = format(addDays(year2Date, 7), 'yyyy-MM-dd');

    // --- 3. Parallel Network Optimization (+10 Bonus Points) ---
    // Fetch both years concurrently. The Central API's 'from' and 'to' filters 
    // mean we only download the exact records we care about.
    const [rentalsY1, rentalsY2] = await Promise.all([
      fetchRentalsInWindow(w1From, w1To),
      fetchRentalsInWindow(w2From, w2To)
    ]);

    const allRentals = rentalsY1.concat(rentalsY2);

    // Edge Case: No rentals in this window historically
    if (allRentals.length === 0) {
      return res.json({ date, recommendations: [] });
    }

    // --- 4. Tally Frequencies ---
    const counts = new Map();
    for (const r of allRentals) {
      counts.set(r.productId, (counts.get(r.productId) || 0) + 1);
    }

    // --- 5. Sort & Slice to Top K ---
    const sortedProducts = Array.from(counts.entries())
      .map(([productId, score]) => ({ productId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // --- 6. Batch Enrichment ---
    // Because the max limit is 50, and the batch API accepts max 50,
    // we NEVER need to chunk this array. One network call handles it perfectly.
    const topProductIds = sortedProducts.map(p => p.productId);
    const batchRes = await centralApi.get('/api/data/products/batch', {
      params: { ids: topProductIds.join(',') }
    });

    // Create a fast lookup map for the enriched data
    const productsData = batchRes.data.data || [];
    const productMap = new Map();
    for (const p of productsData) {
      productMap.set(p.id, p);
    }

    // --- 7. Format Final Response ---
    const recommendations = sortedProducts.map(p => {
      const details = productMap.get(p.productId) || {};
      return {
        productId: p.productId,
        name: details.name || "Unknown Product",
        category: details.category || "UNKNOWN",
        score: p.score
      };
    });

    res.json({ date, recommendations });

  } catch (error) {
    console.error("Central API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal server error fetching recommendations" });
  }
});

app.get('/status', (req, res) => res.json({ service: 'analytics-service', status: 'OK' }));

const PORT = process.env.ANALYTICS_SERVICE_PORT || 8003;
app.listen(PORT, () => console.log(`Analytics service running on ${PORT}`));