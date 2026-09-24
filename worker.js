export default {
  async fetch(request, env) {
    const OWNER = "z7zt8z8w7t-ops";
    const REPO = "UK-SHARE-PICKS";
    const FILE = "picks.json";

    if (request.method !== "POST") {
      return json({ ok: true, message: "UK SHARE PICKS updater is running" });
    }

    const suppliedSecret = request.headers.get("X-Update-Secret");
    if (!suppliedSecret || suppliedSecret !== env.UPDATE_SECRET) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    let newData;
    try {
      newData = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
    const headers = {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "UK-Share-Picks-Updater"
    };

    const current = await fetch(apiUrl, { headers });
    if (!current.ok) {
      return json({ ok: false, stage: "read", githubStatus: current.status,
        error: await current.text() }, 502);
    }

    const currentFile = await current.json();
    const content = bytesToBase64(
      new TextEncoder().encode(JSON.stringify(newData, null, 2))
    );

    const update = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Automated UK share picks update",
        content,
        sha: currentFile.sha
      })
    });

    if (!update.ok) {
      return json({ ok: false, stage: "write", githubStatus: update.status,
        error: await update.text() }, 502);
    }

    const result = await update.json();
    return json({
      ok: true,
      message: "picks.json updated successfully",
      commit: result.commit?.sha || null
    });
  }
};

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
