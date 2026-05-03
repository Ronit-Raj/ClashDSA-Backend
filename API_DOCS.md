# ClashDSA Backend — API Documentation

> Reference for frontend agents/developers integrating with this backend.

---

## Base URL

```
http://<host>:3000
```

All API routes are prefixed with `/v1/api`.

---

## Authentication

Authentication is **entirely cookie-based**. There is no `Authorization` header.

- On a successful `sign-in` the server sets an `httpOnly; Secure` cookie named **`token`** containing a signed JWT.
- The browser sends this cookie automatically on every subsequent request to the same origin.
- **Every protected route** requires this cookie to be present. Missing or invalid cookies return `401`.

### What the frontend must do

When using `fetch`, always include:

```/dev/null/example.ts#L1-3
fetch(url, {
  credentials: "include",   // sends the cookie automatically
})
```

When using `axios`, set globally:

```/dev/null/example.ts#L1-3
axios.defaults.withCredentials = true;
```

There is **no token to store manually** — the browser cookie jar handles it.

---

## Common Error Shapes

| Status | Meaning | Body |
|--------|---------|------|
| `400` | Validation failed | `{ message, errors: { field: string[] } }` or Zod error object |
| `401` | Not authenticated | `{ message: "Unauthorized" }` |
| `404` | Resource not found | `{ message: string }` |
| `409` | Conflict (duplicate) | `{ message: string }` |
| `500` | Server error | `{ message: "Internal server error" }` |
| `502` | Judge0 unreachable | `{ message: string }` |

---

## Users

### Sign Up

```
POST /v1/api/users/sign-up
```

Creates a new user account. Does **not** sign the user in automatically.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `username` | `string` | 3–32 characters |
| `email` | `string` | Valid email |
| `password` | `string` | Min 8 characters |

**Example**

```/dev/null/request.json#L1-5
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "supersecret"
}
```

**Responses**

| Status | Body |
|--------|------|
| `201` | `{ "message": "User created successfully" }` |
| `400` | `{ "message": "Validation failed", "errors": { ... } }` |
| `409` | `{ "message": "User already exists" }` |

---

### Sign In

```
POST /v1/api/users/sign-in
```

Authenticates a user and **sets the auth cookie**. The cookie is `httpOnly` and `Secure`, so it is invisible to JavaScript — the browser sends it automatically.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `email` | `string` | Valid email |
| `password` | `string` | Non-empty |

**Example**

```/dev/null/request.json#L1-4
{
  "email": "alice@example.com",
  "password": "supersecret"
}
```

**Responses**

| Status | Body |
|--------|------|
| `200` | `{ "message": "User signed in successfully" }` — cookie is now set |
| `400` | `{ "message": "Validation failed", "errors": { ... } }` |
| `401` | `{ "message": "Invalid credentials" }` |

---

## Contests

### Get Public Contests

```
GET /v1/api/contest/getPublicContests
```

Returns all contests marked as public. **No authentication required.**

**Responses**

| Status | Body |
|--------|------|
| `200` | Array of contest objects (see shape below) |

**Contest object shape**

```/dev/null/contest.ts#L1-8
{
  contestId: string          // UUID
  title: string
  contestDuration: number    // minutes
  startTime: number          // Unix timestamp (ms) — convert with new Date(startTime)
  problems: number[]         // array of problem IDs
  creatorId: string          // UUID of the creator
  random: boolean
  public: boolean
}
```

---

### Create a Contest

```
POST /v1/api/contest/create
```

**Requires authentication.**

The backend randomly picks `noOfProblems` problems from the pool and assigns them to the contest. The creator must supply a UUID — generate one on the frontend with `crypto.randomUUID()`.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `contestId` | `string` | Valid UUID — generate on the client |
| `title` | `string` | 3–100 characters |
| `duration` | `number` | Minutes, min 1 |
| `startTime` | `string` | ISO 8601 datetime, e.g. `"2025-08-01T14:00:00Z"` |
| `noOfProblems` | `number` | 1–10 |
| `public` | `boolean` | Whether the contest appears in the public listing |

**Example**

```/dev/null/request.json#L1-8
{
  "contestId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Friday Clash",
  "duration": 90,
  "startTime": "2025-08-01T14:00:00Z",
  "noOfProblems": 3,
  "public": true
}
```

