# הגדרת משתני סביבה ב-Vercel
# הרץ: .\scripts\setup-vercel-env.ps1
# דרוש: npx vercel login (פעם אחת) + vercel link (אם הפרויקט לא מחובר)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# קרא ערכים מ-.env.local
$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Host "קובץ .env.local לא נמצא!" -ForegroundColor Red
    exit 1
}

$content = Get-Content $envFile -Raw
$url = ($content | Select-String "NEXT_PUBLIC_SUPABASE_URL=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() })
$key = ($content | Select-String "NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() })

if (-not $url -or -not $key) {
    Write-Host "חסרים משתנים ב-.env.local" -ForegroundColor Red
    exit 1
}

Write-Host "מוסיף משתני סביבה ל-Vercel..." -ForegroundColor Cyan

# שימוש בקבצי temp כדי להעביר ערכים (מבטיח טיפול נכון בתווים)
$urlFile = [System.IO.Path]::GetTempFileName()
$keyFile = [System.IO.Path]::GetTempFileName()
try {
    [System.IO.File]::WriteAllText($urlFile, $url)
    [System.IO.File]::WriteAllText($keyFile, $key)

    $envs = @("production", "preview", "development")
    foreach ($envName in $envs) {
        Write-Host "  NEXT_PUBLIC_SUPABASE_URL ($envName)..." -ForegroundColor Gray
        Get-Content $urlFile -Raw | npx vercel env add NEXT_PUBLIC_SUPABASE_URL $envName --force 2>$null
        Write-Host "  NEXT_PUBLIC_SUPABASE_ANON_KEY ($envName)..." -ForegroundColor Gray
        Get-Content $keyFile -Raw | npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY $envName --force 2>$null
    }

    Write-Host "`nהמשתנים הוגדרו בהצלחה!" -ForegroundColor Green
    Write-Host "הרץ 'npx vercel --prod' או פרוס מחדש מ-Dashboard כדי להחיל." -ForegroundColor Yellow
} finally {
    Remove-Item $urlFile, $keyFile -ErrorAction SilentlyContinue
}
