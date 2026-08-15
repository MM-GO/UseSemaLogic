<#
.SYNOPSIS
  Creates a SemaLogicView fixture and tests ribbon, dropdown, and view buttons.

.DESCRIPTION
  A missing Golden deliberately triggers an interactive prompt. The user reviews
  the open SemaLogicView and explicitly accepts the visible result before a
  baseline is written.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ObsidianCli,
  [Parameter(Mandatory)] [string]$ServiceUrl,
  [Parameter(Mandatory)] [string]$Sid,
  [Parameter(Mandatory)] [string]$ArtifactPath,
  [switch]$AcceptGolden
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$fixturePath = 'TestCases/SemaLogicView/basic-semalogic.md'
$fixtureSource = Join-Path $repoRoot 'tests\obsidian\fixtures\semalogic-view-basic.md'
$goldenPath = Join-Path $repoRoot 'tests\obsidian\golden\semalogic-view-basic.json'
$responseGoldenPath = Join-Path $repoRoot 'tests\obsidian\golden\semalogic-view-responses.json'
$parseUrl = "$($ServiceUrl.TrimEnd('/'))/rules/parse?sid=$Sid"
$protocolPath = Join-Path $ArtifactPath 'semalogic-view-protocol.json'
$responseCapturePath = Join-Path $ArtifactPath 'semalogic-view-responses.json'
$protocol = [System.Collections.Generic.List[object]]::new()
$capturedResponses = [ordered]@{}
$currentStep = 'initialization'

function Add-TestProtocol {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][ValidateSet('started', 'passed', 'failed', 'skipped')][string]$Status,
    [string]$Detail = ''
  )
  $script:currentStep = $Step
  $script:protocol.Add([PSCustomObject]@{
      timestamp = (Get-Date).ToString('o')
      step = $Step
      status = $Status
      detail = $Detail
    })
  # Keep the protocol useful even when Obsidian or PowerShell stops midway.
  $script:protocol | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $script:protocolPath -Encoding utf8
}

function Invoke-ObsidianCli([string]$Name, [string[]]$Arguments) {
  $output = & $ObsidianCli @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code ${LASTEXITCODE}: $($output -join [Environment]::NewLine)" }
  return $output
}

