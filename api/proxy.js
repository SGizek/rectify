const fetch = require("node-fetch");
const { CookieJar } = require("tough-cookie");
const makeFetchCookie = require("fetch-cookie");
const fetchCookie = makeFetchCookie.default ?? makeFetchCookie;

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

async function getCsrfToken(client) {
  const res = await client(`${BASE}/explore`, { headers: COMMON_HEADERS });
  const html = await res.text();
  const match = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  return match ? match[1] : null;
}

async function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const body = await parseBody(req);
  const { action, sessionId, csrfToken } = body;
  if (!sessionId) return res.json({ success: false, error: "Missing sessionId" });

  const client = getClient(sessionId);

  try {
    if (action === "profile") {
      const { username } = body;
      const r = await client(`${BASE}/users/${username}`, {
        method: "GET",
        headers: { ...COMMON_HEADERS, "accept": "text/html", "sec-fetch-mode": "navigate" },
      });
      const html = await r.text();
      if (r.status === 404) return res.json({ success: false, error: "User not found" });

      const get = (re, i = 1) => { const m = html.match(re); return m ? m[i].trim() : null; };
      const getAll = (re) => { const results = []; let m; const g = new RegExp(re.source, "g"); while ((m = g.exec(html)) !== null) results.push({ title: m[1].trim(), id: m[2].trim() }); return results; };

      const name        = get(/class="profile-username"[^>]*>([^<]+)/);
      const reputation  = get(/data-rr="(\d+)"/);
      const description = get(/class="profile-description"[^>]*>([\s\S]*?)<\/div>/)?.replace(/<[^>]+>/g, "").trim();
      const picture     = get(/class="profile-picture"[\s\S]*?<img[^>]+src="([^"]+)"/);
      const location    = get(/class="profile-location"[^>]*>([^<]+)/);
      const raps        = getAll(/<a class="rap-link"[^>]*>([^<]+)<\/a>[\s\S]*?data-rap-id="(\d+)"/);
      const rapCount    = get(/class="raps-count"[^>]*>(\d+)/);
      const followers   = get(/class="followers-count"[^>]*>(\d+)/);
      const following   = get(/class="following-count"[^>]*>(\d+)/);

      return res.json({ success: true, name, reputation, description, picture: picture ? (picture.startsWith("http") ? picture : `${BASE}${picture}`) : null, location, rapCount, followers, following, recentRaps: raps.slice(0, 5) });
    }

    if (action === "register") {
      const { email, password } = body;
      const csrf = await getCsrfToken(client);
      if (!csrf) return res.json({ success: false, error: "Could not get CSRF token" });

      const payload = new URLSearchParams({
        utf8: "✓",
        "user[email]": email,
        "user[password]": password,
        commit: "Create Account",
      });

      const r = await client(`${BASE}/users`, {
        method: "POST",
        headers: { ...COMMON_HEADERS, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "accept": "*/*;q=0.5, text/javascript, application/javascript", "x-csrf-token": csrf, referer: `${BASE}/explore` },
        body: payload.toString(),
      });
      return res.json(await r.json());
    }

    if (action === "login") {
      const { username, password } = body;
      const csrf = await getCsrfToken(client);
      if (!csrf) return res.json({ success: false, error: "Could not get CSRF token" });

      const payload = new URLSearchParams({
        utf8: "✓",
        "user[login]": username,
        "user[password]": password,
        "user[remember_me]": "1",
        commit: "Log In",
      });

      const r = await client(`${BASE}/users/sign_in`, {
        method: "POST",
        headers: { ...COMMON_HEADERS, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "accept": "*/*;q=0.5, text/javascript, application/javascript", "x-csrf-token": csrf, referer: `${BASE}/explore` },
        body: payload.toString(),
      });
      return res.json(await r.json());
    }

    if (action === "prop") {
      const { rapId } = body;
      const payload = new URLSearchParams({ proppable_type: "Rap", proppable_id: rapId });
      const r = await client(`${BASE}/api/props`, {
        method: "POST",
        headers: { ...COMMON_HEADERS, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "accept": "*/*", "x-csrf-token": csrfToken, referer: `${BASE}/rap/${rapId}` },
        body: payload.toString(),
      });
      return res.json(await r.json());
    }

    if (action === "bio") {
      const { description, username } = body;
      const payload = new URLSearchParams({ "user[description]": description });
      const r = await client(`${BASE}/api/users`, {
        method: "PUT",
        headers: { ...COMMON_HEADERS, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "accept": "*/*", "x-csrf-token": csrfToken, referer: `${BASE}/users/${username}` },
        body: payload.toString(),
      });
      const text = await r.text();
      try { return res.json({ success: true, ...JSON.parse(text) }); } catch { return res.json({ success: true }); }
    }

    if (action === "feedback") {
      const { rapId, lyrics, delivery, production } = body;
      const payload = new URLSearchParams({ "feedback[lyrics_score]": lyrics, "feedback[delivery_score]": delivery, "feedback[production_score]": production, "feedback[rap_id]": rapId });
      const r = await client(`${BASE}/api/feedbacks`, {
        method: "POST",
        headers: { ...COMMON_HEADERS, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "accept": "*/*", "x-csrf-token": csrfToken, referer: `${BASE}/rap/${rapId}` },
        body: payload.toString(),
      });
      return res.json({ success: true, ...await r.json() });
    }

    if (action === "save-rap") {
      const { title, lyrics, visibility } = body;
      const payload = new URLSearchParams({ "rap[title]": title, "rap[lyrics]": lyrics, "rap[visibility]": visibility });
      const r = await client(`${BASE}/editor/save`, {
        method: "POST",
        headers: { ...COMMON_HEADERS, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "accept": "*/*", "x-csrf-token": csrfToken, referer: `${BASE}/editor` },
        body: payload.toString(),
      });
      const text = await r.text();
      try { return res.json({ success: true, ...JSON.parse(text) }); } catch { return res.json({ success: true }); }
    }

    res.json({ success: false, error: "Unknown action" });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
};
