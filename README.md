# hwid.it2.sh

A Cloudflare Worker that serves the Intune Autopilot **HWID app-registration**
script with the MSP name supplied straight from the URL — replacing the old
`bit.ly` redirect.

## Usage

Put the MSP name in the path and the script is configured for you:

```powershell
irm https://hwid.it2.sh/SalientMSP | iex
```

Any MSP name works — it is injected as the `$MspName` variable:

```powershell
irm https://hwid.it2.sh/MSP1 | iex
```

You can still call it without a path and set the variable yourself:

```powershell
$MspName = "SalientMSP"; irm https://hwid.it2.sh | iex
```

## How it works

- The Worker takes the first path segment (e.g. `/SalientMSP`) and prepends
  `$MspName = '...'` to the script before serving it, so `irm | iex` runs ready
  to go.
- The script itself is fetched live from its canonical home,
  [`Scripts-Public/EndpointManager/Enrollment/Generate-AppRegistrationHWID.ps1`](https://github.com/TheTechNetwork/Scripts-Public/blob/main/EndpointManager/Enrollment/Generate-AppRegistrationHWID.ps1),
  so updates there are reflected automatically — there is no copy to keep in sync.
- MSP names are validated (`A-Z a-z 0-9 . _ - space`, max 64 chars) so nothing
  arbitrary can be injected into the served PowerShell.

## Deploy

Requires a `CLOUDFLARE_API_TOKEN` with Workers edit access on the
**Bit By Bit Consulting** account (`c6452865d04ed5bd485084005c60cb02`).

```bash
CLOUDFLARE_ACCOUNT_ID=c6452865d04ed5bd485084005c60cb02 npx wrangler deploy
```
