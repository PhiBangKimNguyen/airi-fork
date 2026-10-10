param([switch]$SkipInstall)

$ErrorActionPreference = 'Stop'
$airiRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $airiRoot
$airiLocal = Join-Path $airiRoot '.local'
New-Item -ItemType Directory -Path $airiLocal -Force | Out-Null
$airiNode = Join-Path $airiLocal 'node-v26.7.0-win-x64/node.exe'
if (!(Test-Path -LiteralPath $airiNode)) {
    Invoke-WebRequest 'https://nodejs.org/dist/v26.7.0/node-v26.7.0-win-x64.zip' -OutFile (Join-Path $airiLocal 'node.zip')
    Expand-Archive (Join-Path $airiLocal 'node.zip') -DestinationPath $airiLocal -Force
}
$airiPnpm = Join-Path $airiLocal 'pnpm/bin/pnpm.mjs'
if (!(Test-Path -LiteralPath $airiPnpm)) {
    Invoke-WebRequest 'https://registry.npmjs.org/pnpm/-/pnpm-11.24.0.tgz' -OutFile (Join-Path $airiLocal 'pnpm.tgz')
    New-Item -ItemType Directory -Path (Join-Path $airiLocal 'pnpm') -Force | Out-Null
    tar -xf (Join-Path $airiLocal 'pnpm.tgz') -C (Join-Path $airiLocal 'pnpm') --strip-components=1
    if ($LASTEXITCODE -ne 0) { throw 'pnpm extraction failed.' }
}
$airiBin = Join-Path $airiLocal 'bin'
New-Item -ItemType Directory -Path $airiBin -Force | Out-Null
Set-Content -LiteralPath (Join-Path $airiBin 'pnpm.cmd') -Value @('@echo off', '"%~dp0..\node-v26.7.0-win-x64\node.exe" "%~dp0..\pnpm\bin\pnpm.mjs" %*', 'exit /b %ERRORLEVEL%')
if (!(Test-Path -LiteralPath (Join-Path $airiRoot '.env'))) {
    $airiToken = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $airiTemplate = Get-Content -LiteralPath (Join-Path $airiRoot '.env.hybrid.example') -Raw
    $airiTemplate = $airiTemplate.Replace('AIRI_GATEWAY_TOKEN=', "AIRI_GATEWAY_TOKEN=$airiToken")
    Set-Content -LiteralPath (Join-Path $airiRoot '.env') -Value $airiTemplate
}
if (!$SkipInstall) {
    $env:PATH = (Split-Path $airiNode -Parent) + ';' + $airiBin + ';' + $env:PATH
    $env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
    & $airiNode $airiPnpm install --frozen-lockfile --fetch-timeout=1800000 --network-concurrency=8 -F @proj-airi/root -F '@proj-airi/stage-tamagotchi...'
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & $airiNode (Join-Path $airiRoot 'scripts/fetch-cubism2-core.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Cubism 2 core download or verification failed.' }
    & $airiNode (Join-Path $airiRoot 'scripts/setup-local-voice.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Local voice model setup failed.' }
}
Write-Output 'The hybrid toolchain and .env are ready.'
