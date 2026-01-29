$repo = "D:\Neuorga\Programmierung\Obsidian\SemaLogicInObsidian\UseSemaLogicInObsidian"
$vault = "D:\Neuorga\Programmierung\Obsidian\TestProjectVaultSL\UseSemaLogicOffTest\UseSemaLogicOffTest"
$pluginId = "semalogic"

$dst = Join-Path $vault ".obsidian\plugins\$pluginId"

if (!(Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

Set-Location $repo
npm install
npm run build

Copy-Item "$repo\main.js" -Destination $dst -Force
Copy-Item "$repo\manifest.json" -Destination $dst -Force
if (Test-Path "$repo\styles.css") {
  Copy-Item "$repo\styles.css" -Destination $dst -Force
}

Write-Host "Copied plugin to $dst"
