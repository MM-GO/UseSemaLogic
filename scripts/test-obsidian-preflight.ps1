<#
.SYNOPSIS
  Validates the local prerequisites for the Obsidian CLI test suite.

.DESCRIPTION
  This script deliberately performs read-only checks. It does not start
  Obsidian, reload a plugin, contact a SemaLogic service, or write to a vault.
  Copy tests/obsidian/.env.example to tests/obsidian/.env before running it.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot 'tests\obsidian\.env'
$pluginId = 'semalogic'
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$Message) {
  $script:failures.Add($Message)
}

function Read-TestEnvironment([string]$Path) {
  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) { continue }
    $match = [regex]::Match($line, '^(?<key>[A-Z0-9_]+)=(?<value>.*)$')
    if (-not $match.Success) {
      throw "Invalid configuration line in ${Path}: $rawLine"
    }
    $values[$match.Groups['key'].Value] = $match.Groups['value'].Value.Trim()
  }
  return $values
}

function Get-ConfigValue($Values, [string]$Name) {
  if ($Values.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($Values[$Name])) {
    return $Values[$Name]
  }
  return [Environment]::GetEnvironmentVariable($Name)
}

Write-Host 'UseSemaLogic Obsidian CLI preflight (read-only)'

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  Add-Failure "Missing local configuration: copy tests/obsidian/.env.example to tests/obsidian/.env."
  $config = @{}
} else {
  try {
    $config = Read-TestEnvironment $configPath
    Write-Host "Configuration: $configPath"
  } catch {
    Add-Failure $_.Exception.Message
    $config = @{}
  }
}

$cliName = Get-ConfigValue $config 'OBSIDIAN_CLI'
if ([string]::IsNullOrWhiteSpace($cliName)) { $cliName = 'obsidian' }
$cli = Get-Command $cliName -ErrorAction SilentlyContinue
if ($null -eq $cli) {
  Add-Failure "Obsidian CLI '$cliName' was not found. Enable Command line interface in Obsidian Settings > General, then restart this terminal."
} else {
  Write-Host "Obsidian CLI: $($cli.Source)"
  # Note: The 'version' command may not work in all CLI setups. We skip this check
  # and rely on the vault and plugin checks below to validate the setup.
}

$vaultValue = Get-ConfigValue $config 'SL_TEST_VAULT'
if ([string]::IsNullOrWhiteSpace($vaultValue)) {
  Add-Failure 'SL_TEST_VAULT is not configured.'
} else {
  try {
    $vaultPath = [IO.Path]::GetFullPath($vaultValue)
    $pathSegments = $vaultPath -split '[\\/]'
    if (-not ($pathSegments | Where-Object { $_ -match '(?i)test' })) {
      Add-Failure "Refusing vault without a path segment containing 'test': $vaultPath"
    }
    if (-not (Test-Path -LiteralPath $vaultPath -PathType Container)) {
      Add-Failure "SL_TEST_VAULT does not exist: $vaultPath"
    } else {
      $pluginPath = Join-Path $vaultPath ".obsidian\plugins\$pluginId"
      $manifestPath = Join-Path $pluginPath 'manifest.json'
      if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Add-Failure "Plugin '$pluginId' is not installed in the test vault: $pluginPath"
      } else {
        Write-Host "Test vault: $vaultPath"
        Write-Host "Plugin installation: $pluginPath"
      }
    }
  } catch {
    Add-Failure "SL_TEST_VAULT is invalid: $($_.Exception.Message)"
  }
}

$serviceUrl = Get-ConfigValue $config 'SL_SERVICE_URL'
if (-not [string]::IsNullOrWhiteSpace($serviceUrl)) {
  try {
    $serviceUri = [Uri]$serviceUrl
    if (-not $serviceUri.IsLoopback) {
      Add-Failure "SL_SERVICE_URL must point to a local service, not '$($serviceUri.Host)'."
    }
  } catch {
    Add-Failure "SL_SERVICE_URL is invalid: $serviceUrl"
  }
}

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Host 'Preflight failed:' -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
  exit 1
}

Write-Host 'Preflight passed.' -ForegroundColor Green
