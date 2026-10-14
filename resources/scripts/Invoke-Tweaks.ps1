#Requires -Version 5.1
# Invoke-Tweaks.ps1 -- drives catalog actions to their target ('set') or back to a snapshot ('restore').
#   in:  {"dryRun":bool,"items":[{"key":"...","op":"set"|"restore","action":<TweakAction>,"restore":<Snapshot>?}]}
#   out: {"ok":true,"data":{"results":[{"key":"...","ok":bool,"changed":bool,"error"?:"...","createdGuid"?:"..."}]}}
# dryRun:true (also the default when the field is missing) reads state and reports what WOULD change,
# writing nothing. Each item is isolated: one failure never stops the rest.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

$MaxItems = 2000

function Invoke-RegistryItem($Action, [string]$Op, $Restore, [bool]$DryRun) {
  $target = Get-RegTarget $Action
  $current = Get-RegSnapshot $Action
  if ($Op -eq 'set') {
    $type = Get-Prop $Action 'valueType'
    $value = Get-Prop $Action 'value'
  } else {
    if (-not (Get-Prop $Restore 'exists' $false)) {
      if (-not $current.exists) { return @{ changed = $false } }
      if (-not $DryRun) { Remove-RegValueData $target }
      return @{ changed = $true }
    }
    $type = Get-Prop $Restore 'valueType'
    $value = Get-Prop $Restore 'value'
    if ($null -eq $type) { throw 'The saved snapshot has an unsupported value type, so it cannot be restored' }
  }
  if (Test-RegSnapshotEquals $current $type $value) { return @{ changed = $false } }
  if (-not $DryRun) { Set-RegValueData $target $type $value }
  return @{ changed = $true }
}

function Invoke-ServiceItem($Action, [string]$Op, $Restore, [bool]$DryRun) {
  $name = Get-ServiceName $Action
  $current = Get-ServiceSnapshot $Action
  if (-not $current.exists) { return @{ changed = $false } } # not installed here: nothing to do
  if ($Op -eq 'set') {
    $target = Assert-StartType (Get-Prop $Action 'startType')
  } else {
    if (-not (Get-Prop $Restore 'exists' $false)) { return @{ changed = $false } }
    $target = Assert-StartType (Get-Prop $Restore 'startType')
  }
  if ($current.startType -eq $target) { return @{ changed = $false } }
  if (-not $DryRun) {
    Set-ServiceStartType $name $target
    if ($Op -eq 'restore') { Start-ServiceIfAutomatic $name $target }
  }
  return @{ changed = $true }
}

function Invoke-TaskItem($Action, [string]$Op, $Restore, [bool]$DryRun) {
  $task = Get-RegisteredTask $Action
  if ($null -eq $task) { return @{ changed = $false } } # not present here: nothing to do
  if ($Op -eq 'set') {
    $target = [bool](Get-Prop $Action 'enabled')
  } else {
    if (-not (Get-Prop $Restore 'exists' $false)) { return @{ changed = $false } }
    $saved = Get-Prop $Restore 'enabled'
    if ($null -eq $saved) { return @{ changed = $false } }
    $target = [bool]$saved
  }
  if ([bool]$task.Enabled -eq $target) { return @{ changed = $false } }
  if (-not $DryRun) { $task.Enabled = $target }
  return @{ changed = $true }
}

function Invoke-PowerCfgItem($Action, [string]$Op, $Restore, [bool]$DryRun) {
  $target = Get-PowerCfgTarget $Action
  if ($Op -eq 'set') {
    $scheme = (Get-ActiveScheme).guid
    $ac = Get-Prop $Action 'ac'
    $dc = Get-Prop $Action 'dc'
  } else {
    if (-not (Get-Prop $Restore 'exists' $false)) { return @{ changed = $false } }
    $scheme = Get-Prop $Restore 'schemeGuid'
    if ($scheme -eq 'SCHEME_CURRENT') { $scheme = (Get-ActiveScheme).guid } else { Assert-Match $scheme $script:GuidPattern 'power scheme GUID' }
    $ac = Get-Prop $Restore 'ac'
    $dc = Get-Prop $Restore 'dc'
    if ($null -eq $ac) { return @{ changed = $false } }
  }
  $current = Get-PowerValues $scheme $target.subgroup $target.setting
  if ($null -eq $current) {
    if ($Op -eq 'restore') { return @{ changed = $false } } # the saved plan no longer exists
    throw 'This power setting does not exist in the active power plan'
  }
  $same = ([long]$current.ac -eq [long]$ac) -and (($null -eq $dc) -or ([long]$current.dc -eq [long]$dc))
  if ($same) { return @{ changed = $false } }
  if (-not $DryRun) { Set-PowerValues $scheme $target $ac $dc }
  return @{ changed = $true }
}

