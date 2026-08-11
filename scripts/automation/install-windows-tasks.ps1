[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$startScript = Join-Path $PSScriptRoot "start-local-site.ps1"
$refreshScript = Join-Path $PSScriptRoot "update-market-data.ps1"
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function New-JunshiPowerShellAction([string]$scriptPath) {
  $arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
  New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $projectRoot
}

$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited

$siteSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$refreshSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

$siteTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$codexTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$codexTrigger.Delay = "PT1M"
$refreshTrigger = New-ScheduledTaskTrigger `
  -Weekly `
  -WeeksInterval 1 `
  -DaysOfWeek @(
    [DayOfWeek]::Monday,
    [DayOfWeek]::Tuesday,
    [DayOfWeek]::Wednesday,
    [DayOfWeek]::Thursday,
    [DayOfWeek]::Friday
  ) `
  -At ([DateTime]::Today.AddHours(13).AddMinutes(45))

$siteTaskParameters = @{
  Action = New-JunshiPowerShellAction $startScript
  Trigger = $siteTrigger
  Principal = $principal
  Settings = $siteSettings
  Description = "Start the Junshi Radar local site after Windows sign-in."
}
$siteTask = New-ScheduledTask @siteTaskParameters

$codexTaskParameters = @{
  Action = New-ScheduledTaskAction -Execute "$env:SystemRoot\explorer.exe" -Argument "codex://"
  Trigger = $codexTrigger
  Principal = $principal
  Settings = $siteSettings
  Description = "Start Codex after Windows sign-in so the Junshi Radar publishing schedule can run."
}
$codexTask = New-ScheduledTask @codexTaskParameters

$refreshTaskParameters = @{
  Action = New-JunshiPowerShellAction $refreshScript
  Trigger = $refreshTrigger
  Principal = $principal
  Settings = $refreshSettings
  Description = "Refresh Junshi Radar with Taishin Nova and official market data at 13:45 on weekdays."
}
$refreshTask = New-ScheduledTask @refreshTaskParameters

Register-ScheduledTask -TaskName "JunshiRadar-LocalSite" -InputObject $siteTask -Force | Out-Null
Register-ScheduledTask -TaskName "JunshiRadar-CodexScheduler" -InputObject $codexTask -Force | Out-Null
Register-ScheduledTask -TaskName "JunshiRadar-MarketRefresh" -InputObject $refreshTask -Force | Out-Null

Start-ScheduledTask -TaskName "JunshiRadar-LocalSite"

Get-ScheduledTask -TaskName "JunshiRadar-LocalSite", "JunshiRadar-CodexScheduler", "JunshiRadar-MarketRefresh" |
  Select-Object TaskName, State
