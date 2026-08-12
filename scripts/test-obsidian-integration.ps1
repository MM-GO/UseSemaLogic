<#
.SYNOPSIS
  Exercises the SemaLogic view's dropdown-driven requests against local service.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ObsidianCli,
  [Parameter(Mandatory)] [string]$ServiceUrl,
  [Parameter(Mandatory)] [string]$Sid,
  [Parameter(Mandatory)] [string]$ArtifactPath
)

$ErrorActionPreference = 'Stop'
$serviceUri = [Uri]$ServiceUrl
$parseUrl = "$($serviceUri.AbsoluteUri.TrimEnd('/'))/rules/parse?sid=$Sid"
$rules = "OR-Rule 1|2 { Choice A, Choice B}`nChoice A [AND-Rule D,E]`nAND-Rule D[Choice A,F]"

function Invoke-ObsidianCli([string]$Name, [string[]]$Arguments) {
  $output = & $ObsidianCli @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code ${LASTEXITCODE}: $($output -join [Environment]::NewLine)" }
  return $output
}

function Wait-ForDom([string]$Selector, [int]$TimeoutMs = 15000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $output = Invoke-ObsidianCli "query DOM $Selector" @('dev:dom', "selector=$Selector", 'total')
    $count = 0
    if ([int]::TryParse(($output -join ' ').Trim(), [ref]$count) -and $count -gt 0) { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $Selector"
}

function Test-HasJavaScriptErrors([object[]]$Output) {
  $text = ($Output -join [Environment]::NewLine).Trim()
  return $text.Length -gt 0 -and $text -notmatch '^(No errors captured\.?|No JavaScript errors\.?|\[\])$'
}

try {
  Invoke-WebRequest -Uri "$($serviceUri.AbsoluteUri.TrimEnd('/'))/reset?sid=$Sid" -Method Post -TimeoutSec 10 -UseBasicParsing | Out-Null
  Invoke-ObsidianCli 'clear JavaScript errors' @('dev:errors', 'clear') | Out-Null
  Invoke-ObsidianCli 'clear console' @('dev:console', 'clear') | Out-Null

  $js = @"
const view = app.workspace.getLeavesOfType('SemaLogicService')[0]?.view;
if (!view) throw new Error('SemaLogic view is not open');
view.apiURL = '$parseUrl';
view.dialectID = 'default';
view.bodytext = '$($rules -replace "'", "\\'" -replace "`r?`n", "\\n")';
const output = view.dropdownButton.selectEl;
output.value = 'SemaLogic';
output.dispatchEvent(new Event('change', { bubbles: true }));
'SemaLogic dropdown request dispatched';
"@
  Invoke-ObsidianCli 'select SemaLogic output' @('eval', "code=$js") | Out-Null
  Wait-ForDom '[data-sl-test="result"] *'

  $svgJs = @"
const view = app.workspace.getLeavesOfType('SemaLogicService')[0]?.view;
const output = view.dropdownButton.selectEl;
output.value = 'SVG';
output.dispatchEvent(new Event('change', { bubbles: true }));
'SVG dropdown request dispatched';
"@
  Invoke-ObsidianCli 'select SVG output' @('eval', "code=$svgJs") | Out-Null
  Wait-ForDom '[data-sl-test="result"] svg'

  $errors = Invoke-ObsidianCli 'read JavaScript errors' @('dev:errors')
  if (Test-HasJavaScriptErrors $errors) {
    throw "Obsidian captured JavaScript errors: $($errors -join [Environment]::NewLine)"
  }
  Invoke-WebRequest -Uri "$($serviceUri.AbsoluteUri.TrimEnd('/'))/reset?sid=$Sid" -Method Post -TimeoutSec 10 -UseBasicParsing | Out-Null
  'SemaLogic and SVG dropdown requests passed.' | Set-Content -LiteralPath (Join-Path $ArtifactPath 'integration.txt') -Encoding utf8
} catch {
  Invoke-ObsidianCli 'read JavaScript errors' @('dev:errors') | Set-Content -LiteralPath (Join-Path $ArtifactPath 'integration-javascript-errors.txt') -Encoding utf8
  Invoke-ObsidianCli 'read console' @('dev:console', 'limit=100') | Set-Content -LiteralPath (Join-Path $ArtifactPath 'integration-console.txt') -Encoding utf8
  throw
}