function Invoke-ObsidianEval([string]$Name, [string]$Code) {
  return Invoke-ObsidianCli $Name @('eval', "code=$Code")
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

function Wait-ForMissingDom([string]$Selector, [int]$TimeoutMs = 15000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $output = Invoke-ObsidianCli "query DOM $Selector" @('dev:dom', "selector=$Selector", 'total')
    # `dev:dom` may transport this as `Result: 0`, not only as bare `0`.
    if (($output -join ' ').Trim() -match '(^|\D)0(\D|$)') { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $Selector to disappear"
}

function Wait-ForSemaLogicViewCount([int]$ExpectedCount, [int]$TimeoutMs = 5000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $output = Invoke-ObsidianEval 'read SemaLogic workspace view count' "app.workspace.getLeavesOfType('SemaLogicService').length"
    # `obsidian eval` may prefix the value (for example "Result: 0"), so do
    # not require a bare integer as the developer CLI output format is not a
    # stable API contract.
    $countText = ($output -join ' ').Trim()
    if ($countText -match "(^|\D)$ExpectedCount(\D|$)") { return }
    Start-Sleep -Milliseconds 150
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $ExpectedCount SemaLogic workspace view(s)."
}

function Wait-ForSemaLogicViewInstance([int]$TimeoutMs = 15000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $output = Invoke-ObsidianEval 'read SemaLogic workspace view instance' "app.workspace.getLeavesOfType('SemaLogicService')[0]?.view?.getViewType?.() ?? ''"
    if (($output -join ' ').Trim() -match 'SemaLogicService') { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Timed out waiting for the SemaLogic workspace view instance.'
}

function Wait-ForActiveMarkdownFixture([int]$TimeoutMs = 15000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $output = Invoke-ObsidianEval 'read active Markdown fixture' "const leaf=app.workspace.activeLeaf; leaf?.view?.getViewType?.()==='markdown' && leaf.view.file?.path==='$fixturePath'"
    if (($output -join ' ').Trim() -match 'true') { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for the active Markdown test fixture: $fixturePath"
}

function Wait-ForButtonState([string]$Selector, [string]$ExpectedText, [int]$TimeoutMs = 15000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $text = (Invoke-ObsidianCli "read button text $Selector" @('dev:dom', "selector=$Selector", 'text') -join ' ').Trim()
    $classes = (Invoke-ObsidianCli "read button classes $Selector" @('dev:dom', "selector=$Selector", 'attr=class') -join ' ').Trim()
    if ($ExpectedText -eq 'Source' -and $text -match 'Source' -and $classes -match 'is-source') { return }
    if ($ExpectedText -eq 'Rendered' -and $text -match 'Rendered' -and $classes -notmatch 'is-source') { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for button $Selector to show state $ExpectedText."
}

function Get-ResultText {
  # `dev:dom` transports selector arguments reliably. The CLI's `eval` parser
  # can reject nested quotes here and return its error text as a false result.
  $result = Invoke-ObsidianCli 'read rendered SemaLogic result' @('dev:dom', 'selector=[data-sl-test="result"]', 'text')
  return ($result -join [Environment]::NewLine).Trim()
}

function Capture-OutputResponse {
  param([Parameter(Mandatory = $true)][string]$Format)
  $text = Get-ResultText
  if ($text.Length -eq 0) { throw "$Format dropdown produced no visible result." }
  $script:capturedResponses[$Format] = [PSCustomObject]@{ resultText = $text }
  [PSCustomObject]@{ fixture = $fixturePath; responses = $script:capturedResponses } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $script:responseCapturePath -Encoding utf8
}

function ConvertTo-CanonicalValue {
  param($Value)
  if ($null -eq $Value -or $Value -is [string] -or $Value -is [ValueType]) { return $Value }
  if ($Value -is [System.Collections.IEnumerable]) {
    $items = @($Value | ForEach-Object { ConvertTo-CanonicalValue $_ })
    # ASP and Canvas collections describe sets of nodes/terms/groups. Their
    # transport order is not part of the SemaLogic contract.
    return @($items | Sort-Object { ConvertTo-Json $_ -Depth 30 -Compress })
  }
  $ordered = [ordered]@{}
  foreach ($property in @($Value.psobject.Properties | Sort-Object Name)) {
    $ordered[$property.Name] = ConvertTo-CanonicalValue $property.Value
  }
  return [PSCustomObject]$ordered
}

function Get-ComparableGoldenResponse {
  param(
    [Parameter(Mandatory = $true)][string]$Format,
    [Parameter(Mandatory = $true)][string]$Text
  )
  if ($Format -in @('ASP.json', 'KnowledgeGraph')) {
    try {
      return (ConvertTo-CanonicalValue ($Text | ConvertFrom-Json) | ConvertTo-Json -Depth 30 -Compress)
    } catch {
      throw "Could not canonicalize the $Format Golden response: $($_.Exception.Message)"
    }
  }
  return $Text
}

function Wait-ForDropdownRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Format,
    [int]$TimeoutMs = 15000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $actual = Invoke-ObsidianEval "wait for completed $Format dropdown request" "app.workspace.getLeavesOfType('SemaLogicService')[0]?.view?.contentEl?.getAttribute('data-sl-test-last-request') ?? ''"
    # The CLI may prefix eval output (for example `Result: SemaLogic`), so
    # accept the expected marker inside its transport wrapper.
    if (($actual -join ' ').Trim() -match [regex]::Escape($Format)) { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for the $Format dropdown request to complete."
}

function Select-OutputFormat {
  param([Parameter(Mandatory = $true)][string]$Format)
  Add-TestProtocol "dropdown:$Format" 'started' 'Select output format and wait for the corresponding server response.'
  Invoke-ObsidianEval "select $Format dropdown option" "const v=app.workspace.getLeavesOfType('SemaLogicService')[0]?.view; if(!v) throw new Error('SemaLogic view is not open'); const s=v.dropdownButton.selectEl; if(s.value==='$Format') throw new Error('Test requires an actual dropdown value change to $Format'); v.contentEl.removeAttribute('data-sl-test-last-selection'); v.contentEl.removeAttribute('data-sl-test-last-request'); v.contentEl.removeAttribute('data-sl-test-last-request-status'); v.resultEl.empty(); s.focus(); s.value='$Format'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); '$Format selected and change event dispatched';" | Out-Null
  $selection = Invoke-ObsidianEval "verify $Format dropdown handler" "app.workspace.getLeavesOfType('SemaLogicService')[0]?.view?.contentEl?.getAttribute('data-sl-test-last-selection') ?? ''"
  if (($selection -join ' ').Trim() -notmatch [regex]::Escape($Format)) { throw "$Format dropdown change handler was not invoked." }
  Wait-ForDropdownRequest $Format
  Wait-ForDom '[data-sl-test="result"] *'
  Capture-OutputResponse $Format
  Add-TestProtocol "dropdown:$Format" 'passed' 'Completed server request and rendered a non-empty result.'
}

function Wait-ForKnowledgeCanvas([int]$TimeoutMs = 15000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $output = Invoke-ObsidianEval 'read KnowledgeGraph canvas count' "app.workspace.getLeavesOfType('canvas').length"
    if (($output -join ' ').Trim() -match '[1-9]') { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'KnowledgeGraph dropdown did not open its canvas view.'
}

try {
  New-Item -ItemType Directory -Path $ArtifactPath -Force | Out-Null
  Add-TestProtocol 'initialization' 'started' "Fixture: $fixturePath"
  $fixtureContent = Get-Content -LiteralPath $fixtureSource -Raw
  Invoke-ObsidianCli 'create SemaLogicView fixture' @('create', "path=$fixturePath", "content=$fixtureContent", 'overwrite') | Out-Null
  Add-TestProtocol 'fixture:create' 'passed' 'Markdown test file was created in the test vault.'

  # Start from an empty document workspace, then use the official CLI to open
  # the Markdown test fixture visibly before making a right-hand split.
  $resetWorkspace = @"
for (const type of ['markdown', 'canvas', 'SemaLogicService', 'TransferService']) {
  app.workspace.detachLeavesOfType(type);
}
'Test document workspace reset';
"@
  Invoke-ObsidianEval 'close all test document views' $resetWorkspace | Out-Null
  Add-TestProtocol 'workspace:reset' 'passed' 'Closed Markdown, Canvas, SemaLogic and TransferService views.'
  Invoke-ObsidianCli 'open Markdown fixture in left pane' @('open', "path=$fixturePath") | Out-Null
  Wait-ForActiveMarkdownFixture
  Add-TestProtocol 'markdown:open' 'passed' 'Test Markdown file is active in the left pane.'
  Invoke-ObsidianCli 'open SemaLogicView through plugin command' @('command', 'id=semalogic:sl_open_view') | Out-Null
  Wait-ForSemaLogicViewInstance
  Wait-ForDom '[data-sl-test="semalogic-view"]'
  Add-TestProtocol 'semalogic-view:open' 'passed' 'SemaLogicView instance and DOM root are available.'

  $splitState = Invoke-ObsidianEval 'verify SemaLogicView is right of Markdown fixture' "const m=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='$fixturePath'); const s=app.workspace.getLeavesOfType('SemaLogicService')[0]; (!m||!s) ? 'missing-leaf' : (s.view.containerEl.getBoundingClientRect().left > m.view.containerEl.getBoundingClientRect().left ? 'split-right' : 'wrong-layout');"
  if (($splitState -join ' ').Trim() -notmatch 'split-right') { throw "SemaLogicView is not in the right split pane: $($splitState -join ' ')" }
  Add-TestProtocol 'layout:right-split' 'passed' 'Markdown is left of SemaLogicView.'

  $rulesForJs = ($fixtureContent -replace '\\', '\\\\' -replace "'", "\\'" -replace "`r?`n", "\\n")
  $requestAndSelect = @"
const view = app.workspace.getLeavesOfType('SemaLogicService')[0]?.view;
if (!view) throw new Error('SemaLogic view is not open');
view.apiURL = '$parseUrl'; view.dialectID = 'default'; view.bodytext = '$rulesForJs';
const select = view.dropdownButton.selectEl;
// The initial value is SemaLogic. Prepare a different visible value without
// firing its handler, then make a real SVG -> SemaLogic selection change.
view.dropdownButton.setValue('SVG');
view.contentEl.removeAttribute('data-sl-test-last-request');
view.contentEl.removeAttribute('data-sl-test-last-request-status');
view.resultEl.empty();
select.focus(); select.value = 'SemaLogic'; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); 'SemaLogic selection dispatched';
"@
  Invoke-ObsidianEval 'request SemaLogic from Markdown fixture through dropdown' $requestAndSelect | Out-Null
  Add-TestProtocol 'dropdown:SemaLogic' 'started' 'Perform the initial real SVG to SemaLogic selection change.'
  Wait-ForDropdownRequest 'SemaLogic'
  Wait-ForDom '[data-sl-test="result"] *'
  $resultText = Get-ResultText
  if ($resultText.Length -eq 0) { throw 'SemaLogic dropdown produced no visible result.' }
  Capture-OutputResponse 'SemaLogic'
  Add-TestProtocol 'dropdown:SemaLogic' 'passed' 'Initial SemaLogic request completed with a non-empty result.'

  # Every output format must cause its own request and visible response. The
  # order guarantees a real value change for every selection.
  Select-OutputFormat 'ASP.json'
  Wait-ForDom '[data-sl-test="result"] .debuginline'

  Select-OutputFormat 'SVG'
  Wait-ForDom '[data-sl-test="result"] svg'

  Select-OutputFormat 'SemanticTree'
  Select-OutputFormat 'KnowledgeGraph'
  Wait-ForKnowledgeCanvas
  Add-TestProtocol 'knowledgegraph:canvas-open' 'passed' 'KnowledgeGraph selection opened its canvas view.'
  Invoke-ObsidianEval 'close KnowledgeGraph canvas after its dropdown test' "await app.plugins.getPlugin('semalogic')?.deactivateKnowledgeView(); 'KnowledgeGraph canvas closed';" | Out-Null
  Add-TestProtocol 'knowledgegraph:canvas-close' 'passed' 'KnowledgeGraph canvas was closed before the next selection.'

  Select-OutputFormat 'AnnotatedHTML'
  Select-OutputFormat 'AnnotatedHTML_backlinks'

  # DialectEngine is intentionally a marker entry, not a parse request. Its
  # expected UI action is the explanatory hint; engine execution is covered by
  # the dedicated dialect-engine button tests.
  Add-TestProtocol 'dropdown:DialectEngine' 'started' 'Select the marker entry and verify its explanatory hint.'
  Invoke-ObsidianEval 'select DialectEngine dropdown marker' "const v=app.workspace.getLeavesOfType('SemaLogicService')[0]?.view; const s=v?.dropdownButton.selectEl; if(!v||!s) throw new Error('SemaLogic view is not open'); v.contentEl.removeAttribute('data-sl-test-last-selection'); v.contentEl.removeAttribute('data-sl-test-last-request'); s.focus(); s.value='DialectEngine'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); 'DialectEngine selected';" | Out-Null
  Wait-ForDom '[data-sl-test="result"] p'
  $dialectHint = Get-ResultText
  if ($dialectHint -notmatch 'DialectEngine') { throw 'DialectEngine dropdown did not show its explanatory hint.' }
  Add-TestProtocol 'dropdown:DialectEngine' 'passed' 'Marker selection displayed its explanatory hint without a parse request.'

  # Return to SemaLogic before the Golden comparison.
  Select-OutputFormat 'SemaLogic'
  $resultText = Get-ResultText

  Add-TestProtocol 'golden:compare' 'started' 'Compare all confirmed dropdown responses with the Golden baselines.'
  if (-not (Test-Path -LiteralPath $goldenPath -PathType Leaf)) {
    Write-Host ''
    Write-Host 'Golden baselines are missing. Please inspect the final SemaLogicView result.' -ForegroundColor Yellow
    $answer = if ($AcceptGolden) { 'y' } else { Read-Host 'Accept the captured dropdown responses as GOLDEN? [y/N]' }
    if ($answer -notmatch '^(y|yes|j|ja)$') { throw 'Golden baselines were not accepted. No Golden file was written.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $goldenPath) -Force | Out-Null
    [PSCustomObject]@{ fixture = $fixturePath; outputFormat = 'SemaLogic'; resultText = $resultText } | ConvertTo-Json |
      Set-Content -LiteralPath $goldenPath -Encoding utf8
    [PSCustomObject]@{ fixture = $fixturePath; responses = $capturedResponses } | ConvertTo-Json -Depth 5 |
      Set-Content -LiteralPath $responseGoldenPath -Encoding utf8
    Write-Host "Golden baselines accepted: $goldenPath and $responseGoldenPath" -ForegroundColor Green
    Add-TestProtocol 'golden:compare' 'passed' 'All captured dropdown responses were accepted as Golden baselines.'
  } else {
    $golden = Get-Content -LiteralPath $goldenPath -Raw | ConvertFrom-Json
    if ($golden.resultText -ne $resultText) {
      Set-Content -LiteralPath (Join-Path $ArtifactPath 'golden-actual.txt') -Value $resultText -Encoding utf8
      throw 'SemaLogicView result differs from the approved Golden baseline. See golden-actual.txt.'
    }
    $responseGolden = Get-Content -LiteralPath $responseGoldenPath -Raw | ConvertFrom-Json
    foreach ($property in $responseGolden.responses.psobject.Properties) {
      $actualComparable = Get-ComparableGoldenResponse $property.Name $capturedResponses[$property.Name].resultText
      $goldenComparable = Get-ComparableGoldenResponse $property.Name $property.Value.resultText
      if ($actualComparable -ne $goldenComparable) {
        throw "Dropdown response differs from its approved Golden baseline: $($property.Name)."
      }
    }
    Add-TestProtocol 'golden:compare' 'passed' 'All dropdown responses match their Golden baselines.'
  }

  # Button tests run after all output-format cases. A button failure must not
  # prevent the dropdown request cases from reaching the server.
  Add-TestProtocol 'button:result-mode-source' 'started' 'Run the result-mode command.'
  Invoke-ObsidianCli 'toggle result source mode through plugin command' @('command', 'id=semalogic:sl_toggle_result_source') | Out-Null
  Wait-ForButtonState '[data-sl-test="result-mode-toggle"]' 'Source'
  Add-TestProtocol 'button:result-mode-source' 'passed' 'Result mode changed to Source.'
  Add-TestProtocol 'button:result-mode-rendered' 'started' 'Run the result-mode command again.'
  Invoke-ObsidianCli 'restore rendered result mode through plugin command' @('command', 'id=semalogic:sl_toggle_result_source') | Out-Null
  Wait-ForButtonState '[data-sl-test="result-mode-toggle"]' 'Rendered'
  Add-TestProtocol 'button:result-mode-rendered' 'passed' 'Result mode changed back to Rendered.'

  'SemaLogicView interaction tests passed.' | Set-Content -LiteralPath (Join-Path $ArtifactPath 'semalogic-view.txt') -Encoding utf8
} catch {
  Add-TestProtocol $currentStep 'failed' $_.Exception.Message
  Invoke-ObsidianCli 'capture view DOM' @('dev:dom', 'selector=[data-sl-test="semalogic-view"]', 'inner') |
    Set-Content -LiteralPath (Join-Path $ArtifactPath 'semalogic-view-dom.txt') -Encoding utf8
  Invoke-ObsidianCli 'capture screenshot' @('dev:screenshot', ("path=" + (Join-Path $ArtifactPath 'semalogic-view-failure.png'))) | Out-Null
  throw
} finally {
  # A test cycle ends with no document views left behind. This prevents the
  # next fixture from inheriting an active editor, Canvas, or SemaLogic leaf.
  try {
    Invoke-ObsidianEval 'close SemaLogicView and Markdown fixture after test cycle' @"
for (const type of ['markdown', 'canvas', 'SemaLogicService', 'TransferService']) {
  app.workspace.detachLeavesOfType(type);
}
'Test document views closed';
"@ | Out-Null
  } catch {
    Write-Warning "Could not clean up test document views: $($_.Exception.Message)"
  }
}
