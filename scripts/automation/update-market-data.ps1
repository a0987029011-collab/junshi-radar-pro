[CmdletBinding()]
param(
  [int]$MaximumAttempts = 3,
  [int]$RetryDelaySeconds = 180,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$automationDir = Join-Path $projectRoot ".local\automation"
$logPath = Join-Path $automationDir "market-refresh.log"
$statusPath = Join-Path $automationDir "last-refresh.json"
$lockPath = Join-Path $automationDir "market-refresh.lock"
$snapshotPath = Join-Path $projectRoot "data\radar-snapshot.json"

New-Item -ItemType Directory -Path $automationDir -Force | Out-Null

if (-not $Force -and (Get-Date).DayOfWeek -in @("Saturday", "Sunday")) {
  @{ status = "skipped"; reason = "weekend"; checkedAt = (Get-Date).ToString("o") } |
    ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
  exit 0
}

$lockStream = $null
try {
  try {
    $lockStream = [System.IO.File]::Open(
      $lockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch [System.IO.IOException] {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) another refresh is already running"
    exit 0
  }

  $node = "C:\Program Files\nodejs\node.exe"
  if (-not (Test-Path -LiteralPath $node)) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
  }

  Set-Location -LiteralPath $projectRoot
  for ($attempt = 1; $attempt -le $MaximumAttempts; $attempt += 1) {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) refresh attempt $attempt/$MaximumAttempts"
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $node
    $startInfo.Arguments = '--env-file-if-exists=.env.local scripts/fetch-market-snapshot.mjs'
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($stdout) { Add-Content -LiteralPath $logPath -Value $stdout.TrimEnd() }
    if ($stderr) { Add-Content -LiteralPath $logPath -Value $stderr.TrimEnd() }

    $completed = $process.ExitCode -eq 0
    if ($completed) {
      Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) building signal research payload"
      $researchStartInfo = New-Object System.Diagnostics.ProcessStartInfo
      $researchStartInfo.FileName = $node
      $researchStartInfo.Arguments = '--experimental-strip-types scripts/build-signal-research-payload.ts'
      $researchStartInfo.WorkingDirectory = $projectRoot
      $researchStartInfo.UseShellExecute = $false
      $researchStartInfo.CreateNoWindow = $true
      $researchStartInfo.RedirectStandardOutput = $true
      $researchStartInfo.RedirectStandardError = $true
      $researchProcess = [System.Diagnostics.Process]::Start($researchStartInfo)
      $researchStdoutTask = $researchProcess.StandardOutput.ReadToEndAsync()
      $researchStderrTask = $researchProcess.StandardError.ReadToEndAsync()
      $researchProcess.WaitForExit()
      $researchStdout = $researchStdoutTask.GetAwaiter().GetResult()
      $researchStderr = $researchStderrTask.GetAwaiter().GetResult()
      if ($researchStdout) { Add-Content -LiteralPath $logPath -Value $researchStdout.TrimEnd() }
      if ($researchStderr) { Add-Content -LiteralPath $logPath -Value $researchStderr.TrimEnd() }
      $completed = $researchProcess.ExitCode -eq 0
    }

    if ($completed) {
      $snapshot = Get-Content -LiteralPath $snapshotPath -Raw -Encoding utf8 | ConvertFrom-Json
      @{
        status = "succeeded"
        dataAsOf = $snapshot.meta.dataAsOf
        generatedAt = $snapshot.meta.generatedAt
        completedAt = (Get-Date).ToString("o")
        attempt = $attempt
      } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
      Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) refresh succeeded for $($snapshot.meta.dataAsOf)"
      exit 0
    }

    if ($attempt -lt $MaximumAttempts) {
      Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) retrying in $RetryDelaySeconds seconds"
      Start-Sleep -Seconds $RetryDelaySeconds
    }
  }

  @{
    status = "failed"
    completedAt = (Get-Date).ToString("o")
    attempts = $MaximumAttempts
  } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
  exit 1
} finally {
  if ($lockStream) { $lockStream.Dispose() }
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
