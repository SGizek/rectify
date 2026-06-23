const express = require("express");
const fetch = require("node-fetch");
const { CookieJar } = require("tough-cookie");
const makeFetchCookie = require("fetch-cookie");
const fetchCookie = makeFetchCookie.default ?? makeFetchCookie;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// One cookie jar per session — keyed by a simple session id sent from frontend
const sessions = {};

function getClient(sessionId) {
  if (!sessions[sessionId]) {
    const jar = new CookieJar();
    sessions[sessionId] = fetchCookie(fetch, jar);
  }
  return sessions[sessionId];
}

const BASE = "https://www.rappad.co";
const COMMON_HEADERS = {
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "x-requested-with": "XMLHttpRequest",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
};

// Step 1: fetch login page to get CSRF token
async function getCsrfToken(client) {
  const res = await client(`${BASE}/explore`, { headers: COMMON_HEADERS });
  const html = await res.text();
  const match = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  return match ? match[1] : null;
}

// POST /login
app.post("/login", async (req, res) => {
  const { username, password, sessionId } = req.body;
  if (!username || !password || !sessionId)
    return res.json({ success: false, error: "Missing fields" });

  const client = getClient(sessionId);
  try {
    const csrf = await getCsrfToken(client);
    if (!csrf) return res.json({ success: false, error: "Could not get CSRF token" });

    const body = new URLSearchParams({
      utf8: "✓",
      "user[login]": username,
      "user[password]": password,
      "user[remember_me]": "1",
      commit: "Log In",
    });

    const r = await client(`${BASE}/users/sign_in`, {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "accept": "*/*;q=0.5, text/javascript, application/javascript",
        "x-csrf-token": csrf,
        referer: `${BASE}/explore`,
      },
      body: body.toString(),
    });

    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// POST /prop
app.post("/prop", async (req, res) => {
  const { rapId, sessionId, csrfToken } = req.body;
  if (!rapId || !sessionId || !csrfToken)
    return res.json({ success: false, error: "Missing fields" });

  const client = getClient(sessionId);
  try {
    const body = new URLSearchParams({
      proppable_type: "Rap",
      proppable_id: rapId,
    });

    const r = await client(`${BASE}/api/props`, {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "accept": "*/*",
        "x-csrf-token": csrfToken,
        referer: `${BASE}/rap/${rapId}`,
      },
      body: body.toString(),
    });

    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// POST /save-rap
app.post("/save-rap", async (req, res) => {
  const { title, lyrics, visibility, sessionId, csrfToken } = req.body;
  if (!title || !lyrics || !visibility || !sessionId || !csrfToken)
    return res.json({ success: false, error: "Missing fields" });

  const client = getClient(sessionId);
  try {
    const body = new URLSearchParams({
      "rap[title]": title,
      "rap[lyrics]": lyrics,
      "rap[visibility]": visibility,
    });

    const r = await client(`${BASE}/editor/save`, {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "accept": "*/*",
        "x-csrf-token": csrfToken,
        referer: `${BASE}/editor`,
      },
      body: body.toString(),
    });

    const text = await r.text();
    try {
      res.json({ success: true, ...JSON.parse(text) });
    } catch {
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// PUT /bio
app.post("/bio", async (req, res) => {
  const { description, sessionId, csrfToken, username } = req.body;
  if (!description || !sessionId || !csrfToken || !username)
    return res.json({ success: false, error: "Missing fields" });

  const client = getClient(sessionId);
  try {
    const body = new URLSearchParams({ "user[description]": description });

    const r = await client(`${BASE}/api/users`, {
      method: "PUT",
      headers: {
        ...COMMON_HEADERS,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "accept": "*/*",
        "x-csrf-token": csrfToken,
        referer: `${BASE}/users/${username}`,
      },
      body: body.toString(),
    });

    const text = await r.text();
    try {
      res.json({ success: true, ...JSON.parse(text) });
    } catch {
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// POST /feedback
app.post("/feedback", async (req, res) => {
  const { rapId, lyrics, delivery, production, sessionId, csrfToken } = req.body;
  if (!rapId || !lyrics || !delivery || !production || !sessionId || !csrfToken)
    return res.json({ success: false, error: "Missing fields" });

  const client = getClient(sessionId);
  try {
    const body = new URLSearchParams({
      "feedback[lyrics_score]": lyrics,
      "feedback[delivery_score]": delivery,
      "feedback[production_score]": production,
      "feedback[rap_id]": rapId,
    });

    const r = await client(`${BASE}/api/feedbacks`, {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "accept": "*/*",
        "x-csrf-token": csrfToken,
        referer: `${BASE}/rap/${rapId}`,
      },
      body: body.toString(),
    });

    const data = await r.json();
    res.json({ success: true, ...data });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.listen(3000, () => console.log("Rectify proxy running on http://localhost:3000"));
