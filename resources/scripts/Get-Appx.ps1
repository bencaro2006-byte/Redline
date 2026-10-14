#Requires -Version 5.1
# Get-Appx.ps1 -- READ-ONLY. Which of the given Store app packages are installed.
#   in:  {"packages":["Microsoft.BingWeather", ...]}
#   out: {"ok":true,"data":{"installed":["Microsoft.BingWeather", ...],"allUsers":bool}}
# Uses -AllUsers when elevated (what Remove-Appx.ps1 removes), else the current user.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

try {
  $request = Read-Request
  $packages = @(Get-Prop $request 'packages' @())
  if ($packages.Count -gt 200) { throw 'Too many packages' }
  foreach ($name in $packages) { Assert-Match $name '^[A-Za-z0-9.-]{3,128}$' 'package name' }

  $allUsers = Test-IsAdmin
  $present = @(if ($allUsers) { Get-AppxPackage -AllUsers } else { Get-AppxPackage })
  $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($p in $present) { [void]$names.Add([string]$p.Name) }

  $installed = New-Object System.Collections.Generic.List[string]
  foreach ($name in $packages) { if ($names.Contains($name)) { $installed.Add($name) } }

  Write-Result @{ ok = $true; data = @{ installed = $installed.ToArray(); allUsers = $allUsers } }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
