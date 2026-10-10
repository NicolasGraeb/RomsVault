$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Host '.env already exists; no changes made.'
    exit 0
}
function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$configText = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw
foreach ($key in @('POSTGRES_PASSWORD','REDIS_PASSWORD','S3_SECRET_KEY','ADMIN_PASSWORD')) {
    $configText = $configText -replace "(?m)^$key=.*$", "$key=$(New-LocalSecret)"
}
[System.IO.File]::WriteAllText($envPath, $configText)
Write-Host 'Created .env with random credentials. Admin login is stored in .env.'
