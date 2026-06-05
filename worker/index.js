// Cloudflare Worker for hwid.it2.sh
//
// Serves the Intune HWID App Registration script from the Scripts-Public repo,
// injecting the MSP name taken from the URL path so it can be run in one line:
//
//   irm https://hwid.it2.sh/SalientMSP | iex
//
// The first path segment becomes $MspName. With no path the raw script is
// served unchanged (it then requires $MspName to be defined manually):
//
//   $MspName = "SalientMSP"; irm https://hwid.it2.sh | iex

// Single source of truth: the canonical script in TheTechNetwork/Scripts-Public.
const SCRIPT_URL =
  "https://raw.githubusercontent.com/TheTechNetwork/Scripts-Public/main/EndpointManager/Enrollment/Generate-AppRegistrationHWID.ps1";

// MSP names are alphanumeric with a few safe separators. Anything else is
// rejected so it can never inject arbitrary PowerShell into the served script.
const MSP_PATTERN = /^[A-Za-z0-9 ._-]{1,64}$/;

async function fetchScript() {
  const res = await fetch(SCRIPT_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) {
    throw new Error(`Failed to fetch script (${res.status})`);
  }
  return res.text();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // Ignore browser noise
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    // First path segment → MSP name (URL-decoded)
    const segment = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "").split("/")[0];
    const mspName = segment ? decodeURIComponent(segment) : "";

    if (mspName && !MSP_PATTERN.test(mspName)) {
      return new Response(
        `Invalid MSP name: "${mspName}". Use letters, numbers, spaces, '.', '_' or '-'.\n`,
        { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    let script;
    try {
      script = await fetchScript();
    } catch (err) {
      return new Response(`${err.message}\n`, { status: 502 });
    }

    // Inject $MspName when one was supplied in the path. PowerShell single-quoted
    // strings escape a quote by doubling it; the pattern already blocks quotes.
    let body = script;
    if (mspName) {
      const safe = mspName.replace(/'/g, "''");
      body = `$MspName = '${safe}'\n${script}`;
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Source": "hwid.it2.sh",
        "X-Msp-Name": mspName || "(none)",
      },
    });
  },
};
