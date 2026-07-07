# hwid.it2.sh

A Cloudflare Worker that serves the Intune Autopilot **HWID app-registration**
script with the MSP name supplied straight from the URL — replacing the old
`bit.ly` redirect.

> **Requires PowerShell 7.** The script uses the Microsoft.Graph PowerShell SDK,
> which is unreliable on Windows PowerShell 5.1. `irm` is a 5.1 alias, so the
> served script now starts with a guard: on 5.1 it **relaunches itself under
> `pwsh`** (preserving the MSP name from the URL), or — if PowerShell 7 isn't
> installed — prints `winget install --id Microsoft.PowerShell -e` and the exact
> command to re-run. No action needed on your part beyond having pwsh 7 available.

## Usage

Put the MSP name in the path and the script is configured for you:

```powershell
irm https://hwid.it2.sh/TheTechNetwork | iex
```

Any MSP name works — it is injected as the `$MspName` variable:

```powershell
irm https://hwid.it2.sh/MSP1 | iex
```

You can still call it without a path and set the variable yourself:

```powershell
$MspName = "TheTechNetwork"; irm https://hwid.it2.sh | iex
```

## How it works

- The Worker takes the first path segment (e.g. `/TheTechNetwork`) and prepends
  `$MspName = '...'` to the script before serving it, so `irm | iex` runs ready
  to go.
- Ahead of that it prepends a **PowerShell 7 guard**: if the host is Windows
  PowerShell 5.1 it relaunches the same one-liner under `pwsh` (or explains how
  to install it) and stops, so the Graph SDK never runs on an unsupported host.
- The script itself is fetched live from its canonical home,
  [`Scripts-Public/EndpointManager/Enrollment/Generate-AppRegistrationHWID.ps1`](https://github.com/TheTechNetwork/Scripts-Public/blob/main/EndpointManager/Enrollment/Generate-AppRegistrationHWID.ps1),
  so updates there are reflected automatically — there is no copy to keep in sync.
- MSP names are validated (`A-Z a-z 0-9 . _ - space`, max 64 chars) so nothing
  arbitrary can be injected into the served PowerShell.
