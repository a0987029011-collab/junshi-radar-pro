[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Save-DpapiSecret {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  $secret = Read-Host $Prompt -AsSecureString
  if ($secret.Length -eq 0) {
    throw 'This field cannot be empty.'
  }
  $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $Destination -Encoding ascii
}

try {
  $resolvedCertificate = (Resolve-Path -LiteralPath $CertificatePath).Path
  $certificateExtension = [IO.Path]::GetExtension($resolvedCertificate).ToLowerInvariant()
  if (@('.pfx', '.p12') -notcontains $certificateExtension) {
    throw 'The certificate backup must be a .pfx or .p12 file.'
  }

  $projectRoot = Split-Path -Parent $PSScriptRoot
  $configDir = Join-Path $projectRoot '.local\taishin-nova\credentials'
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null

  Write-Host ''
  Write-Host 'Junshi Radar | Taishin Nova secure setup' -ForegroundColor Cyan
  Write-Host 'Your entries are encrypted for the current Windows user.'
  Write-Host 'Passwords are hidden and are never saved in the website or Git repository.'
  Write-Host ''

  Save-DpapiSecret -Prompt '1/3 Taishin login personal ID' -Destination (Join-Path $configDir 'personal-id.dpapi')
  Save-DpapiSecret -Prompt '2/3 Taishin login password' -Destination (Join-Path $configDir 'login-password.dpapi')
  Save-DpapiSecret -Prompt '3/3 Certificate backup password' -Destination (Join-Path $configDir 'certificate-password.dpapi')

  @{
    certificatePath = $resolvedCertificate
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $configDir 'config.json') -Encoding utf8

  $envPath = Join-Path $projectRoot '.env.local'
  $setting = 'TAISHIN_SECURE_CONFIG_DIR=.local/taishin-nova/credentials'
  $envContent = if (Test-Path -LiteralPath $envPath) {
    Get-Content -Raw -LiteralPath $envPath
  } else {
    "MARKET_DATA_PROVIDER=auto`r`nTAISHIN_NOVA_SDK_PATH=.local/taishin-nova/node_modules/taishin-sdk`r`n"
  }
  if ($envContent -match '(?m)^TAISHIN_SECURE_CONFIG_DIR=') {
    $envContent = $envContent -replace '(?m)^TAISHIN_SECURE_CONFIG_DIR=.*$', $setting
  } else {
    $envContent = $envContent.TrimEnd() + "`r`n$setting`r`n"
  }
  Set-Content -LiteralPath $envPath -Value $envContent -Encoding utf8

  Write-Host ''
  Write-Host 'Secure setup complete. Return to Codex and say: input complete.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host 'Press Enter to close this window'
