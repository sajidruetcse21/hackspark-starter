import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { isBefore, isAfter, max, min, differenceInDays, format, addDays, subDays } from 'date-fns';

// Configure dotenv to look one directory up (useful for local development)
dotenv.config({ path: '../.env' });

const app = express();
const port = process.env.RENTAL_SERVICE_PORT || 8002;

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_TOKEN = process.env.CENTRAL_API_TOKEN;

const centralApi = axios.create({
  baseURL: CENTRAL_API_URL,
  headers: {
    'Authorization': `Bearer ${CENTRAL_API_TOKEN}`
  }
});

// Cache for valid categories (P5 Requirement)
let cachedCategories = null;

async function getValidCategories() {
  if (cachedCategories) return cachedCategories;
  try {
    const response = await centralApi.get('/api/data/categories');
    cachedCategories = response.data.categories;
    return cachedCategories;
  } catch (error) {
    console.error('Failed to fetch categories:', error.message);
    return []; 
  }
}

// Helper function to translate Central API errors
function handleCentralApiError(error, res) {
  if (error.response) {
    // The Central API responded with an error (404, 429, 5xx)
    const status = error.response.status;
    const message = error.response.data?.error || 'An error occurred while fetching data from the Central API';
    res.status(status).json({ 
      error: message, 
      details: error.response.data 
    });
  } else if (error.request) {
    // The request was made but no response was received (e.g. network timeout)
    res.status(503).json({ error: 'Central API is currently unreachable' });
  } else {
    // Something happened during request setup
    res.status(500).json({ error: 'Internal server error processing the request' });
  }
}

// P3/P5: Proxy GET /rentals/products (with category validation)
app.get('/rentals/products', async (req, res) => {
  try {
    // P5 Validation: Validate category against cached list
    if (req.query.category) {
      const validCategories = await getValidCategories();
      if (validCategories.length > 0 && !validCategories.includes(req.query.category)) {
        return res.status(400).json({
          error: `Invalid category: '${req.query.category}'`,
          validOptions: validCategories
        });
      }
    }

    const response = await centralApi.get('/api/data/products', {
      params: req.query // Forwards query parameters (?category=, ?page=, etc.) automatically
    });
    
    // Passes the entire response envelope through unchanged
    res.json(response.data);
  } catch (error) {
    handleCentralApiError(error, res);
  }
});

// P3: Proxy GET /rentals/products/:id
app.get('/rentals/products/:id', async (req, res) => {
  try {
    const response = await centralApi.get(`/api/data/products/${req.params.id}`);
    // Passes the entire response envelope through unchanged
    res.json(response.data);
  } catch (error) {
    handleCentralApiError(error, res);
  }
});

// Helper for date parsing and comparison (P7)
function toDate(str) {
  const [y, m, d] = str.split('-');
  return new Date(Date.UTC(y, m - 1, d));
}

function toString(date) {
  return date.toISOString().split('T')[0];
}

// P7: Is It Available?
app.get('/rentals/products/:id/availability', async (req, res) => {
  const productId = req.params.id;
  const reqFromStr = req.query.from;
  const reqToStr = req.query.to;

  if (!reqFromStr || !reqToStr) {
    return res.status(400).json({ error: 'Missing from or to parameters' });
  }

  try {
    const reqFromDate = toDate(reqFromStr);
    const reqToDate = toDate(reqToStr);

    let allRentals = [];
    let page = 1;

    // Fetch all rentals for this product
    while (true) {
      const centralRes = await centralApi.get('/api/data/rentals', {
        params: { product_id: productId, limit: 100, page }
      });
      const data = centralRes.data.data;
      allRentals = allRentals.concat(data);
      if (data.length < 100) break;
      page++;
    }

    // Sort and Merge Intervals
    const intervals = allRentals.map(r => ({
      start: toDate(r.rentalStart.split('T')[0]),
      end: toDate(r.rentalEnd.split('T')[0])
    })).sort((a, b) => a.start - b.start);

    const merged = [];
    if (intervals.length > 0) {
      merged.push({ start: intervals[0].start, end: intervals[0].end });
      for (let i = 1; i < intervals.length; i++) {
        const current = intervals[i];
        const last = merged[merged.length - 1];
        if (current.start <= last.end) {
          if (current.end > last.end) last.end = current.end;
        } else {
          merged.push({ start: current.start, end: current.end });
        }
      }
    }

    // Find intersecting busy periods
    const intersectingBusy = merged.filter(b => b.start <= reqToDate && b.end >= reqFromDate);

    // Calculate free windows within the requested range
    const freeWindows = [];
    let currentFreeStart = new Date(reqFromDate);

    for (let busy of intersectingBusy) {
      if (busy.start > currentFreeStart) {
        // Free window exists before this busy period starts
        const freeEnd = new Date(busy.start);
        freeEnd.setUTCDate(freeEnd.getUTCDate() - 1);
        if (freeEnd >= currentFreeStart) {
          freeWindows.push({ start: currentFreeStart, end: freeEnd });
        }
      }
      // Advance to after the busy period
      const nextFreeStart = new Date(busy.end);
      nextFreeStart.setUTCDate(nextFreeStart.getUTCDate() + 1);
      if (nextFreeStart > currentFreeStart) {
        currentFreeStart = nextFreeStart;
      }
    }

    if (currentFreeStart <= reqToDate) {
      freeWindows.push({ start: currentFreeStart, end: reqToDate });
    }

    res.json({
      productId: Number(productId),
      from: reqFromStr,
      to: reqToStr,
      available: intersectingBusy.length === 0,
      busyPeriods: intersectingBusy.map(b => ({
        start: toString(b.start),
        end: toString(b.end)
      })),
      freeWindows: freeWindows.map(f => ({
        start: toString(f.start),
        end: toString(f.end)
      }))
    });
  } catch (error) {
    handleCentralApiError(error, res);
  }
});

