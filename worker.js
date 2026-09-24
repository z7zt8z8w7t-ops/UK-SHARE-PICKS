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
      return json({ ok: false, stage: "request", error: "Invalid JSON body" }, 400);
    }

    // iOS Shortcuts-compatible authentication: secret travels in JSON, not a custom header.
    const suppliedSecret = body?.secret;
    if (!env.UPDATE_SECRET || !suppliedSecret || suppliedSecret !== env.UPDATE_SECRET) {
      return json({ ok: false, stage: "authentication", error: "Unauthorized" }, 401);
    }

    if (!env.GITHUB_TOKEN) {
      return json({ ok: false, stage: "config", error: "GITHUB_TOKEN is not configured" }, 500);
    }

    // Never save the authentication secret into the public picks.json file.
    const { secret, ...newData } = body;

    const current = await fetch(`${apiUrl}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: githubHeaders
    });

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

    const bytes = new TextEncoder().encode(JSON.stringify(newData, null, 2) + "\n");
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
    try { result = JSON.parse(replyText); } catch { result = replyText; }

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
      commit: result?.commit?.sha || null
    });
  }
};
