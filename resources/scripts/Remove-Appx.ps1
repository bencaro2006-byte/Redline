#Requires -Version 5.1
# Remove-Appx.ps1 -- removes preinstalled Store apps for every user and deprovisions them so
# new accounts don't get them. Removed apps can be reinstalled from the Microsoft Store.
#   in:  {"dryRun":bool,"packages":["Microsoft.BingWeather", ...]}   (exact names, no wildcards)
#   out: {"ok":true,"data":{"results":[{"package":"...","ok":bool,"removed":bool,"error"?:"..."}]}}
# dryRun:true (also the default) only reports what would be removed.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

try {
  $request = Read-Request
  $dryRunValue = Get-Prop $request 'dryRun' $true
  if (-not ($dryRunValue -is [bool])) { throw 'dryRun must be a boolean' }
  $dryRun = [bool]$dryRunValue
  if (-not $dryRun -and -not (Test-IsAdmin)) {
    Write-Result @{ ok = $false; error = @{ code = 'NOT_ELEVATED'; message = 'Removing apps needs administrator rights.' } }
    exit 1
  }

  $packages = @(Get-Prop $request 'packages' @())
  if ($packages.Count -gt 100) { throw 'Too many packages' }
  foreach ($name in $packages) { Assert-Match $name '^[A-Za-z0-9.-]{3,128}$' 'package name' }

  # @(...) around the if: assigning an if-statement's output unrolls arrays, so keep it an array.
  $provisioned = @(if (-not $dryRun) { Get-AppxProvisionedPackage -Online })
  $isAdmin = Test-IsAdmin
  $results = New-Object System.Collections.Generic.List[object]
  foreach ($name in $packages) {
    try {
      $installed = @(if ($isAdmin) { Get-AppxPackage -AllUsers -Name $name } else { Get-AppxPackage -Name $name })
      if ($installed.Count -eq 0) {
        $results.Add(@{ package = $name; ok = $true; removed = $false })
        continue
      }
      if (-not $dryRun) {
        foreach ($pkg in $installed) { Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop }
        foreach ($prov in @($provisioned | Where-Object { $_.DisplayName -eq $name })) {
          Remove-AppxProvisionedPackage -Online -PackageName $prov.PackageName -ErrorAction Stop | Out-Null
        }
      }
      $results.Add(@{ package = $name; ok = $true; removed = $true })
    } catch {
      $results.Add(@{ package = $name; ok = $false; removed = $false; error = $_.Exception.Message })
    }
  }

  Write-Result @{ ok = $true; data = @{ results = $results.ToArray() } }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
