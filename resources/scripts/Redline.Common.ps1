#Requires -Version 5.1
# Redline.Common.ps1 -- helpers dot-sourced by the Redline scripts. Defines functions only;
# it never reads stdin or writes stdout by itself.
#
# Action shapes mirror src/shared/catalog.ts. Snapshots mirror the Snapshot type in
# src/shared/types.ts. Every input is re-validated here (defence in depth): main already
# validated it, but these scripts run elevated.
Set-StrictMode -Version Latest

$script:UltimateBaseGuid = 'e9a42b02-d5df-448d-aa00-03f14749eb61'
$script:BalancedGuid = '381b4222-f694-41f0-9685-ff5bb260df2e'
$script:RedlineSchemeName = 'Redline Ultimate Performance'
$script:GuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
$script:PowerCfgExe = Join-Path $env:SystemRoot 'System32\powercfg.exe'
$script:ScExe = Join-Path $env:SystemRoot 'System32\sc.exe'
$script:TaskService = $null
$script:ActiveSchemeCache = $null

# ---------------------------------------------------------------- protocol

function Write-Result([hashtable]$Result) {
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $Result -Depth 12 -Compress))
}

function Write-Diag([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

function Read-Request {
  # Strip a leading BOM (U+FEFF, or its OEM-decoded bytes) that some callers prepend.
  $raw = ([Console]::In.ReadToEnd()) -replace '^(﻿|ï»¿|[^\{\[]{1,3}(?=[\{\[]))', ''
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

# StrictMode-safe property read on objects from ConvertFrom-Json.
function Get-Prop($Object, [string]$Name, $Default = $null) {
  if ($null -eq $Object) { return $Default }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}

function Assert-Match($Value, [string]$Pattern, [string]$What) {
  if ($null -eq $Value -or -not ($Value -is [string]) -or $Value -notmatch $Pattern) { throw "Invalid $What" }
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-InnermostHResult($ErrorRecord) {
  $e = $ErrorRecord.Exception
  while ($null -ne $e.InnerException) { $e = $e.InnerException }
  return $e.HResult
}

# ---------------------------------------------------------------- registry

$script:RegKinds = @{
  'REG_DWORD'     = [Microsoft.Win32.RegistryValueKind]::DWord
  'REG_QWORD'     = [Microsoft.Win32.RegistryValueKind]::QWord
  'REG_SZ'        = [Microsoft.Win32.RegistryValueKind]::String
  'REG_EXPAND_SZ' = [Microsoft.Win32.RegistryValueKind]::ExpandString
  'REG_BINARY'    = [Microsoft.Win32.RegistryValueKind]::Binary
  'REG_MULTI_SZ'  = [Microsoft.Win32.RegistryValueKind]::MultiString
}

function Open-RegBase([string]$Hive) {
  switch ($Hive) {
    'HKLM' { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64) }
    'HKCU' { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64) }
    default { throw "Unsupported registry hive '$Hive'" }
  }
}

function Get-RegTarget($Action) {
  $hive = Get-Prop $Action 'hive'
  $path = Get-Prop $Action 'path'
  $name = Get-Prop $Action 'name' ''
  Assert-Match $hive '^(HKLM|HKCU)$' 'registry hive'
  Assert-Match $path '^[^\\/:*?"<>|][^:*?"<>|]{0,511}$' 'registry path'
  if (-not ($name -is [string]) -or $name.Length -gt 256) { throw 'Invalid registry value name' }
  return @{ hive = $hive; path = $path; name = $name }
}

function ConvertTo-RegTypeName($Kind) {
  switch ([string]$Kind) {
    'DWord' { return 'REG_DWORD' }
    'QWord' { return 'REG_QWORD' }
    'String' { return 'REG_SZ' }
    'ExpandString' { return 'REG_EXPAND_SZ' }
    'Binary' { return 'REG_BINARY' }
    'MultiString' { return 'REG_MULTI_SZ' }
    default { return $null }
  }
}

function ConvertFrom-RegValue($Kind, $Raw) {
  switch ([string]$Kind) {
    'DWord' { return [long][BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$Raw), 0) }
    'QWord' { return [BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$Raw), 0) }
    'Binary' { return ((@($Raw) | ForEach-Object { ([byte]$_).ToString('x2') }) -join '') }
    'MultiString' { return , ([string[]]@($Raw)) }
    default { return [string]$Raw }
  }
}

