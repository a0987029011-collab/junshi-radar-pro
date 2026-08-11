[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$automationDir = Join-Path $projectRoot ".local\automation"
$logPath = Join-Path $automationDir "site.stdout.log"
$errorLogPath = Join-Path $automationDir "site.stderr.log"

New-Item -ItemType Directory -Path $automationDir -Force | Out-Null

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/radar" -TimeoutSec 5
  if ($response.StatusCode -eq 200) {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) site already healthy"
    exit 0
  }
} catch {
  # The site is not running yet. Continue with a clean start.
}

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
}
$next = Join-Path $projectRoot "node_modules\next\dist\bin\next"

Set-Location -LiteralPath $projectRoot
Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) starting local site"

$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $node $next dev --hostname 0.0.0.0 1>> $logPath 2>> $errorLogPath
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) site stopped with exit code $exitCode"
exit $exitCode
