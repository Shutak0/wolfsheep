$file = "client/public/css/style.css"
$content = [System.IO.File]::ReadAllText($file)
$idx = $content.LastIndexOf("/* ---------- responsive ---------- */")
if ($idx -gt 0) {
    $content = $content.Substring(0, $idx).TrimEnd() + "`n"
    [System.IO.File]::WriteAllText($file, $content)
    Write-Host "OK"
} else {
    Write-Host "NOT FOUND"
}
