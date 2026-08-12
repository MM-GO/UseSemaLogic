<#
.SYNOPSIS
  Runs the local Obsidian CLI smoke-test preparation workflow.

.DESCRIPTION
  The runner checks the local test configuration, runs Jest, builds the plugin,
  copies the three plugin runtime files into the dedicated test vault, and asks
  the running Obsidian instance to reload. It writes a JSON report in the
  ignored artifact folder. Assertions inside Obsidian are added in WP-04.

  Integration mode additionally starts the configured local SemaLogic service,
  waits for its API, and stops it again only when this runner started it.
#>
[CmdletBinding()]
param(
  [ValidateSet('smoke', 'integration')]
  [string]$Mode = 'smoke',
  [ValidateSet('keep', 'process')]
  [string]$ServerCleanup = 'process',
  [switch]$KeepArtifacts,
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot 'tests\obsidian\.env'
$artifactRoot = Join-Path $repoRoot 'tests\obsidian\artifacts'
$pluginId = 'semalogic'
$pluginFiles = @('main.js', 'manifest.json', 'styles.css')
$runStarted = Get-Date
$runId = $runStarted.ToString('yyyyMMdd-HHmmss')
$artifactPath = Join-Path $artifactRoot $runId
$serverStatePath = Join-Path $artifactPath 'semalogic-server-state.json'
$integrationSid = "obsidian-cli-$runId"
$steps = [System.Collections.Generic.List[object]]::new()

function Add-Step([string]$Name, [string]$Status, [string]$Detail = '') {
  $script:steps.Add([PSCustomObject]@{
    name = $Name
    status = $Status
    detail = $Detail
    timestamp = (Get-Date).ToString('o')
  })
}

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

function Invoke-Checked([string]$Name, [scriptblock]$Command) {
  try {
    & $Command
    Add-Step $Name 'passed'
  } catch {
    Add-Step $Name 'failed' $_.Exception.Message
    throw
  }
}

function Write-Report([string]$Result, [string]$ErrorMessage = '') {
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Container)) {
    New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
  }
  $report = [PSCustomObject]@{
    runId = $runId
    mode = $Mode
    result = $Result
    startedAt = $runStarted.ToString('o')
    finishedAt = (Get-Date).ToString('o')
    error = $ErrorMessage
    steps = $steps
  }
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $artifactPath 'report.json') -Encoding utf8
}

function Configure-IntegrationProfile($Config, [string]$VaultPath, [string]$ArtifactPath, [string]$Sid) {
  $serviceUri = [Uri]$Config['SL_SERVICE_URL']
  if (-not $serviceUri.IsLoopback) { throw "Integration service must be local: $serviceUri" }
  $settingsPath = Join-Path $VaultPath '.obsidian\plugins\semalogic\data.json'
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw "Plugin settings are missing: $settingsPath" }
  $backupPath = Join-Path $ArtifactPath 'plugin-data.before-integration.json'
  New-Item -ItemType Directory -Path $ArtifactPath -Force | Out-Null
  Copy-Item -LiteralPath $settingsPath -Destination $backupPath -Force
  $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
  if ($null -eq $settings.mySLSettings -or $settings.mySLSettings.Count -eq 0) { throw 'Plugin settings have no SemaLogic profile.' }
  $profile = $settings.mySLSettings[0]
  $profile.myBaseURL = $serviceUri.Host
  $profile.myPort = [string]$serviceUri.Port
  $profile.myUseHttpsSL = $false
  $profile.myUserSL = ''
  $profile.myPasswordSL = ''
  $profile.mySID = $Sid
  $profile.myOutputFormat = 'SemaLogic'
  $settings.mySetting = 0
  $settings | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $settingsPath -Encoding utf8
  return $backupPath
}

