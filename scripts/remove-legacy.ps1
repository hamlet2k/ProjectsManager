<#
.SYNOPSIS
  Deletes the old Flask app after Supabase migration is verified.

.DESCRIPTION
  Removes legacy-flask/ and temporary migration artifacts.
  Run this ONLY after:
    1. Data imported into Supabase
    2. Family can log into the new app
    3. You no longer need the Flask codebase for reference

.EXAMPLE
  .\scripts\remove-legacy.ps1 -WhatIf
  .\scripts\remove-legacy.ps1 -Confirm
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$targets = @(
  "legacy-flask",
  "scripts\migrate-from-flask\export",
  ".pytest_cache"
)

Write-Host "Workspace: $root"
Write-Host "Will remove:"
foreach ($t in $targets) {
  $full = Join-Path $root $t
  $exists = Test-Path $full
  Write-Host ("  [{0}] {1}" -f ($(if ($exists) { "exists" } else { "missing" }), $t))
}

Write-Host ""
Write-Host "After this, the repo should only contain the modern stack:"
Write-Host "  web/  supabase/  scripts/  docs/  README.md  LICENSE"

if (-not $Force -and -not $WhatIfPreference) {
  $answer = Read-Host "Type DELETE LEGACY to permanently remove the Flask app"
  if ($answer -ne "DELETE LEGACY") {
    Write-Host "Aborted."
    exit 1
  }
}

foreach ($t in $targets) {
  $full = Join-Path $root $t
  if (-not (Test-Path $full)) { continue }
  if ($PSCmdlet.ShouldProcess($full, "Remove")) {
    Remove-Item -LiteralPath $full -Recurse -Force
    Write-Host "Removed $t"
  }
}

# Optional: drop export helpers if you want zero migration tooling left
# (kept by default so you can re-import if needed)

Write-Host ""
Write-Host "Done. Remaining top-level:"
Get-ChildItem $root -Name | Where-Object { $_ -notmatch '^\.' }
Write-Host ""
Write-Host "Tip: commit this cleanup so the remote matches the clean tree."
