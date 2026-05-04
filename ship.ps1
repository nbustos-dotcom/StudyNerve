param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Message
)

if (-not $Message.Trim()) {
    Write-Host "ERROR: commit message cannot be empty" -ForegroundColor Red
    exit 1
}

function Die([string]$step) {
    Write-Host ""
    Write-Host "FAILED at: $step" -ForegroundColor Red
    exit 1
}

# ── Stop uvicorn ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Stopping uvicorn..." -ForegroundColor Cyan
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -like '*uvicorn*' }
if ($procs) {
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "  Stopped $(@($procs).Count) process(es)." -ForegroundColor DarkGray
} else {
    Write-Host "  Not running." -ForegroundColor DarkGray
}

# ── Git ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "git add ." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) { Die "git add ." }

Write-Host ""
Write-Host "git commit" -ForegroundColor Cyan
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Die "git commit" }

Write-Host ""
Write-Host "git push cloud-deploy" -ForegroundColor Cyan
git push origin cloud-deploy
if ($LASTEXITCODE -ne 0) { Die "git push origin cloud-deploy" }

Write-Host ""
Write-Host "Shipped." -ForegroundColor Green
