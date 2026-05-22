param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $root "dist"
$packageDir = Join-Path $distRoot "FreeAgent-win-x64"
$launcherSource = Join-Path $root "tools\windows-launcher\Program.cs"
$nodeExe = (Get-Command node.exe).Source
$cscCandidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
  throw "Cannot find .NET Framework csc.exe. This Windows installation may be missing .NET Framework 4.x."
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Command,
    [Parameter(Mandatory = $true)][string]$Name
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Set-Location $root

if (-not $SkipBuild) {
  Write-Host "==> Building web assets"
  Invoke-Checked { npm.cmd run build } "npm run build"
} else {
  Write-Host "==> Using existing web assets"
}

Write-Host "==> Preparing package directory"
if (Test-Path $packageDir) {
  Remove-Item -LiteralPath $packageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDir | Out-Null

Write-Host "==> Compiling launcher"
$launcherExe = Join-Path $packageDir "FreeAgent.exe"
Invoke-Checked { & $csc /nologo /target:exe /codepage:65001 "/out:$launcherExe" $launcherSource } "csc"

Write-Host "==> Copying runtime and app files"
$nodeDir = Join-Path $packageDir "node"
New-Item -ItemType Directory -Path $nodeDir | Out-Null
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $nodeDir "node.exe") -Force

Copy-Item -LiteralPath (Join-Path $root "src") -Destination (Join-Path $packageDir "src") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "public") -Destination (Join-Path $packageDir "public") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root ".env.example") -Destination (Join-Path $packageDir ".env.example") -Force

$readme = @(
  "Free Agent Windows Portable",
  "",
  "Start:",
  "1. Double click FreeAgent.exe.",
  "2. On first run, paste your OpenRouter key.",
  "3. The key is saved to .env in this folder only.",
  "4. Your browser opens http://localhost:3000 automatically.",
  "",
  "Stop:",
  "- Close the launcher window, or press Ctrl+C.",
  "",
  "Change key:",
  "- Edit .env and replace OPENROUTER_API_KEY.",
  "- Run FreeAgent.exe again.",
  "",
  "Use with CCSwitch / other clients:",
  "- Base URL: http://localhost:3000/v1",
  "- API Key: local-dev-token",
  "",
  "Notes:",
  "- Do not share .env.",
  "- If you expose it to the public internet, replace RELAY_API_KEY with a strong random token and add HTTPS, rate limits, and access control first."
)

Set-Content -LiteralPath (Join-Path $packageDir "README-START.txt") -Value $readme -Encoding UTF8

Write-Host ""
Write-Host "Done: $packageDir"
Write-Host "Run:  $packageDir\FreeAgent.exe"
