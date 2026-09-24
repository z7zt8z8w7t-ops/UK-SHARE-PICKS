export default {
  async fetch(request, env) {
    const OWNER = "z7zt8z8w7t-ops";
    const REPO = "UK-SHARE-PICKS";
    const FILE = "picks.json";
    const BRANCH = "main";

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });

    const githubHeaders = {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "UK-Share-Picks-Updater"
    };

    const apiUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

    if (request.method === "GET") {
      return json({
        ok: true,
        message: "UK SHARE PICKS updater is running",
        authMode: "JSON body",
        updateSecretConfigured: !!env.UPDATE_SECRET,
        githubTokenConfigured: !!env.GITHUB_TOKEN
      });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        stage: "request",
        error: "Invalid JSON body"
      }, 400);
    }

    const suppliedSecret = body?.secret;
    if (!env.UPDATE_SECRET || !suppliedSecret ||
        suppliedSecret !== env.UPDATE_SECRET) {
      return json({
        ok: false,
        stage: "authentication",
        error: "Unauthorized"
      }, 401);
    }

    if (!env.GITHUB_TOKEN) {
      return json({
        ok: false,
        stage: "config",
        error: "GITHUB_TOKEN is not configured"
      }, 500);
    }

    // Accept any of these Shortcut-friendly formats:
    // 1) { secret, payload: { ...full picks object... } }
    // 2) { secret, payload: "{...JSON text...}" }
    // 3) { secret, data: { ...full picks object... } }
    // 4) { secret, data: "{...JSON text...}" }
    // 5) { secret, updated, picks, watchlist }
    let newData = body.payload ?? body.data;

    if (typeof newData === "string") {
      try {
        newData = JSON.parse(newData);
      } catch {
        return json({
          ok: false,
          stage: "payload",
          error: "The payload/data field contains invalid JSON text"
        }, 400);
      }
    }

    if (!newData) {
      const { secret, ...directData } = body;
      newData = directData;
    }

    if (!newData || typeof newData !== "object" || Array.isArray(newData)) {
      return json({
        ok: false,
        stage: "payload",
        error: "No valid share-picks object was supplied"
      }, 400);
    }

    // Prevent another secret-only test from wiping picks.json.
    if (!Array.isArray(newData.picks)) {
      return json({
        ok: false,
        stage: "validation",
        error: "Payload must contain a picks array"
      }, 400);
    }

    if (!Array.isArray(newData.watchlist)) {
      newData.watchlist = [];
    }

    // Fill the update timestamp automatically if omitted.
    if (!newData.updated) {
      newData.updated = new Date().toISOString();
    }

    if (!newData.updatedLabel) {
      try {
        newData.updatedLabel = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date(newData.updated));
      } catch {
        newData.updatedLabel = newData.updated;
      }
    }

    // Normalise expected display fields without changing supplied values.
    newData.picks = newData.picks.map(p => ({
      ticker: p?.ticker ?? "",
      name: p?.name ?? "",
      action: p?.action ?? "WATCH",
      buy: p?.buy ?? "",
      target: p?.target ?? "",
      reconsider: p?.reconsider ?? "",
      potential: p?.potential ?? "",
      risk: p?.risk ?? "",
      timeframe: p?.timeframe ?? "",
      catalyst: p?.catalyst ?? "",
      reason: p?.reason ?? ""
    }));

    newData.watchlist = newData.watchlist.map(w => ({
      ticker: w?.ticker ?? "",
      date: w?.date ?? "",
      catalyst: w?.catalyst ?? "",
      status: w?.status ?? "WATCH"
    }));

    const current = await fetch(
      `${apiUrl}?ref=${encodeURIComponent(BRANCH)}`,
      { headers: githubHeaders }
    );

    if (!current.ok) {
      const replyText = await current.text();
      return json({
        ok: false,
        stage: "read-current-picks",
        githubStatus: current.status,
        githubReply: replyText
      }, 502);
    }

    const currentFile = await current.json();

    const bytes = new TextEncoder().encode(
      JSON.stringify(newData, null, 2) + "\n"
    );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const content = btoa(binary);

    const update = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        ...githubHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Automated UK share picks update",
        content,
        sha: currentFile.sha,
        branch: BRANCH
      })
    });

    const replyText = await update.text();
    let result;
    try {
      result = JSON.parse(replyText);
    } catch {
      result = replyText;
    }

    if (!update.ok) {
      return json({
        ok: false,
        stage: "write-picks",
        githubStatus: update.status,
        githubReply: result
      }, 502);
    }

    return json({
      ok: true,
      stage: "complete",
      message: "picks.json updated successfully",
      githubStatus: update.status,
      picksWritten: newData.picks.length,
      watchlistWritten: newData.watchlist.length,
      updated: newData.updated,
      commit: result?.commit?.sha || null
    });
  }
};
