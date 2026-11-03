Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    $_.CommandLine -match "next" -or
    $_.CommandLine -match "npm run dev" -or
    $_.CommandLine -match "dev-server" -or
    $_.CommandLine -match "afiliado_ia"
  ) -and $_.Name -match "node|npm|cmd|powershell"
} | ForEach-Object {
  $proc = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  $start = if ($proc) { $proc.StartTime.ToUniversalTime().ToString("o") } else { "unknown" }
  $cl = $_.CommandLine
  if ($cl.Length -gt 240) { $cl = $cl.Substring(0, 240) + "..." }
  Write-Output ("pid=" + $_.ProcessId + " parent=" + $_.ParentProcessId + " startUtc=" + $start + " name=" + $_.Name)
  Write-Output ("  cmd=" + $cl)
}
