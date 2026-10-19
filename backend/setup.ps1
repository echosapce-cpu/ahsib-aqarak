# ahsib-aqarak (احسب عقارك 100%) - one-time setup of the Google Sheets backend (Windows PowerShell 5+ / 7)
# Run:  irm https://raw.githubusercontent.com/echosapce-cpu/ahsib-aqarak/main/backend/setup.ps1 | iex
# What it does: installs Google's official Apps Script CLI (clasp), signs in to YOUR Google account in the browser,
# attaches the backend script to your sheet, deploys it as a web app, and prints the URL to send to Claude.
$ErrorActionPreference = "Stop"
$SheetId = "1YSHVjzU62NttytNINZ-S4oXpiciKjv40j70u1i9wrU8"
$Raw     = "https://raw.githubusercontent.com/echosapce-cpu/ahsib-aqarak/main/backend/Code.gs"
function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }

Step "1/6 Checking Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Installing Node.js LTS with winget..." -ForegroundColor Yellow
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js installed. Close this window, open a NEW PowerShell and run the same command again." }
}
node --version

Step "2/6 Installing clasp (Google Apps Script CLI)"
npm install -g @google/clasp@2.4.2 | Out-Null
$clasp = (Get-Command clasp -ErrorAction SilentlyContinue)
if (-not $clasp) { $env:Path += ";" + (Join-Path $env:APPDATA "npm"); }
clasp --version

Step "3/6 Turn ON the Google Apps Script API (one switch)"
Start-Process "https://script.google.com/home/usersettings"
Read-Host "In the page that opened, switch 'Google Apps Script API' to ON, then press Enter here"

Step "4/6 Sign in to Google (browser opens - choose echosapce@gmail.com and Allow)"
if (Test-Path (Join-Path $env:USERPROFILE ".clasprc.json")) { Write-Host "Already signed in - skipping." } else { clasp login }

Step "5/6 Attaching the script to your sheet and uploading the code"
$dir = Join-Path $env:TEMP ("aqar-backend-" + (Get-Date -Format "yyyyMMddHHmmss"))
New-Item -ItemType Directory -Path $dir | Out-Null
Set-Location $dir
clasp create --title "ahsib-aqarak backend" --parentId $SheetId --rootDir .
if (-not (Test-Path (Join-Path $dir ".clasp.json"))) {
  Write-Host "`nSTOPPED: Google Apps Script API is still OFF (or not active yet)." -ForegroundColor Red
  Write-Host "Open https://script.google.com/home/usersettings , switch it ON, wait 2 minutes, then run the same command again." -ForegroundColor Yellow
  Start-Process "https://script.google.com/home/usersettings"
  return
}
Invoke-WebRequest -UseBasicParsing $Raw -OutFile (Join-Path $dir "Code.gs")
$manifest = @'
{
  "timeZone": "Asia/Dubai",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "webapp": { "access": "ANYONE_ANONYMOUS", "executeAs": "USER_DEPLOYING" }
}
'@
[IO.File]::WriteAllText((Join-Path $dir "appsscript.json"), $manifest, (New-Object Text.UTF8Encoding($false)))
clasp push --force

Step "6/6 Deploying as a web app"
$out = clasp deploy --description "v1" 2>&1 | Out-String
Write-Host $out
$m = [regex]::Match($out, "(AKfy[\w-]+)")
if (-not $m.Success) { throw "Could not read the deployment id from the output above. Send Claude a screenshot." }
$url = "https://script.google.com/macros/s/$($m.Groups[1].Value)/exec"
Set-Clipboard -Value $url
Write-Host "`nWEB APP URL (copied to clipboard):" -ForegroundColor Green
Write-Host $url -ForegroundColor Green
Write-Host "`nA browser tab will open it once. If Google asks for permission: choose your account > Advanced > Go to (unsafe) > Allow." -ForegroundColor Yellow
Write-Host "Then send the URL above to Claude." -ForegroundColor Yellow
Start-Process $url
