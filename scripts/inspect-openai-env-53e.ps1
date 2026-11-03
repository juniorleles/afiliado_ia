function Get-KeyFingerprint([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return "absent" }
  $trimmed = $value.Trim()
  $sha = [BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($trimmed))
  ).Replace("-", "").Substring(0, 12).ToLower()
  $cls = "other"
  if ($trimmed.StartsWith("sk-proj-")) { $cls = "sk-proj" }
  elseif ($trimmed.StartsWith("sk-")) { $cls = "sk" }
  return "$cls len=$($trimmed.Length) sha25612=$sha"
}

Write-Output ("process=" + (Get-KeyFingerprint ([Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "Process"))))
Write-Output ("user=" + (Get-KeyFingerprint ([Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "User"))))
Write-Output ("machine=" + (Get-KeyFingerprint ([Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "Machine"))))
Write-Output ("envLocalMtimeUtc=" + (Get-Item -LiteralPath ".env.local").LastWriteTimeUtc.ToString("o"))

Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and ($_.CommandLine -match "afiliado_ia") -and ($_.CommandLine -match "next")
} | ForEach-Object {
  $proc = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Output ("nextPid=" + $_.ProcessId + " startUtc=" + $proc.StartTime.ToUniversalTime().ToString("o") + " name=" + $proc.ProcessName)
  }
}
