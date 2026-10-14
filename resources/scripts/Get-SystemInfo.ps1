#Requires -Version 5.1
# Get-SystemInfo.ps1 -- READ-ONLY hardware and Windows scan for the System Scan screen.
#   in:  {}
#   out: {"ok":true,"data":<SystemInfo>}   (shape: src/shared/types.ts)
# Every section is isolated: a failing query yields nulls / empty lists, never a failed scan.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

function Get-Section([string]$Name, [scriptblock]$Block, $Fallback) {
  try { return (& $Block) } catch { Write-Diag "scan section '$Name' failed: $($_.Exception.Message)"; return $Fallback }
}

function Get-RegDword([string]$Hive, [string]$Path, [string]$Name) {
  $snapshot = Get-RegSnapshot ([pscustomobject]@{ hive = $Hive; path = $Path; name = $Name })
  if (-not $snapshot.exists -or $snapshot.valueType -ne 'REG_DWORD') { return $null }
  return [long]$snapshot.value
}

function Get-RegString([string]$Hive, [string]$Path, [string]$Name) {
  $snapshot = Get-RegSnapshot ([pscustomobject]@{ hive = $Hive; path = $Path; name = $Name })
  if (-not $snapshot.exists -or $null -eq $snapshot.value) { return $null }
  return [string]$snapshot.value
}

# DriverVersion "32.0.15.8253" -> NVIDIA's public version "582.53" (last five digits).
function ConvertTo-NvidiaVersion([string]$DriverVersion) {
  $digits = ($DriverVersion -replace '[^0-9]', '')
  if ($digits.Length -lt 5) { return $null }
  $tail = $digits.Substring($digits.Length - 5)
  return '{0}.{1}' -f [int]$tail.Substring(0, 3), $tail.Substring(3)
}

function Get-GpuVram([string]$Name) {
  $class = 'SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
  $base = Open-RegBase 'HKLM'
  try {
    $root = $base.OpenSubKey($class, $false)
    if ($null -eq $root) { return $null }
    try {
      foreach ($sub in $root.GetSubKeyNames()) {
        if ($sub -notmatch '^\d{4}$') { continue }
        $key = $root.OpenSubKey($sub, $false)
        if ($null -eq $key) { continue }
        try {
          if ([string]$key.GetValue('DriverDesc', '') -ne $Name) { continue }
          $qw = $key.GetValue('HardwareInformation.qwMemorySize', $null)
          if ($null -ne $qw) { return [long]$qw }
          $dw = $key.GetValue('HardwareInformation.MemorySize', $null)
          if ($dw -is [byte[]]) { return [long][BitConverter]::ToUInt32($dw, 0) }
          if ($null -ne $dw) { return [long][BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$dw), 0) }
        } finally { $key.Dispose() }
      }
    } finally { $root.Dispose() }
  } finally { $base.Dispose() }
  return $null
}