**Responses**

| Status | Body |
|--------|------|
| `201` | `{ "message": "Contest created successfully", "contestId": "..." }` |
| `200` | `{ "message": "Contest already exists" }` — the UUID was already used |
| `400` | Validation error or not enough problems in the pool |
| `401` | Not authenticated |

---

### Enter a Contest

```
POST /v1/api/contest/enter
```

**Requires authentication.**

Registers the signed-in user as a participant. Call this once before the user can submit to a contest. Calling it again is safe — returns `200` instead of `201`.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `contestId` | `string` | Valid UUID of an existing contest |

**Example**

```/dev/null/request.json#L1-3
{
  "contestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Responses**

| Status | Body |
|--------|------|
| `201` | `{ "message": "Entered contest successfully", "contestId": "..." }` |
| `200` | `{ "message": "Already entered contest" }` |
| `401` | Not authenticated |
| `404` | `{ "message": "Contest not found" }` |

---

### Submit a Solution

```
POST /v1/api/contest/submit
```

**Requires authentication.**

Sends source code to the judge. All test cases for the problem are run as a **batch in parallel**. The response is immediate (`202 Accepted`) — the actual verdict arrives asynchronously via the Judge0 webhook and is stored in the database. **The frontend must poll for the result** (polling route TBD).

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `contestId` | `string` | UUID of the contest the user is participating in |
| `problemId` | `number` | Integer ID of the problem |
| `sourceCode` | `string` | Full source code as a plain string |
| `language` | `number` | Judge0 language ID (see table below) |

**Common Judge0 language IDs**

| ID | Language |
|----|----------|
| `50` | C (GCC 9.2.0) |
| `54` | C++ (GCC 9.2.0) |
| `62` | Java (OpenJDK 13) |
| `71` | Python 3 (3.8.1) |
| `63` | JavaScript (Node.js 12) |
| `73` | Rust (1.40.0) |
| `74` | TypeScript (3.7.4) |

Full list available at `GET http://<host>:2358/languages`.

**Example**

```/dev/null/request.json#L1-7
{
  "contestId": "550e8400-e29b-41d4-a716-446655440000",
  "problemId": 1,
  "sourceCode": "n = int(input())\nnums = list(map(int, input().split()))\n...",
  "language": 71
}
```

**Responses**

| Status | Body |
|--------|------|
| `202` | `{ "message": "Submission accepted", "submissionId": "...", "totalTestCases": 12 }` |
| `400` | Validation error or no test data found for the problem |
| `401` | Not authenticated |
| `404` | `{ "message": "Problem not found" }` |
| `502` | Judge0 is down or returned no tokens |

**Important:** Store the `submissionId` from the `202` response — it will be needed to poll the verdict once that route is implemented.

---

## Problem Statements (Static Files)

Problem statements are served as **static HTML files** directly from the server root (no `/v1/api` prefix).

```
GET /{problemId}/statement.html
```

**Example**

```
GET /1/statement.html
```

Returns a full HTML document. Render it inside an **`<iframe>`** on the frontend — do not inject the HTML directly into the page to avoid style/script conflicts.

```/dev/null/example.tsx#L1-5
<iframe
  src="/1/statement.html"
  style={{ width: "100%", height: "100%", border: "none" }}
  title="Problem Statement"
/>
```

---

## Submission Lifecycle (for UI state management)

```/dev/null/lifecycle.txt#L1-12
1. User clicks "Submit"
   └── POST /v1/api/contest/submit
       └── 202 { submissionId, totalTestCases }

2. Store submissionId, show "Judging..." spinner

3. As soon as you get 202 with submissionId show judged 
The results will be propgated using web sockets but that is not implemented on 
the backend yet 

---

## Authentication Flow Summary

```/dev/null/auth-flow.txt#L1-10
1. POST /v1/api/users/sign-up       → create account
2. POST /v1/api/users/sign-in       → sets httpOnly cookie "token"
3. All subsequent requests          → browser sends cookie automatically
                                      (use credentials: "include")
4. Sign out                         → clear the cookie on the client:
                                      document.cookie = "token=; Max-Age=0"
                                      (no dedicated sign-out endpoint yet)
```
