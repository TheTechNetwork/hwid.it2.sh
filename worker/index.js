// Cloudflare Worker for hwid.it2.sh
//
// Serves the Intune HWID App Registration script from the Scripts-Public repo,
// injecting the MSP name taken from the URL path so it can be run in one line:
//
//   irm https://hwid.it2.sh/TheTechNetwork | iex
//
// The first path segment becomes $MspName. With no path the raw script is
// served unchanged (it then requires $MspName to be defined manually):
//
//   $MspName = "TheTechNetwork"; irm https://hwid.it2.sh | iex

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

// PowerShell 7 guard, prepended to the served script.
//
// The HWID script drives the Microsoft.Graph PowerShell SDK, which is unreliable
// on Windows PowerShell 5.1 (assembly-load conflicts, Connect-MgGraph failures).
// Since `irm` is a 5.1 alias, the one-liner lands in 5.1 by default — so detect
// that and relaunch the SAME one-liner under pwsh 7, or tell the user how to get
// it. `return` stops the 5.1 host before it reaches the SDK code that would fail.
//
// `segment` is the already-validated, URL-encoded path piece, so it can be dropped
// straight back into the relaunch URL. It only ever comes from MSP_PATTERN, so
// there is no script-injection surface.
function versionGuard(segment) {
  const relaunchAuto = segment
    ? `    pwsh -NoProfile -ExecutionPolicy Bypass -Command 'irm hwid.it2.sh/${segment} | iex'\n    return`
    : `    Write-Warning 'Re-run under PowerShell 7 with your MSP name, e.g.:  pwsh -NoProfile -Command "$MspName=''YourMSP''; irm hwid.it2.sh | iex"'`;
  const manualCmd = segment
    ? `pwsh -c "irm hwid.it2.sh/${segment} | iex"`
    : `pwsh -c "$MspName='YourMSP'; irm hwid.it2.sh | iex"`;
  return [
    `if ($PSVersionTable.PSVersion.Major -lt 7) {`,
    `  Write-Host ''`,
    `  if (Get-Command pwsh -ErrorAction SilentlyContinue) {`,
    `    Write-Host 'This tool needs PowerShell 7 — relaunching under pwsh...' -ForegroundColor Cyan`,
    relaunchAuto,
    `  } else {`,
    `    Write-Warning 'This tool requires PowerShell 7+ (the Microsoft.Graph SDK is unreliable on Windows PowerShell 5.1).'`,
    `    Write-Host 'Install it once:  winget install --id Microsoft.PowerShell -e' -ForegroundColor Yellow`,
    `    Write-Host 'Then run:         ${manualCmd}' -ForegroundColor Yellow`,
    `  }`,
    `  return`,
    `}`,
    ``,
  ].join("\n");
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

    // Prepend the PS7 guard so a 5.1 host relaunches under pwsh before it ever
    // reaches the Microsoft.Graph SDK calls that fail on 5.1.
    body = versionGuard(segment) + body;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Source": "hwid.it2.sh",
        "X-Msp-Name": mspName || "(none)",
        "X-Requires": "PowerShell-7",
      },
    });
  },
};