function ConvertTo-RegData([string]$TypeName, $Value) {
  switch ($TypeName) {
    'REG_DWORD' {
      $unsigned = [uint32][long]$Value
      return , ([BitConverter]::ToInt32([BitConverter]::GetBytes($unsigned), 0))
    }
    'REG_QWORD' {
      $unsigned = [uint64]$Value
      return , ([BitConverter]::ToInt64([BitConverter]::GetBytes($unsigned), 0))
    }
    'REG_SZ' { return , ([string]$Value) }
    'REG_EXPAND_SZ' { return , ([string]$Value) }
    'REG_BINARY' {
      $hex = [string]$Value
      if (($hex.Length % 2) -ne 0 -or $hex -notmatch '^[0-9a-fA-F]*$') { throw 'Invalid REG_BINARY hex string' }
      $bytes = New-Object byte[] ($hex.Length / 2)
      for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16) }
      return , $bytes
    }
    'REG_MULTI_SZ' { return , ([string[]]@($Value)) }
    default { throw "Unsupported registry value type '$TypeName'" }
  }
}

function Get-RegSnapshot($Action) {
  $t = Get-RegTarget $Action
  $absent = @{ kind = 'registry'; exists = $false; valueType = $null; value = $null }
  $base = Open-RegBase $t.hive
  try {
    $key = $base.OpenSubKey($t.path, $false)
    if ($null -eq $key) { return $absent }
    try {
      if (-not ($key.GetValueNames() -contains $t.name)) { return $absent }
      $kind = $key.GetValueKind($t.name)
      $typeName = ConvertTo-RegTypeName $kind
      if ($null -eq $typeName) { return @{ kind = 'registry'; exists = $true; valueType = $null; value = $null } }
      $raw = $key.GetValue($t.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      return @{ kind = 'registry'; exists = $true; valueType = $typeName; value = (ConvertFrom-RegValue $kind $raw) }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Test-RegSnapshotEquals($Snapshot, [string]$TypeName, $Value) {
  if (-not $Snapshot.exists -or $Snapshot.valueType -ne $TypeName) { return $false }
  switch ($TypeName) {
    'REG_DWORD' { return ([decimal]$Snapshot.value) -eq ([decimal]$Value) }
    'REG_QWORD' { return ([decimal]$Snapshot.value) -eq ([decimal]$Value) }
    'REG_BINARY' { return ([string]$Snapshot.value).ToLowerInvariant() -eq ([string]$Value).ToLowerInvariant() }
    'REG_MULTI_SZ' { return ((@($Snapshot.value) -join "`0") -ceq (@($Value) -join "`0")) }
    default { return ([string]$Snapshot.value) -ceq ([string]$Value) }
  }
}

function Set-RegValueData($Target, [string]$TypeName, $Value) {
  if (-not $script:RegKinds.ContainsKey($TypeName)) { throw "Unsupported registry value type '$TypeName'" }
  $data = ConvertTo-RegData $TypeName $Value
  $base = Open-RegBase $Target.hive
  try {
    $key = $base.CreateSubKey($Target.path, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree)
    if ($null -eq $key) { throw "Cannot open or create registry key $($Target.hive)\$($Target.path)" }
    try { $key.SetValue($Target.name, $data, $script:RegKinds[$TypeName]) } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Remove-RegValueData($Target) {
  $base = Open-RegBase $Target.hive
  try {
    $key = $base.OpenSubKey($Target.path, $true)
    if ($null -eq $key) { return }
    try {
      if ($key.GetValueNames() -contains $Target.name) { $key.DeleteValue($Target.name, $false) }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

# ---------------------------------------------------------------- services

$script:ScStartArg = @{ Disabled = 'disabled'; Manual = 'demand'; Automatic = 'auto'; AutomaticDelayed = 'delayed-auto' }

function Get-ServiceName($Action) {
  $name = Get-Prop $Action 'name'
  Assert-Match $name '^[A-Za-z0-9_.-]{1,256}$' 'service name'
  return $name
}

function Assert-StartType($Value) {
  Assert-Match $Value '^(Disabled|Manual|Automatic|AutomaticDelayed)$' 'service start type'
  return $Value
}

function Get-ServiceSnapshot($Action) {
  $name = Get-ServiceName $Action
  $absent = @{ kind = 'service'; exists = $false; startType = $null }
  $base = Open-RegBase 'HKLM'
  try {
    $key = $base.OpenSubKey("SYSTEM\CurrentControlSet\Services\$name", $false)
    if ($null -eq $key) { return $absent }
    try {
      $start = $key.GetValue('Start', $null)
      if ($null -eq $start) { return $absent }
      $delayed = [int]$key.GetValue('DelayedAutostart', 0)
      $type = switch ([int]$start) {
        2 { if ($delayed -eq 1) { 'AutomaticDelayed' } else { 'Automatic' } }
        3 { 'Manual' }
        4 { 'Disabled' }
        default { 'Automatic' }
      }
      return @{ kind = 'service'; exists = $true; startType = $type }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Invoke-ScConfig([string]$Name, [string]$StartArg) {
  $ErrorActionPreference = 'Continue' # see Invoke-PowerCfg: read the exit code instead of throwing on stderr
  $output = & $script:ScExe config $Name start= $StartArg 2>&1 | ForEach-Object { "$_" }
  return @{ code = $LASTEXITCODE; text = (@($output) -join ' ') }
}

function Set-ServiceStartType([string]$Name, [string]$StartType) {
  $result = Invoke-ScConfig $Name $script:ScStartArg[$StartType]
  if ($result.code -ne 0) { throw "sc.exe config $Name failed (exit $($result.code)): $($result.text)" }
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($null -eq $service) { return }
  if ($StartType -eq 'Disabled' -and $service.Status -eq 'Running') {
    # No -Force: never stop dependent services. If it refuses, the change applies at next restart.
    try { Stop-Service -Name $Name -ErrorAction Stop -WarningAction SilentlyContinue } catch { Write-Diag "Could not stop ${Name}: $($_.Exception.Message)" }
  }
}

function Start-ServiceIfAutomatic([string]$Name, [string]$StartType) {
  if ($StartType -ne 'Automatic' -and $StartType -ne 'AutomaticDelayed') { return }
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($null -ne $service -and $service.Status -eq 'Stopped') {
    try { Start-Service -Name $Name -ErrorAction Stop -WarningAction SilentlyContinue } catch { Write-Diag "Could not start ${Name}: $($_.Exception.Message)" }
  }
}

# ---------------------------------------------------------------- scheduled tasks

function Get-TaskService {
  if ($null -eq $script:TaskService) {
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $script:TaskService = $service
  }
  return $script:TaskService
}

function Get-RegisteredTask($Action) {
  $path = Get-Prop $Action 'path'
  Assert-Match $path '^\\[^/:*?"<>|]{1,511}$' 'task path'
  $index = $path.LastIndexOf('\')
  $folder = if ($index -le 0) { '\' } else { $path.Substring(0, $index) }
  $name = $path.Substring($index + 1)
  try {
    return (Get-TaskService).GetFolder($folder).GetTask($name)
  } catch {
    $hresult = Get-InnermostHResult $_
    # 0x80070002 file not found, 0x80070003 path not found: the task does not exist here.
    if ($hresult -eq -2147024894 -or $hresult -eq -2147024893) { return $null }
    throw
  }
}

function Get-TaskSnapshot($Action) {
  $task = Get-RegisteredTask $Action
  if ($null -eq $task) { return @{ kind = 'scheduledTask'; exists = $false; enabled = $null } }
  return @{ kind = 'scheduledTask'; exists = $true; enabled = [bool]$task.Enabled }
}

# ---------------------------------------------------------------- power plans

function Invoke-PowerCfg([string[]]$Arguments) {
  # With 'Stop', PS 5.1 turns a native command's redirected stderr into a terminating
  # NativeCommandError, so failures never reach the exit-code checks. Scoped to this function.
  $ErrorActionPreference = 'Continue'
  $output = & $script:PowerCfgExe @Arguments 2>&1 | ForEach-Object { "$_" }
  return @{ code = $LASTEXITCODE; text = (@($output) -join "`n") }
}

function Get-ActiveScheme {
  if ($null -ne $script:ActiveSchemeCache) { return $script:ActiveSchemeCache }
  $result = Invoke-PowerCfg @('/getactivescheme')
  if ($result.code -ne 0) { throw "powercfg /getactivescheme failed (exit $($result.code))" }
  if ($result.text -notmatch '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s*\((.*)\)') {
    throw 'Cannot parse the active power scheme'
  }
  $script:ActiveSchemeCache = @{ guid = $Matches[1].ToLowerInvariant(); name = $Matches[2].Trim() }
  return $script:ActiveSchemeCache
}

function Clear-ActiveSchemeCache { $script:ActiveSchemeCache = $null }

function Get-PowerSchemes {
  $result = Invoke-PowerCfg @('/list')
  if ($result.code -ne 0) { throw "powercfg /list failed (exit $($result.code))" }
  $schemes = New-Object System.Collections.Generic.List[object]
  foreach ($line in ($result.text -split "`n")) {
    if ($line -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s*\((.*?)\)') {
      $schemes.Add(@{ guid = $Matches[1].ToLowerInvariant(); name = $Matches[2].Trim() })
    }
  }
  return , $schemes.ToArray()
}

function Test-IsUltimateScheme([string]$Guid, [string]$Name) {
  return ($Guid -eq $script:UltimateBaseGuid) -or ($Name -match 'Ultimate Performance')
}

function Get-PowerCfgTarget($Action) {
  $subgroup = Get-Prop $Action 'subgroup'
  $setting = Get-Prop $Action 'setting'
  Assert-Match $subgroup $script:GuidPattern 'power subgroup GUID'
  Assert-Match $setting $script:GuidPattern 'power setting GUID'
  return @{ subgroup = $subgroup; setting = $setting }
}

# powercfg /qh prints the setting's metadata and then "Current AC ... 0x..." and "Current DC ... 0x..."
# as the last two hex numbers. Their labels are localized; the hex values are not.
function Get-PowerValues([string]$Scheme, [string]$Subgroup, [string]$Setting) {
  $result = Invoke-PowerCfg @('/qh', $Scheme, $Subgroup, $Setting)
  if ($result.code -ne 0) { return $null }
  $hex = [regex]::Matches($result.text, '0x([0-9a-fA-F]{1,8})')
  if ($hex.Count -lt 2) { return $null }
  return @{
    ac = [Convert]::ToInt64($hex[$hex.Count - 2].Groups[1].Value, 16)
    dc = [Convert]::ToInt64($hex[$hex.Count - 1].Groups[1].Value, 16)
  }
}

function Get-PowerCfgSnapshot($Action) {
  $t = Get-PowerCfgTarget $Action
  $scheme = (Get-ActiveScheme).guid
  $values = Get-PowerValues $scheme $t.subgroup $t.setting
  if ($null -eq $values) { return @{ kind = 'powercfg'; exists = $false; ac = $null; dc = $null; schemeGuid = $scheme } }
  return @{ kind = 'powercfg'; exists = $true; ac = $values.ac; dc = $values.dc; schemeGuid = $scheme }
}

function Set-PowerValues([string]$Scheme, $Target, $Ac, $Dc) {
  $ac = Invoke-PowerCfg @('/setacvalueindex', $Scheme, $Target.subgroup, $Target.setting, [string][long]$Ac)
  if ($ac.code -ne 0) { throw "powercfg /setacvalueindex failed (exit $($ac.code)): $($ac.text)" }
  if ($null -ne $Dc) {
    $dc = Invoke-PowerCfg @('/setdcvalueindex', $Scheme, $Target.subgroup, $Target.setting, [string][long]$Dc)
    if ($dc.code -ne 0) { throw "powercfg /setdcvalueindex failed (exit $($dc.code)): $($dc.text)" }
  }
  # Re-apply the active scheme so changes to it take effect now.
  $active = Invoke-PowerCfg @('/setactive', 'SCHEME_CURRENT')
  if ($active.code -ne 0) { throw "powercfg /setactive failed (exit $($active.code))" }
}

function Get-PowerSchemeSnapshot {
  $active = Get-ActiveScheme
  return @{ kind = 'powerScheme'; activeGuid = $active.guid; activeName = $active.name; isUltimate = (Test-IsUltimateScheme $active.guid $active.name) }
}

function Set-ActiveScheme([string]$Guid) {
  Assert-Match $Guid $script:GuidPattern 'power scheme GUID'
  $result = Invoke-PowerCfg @('/setactive', $Guid)
  if ($result.code -ne 0) { throw "powercfg /setactive $Guid failed (exit $($result.code))" }
  Clear-ActiveSchemeCache
}

# ---------------------------------------------------------------- catalog commands

# Runs a FIXED string from the bundled catalog (never user input). Write-Host output is
# discarded (6>$null) so it cannot break the one-line stdout protocol.
function Invoke-CatalogScript([string]$Code) {
  if ([string]::IsNullOrWhiteSpace($Code) -or $Code.Length -gt 4000) { throw 'Invalid catalog command' }
  # Catalog commands are written for a default PowerShell session (e.g. they probe optional
  # registry properties), so run them without this script's StrictMode. Scoped to this call.
  Set-StrictMode -Off
  $block = [scriptblock]::Create($Code)
  $global:LASTEXITCODE = 0
  $output = & $block 6>$null
  if ($LASTEXITCODE -ne 0) { throw "Command exited with code $LASTEXITCODE" }
  return , @($output)
}

function ConvertTo-DetectResult($Value) {
  if ($null -eq $Value) { return $false }
  if ($Value -is [bool]) { return $Value }
  if ($Value -is [string]) { return $Value.Trim() -ieq 'True' }
  return [bool]$Value
}

function Get-CommandSnapshot($Action) {
  $detect = Get-Prop $Action 'detect'
  $output = Invoke-CatalogScript $detect
  if ($output.Count -eq 0) { return @{ kind = 'command'; detected = $false } }
  return @{ kind = 'command'; detected = (ConvertTo-DetectResult $output[$output.Count - 1]) }
}

# ---------------------------------------------------------------- dispatch

function Get-ActionSnapshot($Action) {
  $type = Get-Prop $Action 'type'
  switch ($type) {
    'registry' { return Get-RegSnapshot $Action }
    'service' { return Get-ServiceSnapshot $Action }
    'scheduledTask' { return Get-TaskSnapshot $Action }
    'powercfg' { return Get-PowerCfgSnapshot $Action }
    'powerScheme' { return Get-PowerSchemeSnapshot }
    'command' { return Get-CommandSnapshot $Action }
    default { throw "Unsupported action type '$type'" }
  }
}