try {
  $cpu = Get-Section 'cpu' {
    $p = @(Get-CimInstance Win32_Processor)[0]
    @{ name = ([string]$p.Name).Trim(); cores = [int]$p.NumberOfCores; threads = [int]$p.NumberOfLogicalProcessors; baseMHz = [int]$p.MaxClockSpeed; vendor = [string]$p.Manufacturer }
  } @{ name = 'Unknown CPU'; cores = 0; threads = 0; baseMHz = 0; vendor = '' }

  $videoControllers = Get-Section 'video' { @(Get-CimInstance Win32_VideoController) } @()

  $gpus = Get-Section 'gpus' {
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($vc in $videoControllers) {
      $name = ([string]$vc.Name).Trim()
      if ($name -match 'Basic Display|Remote Display|Mirage|Virtual') { continue }
      $driver = [string]$vc.DriverVersion
      $vram = Get-GpuVram $name
      if ($null -eq $vram -and $null -ne $vc.AdapterRAM) { $vram = [long][uint32]$vc.AdapterRAM }
      $list.Add(@{ name = $name; driverVersion = $driver; nvidiaDriver = $(if ($name -match 'NVIDIA') { ConvertTo-NvidiaVersion $driver } else { $null }); vramBytes = $vram })
    }
    , $list.ToArray()
  } @()

  $memory = Get-Section 'memory' {
    $modules = New-Object System.Collections.Generic.List[object]
    $total = [long]0
    foreach ($m in @(Get-CimInstance Win32_PhysicalMemory)) {
      $capacity = [long]$m.Capacity
      $total += $capacity
      $modules.Add(@{
          capacityBytes = $capacity
          speedMTs      = [int]$(if ($null -ne $m.Speed) { $m.Speed } else { 0 })
          configuredMTs = [int]$(if ($null -ne $m.ConfiguredClockSpeed) { $m.ConfiguredClockSpeed } else { 0 })
          manufacturer  = ([string]$m.Manufacturer).Trim()
          partNumber    = ([string]$m.PartNumber).Trim()
          slot          = ([string]$m.DeviceLocator).Trim()
        })
    }
    if ($total -eq 0) { $total = [long](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory }
    @{ totalBytes = $total; modules = $modules.ToArray() }
  } @{ totalBytes = 0; modules = @() }

  $systemDiskNumber = Get-Section 'systemDisk' { [int](Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':')) | Select-Object -First 1).DiskNumber } -1

  $disks = Get-Section 'disks' {
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($d in @(Get-PhysicalDisk)) {
      $list.Add(@{ model = ([string]$d.FriendlyName).Trim(); mediaType = [string]$d.MediaType; busType = [string]$d.BusType; sizeBytes = [long]$d.Size; isSystem = ([string]$d.DeviceId -eq [string]$systemDiskNumber) })
    }
    , $list.ToArray()
  } @()

  $volumes = Get-Section 'volumes' {
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($v in @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')) {
      $list.Add(@{ letter = [string]$v.DeviceID; sizeBytes = [long]$v.Size; freeBytes = [long]$v.FreeSpace })
    }
    , $list.ToArray()
  } @()

  $board = Get-Section 'board' { $b = Get-CimInstance Win32_BaseBoard; @{ manufacturer = ([string]$b.Manufacturer).Trim(); product = ([string]$b.Product).Trim() } } @{ manufacturer = ''; product = '' }

  $bios = Get-Section 'bios' {
    $b = Get-CimInstance Win32_BIOS
    @{ version = ([string]$b.SMBIOSBIOSVersion).Trim(); releaseDate = $(if ($null -ne $b.ReleaseDate) { ([datetime]$b.ReleaseDate).ToString('yyyy-MM-dd') } else { $null }) }
  } @{ version = ''; releaseDate = $null }

  $os = Get-Section 'os' {
    $o = Get-CimInstance Win32_OperatingSystem
    @{ caption = ([string]$o.Caption).Trim(); version = [string]$o.Version; build = [string]$o.BuildNumber; displayVersion = (Get-RegString 'HKLM' 'SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'DisplayVersion') }
  } @{ caption = 'Windows'; version = ''; build = ''; displayVersion = $null }

  $displays = Get-Section 'displays' {
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($vc in $videoControllers) {
      if ($null -eq $vc.CurrentHorizontalResolution -or $null -eq $vc.CurrentRefreshRate) { continue }
      $list.Add(@{ name = ([string]$vc.Name).Trim(); width = [int]$vc.CurrentHorizontalResolution; height = [int]$vc.CurrentVerticalResolution; refreshHz = [int]$vc.CurrentRefreshRate })
    }
    , $list.ToArray()
  } @()

  $power = Get-Section 'power' { $a = Get-ActiveScheme; @{ activeSchemeGuid = $a.guid; activeSchemeName = $a.name } } @{ activeSchemeGuid = ''; activeSchemeName = '' }

  $defender = Get-Section 'defender' { [bool](Get-MpComputerStatus).RealTimeProtectionEnabled } $null
  $vbs = Get-Section 'vbs' { [int](Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard).VirtualizationBasedSecurityStatus -eq 2 } $null

  $gaming = Get-Section 'gaming' {
    $autoGameMode = Get-RegDword 'HKCU' 'Software\Microsoft\GameBar' 'AutoGameModeEnabled'
    $dvrPolicy = Get-RegDword 'HKLM' 'SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR'
    $dvrUser = Get-RegDword 'HKCU' 'System\GameConfigStore' 'GameDVR_Enabled'
    $hags = Get-RegDword 'HKLM' 'SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode'
    $deleteNotify = Get-RegDword 'HKLM' 'SYSTEM\CurrentControlSet\Control\FileSystem' 'DisableDeleteNotification'
    @{
      gameModeOn   = ($null -eq $autoGameMode) -or ($autoGameMode -ne 0)
      gameDvrOn    = $(if ($dvrPolicy -eq 0) { $false } elseif ($null -ne $dvrUser) { $dvrUser -ne 0 } else { $null })
      hagsOn       = ($hags -eq 2)
      trimEnabled  = ($null -eq $deleteNotify) -or ($deleteNotify -eq 0)
    }
  } @{ gameModeOn = $null; gameDvrOn = $null; hagsOn = $null; trimEnabled = $null }

  Write-Result @{ ok = $true; data = @{
      scannedAt    = [DateTime]::UtcNow.ToString('o')
      computerName = [string]$env:COMPUTERNAME
      cpu          = $cpu
      gpus         = @($gpus)
      memory       = $memory
      disks        = @($disks)
      volumes      = @($volumes)
      board        = $board
      bios         = $bios
      os           = $os
      displays     = @($displays)
      power        = $power
      security     = @{ defenderRealtime = $defender; vbsRunning = $vbs }
      gaming       = $gaming
    }
  }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
