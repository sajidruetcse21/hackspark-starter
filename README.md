# Technocracy Lite - HACKSPARK

> **10 Hours · Onsite · Team Size: 3** <br>
> Build the next generation of RentPi, a real-world rental platform, microservice by microservice.

---

## Table of Contents

1. [The Story](#the-story)
2. [Quick Start](#quick-start)
3. [Architecture Overview](#architecture-overview)
4. [Central API](#central-api-rentpis-historical-data)
5. [Problem Statements](#problem-statements)
   - [Chapter 1: The Foundation](#chapter-1-the-foundation)
   - [Chapter 2: The Data Layer](#chapter-2-the-data-layer)
   - [Chapter 3: The Intelligence Layer](#chapter-3-the-intelligence-layer)
   - [Chapter 4: The Face](#chapter-4-the-face)
   - [Bonus Problems](#bonus-problems)
6. [Rules & Constraints](#rules--constraints)
7. [Scoring](#scoring)
8. [Event Timeline & Submission](#event-timeline--submission)
9. [Tips & Gotchas](#tips--gotchas)

---

## The Story

**RentPi** is a rental marketplace where people rent anything, electronics, vehicles, tools, outdoor gear, musical instruments, and more. After three years of operation, RentPi has accumulated:

- **10 million** rental transactions
- **500,000** listed products across 30 categories
- **100,000** registered users, each with a `securityScore` that determines their discount eligibility

RentPi just raised a **Series A** and is rebuilding its entire platform from scratch, microservice by microservice, with a team of fresh engineers.

That team is **you**.

You have **10 hours** to bring RentPi's new platform to life. Work through the chapters in order. Each chapter builds on the last.

---

## Quick Start

### Prerequisites

Before the hackathon starts, make sure your machine has:

- **Docker Desktop** (v24+): [download](https://www.docker.com/products/docker-desktop/)
  - **Windows users:** Open Docker Desktop → Settings → Resources → set RAM to **at least 6 GB**
- **Git**: [download](https://git-scm.com/)
- **Node.js 20+** (for local dev without Docker): [download](https://nodejs.org/)
- A code editor (VS Code recommended)

### Setup

```bash
# 1. Clone the following repo
git clone https://github.com/Galib-23/hackspark-starter
cd hackspark-starter

# 2. Copy env file and fill in your team token
cp .env.example .env
# Open .env and set CENTRAL_API_TOKEN to the token given by judges

# 3. Start everything
docker-compose up --build

# Services will be available at:
# api-gateway       →  http://localhost:8000
# user-service      →  http://localhost:8001
# rental-service    →  http://localhost:8002
# analytics-service →  http://localhost:8003
# agentic-service   →  http://localhost:8004
# frontend          →  http://localhost:3000
```

> **First build takes 3-5 minutes** as Docker pulls base images. Subsequent builds are faster due to layer caching.

---

## Architecture Overview

```
                        ┌──────────────────────────────────────────┐
                        │           YOUR LOCAL MACHINE             │
                        │                                          │
  Browser ──────────────►  frontend         :3000                  │
                        │       │                                  │
                        │       ▼                                  │
                        │  api-gateway      :8000  ◄── all calls   │
                        │    │    │    │    │       go through here│
                        │    ▼    ▼    ▼    ▼                      │
                        │ user rental ana agentic                  │
                        │ :8001 :8002 :8003 :8004                  │
                        │    │           │  │ │                    │
                        │    ▼           ▼  ▼ ▼                    │
                        │ postgres     mongo  (internal calls)     │
                        │  :5432      :27017                       │
                        └───────────────┬──────────────────────────┘
                                        │ Bearer Token
                                        ▼
                        ┌──────────────────────────────────┐
                        │  CENTRAL API (Judge's VPS)       │
                        │  https://technocracy.brittoo.xyz │
                        │  Rate limit: 30 req/min/token    │
                        └──────────────────────────────────┘
```

> #### Note: Excessive requests beyond the rate limit may result in temporary suspension of the token. Repeated violations can lead to permanent revocation (ban).

### Service Responsibilities

| Service | Port | Connects To | Responsibility |
|---------|------|-------------|----------------|
| `api-gateway` | 8000 | All services | Route requests, single entry point |
| `user-service` | 8001 | Postgres, Central API | Auth, JWT, discount logic |
| `rental-service` | 8002 | Central API | Products, rentals, algorithmic queries |
| `analytics-service` | 8003 | Central API | Trend analysis, surge detection, recommendations |
| `agentic-service` | 8004 | MongoDB, analytics-service, rental-service, Central API | AI chatbot |
| `frontend` | 3000 | api-gateway only | React UI |

### Inter-service Communication

Services talk to each other via **HTTP** using Docker's internal DNS. Inside the Docker network, service names resolve automatically:

```
http://user-service:8001
http://rental-service:8002
http://analytics-service:8003
http://agentic-service:8004
```

> **Optional Bonus:** You may use **gRPC** for `agentic-service`'s internal communication with `analytics-service` or `rental-service` for bonus points. See B1.

---

## Central API: RentPi's Historical Data

**Base URL:** `https://technocracy.brittoo.xyz`  
**Auth:** `Authorization: Bearer YOUR_TOKEN`  
**Rate Limit:** 30 requests per minute per token. Every violation costs -20 points. <br>
**Access:** Read-only

---

### Central API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/data/categories` | List all valid categories |
| GET | `/api/data/users/:id` | Get a rental user by ID |
| GET | `/api/data/products` | List products (filter: `?category=&owner_id=&page=&limit=`) |
| GET | `/api/data/products/:id` | Get product by ID |
| GET | `/api/data/products/batch` | Get multiple products by ID (`?ids=1,2,3` - max 50 per call) |
| GET | `/api/data/rentals` | List rentals (filter: `?product_id=&renter_id=&from=&to=&page=`) |
| GET | `/api/data/rentals/stats` | Stats - `?group_by=date&month=YYYY-MM` or `?group_by=category` |

Max 100 results per page. Default 50.

---

## Data You Will Get From The Central API

#### `GET /api/data/categories`

```json
{
  "categories": ["ELECTRONICS", "FURNITURE", "VEHICLES", "TOOLS", "OUTDOOR", "SPORTS", "MUSIC", "..."]
}
```

---

#### `GET /api/data/users/:id`

```json
{ "id": 42, "name": "User_42", "email": "renter42@rentpi.com", "securityScore": 78 }
```

---

#### `GET /api/data/products`

```json
{
  "data": [
    { "id": 1, "name": "Premium Kit #1", "category": "ELECTRONICS", "pricePerDay": 24.99, "ownerId": 5021 }
  ],
  "page": 1, "limit": 50, "total": 500000, "totalPages": 10000
}
```

---

#### `GET /api/data/products/batch?ids=1,2,3`

```json
{
  "data": [
    { "id": 1, "name": "Pro System #1",      "category": "OFFICE",       "pricePerDay": 250.26, "ownerId": 53453 },
    { "id": 2, "name": "Standard Bundle #2", "category": "CAMERAS",      "pricePerDay": 404.02, "ownerId": 23706 },
    { "id": 3, "name": "Portable Tool #3",   "category": "ELECTRONICS",  "pricePerDay": 178.19, "ownerId": 34683 }
  ],
  "missing": []
}
```

---

#### `GET /api/data/rentals`

```json
{
  "data": [
    {
      "id": 1, "productId": 420, "ownerId": 5021, "renterId": 8834,
      "rentalStart": "2023-06-01T00:00:00.000Z",
      "rentalEnd":   "2023-06-08T00:00:00.000Z",
      "discountPercent": 15
    }
  ],
  "page": 1, "limit": 50, "total": 10000000
}
```

---

#### `GET /api/data/rentals/stats?group_by=date&month=YYYY-MM`

```json
{
  "data": [
    { "date": "2024-03-01", "count": 342 },
    { "date": "2024-03-02", "count": 389 }
  ]
}
```

#### `GET /api/data/rentals/stats?group_by=category`

```json
{
  "data": [
    { "category": "ELECTRONICS", "rental_count": 38420, "avg_discount": 12.4 }
  ]
}
```

---

### Rate Limit Response Headers

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 24
X-RateLimit-Reset: 1710000060
```

**429: Rate limit exceeded:**

```json
{
  "error": "Rate limit exceeded",
  "limit": 30,
  "windowSeconds": 60,
  "retryAfterSeconds": 18,
  "warning": "Each violation incurs a -20 point penalty"
}
```

---

##  Problem Statements

All problems are visible from the start. Work through chapters in order, later chapters depend on earlier ones. Within each chapter, problems are ordered from easiest to hardest.

---

## Chapter 1: The Foundation

*Goal: Get all services running and prove the plumbing works. Every team should finish this chapter.*

---

### P1: Health Checks `(20 pts)`

**The "hello world" of this hackathon. Start here.**

RentPi's ops team needs a single command to verify that the entire platform is alive at any moment. Every service must expose a status endpoint, and the gateway must aggregate all of them into one response.

Each individual service must expose:

```
GET /status
```

And return:

```json
{ "service": "<service-name>", "status": "OK" }
```

The `api-gateway`'s `/status` must aggregate all downstream services:

```json
{
  "service": "api-gateway",
  "status": "OK",
  "downstream": {
    "user-service":      "OK",
    "rental-service":    "OK",
    "analytics-service": "OK",
    "agentic-service":   "OK"
  }
}
```

The gateway calls each downstream `/status` **in parallel** and reports the result. If a service is unreachable, report `"UNREACHABLE"`, do not crash.

**Judged by:** Automated runner hitting `GET http://localhost:8000/status` and checking all keys.

---

### P2: User Authentication `(40 pts)`

RentPi's users need to register, log in, and identify themselves to the platform. Implement user **register** and **login** in `user-service`, backed by local Postgres(or your preferred DB).

| Endpoint | Description |
|----------|-------------|
| `POST /users/register` | Accepts `{ name, email, password }`, stores hashed password, returns JWT |
| `POST /users/login` | Validates credentials, returns JWT |
| `GET /users/me` | Protected, returns user profile decoded from JWT |

Rules:
- Passwords **must be hashed** (bcrypt, argon2, etc.). Plain text storage results in automatic 0 on this problem.
- JWT must be verifiable by other services.
- Duplicate email on register returns `409 Conflict`.
- Invalid credentials on login return `401 Unauthorized`.

**No Central API calls required for this problem.**

---

### P3: Product Proxy `(30 pts)`

The `rental-service` is RentPi's product-facing gateway. For now, it needs to act as a transparent proxy to the Central API's product endpoints, automatically attaching the team's bearer token without ever exposing it to callers.

| Endpoint | Proxies To |
|----------|-----------|
| `GET /rentals/products` | `GET /api/data/products` |
| `GET /rentals/products/:id` | `GET /api/data/products/:id` |

Requirements:
- Bearer token attached automatically from env.
- Query params (`?category=&page=&limit=&owner_id=`) forwarded as-is.
- Central API errors (404, 429, 5xx) translated to appropriate responses with a clear message.
- Response envelope passed through unchanged.

**Central API calls: 1 per request.**

---

### P4: Docker Compose & Multistage Builds `(40 pts)`

RentPi's infrastructure team demands that any engineer can bring up the entire platform on a clean machine with a single command. No exceptions.

All 6 services plus Postgres and MongoDB must:

- Start with a **single** `docker-compose up --build` from the repo root.
- Use **multistage Dockerfiles**: a `builder` stage compiles/installs, and a lean `runtime` stage ships.
- Declare a `healthcheck` in each service (pointing to `/status`).
- Use **named volumes** for Postgres and MongoDB persistence.

Judges run `docker image ls` after build. Target final image sizes:

| Service | Target |
|---------|--------|
| api-gateway | < 150 MB |
| user-service | < 150 MB |
| rental-service | < 150 MB |
| analytics-service | < 150 MB |
| agentic-service | < 300 MB |
| frontend | < 50 MB |

**No Central API calls required for this problem.**

---

## Chapter 2: The Data Layer

*Goal: Query, filter, and process RentPi's historical rental data using the Central API efficiently.*

---

### P5: Paginated Product Listing with Category Filter `(50 pts)`

RentPi's product catalog holds half a million items. Users browse by category, and the platform needs to serve filtered, paginated results cleanly. A typo in the category name should never silently return wrong results, it should fail loudly with a helpful message.

In `rental-service`:

```
GET /rentals/products?category=TOOLS&page=2&limit=20
```

Requirements:
- Fetch products data from the central API. 
- Return the full pagination envelope: `{ data, page, limit, total, totalPages }`.
- If `category` is provided and is not a valid category string, return `400` with a helpful error listing all valid options.
- Valid categories must be fetched from the Central API and **cached**, do not call `/api/data/categories` on every request.
- All other query params forwarded to Central API.


---

### P6: The Loyalty Discount `(35 pts)`

RentPi rewards trustworthy renters. Every user has a `securityScore` maintained by the platform, and that score determines how much of a discount they get on their next rental. The sales team needs an endpoint that returns a user's current discount tier on demand.

In `user-service`:

```
GET /users/:id/discount
```

Fetch the user's `securityScore` from the Central API and compute their discount tier:

| Security Score | Discount |
|----------------|----------|
| 80 – 100 | 20% |
| 60 – 79  | 15% |
| 40 – 59  | 10% |
| 20 – 39  | 5%  |
| 0  – 19  | 0%  |

```json
{ "userId": 42, "securityScore": 85, "discountPercent": 20 }
```

If the user ID does not exist in the Central API, return `404`.


---

### P7: Is It Available? `(65 pts)`

A customer wants to rent a camera for their upcoming trip. Before they commit, RentPi needs to tell them honestly whether the product is free during their requested dates in a particular year, and if not, show them exactly when it will be.

The tricky part: popular products have dozens of overlapping rental records. A naive check against each record individually produces wrong answers when rentals overlap each other.

In `rental-service`:

```
GET /rentals/products/:id/availability?from=2024-03-01&to=2024-03-14
```

Fetch all rentals for the product from the central API, consolidate overlapping busy periods, and check whether the requested window conflicts with any of them. Return the merged busy periods and any free windows within the requested range.

```json
{
  "productId": 42,
  "from": "2024-03-01",
  "to":   "2024-03-14",
  "available": false,
  "busyPeriods": [
    { "start": "2024-02-28", "end": "2024-03-05" },
    { "start": "2024-03-09", "end": "2024-03-16" }
  ],
  "freeWindows": [
    { "start": "2024-03-06", "end": "2024-03-08" }
  ]
}
```

> **Hint:** Think carefully about what happens when two rental periods overlap each other. A naive pairwise check won't handle this correctly. Is there a way to process the intervals in a specific order that makes the problem much simpler?


---

### P8: The Record Day `(70 pts + 15 bonus pts)`

RentPi's operations team is preparing a retrospective report and they need to answer one question: "Looking back in a particular year at this period, which day was the 3rd busiest?" The answer needs to be pulled from months of data across the platform.

In `rental-service`:

```
GET /rentals/kth-busiest-date?from=2024-01&to=2024-06&k=3
```

```json
{ "from": "2024-01", "to": "2024-06", "k": 3, "date": "2024-03-15", "rentalCount": 412 }
```

**Validation:**
- `from` and `to` must be valid `YYYY-MM` strings, return `400` otherwise.
- `k` must be a positive integer, return `400` otherwise.
- `from` must not be after `to`, return `400` otherwise.
- Max range is 12 months, return `400` if exceeded.
- If `k` exceeds the total number of distinct dates available, return `404`.

---

**Scoring:**

| Approach | Points |
|----------|--------|
| Correct answer, any implementation | 70 pts |
| Correct answer using an optimized approach with better-than full sorting complexity | 70 + 15 pts |

> **Hint:** You are processing a stream of date-count pairs and only care about the top K. Do you need to sort everything to find just the Kth largest?

---

### P9: What Does This Renter Love? `(60 pts + 10 bonus pts)`

The marketing team wants to personalise the RentPi experience. To do that, they need to understand each renter's category preferences based on their actual rental history, not guesses.

In `rental-service`:

```
GET /rentals/users/:id/top-categories?k=5
```

Fetch all rentals made by this user, figure out which product categories they belong to, tally up the counts, and return the top `k` categories.

```json
{
  "userId": 101,
  "topCategories": [
    { "category": "ELECTRONICS", "rentalCount": 14 },
    { "category": "OUTDOOR",     "rentalCount": 9  },
    { "category": "TOOLS",       "rentalCount": 6  }
  ]
}
```

**Validation:**
- `k` must be a positive integer, return `400` otherwise.
- If the user has no rentals, return an empty `topCategories` array, not a `404`.
- If `k` exceeds the number of distinct categories the user has rented, return however many exist.

> **Note on the batch endpoint:** Product details must be fetched using `GET /api/data/products/batch?ids=...`, max 50 IDs per call. Do not make individual product calls.

---

**Scoring:**

| Approach | Points |
|----------|--------|
| Correct answer, any implementation | 60 pts |
| Correct answer using an optimized approach with better-than full sorting complexity | 60 + 10 pts |

> **Hint:** If you look closely this problem seems similar to one of the earlier problems.

---

### P10: The Long Vacation `(65 pts)`

A product owner wants to know: "In 2023, what was the longest stretch my product just sat on the shelf?" This tells them the best window to schedule maintenance, transport, or re-listing.

The challenge: some rentals overlap, some span across month boundaries, and a naive day-by-day scan won't handle any of this correctly.

In `rental-service`:

```
GET /rentals/products/:id/free-streak?year=2023
```

Given a product and a calendar year, find the **longest continuous period (in days) during which the product was not rented**, within that year.

```json
{
  "productId": 77,
  "year": 2023,
  "longestFreeStreak": {
    "from": "2023-04-10",
    "to":   "2023-07-22",
    "days": 103
  }
}
```

Edge cases to handle:
- A product with no rentals in that year, the entire year is free.
- Rentals that begin before January 1st or end after December 31st.

> **Hint:** This problem shares a key sub-problem with P7. Once you have clean, non-overlapping intervals, the rest is a scan.


---

## Chapter 3: The Intelligence Layer

*Goal: Extract patterns from large datasets and build an AI assistant grounded in real data.*

---

### P11: The Seven-Day Rush `(80 pts)`

RentPi's growth team is chasing one insight: "When was our biggest consecutive 7-day boom?" They want to know the exact window of 7 calendar days in a particular year with the highest combined rental count across the entire platform, within a given date range.

In `analytics-service`:

```
GET /analytics/peak-window?from=2024-01&to=2024-06
```

```json
{
  "from": "2024-01",
  "to":   "2024-06",
  "peakWindow": {
    "from":         "2024-03-10",
    "to":           "2024-03-16",
    "totalRentals": 2847
  }
}
```

**Validation:**
- `from` and `to` must be valid `YYYY-MM` strings, return `400` otherwise.
- `from` must not be after `to`, return `400` otherwise.
- Max range is 12 months, return `400` if exceeded.
- If total days in range is less than 7, return `400`, not enough data for a window.


> **Important:** The stats API only returns days that had at least one rental. Missing dates mean zero rentals, not missing data. Make sure every calendar day in the range is accounted for before you slide the window, otherwise your window silently changes size.

> **Hint:** A naive approach recalculates the sum from scratch at every position. Can you maintain a running total instead? This problem has an O(n) solution. Judges will verify no inner-loop sum recalculation exists.

---

### P12: The Unified Feed `(80 pts)`

A RentPi power user is tracking multiple products at once, perhaps a fleet manager watching 8 vehicles. They want a single chronological feed of all rental activity across all of them, sorted by `rentalStart`.

The catch: each product's rental history from the Central API is already sorted chronologically. You have K sorted lists and need to produce one merged sorted output. Concatenating all records and sorting from scratch is wasteful, you should be able to do better.

In `rental-service`:

```
GET /rentals/merged-feed?productIds=12,47,88,203,410,601,702,815&limit=30
```

Merge the rental histories of all given products into a **single chronological feed sorted by `rentalStart` (ascending)**, and return only the **first `limit` records** from that merged feed.

```json
{
  "productIds": [12, 47, 88, 203, 410],
  "limit": 30,
  "feed": [
    { "rentalId": 5041,  "productId": 88,  "rentalStart": "2024-01-01", "rentalEnd": "2024-01-05" },
    { "rentalId": 12900, "productId": 12,  "rentalStart": "2024-01-02", "rentalEnd": "2024-01-09" },
    { "rentalId": 8831,  "productId": 203, "rentalStart": "2024-01-03", "rentalEnd": "2024-01-04" },
    { "rentalId": 3310,  "productId": 47,  "rentalStart": "2024-01-04", "rentalEnd": "2024-01-07" },
    ...
    ...
    ...
  ]
}
```

Note: `feed` contains exactly `limit` records (or fewer if the total number of rentals across all products is less than `limit`).

**Validation:**
- `productIds` must be 1–10 comma-separated integers, return `400` otherwise.
- `limit` must be a positive integer, max 100, return `400` otherwise.
- A productId with no rentals is simply an empty stream, not an error.
- Duplicate productIds must be deduplicated before fetching.

> **Hint:** You have K sorted arrays. Think about how you can repeatedly merge pairs of sorted arrays using only two pointers, no sorting needed inside the merge. Apply this idea recursively on your K streams. The total work done is O(N·K·log K) where N is the number of records returned.

---

### P13: Chasing the Surge `(55 pts)`

RentPi's pricing team wants to flag surge days before they happen. For any given month, they want to know: for each day, when is the next day in that month where rental activity spikes higher?

This is useful for proactive pricing adjustments, if Monday's activity is low but Thursday historically spikes, the system can pre-warm inventory.

In `analytics-service`:

```
GET /analytics/surge-days?month=2024-03
```

For each day in the month, find the **next day in that month where the rental count is strictly higher** than the current day's count. Days with no future higher day return `null`.

```json
{
  "month": "2024-03",
  "data": [
    { "date": "2024-03-01", "count": 342, "nextSurgeDate": "2024-03-04", "daysUntil": 3 },
    { "date": "2024-03-02", "count": 289, "nextSurgeDate": "2024-03-04", "daysUntil": 2 },
    { "date": "2024-03-03", "count": 301, "nextSurgeDate": "2024-03-04", "daysUntil": 1 },
    { "date": "2024-03-04", "count": 412, "nextSurgeDate": "2024-03-11", "daysUntil": 7 },
    { "date": "2024-03-31", "count": 380, "nextSurgeDate": null,          "daysUntil": null }
  ]
}
```

**Validation:**
- `month` must be a valid `YYYY-MM` string, return `400` otherwise.
- Missing dates in the API response must be filled with `count: 0` before processing.


> **Hint:** The naive approach uses a nested loop, for each day, scan every future day until you find a higher count. That's O(n²) with n ≈ 31. Think about whether you can solve this in a single left-to-right pass by keeping track of which days are still "waiting" to find their answer. Judges will verify no nested loop exists in your solution.

---

### P14: What's In Season? `(60 pts + 10 bonus pts)`

RentPi wants to surface products that people historically rent around this time of year. A customer visiting the platform on June 15th shouldn't be recommended ski gear, they should see kayaks and camping tents.

In `analytics-service`:

```
GET /analytics/recommendations?date=2024-06-15&limit=10
```

Find products most frequently rented during the same 15-day seasonal window (7 days before and after the given date) across the **past 2 years**. Return the top `limit` products enriched with name and category.

```json
{
  "date": "2024-06-15",
  "recommendations": [
    { "productId": 1042, "name": "Elite Tent #1042", "category": "OUTDOOR", "score": 24 },
    { "productId": 88,   "name": "Pro Kayak #88",    "category": "SPORTS",  "score": 19 }
  ]
}
```

**Validation:**
- `date` must be a valid `YYYY-MM-DD` string, return `400` otherwise.
- `limit` must be a positive integer, max 50, return `400` otherwise.
- If no historical rentals exist for the window, return an empty `recommendations` array.


> **Important edge case:** The seasonal window can cross year boundaries. If `date=2024-01-03`, the window is `Dec 27 – Jan 10`. Use a proper date library to handle this, do not manually subtract days from date strings.

---

**Scoring:**

| Approach | Points |
|----------|--------|
| Correct answer, any implementation | 60 pts |
| An optimal approach | 60 + 10 pts |

---

### P15: RentPi Assistant `(80 pts)`

RentPi wants to give every user an AI-powered assistant that can answer real questions about the platform, availability, trends, categories, discounts, backed by actual data, not hallucinations.

In `agentic-service`:

```
POST /chat
Body: { "sessionId": "abc123", "message": "Which category had the most rentals?" }
```

```json
{ "sessionId": "abc123", "reply": "ELECTRONICS led with 38,420 rentals." }
```

**Requirements:**

1. **Topic guard:** Any message unrelated to RentPi (rentals, products, categories, pricing, availability, users, discounts) must be refused politely, without calling the LLM at all. Use keyword matching as a pre-check before any API or LLM call.

2. **Data grounding:** For data questions, call the relevant service or endpoint and inject the result as context into the LLM prompt. The bot must never invent numbers. Examples:

   | User asks about | Fetch from |
   |-----------------|------------|
   | Most rented category | `GET /api/data/rentals/stats?group_by=category` via Central API |
   | Product availability | `GET rental-service:8002/rentals/products/:id/availability?from=&to=` |
   | Trending / recommended products | `GET analytics-service:8003/analytics/recommendations?date=TODAY&limit=5` |
   | Peak rental period | `GET analytics-service:8003/analytics/peak-window?from=&to=` |
   | Rental surge days | `GET analytics-service:8003/analytics/surge-days?month=YYYY-MM` |

3. **No hallucination policy:** If the required data is unavailable (service error, no results), the bot must say so explicitly rather than guessing.

4. **LLM choice:** Any free or paid LLM API is acceptable. Gemini 2.5 Flash is recommended (free tier, fast).

**Judged by:** Manual Q&A with a fixed set of test questions covering grounding, refusal, and multi-turn coherence.

---

### P16: Chat That Remembers `(60 pts)`

A single conversation is useful. A platform that remembers your past conversations is delightful. Extend `agentic-service` to support resumable, named chat sessions backed by MongoDB.

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /chat/sessions` | List all sessions sorted by most recent first |
| `GET /chat/:sessionId/history` | All messages for a session in order |
| `DELETE /chat/:sessionId` | Delete a session and all its messages |

**Session naming:**

When `POST /chat` is called with a `sessionId` that has no prior history (first message in a new session), the service must auto-generate a short session name using the LLM:

After the assistant reply is generated, make a second lightweight LLM call with a prompt along the lines of: "Given this first user message, reply with ONLY a short 3-5 word title for this conversation. No punctuation." Store this name in MongoDB alongside the `sessionId`. The name is generated **once** at session creation and never changes.

**MongoDB collections:**

```
sessions:
  sessionId     String  (unique, indexed)
  name          String
  createdAt     ISODate
  lastMessageAt ISODate

messages:
  sessionId   String  (indexed)
  role        String  "user" | "assistant"
  content     String
  timestamp   ISODate
```

**`GET /chat/sessions` response:**

```json
{
  "sessions": [
    { "sessionId": "abc123", "name": "Peak Electronics Rental Period", "lastMessageAt": "2024-06-15T10:05:00Z" },
    { "sessionId": "xyz789", "name": "Outdoor Gear Availability",      "lastMessageAt": "2024-06-14T09:20:00Z" }
  ]
}
```

**`GET /chat/:sessionId/history` response:**

```json
{
  "sessionId": "abc123",
  "name": "Peak Electronics Rental Period",
  "messages": [
    { "role": "user",      "content": "When did electronics peak?",           "timestamp": "2024-06-15T10:01:00Z" },
    { "role": "assistant", "content": "Electronics peaked on March 15, 2024.", "timestamp": "2024-06-15T10:01:02Z" }
  ]
}
```

**Requirements:**
- When `POST /chat` is called with an existing `sessionId`, load all prior messages from MongoDB and pass them to the LLM as conversation history. The session must be resumable.
- `lastMessageAt` must be updated on the session document after every new message.
- Sessions in `GET /chat/sessions` must be sorted by `lastMessageAt` descending.

---

## Chapter 4: The Face

*Goal: A polished, functional frontend that ties the entire platform together.*

---

### P17: The Pixels Reborn `(80 pts)`

RentPi's product designer has handed off the wireframes and the engineering team (that's you) needs to build the customer-facing interface. It must talk exclusively through the `api-gateway`, never directly to any downstream service or the Central API.

**Required pages:**

| Route | Features |
|-------|---------|
| `/login` | Login form, calls `POST /users/login` via gateway, stores JWT |
| `/register` | Register form, calls `POST /users/register` |
| `/products` | Paginated product list with category filter dropdown; click a product to see its details |
| `/availability` | Product ID input and date range picker, shows busy periods and free windows from P7 |
| `/chat` | Full chatbot UI, detailed below |
| + 2 pages of your choice | See below |

**Chat page (`/chat`) requirements:**

- **Session sidebar:** On load, call `GET /chat/sessions` and render a list of past sessions showing name and last-active time, sorted most recent first.
- Clicking a session loads its history via `GET /chat/:sessionId/history` and displays it in the chat window.
- A **"New Chat"** button generates a fresh `sessionId` (UUID) and clears the chat window.
- Messages display in bubbles, user on the right, assistant on the left.
- Send on Enter or button click. Show a typing indicator while waiting for a reply. Disable input until the reply arrives.

**Two additional pages of your choice:**

Design and build **2 more pages** that add genuine value to RentPi as a product. You may use any endpoint built in earlier problems.

Starting ideas (pick any, or invent your own):
- A user profile page showing rental history and discount tier
- A category explorer showing rental trends per category
- A surge calendar visualising peak days from P13
- A product comparison page showing availability side by side from P7

**Judged on:**
- Correct API integration through the gateway only, never calling the Central API directly
- Loading states (spinners, skeletons) and error handling (user-friendly messages on 4xx/5xx)
- Clean, readable UI, clarity over decoration
- For the 2 extra pages: relevance to RentPi and quality of implementation

---

### P18: "What's Trending Today?" Widget `(50 pts)`

RentPi's homepage needs a featured section that answers one question the moment a user lands: "What should I rent right now?"

Add a widget on the homepage (or a dedicated `/trending` route) that shows today's seasonal product recommendations.

**Requirements:**
- On load, call `GET /analytics/recommendations?date=TODAY&limit=6` via the gateway. The date must be today's actual date, dynamic, never hardcoded.
- Display results as responsive cards showing at minimum: product name, category badge, score.
- Loading state: show skeleton cards, not a blank screen.
- Error state: show a friendly message, not a blank screen.
- A refresh button that re-fetches with today's date.

---

### P19: Lean Images `(40 pts)`

RentPi's DevOps team is paying per GB for container storage. Every megabyte counts.

All images must hit the targets from P4. Judges check the final sizes after `docker-compose build`, intermediate build stages do not count.

Common paths to the targets:
- Use `alpine` or `distroless` base images for runtime stages.
- Run `npm ci --omit=dev`, never `npm install` in a final stage.
- Add a `.dockerignore` excluding `node_modules/`, test files, `.git/`, and `*.md`.
- For Go: compile a static binary (`CGO_ENABLED=0`) and use `scratch` as the final stage.
- Copy `package.json` before source code so dependency layers are cached independently.

**Judged by:** Automated size check. No manual review.

---

##  Bonus Problems

---

### B1: gRPC Internal Communication `(50 pts)`

RentPi's backend guild prefers typed, contract-first communication between services. Replace the HTTP calls that `agentic-service` makes to `analytics-service` or `rental-service` for chatbot grounding (P15) with **gRPC**.

Requirements:
- A `.proto` file in the repo defines the service contract for at least one grounding call (e.g. fetching recommendations or the merged rental feed).
- `analytics-service` or `rental-service` exposes a gRPC server on a separate port.
- `agentic-service` calls it via a gRPC client instead of HTTP for that grounding path.
- All existing HTTP endpoints on every service must still work, gRPC is the internal transport only.
- The `.proto` file and generated stubs must be committed to the repo.

**Judged by:** Manual, judges inspect the `.proto`, confirm the grounding path in `agentic-service` uses gRPC not HTTP, and run a chatbot query end-to-end.

---

### B2: Graceful Rate Limit Handling `(40 pts)`

RentPi's Central API enforces a rate limit, and a production system must handle throttling gracefully rather than crashing or passing raw errors back to users.

In every service that calls the Central API, implement **exponential backoff with jitter** when a `429` is received.

Requirements:
- On a `429` response: read `retryAfterSeconds` from the JSON body, wait that duration, then retry.
- Subsequent retries use `retryAfterSeconds × 2^attempt` with random jitter (±20%), max 3 retries.
- Each retry attempt must be logged to stdout in this format:
  ```
  [retry 1/3] waiting 18s before retrying GET /api/data/products
  ```
- After 3 failed retries, return `503 Service Unavailable` to the caller:

```json
{
  "error": "Central API unavailable after 3 retries",
  "lastRetryAfter": 72,
  "suggestion": "Try again in ~2 minutes"
}
```

**Judged by:** Automated, judges temporarily lower the rate limit on the Central API and confirm correct backoff behaviour and `503` response.

---

##  Rules & Constraints

### Central API

- **Rate limit:** 30 requests per minute per team token.
- **Violation penalty:** −20 points per violation. Tracked automatically from server logs.
- **Access:** Read-only. There are no write endpoints.
- **Token:** Store in `.env`. Never hardcode. Never commit to git.

### Repository

- Folder names **must be exactly**: `api-gateway`, `user-service`, `rental-service`, `analytics-service`, `agentic-service`, `frontend`.
- `docker-compose.yml` must be at the **repo root**.
- Full stack starts with `docker-compose up --build` from the root.
- Do not commit `.env` files, tokens found in git history will be invalidated.

### Code

- Any programming language or framework is allowed.
- Any libraries or packages are allowed.
- AI coding assistants are allowed.
- **Teams must be able to explain their own code** if asked by a judge. Inability to explain results in 0 on that problem.

### Team

- 3 members per team.
- All members must be present onsite.
- One GitHub repository per team.

---

##  Scoring

| # | Problem | Base | Bonus |
|---|---------|------|-------|
| P1  | Health Checks | 20 | - |
| P2  | User Authentication | 40 | - |
| P3  | Product Proxy | 30 | - |
| P4  | Docker Compose + Multistage | 40 | - |
| P5  | Paginated Product Listing | 50 | - |
| P6  | The Loyalty Discount | 35 | - |
| P7  | Is It Available? | 65 | - |
| P8  | The Record Day | 70 | +15 |
| P9  | What Does This Renter Love? | 60 | +10 |
| P10 | The Long Vacation | 65 | - |
| P11 | The Seven-Day Rush | 80 | - |
| P12 | The Unified Feed | 80 | - |
| P13 | Chasing the Surge | 55 | - |
| P14 | What's In Season? | 60 | +10 |
| P15 | RentPi Assistant | 80 | - |
| P16 | Chat That Remembers | 60 | - |
| P17 | The RentPi Dashboard | 80 | - |
| P18 | Trending Widget | 50 | - |
| P19 | Lean Images | 40 | - |
| B1  | gRPC Bonus | - | +50 |
| B2  | Graceful Rate Limit Handling | - | +40 |
| -   | Rate limit violations | -20 each | - |
| **Total** | | **1,060** | **+125 bonus** |

### Evaluation Method

| Problems | How |
|----------|-----|
| P1-P6, P19, B2 | Automated test runner |
| P7-P14, B1 | Automated + manual code review (algorithm verified) |
| P15, P16 | Manual Q&A + automated session-resume test |
| P17, P18 | Manual judging by evaluation team |
| Rate limit violations | Automatically counted from Central API server logs |

> **Algorithm verification:** For P7–P14, judges will read your code. If the required algorithmic insight is absent and replaced with a naive approach, the problem receives **half points** regardless of correct output.

---

##  Event Timeline & Submission

### Schedule

| Time | Activity |
|------|----------|
| 08:00 - 08:30 | Participant Reporting |
| 09:00 | Hacking Starts, GitHub repo link mailed to teams |
| 10:30 - 11:30 | Snacks & Kit Distribution |
| 01:00 - 02:00 | Jummah Prayer Break |
| 02:00 - 03:00 | Lunch Break |
| 04:00 - 06:30 | Pre-Judging: Mandatory Code Walkthrough |
| 07:00 | Hackathon Ends, Push access revoked |

---

### Repository & Collaboration

**Mandatory Repository Setup**

Teams must adhere to the following setup immediately upon the start of the event:

1. Clone the provided repository.
2. Set the repository to **PRIVATE**.
3. Add the following accounts as **Collaborators**:
   - Nezent: https://github.com/Nezent
   - Galib-23: https://github.com/Galib-23

---

### Submission Deadline

> **Strict Policy:** No commits or pushes will be accepted after **07:00 PM**. The evaluation script will automatically pull the last commit made before 07:00 PM. Any attempt to modify the code after the deadline will result in **immediate disqualification**.

---

### What Judges Will Do

```bash
git clone team-xyz
cd team-xyz
cp .env.example .env
# (judges insert team token into .env)
docker-compose up --build -d
# Wait for all health checks to pass
# Run automated test suite against localhost:8000
# Manual review: frontend at localhost:3000, chatbot Q&A
```

Make sure your stack works on a **clean machine with only Docker installed**.

---

## Tips & Gotchas

### Inter-Service Communication

```
http://user-service:8001     # correct: inside Docker network
http://localhost:8001        # wrong: does not work inside a container
```

### Keeping the Assistant Focused (P15)

Run a keyword check **before** any LLM call. If the message is off-topic, return a canned refusal immediately, no LLM call, no API cost:

```javascript
const RENTPI_KEYWORDS = [
  "rental", "product", "category", "price", "discount",
  "available", "availability", "renter", "owner", "rentpi",
  "booking", "gear", "surge", "peak", "trending",
];

function isOnTopic(message) {
  const lower = message.toLowerCase();
  return RENTPI_KEYWORDS.some(kw => lower.includes(kw));
}
```

---

## Help

Stuck? Ask an organizer, we are here to help, not to watch you suffer.

**Good luck. Build something great.**

---

*TECHNOCRACY LITE Presents - HACKSPARK, Organized by Dept. of ECE, RUET*