function Invoke-PowerSchemeItem($Action, [string]$Op, $Restore, [bool]$DryRun) {
  Assert-Match (Get-Prop $Action 'scheme') '^ultimate$' 'power scheme'
  $active = Get-ActiveScheme
  $schemes = Get-PowerSchemes

  if ($Op -eq 'set') {
    if (Test-IsUltimateScheme $active.guid $active.name) { return @{ changed = $false } }
    if ($DryRun) { return @{ changed = $true } }
    $existing = @($schemes | Where-Object { Test-IsUltimateScheme $_.guid $_.name })
    if ($existing.Count -gt 0) {
      Set-ActiveScheme $existing[0].guid
      return @{ changed = $true; createdGuid = $null }
    }
    $duplicate = Invoke-PowerCfg @('-duplicatescheme', $script:UltimateBaseGuid)
    if ($duplicate.code -ne 0 -or $duplicate.text -notmatch '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
      throw "Could not create the Ultimate Performance plan (exit $($duplicate.code)): $($duplicate.text)"
    }
    $created = $Matches[1].ToLowerInvariant()
    $rename = Invoke-PowerCfg @('-changename', $created, $script:RedlineSchemeName, 'Created by Redline Optimizer from the Ultimate Performance plan.')
    if ($rename.code -ne 0) { Write-Diag "Could not rename plan ${created}: $($rename.text)" }
    Set-ActiveScheme $created
    return @{ changed = $true; createdGuid = $created }
  }

  $targetGuid = Get-Prop $Restore 'activeGuid'
  Assert-Match $targetGuid $script:GuidPattern 'power scheme GUID'
  $targetGuid = $targetGuid.ToLowerInvariant()
  if (@($schemes | Where-Object { $_.guid -eq $targetGuid }).Count -eq 0) { $targetGuid = $script:BalancedGuid }
  $changed = $active.guid -ne $targetGuid
  if ($changed -and -not $DryRun) { Set-ActiveScheme $targetGuid }

  $created = Get-Prop $Restore 'createdGuid'
  if ($created -is [string] -and $created -match $script:GuidPattern) {
    $created = $created.ToLowerInvariant()
    $stillThere = @($schemes | Where-Object { $_.guid -eq $created }).Count -gt 0
    if ($stillThere -and $created -ne $targetGuid) {
      $changed = $true
      if (-not $DryRun) {
        $delete = Invoke-PowerCfg @('-delete', $created)
        if ($delete.code -ne 0) { Write-Diag "Could not delete plan ${created}: $($delete.text)" }
      }
    }
  }
  return @{ changed = $changed }
}

function Invoke-CommandItem($Action, [string]$Op, $Restore, [bool]$DryRun) {
  $current = (Get-CommandSnapshot $Action).detected
  if ($Op -eq 'set') {
    $want = $true
  } else {
    $saved = Get-Prop $Restore 'detected'
    $want = if ($null -eq $saved) { $false } else { [bool]$saved }
  }
  if ($current -eq $want) { return @{ changed = $false } }
  if (-not $DryRun) {
    $code = if ($want) { Get-Prop $Action 'apply' } else { Get-Prop $Action 'revert' }
    [void](Invoke-CatalogScript $code)
  }
  return @{ changed = $true }
}

function Invoke-Item($Action, [string]$Op, $Restore, [bool]$DryRun) {
  $type = Get-Prop $Action 'type'
  switch ($type) {
    'registry' { return Invoke-RegistryItem $Action $Op $Restore $DryRun }
    'service' { return Invoke-ServiceItem $Action $Op $Restore $DryRun }
    'scheduledTask' { return Invoke-TaskItem $Action $Op $Restore $DryRun }
    'powercfg' { return Invoke-PowerCfgItem $Action $Op $Restore $DryRun }
    'powerScheme' { return Invoke-PowerSchemeItem $Action $Op $Restore $DryRun }
    'command' { return Invoke-CommandItem $Action $Op $Restore $DryRun }
    default { throw "Unsupported action type '$type'" }
  }
}

try {
  $request = Read-Request
  $dryRunValue = Get-Prop $request 'dryRun' $true
  if (-not ($dryRunValue -is [bool])) { throw 'dryRun must be a boolean' }
  $dryRun = [bool]$dryRunValue
  if (-not $dryRun -and -not (Test-IsAdmin)) {
    Write-Result @{ ok = $false; error = @{ code = 'NOT_ELEVATED'; message = 'Applying changes needs administrator rights.' } }
    exit 1
  }

  $items = @(Get-Prop $request 'items' @())
  if ($items.Count -gt $MaxItems) { throw "Too many items ($($items.Count))" }

  $results = New-Object System.Collections.Generic.List[object]
  foreach ($item in $items) {
    $key = Get-Prop $item 'key'
    if (-not ($key -is [string]) -or $key.Length -lt 1 -or $key.Length -gt 200) { throw 'Invalid item key' }
    try {
      $op = Get-Prop $item 'op'
      Assert-Match $op '^(set|restore)$' 'operation'
      $restore = Get-Prop $item 'restore'
      if ($op -eq 'restore' -and $null -eq $restore) { throw 'Restore requested without a snapshot' }
      $outcome = Invoke-Item (Get-Prop $item 'action') $op $restore $dryRun
      $entry = @{ key = $key; ok = $true; changed = [bool]$outcome.changed }
      if ($outcome.ContainsKey('createdGuid')) { $entry.createdGuid = $outcome.createdGuid }
      $results.Add($entry)
    } catch {
      $results.Add(@{ key = $key; ok = $false; changed = $false; error = $_.Exception.Message })
    }
  }

  Write-Result @{ ok = $true; data = @{ results = $results.ToArray() } }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
