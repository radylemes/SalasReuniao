# Copia o build Angular para assets Android como ficheiros reais (Gradle + OneDrive).
$ErrorActionPreference = 'Stop'
$frontendRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $frontendRoot 'dist\frontend-app\browser'
$publicAssets = Join-Path $frontendRoot 'android\app\src\main\assets\public'

if (-not (Test-Path $webDir)) {
    Write-Error "Build nao encontrado: $webDir. Execute 'npm run build:tablet' primeiro."
    exit 1
}

# Pasta temporaria fora do OneDrive evita placeholders/reparse points no destino.
$temp = Join-Path $env:LOCALAPPDATA ("salasreuniao_cap_assets_" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null

function Invoke-RobocopyMirror {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path $Destination)) {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }
  & robocopy $Source $Destination /e /copy:DAT /dcopy:DAT /xj /xjd /r:2 /w:2 /njh /njs /ndl /nc /ns | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy falhou ($Source -> $Destination), codigo $LASTEXITCODE"
    }
}

try {
    Write-Host "A materializar assets a partir de dist (fora do OneDrive)..."
    Invoke-RobocopyMirror -Source $webDir -Destination $temp

    if (Test-Path $publicAssets) {
        Remove-Item -LiteralPath $publicAssets -Recurse -Force
    }
    New-Item -ItemType Directory -Path $publicAssets -Force | Out-Null
    Invoke-RobocopyMirror -Source $temp -Destination $publicAssets

    $reparsePoints = Get-ChildItem -LiteralPath $publicAssets -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }

    if ($reparsePoints) {
        $sample = ($reparsePoints | Select-Object -First 3 | ForEach-Object { $_.FullName }) -join '; '
        Write-Error "Ainda existem ficheiros nao regulares em assets/public (ex.: $sample). Pause o OneDrive e repita o build."
        exit 1
    }

    Write-Host 'Assets materializados com sucesso.'
}
finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
