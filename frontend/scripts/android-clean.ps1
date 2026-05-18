# Limpa caches de build Android (resolve "Unable to delete directory" no Windows/OneDrive).
$ErrorActionPreference = 'Continue'
$frontendRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $frontendRoot 'android'

function Remove-DirectoryForce {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $true }
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Warning "Remove-Item falhou em $Path - a tentar robocopy..."
    }
    $empty = Join-Path $env:TEMP ("empty_" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    & robocopy $empty $Path /mir /r:1 /w:1 /njh /njs /ndl /nc /ns | Out-Null
    Remove-Item -LiteralPath $empty -Force -ErrorAction SilentlyContinue
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Warning "Nao foi possivel remover $Path - feche o Android Studio e pause o OneDrive."
        return $false
    }
}

Write-Host 'A parar daemons Gradle...'
if (Test-Path (Join-Path $androidDir 'gradlew.bat')) {
    Push-Location $androidDir
    & .\gradlew.bat --stop 2>$null
    Pop-Location
}

$paths = @(
    (Join-Path $androidDir 'app\build'),
    (Join-Path $androidDir 'build'),
    (Join-Path $androidDir 'build-modules'),
    (Join-Path $androidDir '.gradle'),
    (Join-Path $frontendRoot 'node_modules\@capacitor\android\capacitor\build'),
    (Join-Path $frontendRoot 'node_modules\@capacitor\app\android\build'),
    (Join-Path $frontendRoot 'node_modules\@capacitor\status-bar\android\build'),
    (Join-Path $androidDir 'capacitor-cordova-android-plugins\build')
)

foreach ($path in $paths) {
    if (Test-Path $path) {
        Write-Host "A remover: $path"
        Remove-DirectoryForce -Path $path | Out-Null
    }
}

$studioJbr = 'C:\Program Files\Android\Android Studio\jbr'
if (Test-Path $studioJbr) {
    $env:JAVA_HOME = $studioJbr
    $env:Path = "$studioJbr\bin;$env:Path"
    Write-Host 'JAVA_HOME definido para Android Studio JBR (JDK 17+).'
}

Write-Host 'Limpeza concluida.'
