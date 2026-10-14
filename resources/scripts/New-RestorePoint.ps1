#Requires -Version 5.1
# New-RestorePoint.ps1 -- creates a System Restore point (Windows PowerShell 5.1 only; needs admin).
#   in:  {"description":"Redline Optimizer"}
#   out: {"ok":true,"data":{"created":bool,"skippedRecent":bool,"latestCreatedAt":"ISO"|null,"warning":"..."}}
# Windows silently skips creation when any restore point is younger than 24 hours; that case is
# detected by comparing sequence numbers and reported as skippedRecent instead of an error.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

function Get-LatestRestorePoint {
  return Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
}

try {
  if (-not (Test-IsAdmin)) {
    Write-Result @{ ok = $false; error = @{ code = 'NOT_ELEVATED'; message = 'Creating a restore point needs administrator rights.' } }
    exit 1
  }
  $request = Read-Request
  $description = [string](Get-Prop $request 'description' '')
  if ($description.Length -lt 1 -or $description.Length -gt 60 -or $description -notmatch '^[\p{L}\p{N} ._()-]+$') { throw 'Invalid restore point description' }

  $before = Get-LatestRestorePoint
  $warnings = $null
  try {
    Checkpoint-Computer -Description $description -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue -WarningVariable warnings
  } catch {
    $message = $_.Exception.Message
    if ($message -match 'disabled|0x80070422|service cannot be started') {
      Write-Result @{ ok = $false; error = @{ code = 'SYSTEM_PROTECTION_DISABLED'; message = 'System Protection is turned off for the system drive, so Windows cannot create restore points.' } }
      exit 1
    }
    throw
  }
  $after = Get-LatestRestorePoint

  $created = ($null -ne $after) -and (($null -eq $before) -or ($after.SequenceNumber -gt $before.SequenceNumber))
  $latestAt = if ($null -ne $after) { [Management.ManagementDateTimeConverter]::ToDateTime($after.CreationTime).ToUniversalTime().ToString('o') } else { $null }
  $warningText = (@($warnings) | ForEach-Object { "$_" }) -join ' '

  Write-Result @{ ok = $true; data = @{
      created         = [bool]$created
      skippedRecent   = (-not $created) -and ($null -ne $after)
      latestCreatedAt = $latestAt
      warning         = $warningText
    }
  }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
