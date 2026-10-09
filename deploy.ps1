$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.setup')) {
  $adminSecure = Read-Host 'Đặt mật khẩu quản lý (ít nhất 12 ký tự)' -AsSecureString
  $viewerSecure = Read-Host 'Đặt mật khẩu nhân viên (ít nhất 8 ký tự)' -AsSecureString
  $env:SETUP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecure).Password
  $env:SETUP_VIEWER_PASSWORD = [System.Net.NetworkCredential]::new('', $viewerSecure).Password
  try { node setup.js; if ($LASTEXITCODE -ne 0) { throw 'Khởi tạo mật khẩu thất bại.' } }
  finally { Remove-Item Env:\SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue; Remove-Item Env:\SETUP_VIEWER_PASSWORD -ErrorAction SilentlyContinue }
}
Write-Host 'Bước tiếp theo: đăng nhập Cloudflare qua trình duyệt, chỉ chọn gói miễn phí.'
npx wrangler login
if ($LASTEXITCODE -ne 0) { throw 'Chưa đăng nhập Cloudflare.' }
if (-not (Test-Path -LiteralPath '.setup\database-created.txt')) {
  $configText = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'wrangler.jsonc'))
  if ($configText.Contains('REPLACE_WITH_DATABASE_ID')) {
    npx wrangler d1 list
    Write-Host 'Nếu chưa có pageops-db, tạo mới; nếu đã có, dùng ID đó và không tạo lại.'
    $createAnswer = Read-Host 'Cần tạo database mới? Nhập y để tạo; Enter để dùng database đã có'
    if ($createAnswer -eq 'y') {
      npx wrangler d1 create pageops-db
      if ($LASTEXITCODE -ne 0) { throw 'Chưa tạo được D1. Nếu database đã tồn tại, dùng ID của database đó.' }
    }
    Write-Host 'Sao chép database_id Cloudflare trả về vào wrangler.jsonc, thay REPLACE_WITH_DATABASE_ID.'
    Read-Host 'Sau khi lưu cấu hình, nhấn Enter để tiếp tục'
    $configText = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'wrangler.jsonc'))
  }
  if ($configText.Contains('REPLACE_WITH_DATABASE_ID')) { throw 'Chưa điền database_id. Điền và chạy lại.' }
  Set-Content -LiteralPath '.setup\database-created.txt' -Value 'configured'
}
if (-not (Test-Path -LiteralPath '.setup\database-initialized.txt')) {
  npx wrangler d1 execute pageops-db --remote --file=.setup/init.sql
  if ($LASTEXITCODE -ne 0) { throw 'Khởi tạo database thất bại. Kiểm tra trước khi chạy lại.' }
  Set-Content -LiteralPath '.setup\database-initialized.txt' -Value 'initialized'
}
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Chưa tạo được Worker.' }
Get-Content -Raw -LiteralPath '.setup\pepper-secret.txt' | npx wrangler secret put PASSWORD_PEPPER
if ($LASTEXITCODE -ne 0) { throw 'Chưa lưu được secret.' }
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Chưa triển khai được web.' }
Write-Host 'Dùng link workers.dev vừa hiển thị. Chỉ chia sẻ mật khẩu nhân viên; giữ kín mật khẩu quản lý.'