// Quickselect Helper for P8 (Bonus: Average O(N) instead of O(N log N) sorting)
function quickSelect(arr, targetIndex, left = 0, right = arr.length - 1) {
  if (left === right) return arr[left];
  
  let pivotValue = arr[right].count;
  let pivotIndex = left;
  
  for (let i = left; i < right; i++) {
    // Descending order (larger elements to the left)
    if (arr[i].count > pivotValue) {
      let temp = arr[i];
      arr[i] = arr[pivotIndex];
      arr[pivotIndex] = temp;
      pivotIndex++;
    }
  }
  let temp = arr[pivotIndex];
  arr[pivotIndex] = arr[right];
  arr[right] = temp;
  
  if (targetIndex === pivotIndex) {
    return arr[targetIndex];
  } else if (targetIndex < pivotIndex) {
    return quickSelect(arr, targetIndex, left, pivotIndex - 1);
  } else {
    return quickSelect(arr, targetIndex, pivotIndex + 1, right);
  }
}

// P8: The Record Day
app.get('/rentals/kth-busiest-date', async (req, res) => {
  const { from, to, k: kStr } = req.query;

  if (!from || !to || !kStr) return res.status(400).json({ error: "Missing params" });

  const k = parseInt(kStr, 10);
  if (isNaN(k) || k <= 0) return res.status(400).json({ error: "Invalid k" });

  const isValidMonth = (str) => /^\d{4}-\d{2}$/.test(str);
  if (!isValidMonth(from) || !isValidMonth(to)) return res.status(400).json({ error: "Invalid format" });
  if (from > to) return res.status(400).json({ error: "from > to" });

  // Max range 12 months
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  const monthsDiff = (y2 - y1) * 12 + (m2 - m1);
  
  if (monthsDiff > 11) return res.status(400).json({ error: "Max range is 12 months" });

  // Generate list of months to fetch
  const months = [];
  let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  try {
    // Fetch all months concurrently for speed
    const promises = months.map(month => 
      centralApi.get('/api/data/rentals/stats', { params: { group_by: 'date', month } })
    );
    const results = await Promise.all(promises);

    let allDays = [];
    for (const r of results) {
      if (r.data.data) allDays = allDays.concat(r.data.data);
    }

    if (k > allDays.length) {
      return res.status(404).json({ error: "k exceeds total number of distinct dates" });
    }

    // O(N) QuickSelect for the (k-1)th element (0-indexed)
    const kthDay = quickSelect(allDays, k - 1);

    res.json({
      from,
      to,
      k,
      date: kthDay.date,
      rentalCount: kthDay.count
    });
  } catch (error) {
    handleCentralApiError(error, res);
  }
});

// Quickselect Top K Helper for P9 (Bonus: O(N) partitioning + O(K log K) sorting)
function getTopKCategories(arr, k) {
  if (k >= arr.length) return arr.sort((a, b) => b.rentalCount - a.rentalCount);
  
  function partition(left, right) {
    let pivotValue = arr[right].rentalCount;
    let pivotIndex = left;
    for (let i = left; i < right; i++) {
      if (arr[i].rentalCount > pivotValue) {
        let temp = arr[i];
        arr[i] = arr[pivotIndex];
        arr[pivotIndex] = temp;
        pivotIndex++;
      }
    }
    let temp = arr[pivotIndex];
    arr[pivotIndex] = arr[right];
    arr[right] = temp;
    return pivotIndex;
  }
  
  function select(left, right, targetIndex) {
    if (left >= right) return;
    let pivotIndex = partition(left, right);
    if (targetIndex === pivotIndex) return;
    else if (targetIndex < pivotIndex) select(left, pivotIndex - 1, targetIndex);
    else select(pivotIndex + 1, right, targetIndex);
  }
  
  select(0, arr.length - 1, k - 1);
  return arr.slice(0, k).sort((a, b) => b.rentalCount - a.rentalCount);
}

