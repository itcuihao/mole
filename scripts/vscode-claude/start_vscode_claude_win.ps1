$ProjectDir = if ($env:PROJECT_DIR) { $env:PROJECT_DIR } else { "$env:USERPROFILE\mygo\mole" }
$ConfigFile = "$env:USERPROFILE\.mole\vscode-claude.ps1"

if (!(Test-Path $ConfigFile)) { Write-Error "缺少配置: $ConfigFile"; exit 1 }
. $ConfigFile

Set-Location $ProjectDir
if (!(Test-Path ".claude")) { New-Item -ItemType Directory -Path ".claude" | Out-Null }

Start-Process "code" -ArgumentList "-n $ProjectDir"
