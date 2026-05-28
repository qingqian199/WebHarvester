param([switch]$Fix)

$errors = @()
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Resolve-Path "$scriptDir/.."
$srcDir = "$projectDir/src"

Write-Host "=== WebHarvester Quality Check ===" -ForegroundColor Cyan
Write-Host ""

# -- 1. TypeScript --
Write-Host "[1/5] TypeScript compilation..." -ForegroundColor Yellow
$tsOutput = npx tsc --noEmit 2>&1
if ($LASTEXITCODE -ne 0) {
  $tsErrors = @($tsOutput | Where-Object { $_ -match "error TS" })
  $errors += "TypeScript compilation failed ($($tsErrors.Count) errors)"
  Write-Host "  FAIL: $($tsErrors.Count) errors" -ForegroundColor Red
} else {
  Write-Host "  PASS: 0 errors" -ForegroundColor Green
}

# -- 2. Empty catch check (allowed with inline comment) --
Write-Host "[2/5] Empty catch check..." -ForegroundColor Yellow
$emptyCatches = Get-ChildItem -Recurse -Filter "*.ts" $srcDir | Select-String -Pattern "catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}"
$invalidCatches = 0
$validCatches = 0
foreach ($m in $emptyCatches) {
  $lineNum = $m.LineNumber  # 1-based
  $content = Get-Content -Path $m.Path -TotalCount ($lineNum + 1)
  $startIdx = [Math]::Max(0, $lineNum - 2)  # 0-based
  $endIdx = $lineNum - 1  # 0-based (the catch line itself)
  $context = $content[$startIdx..$endIdx] -join " "
  $hasComment = $context -match "//\s*(ok|ignore|expected|fallback|noop)"
  if ($hasComment) { $validCatches++ } else { $invalidCatches++ }
}
if ($invalidCatches -gt 0) {
  $errors += "Empty catches without comment: $invalidCatches (exempted: $validCatches)"
  Write-Host "  FAIL: $invalidCatches uncommented (exempted: $validCatches)" -ForegroundColor Red
} else {
  Write-Host "  PASS: 0 uncommented (exempted: $validCatches)" -ForegroundColor Green
}

# -- 3. File-level eslint-disable no-explicit-any --
Write-Host "[3/5] File-level no-explicit-any..." -ForegroundColor Yellow
$anyDisables = Get-ChildItem -Recurse -Filter "*.ts" $srcDir | Select-String -Pattern "eslint-disable.*no-explicit-any"
$fileLevelAny = 0
foreach ($m in $anyDisables) {
  if ($m.Line.Trim() -match "/\* eslint-disable") { $fileLevelAny++ }
}
if ($fileLevelAny -gt 3) {
  $errors += "File-level no-explicit-any: $fileLevelAny (limit: 3)"
  Write-Host "  FAIL: $fileLevelAny (max 3)" -ForegroundColor Red
} else {
  Write-Host "  PASS: $fileLevelAny (max 3)" -ForegroundColor Green
}

# -- 4. Large files --
Write-Host "[4/5] File size check..." -ForegroundColor Yellow
$badFiles = @()
$allowedFiles = @()
Get-ChildItem -Recurse -Filter "*.ts" $srcDir | ForEach-Object {
  $lines = (Get-Content $_.FullName | Measure-Object -Line).Lines
  $rel = $_.FullName.Substring($projectDir.Length + 1)
  if ($lines -gt 500) {
    if ($_.Name -eq "tools.ts" -and $lines -le 600) {
      $allowedFiles += "$rel ($lines lines, exempted)"
    } else {
      $badFiles += "$rel ($lines lines)"
    }
  }
}
foreach ($f in $badFiles) { $errors += "Large file: $f"; Write-Host "  FAIL: $f" -ForegroundColor Red }
foreach ($f in $allowedFiles) { Write-Host "  WARN: $f" -ForegroundColor DarkYellow }
if ($badFiles.Count -eq 0) { Write-Host "  PASS" -ForegroundColor Green }

# -- 5. Core tests --
Write-Host "[5/5] Core tests..." -ForegroundColor Yellow
$testResult = npx jest --no-coverage --testTimeout=30000 --testPathIgnorePatterns='web/|cli/handlers|middleware/__tests__/(BossSecurity|BrowserSignature)|BossSession|StrategyOrchestrator|capture-integration|FileSessionManager' --passWithNoTests 2>&1 | Select-String -Pattern "(Suites:|Tests:|Snapshots:)" | ForEach-Object { $_.Line.Trim() }
if ($LASTEXITCODE -eq 0) {
  Write-Host "  PASS: $testResult" -ForegroundColor Green
} else {
  $errors += "Core tests failed"
  Write-Host "  FAIL: $testResult" -ForegroundColor Red
}

# -- Summary --
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
  Write-Host "RESULT: PASS - All quality checks passed" -ForegroundColor Green
} else {
  Write-Host "RESULT: FAIL - $($errors.Count) issue(s) found:" -ForegroundColor Red
  foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
}
Write-Host "================================================" -ForegroundColor Cyan
exit $errors.Count
