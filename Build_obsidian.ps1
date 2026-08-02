<#
.SYNOPSIS
  Builds the plugin and copies it into the test vault.

.PARAMETER ProdVaults
  Additionally copies the build into the production targets. Without this
  switch only the test vault is touched.

.EXAMPLE
  .\Build_obsidian.ps1
  .\Build_obsidian.ps1 -ProdVaults
#>
[CmdletBinding()]
param(
  [switch]$ProdVaults
)

$repo = "D:\Neuorga\Programmierung\Obsidian\SemaLogicInObsidian\UseSemaLogicInObsidian"
$vault = "D:\Neuorga\Programmierung\Obsidian\TestProjectVaultSL\UseSemaLogicOffTest\UseSemaLogicOffTest"
$pluginId = "semalogic"

$dst = Join-Path $vault ".obsidian\plugins\$pluginId"

# Production targets, only used with -ProdVaults.
$prodTargets = @(
  "D:\Neuorga\Doks\SemaLogic\SemaLogicSync\SemaLogicSync\SemaLogicSync\.obsidian\plugins\semalogic",
  "\\George\SharedData\Datenaustausch\Obsidian\Version_latest"
)

# styles.css is optional; main.js and manifest.json are not.
$pluginFiles = @("main.js", "manifest.json", "styles.css")

function Copy-PluginFiles {
  param(
    [string]$Target
  )

  foreach ($name in $pluginFiles) {
    $source = Join-Path $repo $name
    if (Test-Path $source) {
      Copy-Item $source -Destination $Target -Force
    }
  }
  Write-Host "Copied plugin to $Target"
}

if (!(Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

Set-Location $repo
npm install
npm run build

Copy-PluginFiles -Target $dst

if ($ProdVaults) {
  foreach ($target in $prodTargets) {
    # An unreachable network share must not fail the build - the other targets
    # are still served.
    if (!(Test-Path $target)) {
      Write-Warning "Skipped (not reachable): $target"
      continue
    }
    Copy-PluginFiles -Target $target
  }
}
else {
  Write-Host "Production vaults skipped - pass -ProdVaults to include them."
}
