export default {
  async fetch(request, env) {
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });

    // Browser health check
    if (request.method === "GET") {
      return json({
        ok: true,
        message: "UK SHARE PICKS updater is running",
        test: "POST diagnostic version",
        updateSecretConfigured: !!env.UPDATE_SECRET,
        githubTokenConfigured: !!env.GITHUB_TOKEN
      });
    }

    // Diagnostic POST: deliberately does NOT contact GitHub or update picks.json.
    if (request.method === "POST") {
      const suppliedSecret = request.headers.get("X-Update-Secret");

      if (!suppliedSecret || suppliedSecret !== env.UPDATE_SECRET) {
        return json({
          ok: false,
          stage: "authentication",
          error: "Unauthorized"
        }, 401);
      }

      let body = null;
      try {
        body = await request.json();
      } catch {
        body = { note: "POST received, but body was not valid JSON" };
      }

      return json({
        ok: true,
        stage: "post-received",
        message: "iPhone POST reached the Cloudflare Worker successfully",
        receivedBody: body
      });
    }

    return json({
      ok: false,
      error: "Method not allowed"
    }, 405);
  }
};
