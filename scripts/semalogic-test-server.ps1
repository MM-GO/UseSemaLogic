<#
.SYNOPSIS
  Starts or stops the local SemaLogic server used by Obsidian integration tests.

.DESCRIPTION
  The command and working directory come from the ignored test configuration.
  Only loopback URLs are accepted. A server that was already listening is never
  stopped by this script. The state file records whether this test run owns the
  server process.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('start', 'stop')]
  [string]$Action,
  [Parameter(Mandatory)]
  [string]$ConfigPath,
  [Parameter(Mandatory)]
  [string]$StatePath
)

$ErrorActionPreference = 'Stop'

function Read-TestEnvironment([string]$Path) {
  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) { continue }
    $match = [regex]::Match($line, '^(?<key>[A-Z0-9_]+)=(?<value>.*)$')
    if (-not $match.Success) { throw "Invalid configuration line in ${Path}: $rawLine" }
    $values[$match.Groups['key'].Value] = $match.Groups['value'].Value.Trim()
  }
  return $values
}

function Get-ServiceVersion([Uri]$ServiceUri) {
  try {
    $response = Invoke-WebRequest -Uri "$($ServiceUri.AbsoluteUri.TrimEnd('/'))/api-version" -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) { return $null }
    return $response.Content
  } catch {
    return $null
  }
}

function Wait-ForService([Uri]$ServiceUri, [int]$TimeoutMs, [string]$LogPath) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  $lastResponse = ''
  do {
    $lastResponse = Get-ServiceVersion $ServiceUri
    if (-not [string]::IsNullOrWhiteSpace($lastResponse)) {
      if ($lastResponse -notmatch '00\.03\.00') {
        throw "SemaLogic API version is not compatible: $lastResponse"
      }
      return $lastResponse
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  $log = if (Test-Path -LiteralPath $LogPath) { Get-Content -LiteralPath $LogPath -Raw } else { '<no server log>' }
  throw "Timed out waiting for $ServiceUri/api-version. Server log: $log"
}

if ($Action -eq 'stop') {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { exit 0 }
  $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  if ($state.startedByRunner -ne $true) { exit 0 }
  if ($state.processId -gt 0) {
    $process = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
    if ($process -ne $null) {
      # The runner starts cmd.exe, which owns go.exe and the server process.
      # Terminate that owned process tree directly; `/stop-server` deliberately
      # closes its HTTP connection and used to cause a misleading warning.
      & "$env:SystemRoot\System32\taskkill.exe" /PID $state.processId /T /F | Out-Null
      if ($LASTEXITCODE -ne 0) { Write-Warning "Could not stop SemaLogic process tree $($state.processId)." }
    }
  }
  exit 0
}

$config = Read-TestEnvironment $ConfigPath
$serviceUri = [Uri]$config['SL_SERVICE_URL']
if (-not $serviceUri.IsLoopback) { throw "SL_SERVICE_URL must be local: $serviceUri" }
$timeoutMs = if ($config.ContainsKey('SL_TEST_TIMEOUT_MS')) { [int]$config['SL_TEST_TIMEOUT_MS'] } else { 30000 }
$logPath = Join-Path (Split-Path -Parent $StatePath) 'semalogic-server.log'
$errorLogPath = Join-Path (Split-Path -Parent $StatePath) 'semalogic-server-error.log'

$alreadyRunning = Get-ServiceVersion $serviceUri
if (-not [string]::IsNullOrWhiteSpace($alreadyRunning)) {
  $state = [PSCustomObject]@{ serviceUrl = $serviceUri.AbsoluteUri.TrimEnd('/'); startedByRunner = $false; processId = 0; version = $alreadyRunning; logPath = $logPath }
  $state | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
  Write-Host "Using already running local SemaLogic service: $alreadyRunning"
  exit 0
}

$workDir = $config['SL_SERVER_WORKDIR']
$startCommand = $config['SL_SERVER_START_CMD']
if ([string]::IsNullOrWhiteSpace($workDir) -or -not (Test-Path -LiteralPath $workDir -PathType Container)) {
  throw 'SL_SERVER_WORKDIR is missing or does not exist.'
}
if ([string]::IsNullOrWhiteSpace($startCommand)) {
  throw 'SL_SERVER_START_CMD is missing. Integration tests will not guess a server command.'
}

$previousTrace = $env:SEMALOGIC_TRACE
try {
  $env:SEMALOGIC_TRACE = '1'
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', $startCommand) -WorkingDirectory $workDir -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath -WindowStyle Hidden -PassThru
} finally {
  $env:SEMALOGIC_TRACE = $previousTrace
}

try {
  $version = Wait-ForService $serviceUri $timeoutMs $logPath
  $state = [PSCustomObject]@{ serviceUrl = $serviceUri.AbsoluteUri.TrimEnd('/'); startedByRunner = $true; processId = $process.Id; version = $version; logPath = $logPath }
  $state | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
  Write-Host "Started local SemaLogic service: $version"
} catch {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  throw
}
