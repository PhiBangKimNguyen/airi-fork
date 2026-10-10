param([switch]$Debug)

$ErrorActionPreference = 'Stop'
$airiRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $airiRoot
$airiNode = Join-Path $airiRoot '.local/node-v26.7.0-win-x64/node.exe'
$airiPnpm = Join-Path $airiRoot '.local/pnpm/bin/pnpm.mjs'
if (!(Test-Path -LiteralPath $airiNode) -or !(Test-Path -LiteralPath $airiPnpm)) {
    throw 'Run scripts/setup-hybrid.ps1 first.'
}
$airiSettings = @{}
Get-Content -LiteralPath (Join-Path $airiRoot '.env') | ForEach-Object {
    if ($_ -match '^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$') {
        $airiSettings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
$airiPort = $airiSettings.AIRI_GATEWAY_PORT
$env:AIRI_HYBRID_ENABLED = 'true'
$env:AIRI_ENABLE_LOCAL_ASR = if ($airiSettings.AIRI_ENABLE_LOCAL_ASR -eq 'true') { 'true' } else { 'false' }
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
# Trust this checkout only in the launcher process and its children.
# The initial checkout owner can differ from the interactive Windows account.
$airiGitIndex = if ($env:GIT_CONFIG_COUNT) { [int]$env:GIT_CONFIG_COUNT } else { 0 }
Set-Item -LiteralPath "Env:GIT_CONFIG_KEY_$airiGitIndex" -Value 'safe.directory'
Set-Item -LiteralPath "Env:GIT_CONFIG_VALUE_$airiGitIndex" -Value $airiRoot.Replace('\', '/')
$env:GIT_CONFIG_COUNT = [string]($airiGitIndex + 1)
$env:VITE_AIRI_HYBRID_ENABLED = 'true'
$env:VITE_AIRI_MODEL_ROLES_ENABLED = if ($airiSettings.AIRI_MODEL_ROLES_ENABLED -eq 'true') { 'true' } else { 'false' }
$env:VITE_AIRI_PUBLIC_CHARACTER_PROMPT = $airiSettings.AIRI_PUBLIC_CHARACTER_PROMPT
$env:VITE_AIRI_GATEWAY_URL = "http://127.0.0.1:$airiPort"
$env:VITE_AIRI_GATEWAY_TOKEN = $airiSettings.AIRI_GATEWAY_TOKEN
$env:VITE_LOCAL_TTS_VOICE = if ($airiSettings.LOCAL_TTS_VOICE) { $airiSettings.LOCAL_TTS_VOICE } elseif ($airiSettings.LOCAL_TTS_PROVIDER -eq 'voicevox') { '60' } else { 'af_heart' }
$env:VITE_LOCAL_TTS_PROVIDER = if ($airiSettings.LOCAL_TTS_PROVIDER) { $airiSettings.LOCAL_TTS_PROVIDER } else { 'kokoro' }
$env:VITE_LOCAL_REPLY_LANGUAGE = $airiSettings.LOCAL_REPLY_LANGUAGE
$airiVoicevoxPort = if ($airiSettings.LOCAL_VOICEVOX_PORT) { [int]$airiSettings.LOCAL_VOICEVOX_PORT } else { 50021 }
$env:VITE_LOCAL_VOICEVOX_URL = "http://127.0.0.1:$airiVoicevoxPort/"
$env:APP_USER_DATA_PATH = Join-Path $airiRoot '.local/hybrid-user-data'
$env:PATH = (Split-Path $airiNode -Parent) + ';' + (Join-Path $airiRoot '.local/bin') + ';' + $env:PATH
if ($Debug) {
    $env:APP_REMOTE_DEBUG = 'true'
    $env:APP_REMOTE_DEBUG_PORT = '9250'
    $env:APP_REMOTE_DEBUG_NO_OPEN = 'true'
}
else {
    $env:APP_REMOTE_DEBUG = 'false'
}
$airiGatewayScript = Join-Path $airiRoot 'apps/stage-tamagotchi/scripts/hybrid/gateway.ts'
$airiGateway = Start-Process -FilePath $airiNode -ArgumentList @('--import', 'tsx', "`"$airiGatewayScript`"") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $airiRoot '.local/gateway.log') -RedirectStandardError (Join-Path $airiRoot '.local/gateway-error.log')
$airiVoicevox = $null
try {
    if ($airiSettings.LOCAL_TTS_PROVIDER -eq 'voicevox') {
        $airiPython = Join-Path $airiRoot '.local/voicevox/venv/Scripts/python.exe'
        if (!(Test-Path -LiteralPath $airiPython)) { throw 'The selected local VOICEVOX runtime is missing.' }
        $airiVoicevoxScript = Join-Path $airiRoot 'scripts/voicevox-local-server.py'
        $airiVoicevox = Start-Process -FilePath $airiPython -ArgumentList @('-u', "`"$airiVoicevoxScript`"", '--port', $airiVoicevoxPort) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $airiRoot '.local/voicevox/server.log') -RedirectStandardError (Join-Path $airiRoot '.local/voicevox/server-error.log')
        $airiVoiceReady = $false
        for ($airiAttempt = 0; $airiAttempt -lt 90; $airiAttempt++) {
            if ($airiVoicevox.HasExited) { throw 'VOICEVOX failed. Read .local/voicevox/server-error.log.' }
            try {
                $airiVersion = Invoke-RestMethod ($env:VITE_LOCAL_VOICEVOX_URL + 'version') -TimeoutSec 1
                if ($airiVersion -eq 'airi-local-core-0.17.0') { $airiVoiceReady = $true; break }
            }
            catch { Start-Sleep -Milliseconds 500 }
        }
        if (!$airiVoiceReady) { throw 'The local Japanese voice did not start.' }
    }
    $airiOllamaReady = $false
    try {
        $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2
        $airiOllamaReady = $true
    }
    catch {
        $airiOllamaReady = $false
    }
    if (!$airiOllamaReady) {
        $airiOllamaLauncher = if ($airiSettings.LOCAL_OLLAMA_LAUNCHER) { $airiSettings.LOCAL_OLLAMA_LAUNCHER } else { 'F:\Nec Download\AgentRunway\tools\local-ai\ollama.ps1' }
        try {
            if (!(Test-Path -LiteralPath $airiOllamaLauncher -PathType Leaf)) {
                throw "The Ollama launcher is missing: $airiOllamaLauncher. Set LOCAL_OLLAMA_LAUNCHER in .env."
            }
            & powershell -NoProfile -ExecutionPolicy Bypass -File $airiOllamaLauncher -Action Start
            if ($LASTEXITCODE -ne 0) { throw "The Ollama launcher exited with code $LASTEXITCODE." }
            $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2
        }
        catch {
            throw "The local Ollama server failed to start with '$airiOllamaLauncher': $($_.Exception.Message)"
        }
    }
    if ($airiSettings.LOCAL_QWEN_BASE_URL -eq 'http://127.0.0.1:11434/v1/') {
        $airiModels = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
        if (!$airiSettings.LOCAL_QWEN_MODEL -or $airiSettings.LOCAL_QWEN_MODEL -notin $airiModels.models.name) {
            throw 'The configured LOCAL_QWEN_MODEL is absent. Select an installed model or run scripts/setup-hybrid.ps1.'
        }
        Write-Output 'Prepare the local commentary model before AIRI starts.'
        $airiWarmBody = @{
            model = $airiSettings.LOCAL_QWEN_MODEL
            stream = $false
            think = $false
            keep_alive = '30m'
        } | ConvertTo-Json
        $airiWarmResult = Invoke-RestMethod -Method Post 'http://127.0.0.1:11434/api/generate' -ContentType 'application/json' -Body $airiWarmBody -TimeoutSec 180
        if (!$airiWarmResult.done) { throw 'The local commentary model did not become ready.' }
    }
    $airiReady = $false
    for ($airiAttempt = 0; $airiAttempt -lt 30; $airiAttempt++) {
        if ($airiGateway.HasExited) {
            throw 'The gateway failed. Read .local/gateway-error.log.'
        }
        try {
            $airiResponse = Invoke-RestMethod "$env:VITE_AIRI_GATEWAY_URL/local/v1/models" -Headers @{Authorization = "Bearer $env:VITE_AIRI_GATEWAY_TOKEN"} -TimeoutSec 1
            if ($airiResponse.data) { $airiReady = $true; break }
        }
        catch { Start-Sleep -Milliseconds 300 }
    }
    if (!$airiReady) { throw 'The local gateway did not start.' }
    & $airiNode $airiPnpm dev:tamagotchi
    if ($LASTEXITCODE -ne 0) { throw "AIRI exited with code $LASTEXITCODE." }
}
finally {
    if ($airiVoicevox -and !$airiVoicevox.HasExited) { Stop-Process -Id $airiVoicevox.Id }
    if (!$airiGateway.HasExited) { Stop-Process -Id $airiGateway.Id }
}
