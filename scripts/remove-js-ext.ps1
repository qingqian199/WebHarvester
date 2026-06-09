# Remove .js extensions from import/export paths in all .ts files
$files = Get-ChildItem -Recurse -Filter "*.ts" "src"
foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  $newContent = $content -replace '(from\s+")([^"]+)\.js(")', '$1$2$3'
  $newContent = $newContent -replace "(from\s+')([^']+)\.js(')", '$1$2$3'
  if ($newContent -ne $content) {
    Set-Content $file.FullName -NoNewline -Value $newContent
    Write-Output "Fixed: $($file.FullName)"
  }
}