// P9: What Does This Renter Love?
app.get('/rentals/users/:id/top-categories', async (req, res) => {
  const userId = req.params.id;
  const kStr = req.query.k;

  if (!kStr) return res.status(400).json({ error: "Missing k parameter" });
  const k = parseInt(kStr, 10);
  if (isNaN(k) || k <= 0) return res.status(400).json({ error: "Invalid k" });

  try {
    let allRentals = [];
    let page = 1;

    // 1. Fetch all rentals for user
    while (true) {
      const centralRes = await centralApi.get('/api/data/rentals', {
        params: { renter_id: userId, limit: 100, page }
      });
      const data = centralRes.data.data;
      allRentals = allRentals.concat(data);
      if (data.length < 100) break;
      page++;
    }

    if (allRentals.length === 0) {
      return res.json({
        userId: Number(userId),
        topCategories: []
      });
    }

    // 2. Extract unique product IDs
    const productIds = [...new Set(allRentals.map(r => r.productId))];

    // 3. Fetch products in batches of 50
    const productMap = {}; // productId -> category
    for (let i = 0; i < productIds.length; i += 50) {
      const batchIds = productIds.slice(i, i + 50);
      const batchRes = await centralApi.get('/api/data/products/batch', {
        params: { ids: batchIds.join(',') }
      });
      
      // Central API returns an array of products
      for (const p of batchRes.data) {
        productMap[p.id] = p.category;
      }
    }

    // 4. Tally counts per category
    const counts = {};
    for (const r of allRentals) {
      const category = productMap[r.productId];
      if (category) {
        counts[category] = (counts[category] || 0) + 1;
      }
    }

    const categoryArr = Object.keys(counts).map(category => ({
      category,
      rentalCount: counts[category]
    }));

    // 5. Get Top K using O(N) QuickSelect + O(K log K) Sort
    const topCategories = getTopKCategories(categoryArr, k);

    res.json({
      userId: Number(userId),
      topCategories
    });
  } catch (error) {
    handleCentralApiError(error, res);
  }
});

//P10
// P10: The Long Vacation
app.get('/rentals/products/:id/free-streak', async (req, res) => {
  const productId = req.params.id;
  const yearStr = req.query.year;

  // 1. Validation
  if (!yearStr || !/^\d{4}$/.test(yearStr)) {
    return res.status(400).json({ error: "Valid 4-digit year is required" });
  }
  const year = parseInt(yearStr, 10);

  try {
    let allRentals = [];
    let page = 1;

    // 2. Fetch all rentals for this specific product
    while (true) {
      const centralRes = await centralApi.get('/api/data/rentals', {
        params: { product_id: productId, limit: 100, page }
      });
      const data = centralRes.data.data;
      allRentals = allRentals.concat(data);
      if (data.length < 100) break;
      page++;
    }

    // 3. Define our calendar year boundaries
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    // 4. Clamp intervals to the target year and drop out-of-bounds rentals
    let intervals = [];
    for (const rental of allRentals) {
      const rStart = new Date(rental.rentalStart);
      const rEnd = new Date(rental.rentalEnd);

      if (isAfter(rStart, yearEnd) || isBefore(rEnd, yearStart)) continue;

      intervals.push({
        start: max([rStart, yearStart]),
        end: min([rEnd, yearEnd])
      });
    }

    // 5. Merge Overlapping Intervals (The P7 sub-problem)
    intervals.sort((a, b) => a.start - b.start);
    const merged = [];
    if (intervals.length > 0) {
      let current = intervals[0];
      for (let i = 1; i < intervals.length; i++) {
        // If they overlap or touch, merge them
        if (!isAfter(intervals[i].start, addDays(current.end, 1))) {
          current.end = max([current.end, intervals[i].end]);
        } else {
          merged.push(current);
          current = intervals[i];
        }
      }
      merged.push(current);
    }

    // 6. Scan the gaps to find the longest free streak
    let longestGap = { from: null, to: null, days: -1 };

    const checkGap = (startObj, endObj) => {
      if (isAfter(startObj, endObj)) return; // Invalid gap
      const days = differenceInDays(endObj, startObj);
      if (days > longestGap.days) {
        longestGap = {
          from: format(startObj, 'yyyy-MM-dd'),
          to: format(endObj, 'yyyy-MM-dd'),
          days
        };
      }
    };

    if (merged.length === 0) {
      // Edge Case: No rentals this year -> entire year is free[cite: 1]
      checkGap(yearStart, yearEnd);
    } else {
      // Gap A: Jan 1st to the first rental[cite: 1]
      if (isAfter(merged[0].start, yearStart)) {
        checkGap(yearStart, subDays(merged[0].start, 1));
      }

      // Gap B: The spaces between merged rentals
      for (let i = 0; i < merged.length - 1; i++) {
        const freeStart = addDays(merged[i].end, 1);
        const freeEnd = subDays(merged[i + 1].start, 1);
        checkGap(freeStart, freeEnd);
      }

      // Gap C: The last rental to Dec 31st[cite: 1]
      const lastEnd = merged[merged.length - 1].end;
      if (isBefore(lastEnd, yearEnd)) {
        checkGap(addDays(lastEnd, 1), yearEnd);
      }
    }

    res.json({
      productId: Number(productId),
      year,
      longestFreeStreak: longestGap.days === -1 ? null : longestGap
    });

  } catch (error) {
    // Re-use the error handler we created previously
    handleCentralApiError(error, res);
  }
});

