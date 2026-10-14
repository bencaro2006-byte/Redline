#Requires -Version 5.1
# Watch-Metrics.ps1 -- long-running, READ-ONLY. Prints one LiveMetrics JSON line per interval.
#   in:  {"parentPid":1234,"intervalMs":1000}
#   out: {"at":"ISO","cpuLoad":n,"cpuClockMHz":n|null,"memUsedBytes":n,"memTotalBytes":n,"gpuLoad":n|null,"gpuMemUsedBytes":n|null}
#        (one per line; a failed sample prints {"ok":false,"error":{...}} instead)
# Uses non-localized WMI performance classes (never Get-Counter with English counter names).
# Exits on its own when the parent process is gone, so it can never be orphaned.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'Redline.Common.ps1')

function Write-Line([hashtable]$Value) {
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $Value -Depth 4 -Compress))
  [Console]::Out.Flush()
}

function Get-Sample {
  $cpu = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
  $os = Get-CimInstance -ClassName Win32_OperatingSystem
  $memTotal = [long]$os.TotalVisibleMemorySize * 1024
  $memUsed = $memTotal - ([long]$os.FreePhysicalMemory * 1024)

  $clock = $null
  if ($null -ne $cpu -and [double]$cpu.ProcessorFrequency -gt 0) {
    $clock = [math]::Round([double]$cpu.ProcessorFrequency * [double]$cpu.PercentProcessorPerformance / 100)
  }

  $gpuLoad = $null
  $gpuMem = $null
  try {
    $engines = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.Name -like '*engtype_3D' })
    if ($engines.Count -gt 0) {
      $sum = ($engines | Measure-Object -Property UtilizationPercentage -Sum).Sum
      $gpuLoad = [math]::Min(100, [double]$sum)
    }
    $adapters = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory)
    if ($adapters.Count -gt 0) { $gpuMem = [long](($adapters | Measure-Object -Property DedicatedUsage -Maximum).Maximum) }
  } catch {
    Write-Diag "GPU counters unavailable: $($_.Exception.Message)"
  }

  return @{
    at              = [DateTime]::UtcNow.ToString('o')
    cpuLoad         = $(if ($null -ne $cpu) { [math]::Min(100, [double]$cpu.PercentProcessorTime) } else { 0 })
    cpuClockMHz     = $clock
    memUsedBytes    = $memUsed
    memTotalBytes   = $memTotal
    gpuLoad         = $gpuLoad
    gpuMemUsedBytes = $gpuMem
  }
}

try {
  $request = Read-Request
  $parentPid = [int](Get-Prop $request 'parentPid' 0)
  $interval = [int](Get-Prop $request 'intervalMs' 1000)
  if ($interval -lt 500 -or $interval -gt 10000) { $interval = 1000 }

  while ($true) {
    if ($parentPid -gt 0 -and $null -eq (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { exit 0 }
    $started = [Diagnostics.Stopwatch]::StartNew()
    try {
      Write-Line (Get-Sample)
    } catch {
      Write-Line @{ ok = $false; error = @{ code = 'SAMPLE_FAILED'; message = $_.Exception.Message } }
    }
    $wait = $interval - [int]$started.ElapsedMilliseconds
    if ($wait -gt 50) { Start-Sleep -Milliseconds $wait }
  }
} catch {
  Write-Line @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
