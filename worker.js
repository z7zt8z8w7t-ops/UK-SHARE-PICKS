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

    const url = new URL(request.url);

    // Normal browser health check.
    if (request.method === "GET" && !url.searchParams.has("github")) {
      return json({
        ok: true,
        message: "UK SHARE PICKS updater is running",
        updateSecretConfigured: !!env.UPDATE_SECRET,
        githubTokenConfigured: !!env.GITHUB_TOKEN
      });
    }

    // Diagnostic: GET /?github=read
    // Confirms the GitHub token can read picks.json without changing anything.
    if (request.method === "GET" && url.searchParams.get("github") === "read") {
      if (!env.GITHUB_TOKEN) {
        return json({ ok: false, stage: "config", error: "GITHUB_TOKEN is not configured" }, 500);
      }

      const response = await fetch(`${apiUrl}?ref=${encodeURIComponent(BRANCH)}`, {
        headers: githubHeaders
      });

      const replyText = await response.text();
      let reply;
      try { reply = JSON.parse(replyText); } catch { reply = replyText; }

      return json({
        ok: response.ok,
        stage: "github-read",
        githubStatus: response.status,
        canReadPicks: response.ok,
        githubReply: reply
      }, response.ok ? 200 : 502);
    }

    // Diagnostic: GET /?github=write
    // Performs a harmless GitHub write test to a separate file, then reports
    // GitHub's exact response. It does NOT modify picks.json.
    if (request.method === "GET" && url.searchParams.get("github") === "write") {
      if (!env.GITHUB_TOKEN) {
        return json({ ok: false, stage: "config", error: "GITHUB_TOKEN is not configured" }, 500);
      }

      const testFile = "worker-write-test.txt";
      const testUrl =
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${testFile}`;

      // If the test file already exists, obtain its SHA so the PUT can update it.
      const existing = await fetch(`${testUrl}?ref=${encodeURIComponent(BRANCH)}`, {
        headers: githubHeaders
      });

      let sha;
      if (existing.ok) {
        const existingJson = await existing.json();
        sha = existingJson.sha;
      } else if (existing.status !== 404) {
        const t = await existing.text();
        return json({
          ok: false,
          stage: "github-write-precheck",
          githubStatus: existing.status,
          githubReply: t
        }, 502);
      }

      const content = new TextEncoder().encode(
        `Cloudflare Worker GitHub write test: ${new Date().toISOString()}\n`
      );
      let binary = "";
      for (const byte of content) binary += String.fromCharCode(byte);
      const encoded = btoa(binary);

      const body = {
        message: "Cloudflare Worker GitHub write test",
        content: encoded,
        branch: BRANCH
      };
      if (sha) body.sha = sha;

      const response = await fetch(testUrl, {
        method: "PUT",
        headers: {
          ...githubHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const replyText = await response.text();
      let reply;
      try { reply = JSON.parse(replyText); } catch { reply = replyText; }

      return json({
        ok: response.ok,
        stage: "github-write",
        githubStatus: response.status,
        canWriteToGitHub: response.ok,
        testFile,
        githubReply: reply
      }, response.ok ? 200 : 502);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    // Authenticate POST requests from the iPhone Shortcut.
    const suppliedSecret = request.headers.get("X-Update-Secret");
    if (!env.UPDATE_SECRET || !suppliedSecret || suppliedSecret !== env.UPDATE_SECRET) {
      return json({ ok: false, stage: "auth", error: "Unauthorized" }, 401);
    }

    if (!env.GITHUB_TOKEN) {
      return json({ ok: false, stage: "config", error: "GITHUB_TOKEN is not configured" }, 500);
    }

    let newData;
    try {
      newData = await request.json();
    } catch {
      return json({ ok: false, stage: "request", error: "Invalid JSON body" }, 400);
    }

    // Read the current file so GitHub gives us the SHA required for updates.
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
      message: "picks.json updated successfully",
      githubStatus: update.status,
      commit: result?.commit?.sha || null
    });
  }
};
