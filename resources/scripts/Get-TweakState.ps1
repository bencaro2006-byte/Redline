#Requires -Version 5.1
# Get-TweakState.ps1 -- READ-ONLY. Reports the current state of catalog actions.
#   in:  {"items":[{"key":"<tweak>#<n>","action":<TweakAction>}]}
#   out: {"ok":true,"data":{"results":[{"key":"...","snapshot":<Snapshot>} | {"key":"...","error":"..."}]}}
# One failing item never fails the whole run. Diagnostics go to stderr only.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

$MaxItems = 2000

try {
  $request = Read-Request
  $items = @(Get-Prop $request 'items' @())
  if ($items.Count -gt $MaxItems) { throw "Too many items ($($items.Count))" }

  $results = New-Object System.Collections.Generic.List[object]
  foreach ($item in $items) {
    $key = Get-Prop $item 'key'
    if (-not ($key -is [string]) -or $key.Length -lt 1 -or $key.Length -gt 200) { throw 'Invalid item key' }
    try {
      $snapshot = Get-ActionSnapshot (Get-Prop $item 'action')
      $results.Add(@{ key = $key; snapshot = $snapshot })
    } catch {
      $results.Add(@{ key = $key; error = $_.Exception.Message })
    }
  }

  Write-Result @{ ok = $true; data = @{ results = $results.ToArray() } }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
