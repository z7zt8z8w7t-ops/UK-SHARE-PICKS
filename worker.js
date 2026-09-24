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
          "content-type": "application/json; charset=UTF-8",
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

    // Simple browser health check.
    if (request.method === "GET") {
      return json({
        ok: true,
        message: "UK SHARE PICKS updater is running",
        updateSecretConfigured: !!env.UPDATE_SECRET,
        githubTokenConfigured: !!env.GITHUB_TOKEN
      });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    // Protect the update endpoint.
    const suppliedSecret = request.headers.get("X-Update-Secret");
    if (!env.UPDATE_SECRET || !suppliedSecret ||
        suppliedSecret !== env.UPDATE_SECRET) {
      return json({ ok: false, stage: "auth", error: "Unauthorized" }, 401);
    }

    if (!env.GITHUB_TOKEN) {
      return json({
        ok: false,
        stage: "config",
        error: "GITHUB_TOKEN is not configured"
      }, 500);
    }

    let newData;
    try {
      newData = await request.json();
    } catch (error) {
      return json({
        ok: false,
        stage: "request-json",
        error: "Invalid JSON request body",
        detail: String(error)
      }, 400);
    }

    try {
      // Read the existing file to obtain its SHA.
      const current = await fetch(`${apiUrl}?ref=${BRANCH}`, {
        headers: githubHeaders
      });

      const currentText = await current.text();
      let currentFile = null;
      try {
        currentFile = JSON.parse(currentText);
      } catch {}

      if (!current.ok) {
        return json({
          ok: false,
          stage: "github-read",
          githubStatus: current.status,
          githubReply: currentFile ?? currentText
        }, 502);
      }

      if (!currentFile?.sha) {
        return json({
          ok: false,
          stage: "github-read",
          error: "GitHub response did not contain the current file SHA",
          githubReply: currentFile ?? currentText
        }, 502);
      }

      // UTF-8-safe Base64 encoding.
      const encoded = btoa(
        String.fromCharCode(
          ...new TextEncoder().encode(JSON.stringify(newData, null, 2) + "\n")
        )
      );

      const update = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          ...githubHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "Automated UK share picks update",
          content: encoded,
          sha: currentFile.sha,
          branch: BRANCH
        })
      });

      const updateText = await update.text();
      let githubReply = null;
      try {
        githubReply = JSON.parse(updateText);
      } catch {
        githubReply = updateText;
      }

      if (!update.ok) {
        return json({
          ok: false,
          stage: "github-write",
          githubStatus: update.status,
          githubReply
        }, 502);
      }

      return json({
        ok: true,
        message: "picks.json updated successfully",
        githubStatus: update.status,
        commitSha: githubReply?.commit?.sha ?? null
      });
    } catch (error) {
      return json({
        ok: false,
        stage: "worker-exception",
        error: String(error)
      }, 500);
    }
  }
};
