param([string]$Origin = 'http://localhost:5173')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$settings = @{}
Get-Content -LiteralPath (Join-Path $projectRoot '.env') | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
$env:DATABASE_URL = 'postgres://{0}:{1}@localhost:{2}/{3}?sslmode=disable' -f $settings.POSTGRES_USER, [uri]::EscapeDataString($settings.POSTGRES_PASSWORD), $settings.POSTGRES_PORT, $settings.POSTGRES_DB
$env:REDIS_URL = 'redis://:{0}@localhost:{1}/0' -f [uri]::EscapeDataString($settings.REDIS_PASSWORD), $settings.REDIS_PORT
$env:S3_ENDPOINT = 'http://localhost:' + $settings.S3_PORT
$env:HTTP_PORT = $settings.API_PORT
$env:APP_ORIGIN = $Origin
$env:TRUST_PROXY = 'false'
foreach ($key in @('S3_ACCESS_KEY','S3_SECRET_KEY','S3_BUCKET','ADMIN_EMAIL','ADMIN_PASSWORD','COOKIE_SECURE','MAX_UPLOAD_GB','REGISTRATION_ENABLED')) {
    [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
}
Push-Location (Join-Path $projectRoot 'backend')
try { go run . } finally { Pop-Location }
