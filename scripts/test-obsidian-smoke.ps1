<#
.SYNOPSIS
  Baseline UI assertions for a running Obsidian test vault.

.DESCRIPTION
  This script is called by test-obsidian.ps1 after the plugin was built,
  copied, and reloaded. It intentionally verifies only the deterministic
  fixture-command and Canvas path. Interactive tooltip behaviour is added in
  WP-07 after a stable input-driving strategy is in place.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$ObsidianCli,
  [Parameter(Mandatory)]
  [string]$VaultPath,
  [Parameter(Mandatory)]
  [string]$ArtifactPath
)

$ErrorActionPreference = 'Stop'
$fixtureCanvasPath = 'SemaLogic/TestCanvas.canvas'
$fixtureInfoPath = '.SemaLogic/test_nodeinfos/test-node.md'
$timeoutMs = 10000

function Invoke-ObsidianCli([string]$Name, [string[]]$Arguments) {
  $output = & $ObsidianCli @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code ${LASTEXITCODE}: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Save-DiagnosticArtifacts {
  try {
    Invoke-ObsidianCli 'read JavaScript errors' @('dev:errors') |
      Set-Content -LiteralPath (Join-Path $ArtifactPath 'javascript-errors.txt') -Encoding utf8
    Invoke-ObsidianCli 'read console' @('dev:console', 'limit=100') |
      Set-Content -LiteralPath (Join-Path $ArtifactPath 'console.txt') -Encoding utf8
    Invoke-ObsidianCli 'inspect canvas DOM' @('dev:dom', 'selector=[data-sl-test="canvas"]', 'all') |
      Set-Content -LiteralPath (Join-Path $ArtifactPath 'canvas-dom.txt') -Encoding utf8
    Invoke-ObsidianCli 'take screenshot' @('dev:screenshot', ("path=" + (Join-Path $ArtifactPath 'failure.png'))) | Out-Null
  } catch {
    # The original failed assertion is more useful than a secondary diagnostic failure.
  }
}

function Wait-ForDom([string]$Selector, [int]$TimeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $result = Invoke-ObsidianCli "query DOM $Selector" @('dev:dom', "selector=$Selector", 'total')
    $numberText = ($result -join ' ').Trim()
    $count = 0
    if ([int]::TryParse($numberText, [ref]$count) -and $count -gt 0) { return }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for DOM selector: $Selector"
}

function Test-HasJavaScriptErrors([object[]]$Output) {
  $text = ($Output -join [Environment]::NewLine).Trim()
  return $text.Length -gt 0 -and $text -notmatch '^(No errors captured\.?|No JavaScript errors\.?|\[\])$'
}

try {
  New-Item -ItemType Directory -Path $ArtifactPath -Force | Out-Null
  Invoke-ObsidianCli 'clear JavaScript errors' @('dev:errors', 'clear') | Out-Null
  Invoke-ObsidianCli 'clear console' @('dev:console', 'clear') | Out-Null

  $commands = Invoke-ObsidianCli 'list fixture commands' @('commands', 'filter=semalogic:sl_create_')
  $commandText = $commands -join [Environment]::NewLine
  $commandIds = @{}
  foreach ($shortId in @('sl_create_test_canvas', 'sl_create_template_canvas')) {
    $fullId = "semalogic:$shortId"
    if (-not $commandText.Contains($fullId)) {
      throw "Plugin command is not registered: $fullId"
    }
    $commandIds[$shortId] = $fullId
  }

  Invoke-ObsidianCli 'create simple Canvas fixture without opening it' @('command', "id=$($commandIds['sl_create_test_canvas'])") | Out-Null
  $canvasFullPath = Join-Path $VaultPath $fixtureCanvasPath
  $infoFullPath = Join-Path $VaultPath $fixtureInfoPath
  if (-not (Test-Path -LiteralPath $canvasFullPath -PathType Leaf)) {
    throw "Fixture Canvas was not created: $fixtureCanvasPath"
  }
  if (-not (Test-Path -LiteralPath $infoFullPath -PathType Leaf)) {
    throw "Fixture info file was not created: $fixtureInfoPath"
  }

  $errors = Invoke-ObsidianCli 'read JavaScript errors' @('dev:errors')
  if (Test-HasJavaScriptErrors $errors) {
    throw "Obsidian captured JavaScript errors: $($errors -join [Environment]::NewLine)"
  }

  'Smoke assertions passed.' | Set-Content -LiteralPath (Join-Path $ArtifactPath 'smoke.txt') -Encoding utf8
} catch {
  Save-DiagnosticArtifacts
  throw
}