$pluginSettingsBackupPath = $null
try {
  Invoke-Checked 'configuration preflight' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'test-obsidian-preflight.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Preflight returned exit code $LASTEXITCODE" }
  }

  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Missing local configuration: $configPath"
  }
  $config = Read-TestEnvironment $configPath
  $vaultPath = [IO.Path]::GetFullPath($config['SL_TEST_VAULT'])
  $cliName = if ([string]::IsNullOrWhiteSpace($config['OBSIDIAN_CLI'])) { 'obsidian' } else { $config['OBSIDIAN_CLI'] }
  $cli = Get-Command $cliName -ErrorAction Stop
  $pluginTarget = Join-Path $vaultPath ".obsidian\plugins\$pluginId"

  Invoke-Checked 'active test vault check' {
    $activeVaultPath = (& $cli.Source vault info=path | Out-String).Trim()
    $activeVaultFullPath = [IO.Path]::GetFullPath($activeVaultPath)
    if (-not [String]::Equals($activeVaultFullPath, $vaultPath, [StringComparison]::OrdinalIgnoreCase)) {
      throw "The active Obsidian vault is '$activeVaultFullPath', expected test vault '$vaultPath'. Open the test vault in Obsidian and rerun."
    }
  }

  if ($Mode -eq 'integration') {
    Invoke-Checked 'start local SemaLogic service' {
      New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'semalogic-test-server.ps1') -Action start -ConfigPath $configPath -StatePath $serverStatePath
      if ($LASTEXITCODE -ne 0) { throw "SemaLogic service start returned exit code $LASTEXITCODE" }
    }
    Invoke-Checked 'configure local SemaLogic test profile' {
      $pluginSettingsBackupPath = Configure-IntegrationProfile $config $vaultPath $artifactPath $integrationSid
    }
  }

  Invoke-Checked 'Jest unit tests' {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw "npm test returned exit code $LASTEXITCODE" }
  }

  if ($NoBuild) {
    Add-Step 'plugin build' 'skipped' 'Requested with -NoBuild.'
  } else {
    Invoke-Checked 'plugin build' {
      Push-Location $repoRoot
      try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build returned exit code $LASTEXITCODE" }
      } finally {
        Pop-Location
      }
    }
  }

  Invoke-Checked 'copy plugin to test vault' {
    if (-not (Test-Path -LiteralPath $pluginTarget -PathType Container)) {
      New-Item -ItemType Directory -Path $pluginTarget -Force | Out-Null
    }
    foreach ($fileName in $pluginFiles) {
      $source = Join-Path $repoRoot $fileName
      if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required plugin build file is missing: $source"
      }
      Copy-Item -LiteralPath $source -Destination (Join-Path $pluginTarget $fileName) -Force
    }
  }

  Invoke-Checked 'Obsidian plugin reload' {
    & $cli.Source plugin:reload "id=$pluginId"
    if ($LASTEXITCODE -ne 0) { throw "Obsidian plugin:reload returned exit code $LASTEXITCODE" }
  }

  Invoke-Checked 'Obsidian smoke assertions' {
    & (Join-Path $PSScriptRoot 'test-obsidian-smoke.ps1') -ObsidianCli $cli.Source -VaultPath $vaultPath -ArtifactPath $artifactPath
    if ($LASTEXITCODE -ne 0) { throw "Smoke assertions returned exit code $LASTEXITCODE" }
  }

  if ($Mode -eq 'integration') {
    Invoke-Checked 'Obsidian SemaLogic integration assertions' {
      & (Join-Path $PSScriptRoot 'test-obsidian-integration.ps1') -ObsidianCli $cli.Source -ServiceUrl $config['SL_SERVICE_URL'] -Sid $integrationSid -ArtifactPath $artifactPath
      if ($LASTEXITCODE -ne 0) { throw "Integration assertions returned exit code $LASTEXITCODE" }
    }
    Invoke-Checked 'SemaLogicView button, dropdown, and Golden assertions' {
      & (Join-Path $PSScriptRoot 'test-obsidian-semalogic-view.ps1') -ObsidianCli $cli.Source -ServiceUrl $config['SL_SERVICE_URL'] -Sid $integrationSid -ArtifactPath $artifactPath
      if ($LASTEXITCODE -ne 0) { throw "SemaLogicView assertions returned exit code $LASTEXITCODE" }
    }
  }

  Write-Report 'passed'
  Write-Host "Smoke preparation completed. Report: $artifactPath\report.json" -ForegroundColor Green
} catch {
  $message = $_.Exception.Message
  Write-Report 'failed' $message
  Write-Host "Smoke preparation failed. Report: $artifactPath\report.json" -ForegroundColor Red
  throw
} finally {
  if ($pluginSettingsBackupPath -ne $null -and (Test-Path -LiteralPath $pluginSettingsBackupPath -PathType Leaf)) {
    Copy-Item -LiteralPath $pluginSettingsBackupPath -Destination (Join-Path $vaultPath '.obsidian\plugins\semalogic\data.json') -Force
  }
  if ($Mode -eq 'integration' -and (Test-Path -LiteralPath $serverStatePath -PathType Leaf)) {
    if ($ServerCleanup -eq 'process') {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'semalogic-test-server.ps1') -Action stop -ConfigPath $configPath -StatePath $serverStatePath
    } else {
      Write-Host 'Keeping the SemaLogic service running as requested.'
    }
  }
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $artifactPath -PathType Container)) {
    # Reports are intentionally retained. Screenshot and DOM cleanup belongs to WP-04.
  }
}