// P12
// P12: The Unified Feed
app.get('/rentals/merged-feed', async (req, res) => {
  const { productIds: rawIdsStr, limit: limitStr } = req.query;

  // --- 1. Strict Validation ---
  if (!rawIdsStr) return res.status(400).json({ error: "productIds required" });
  if (!limitStr) return res.status(400).json({ error: "limit required" });

  const rawIds = rawIdsStr.split(',');
  if (rawIds.length < 1 || rawIds.length > 10) {
    return res.status(400).json({ error: "1-10 comma-separated productIds allowed" });
  }

  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit <= 0 || limit > 100) {
    return res.status(400).json({ error: "limit must be a positive integer max 100" });
  }

  // Deduplicate IDs and parse to integers
  const productIds = [...new Set(rawIds.map(id => parseInt(id, 10)))];
  if (productIds.some(isNaN)) {
    return res.status(400).json({ error: "productIds must be valid integers" });
  }

  try {
    // --- 2. Network Optimization ---
    // Fetch streams concurrently. 
    // We ONLY fetch 'limit' records per product, saving huge amounts of data transfer.
    const fetchPromises = productIds.map(id =>
      centralApi.get('/api/data/rentals', {
        params: { product_id: id, limit: limit, page: 1 }
      })
        .then(response => response.data.data || [])
        .catch(error => {
          // If a product doesn't exist or 404s, treat it as an empty stream
          return [];
        })
    );

    const streams = await Promise.all(fetchPromises);

    // --- 3. The Algorithm: Pairwise Merge (Two Pointers) ---
    // Merges two already-sorted arrays in O(N) time
    const mergeTwoSortedStreams = (streamA, streamB) => {
      const merged = [];
      let i = 0;
      let j = 0;

      // Continue until we hit the requested limit or exhaust both arrays
      while (i < streamA.length && j < streamB.length && merged.length < limit) {
        // ISO 8601 Date strings sort perfectly using standard string comparison
        if (streamA[i].rentalStart <= streamB[j].rentalStart) {
          merged.push(streamA[i]);
          i++;
        } else {
          merged.push(streamB[j]);
          j++;
        }
      }

      // Add any remaining items from streamA (if limit not reached)
      while (i < streamA.length && merged.length < limit) {
        merged.push(streamA[i]);
        i++;
      }

      // Add any remaining items from streamB (if limit not reached)
      while (j < streamB.length && merged.length < limit) {
        merged.push(streamB[j]);
        j++;
      }

      return merged;
    };

    // --- 4. The Algorithm: Divide and Conquer ---
    // Recursively splits the K streams and merges them pair by pair in O(N * log K)
    const mergeKStreams = (lists) => {
      if (lists.length === 0) return [];
      if (lists.length === 1) return lists[0].slice(0, limit);
      if (lists.length === 2) return mergeTwoSortedStreams(lists[0], lists[1]);

      const mid = Math.floor(lists.length / 2);
      const leftHalf = mergeKStreams(lists.slice(0, mid));
      const rightHalf = mergeKStreams(lists.slice(mid));

      return mergeTwoSortedStreams(leftHalf, rightHalf);
    };

    const unifiedFeed = mergeKStreams(streams);

    // --- 5. Return the payload ---
    res.json({
      productIds,
      limit,
      feed: unifiedFeed
    });

  } catch (error) {
    handleCentralApiError(error, res);
  }
});

// P1: Health Check
app.get('/status', (req, res) => {
  res.json({ service: 'rental-service', status: 'OK' });
});

app.listen(port, () => {
  console.log(`rental-service running on port ${port}`);
});
