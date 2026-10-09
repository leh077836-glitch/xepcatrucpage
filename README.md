# PageOps — phương án online miễn phí

Ứng dụng chạy trên **Cloudflare Workers Free + D1 Free**, dùng địa chỉ HTTPS `workers.dev`; không cần mua tên miền. Theo tài liệu hiện tại, Workers Free có 100.000 yêu cầu/ngày, D1 Free có 5 triệu hàng đọc/ngày, 100.000 hàng ghi/ngày và tổng lưu trữ 5 GB. Với 8 người xem lịch, đây là phương án phù hợp để bắt đầu; cần theo dõi mức dùng. Không nâng lên gói trả phí tự động. Nếu vượt hạn mức miễn phí, dịch vụ có thể bị giới hạn cho đến kỳ tiếp theo.

Nguồn: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Tình trạng

Bộ mã và cấu hình đã chuẩn bị. **Chưa có link web online** vì chưa đăng nhập vào tài khoản Cloudflare của bạn. Kiểm tra cục bộ đã bao gồm quyền xem/sửa, đổi ca bù, xung đột phiên bản, session và băm mật khẩu. Chưa kiểm tra chạy thực tế hoặc mức CPU trên Cloudflare Free.

## Triển khai trên Windows

1. Tạo hoặc đăng nhập tài khoản tại https://dash.cloudflare.com/ . Chỉ chọn gói miễn phí. Bạn tự hoàn tất xác nhận tài khoản và điều khoản dịch vụ.
2. Cài Node.js LTS từ https://nodejs.org/ nếu chưa có. Giải nén thư mục này và mở PowerShell tại đây.
3. Chạy `npm install` để tải công cụ Wrangler chính thức. Sau đó chạy:

```powershell
.\deploy.ps1
```

Nếu máy chặn chạy script PowerShell, thực hiện các lệnh Wrangler thủ công bên dưới.

4. Script hỏi mật khẩu quản lý (ít nhất 12 ký tự) và mật khẩu nhân viên (ít nhất 8 ký tự), nhập được che. Hai mật khẩu cần khác nhau.
5. Trình duyệt mở để bạn đăng nhập Cloudflare và duyệt quyền Wrangler. Script tạo database D1 và in `database_id`. Điền ID đó vào `wrangler.jsonc`, thay `REPLACE_WITH_DATABASE_ID`, lưu rồi quay lại nhấn Enter.
6. Sau khi triển khai thành công, Wrangler in đường link `https://pageops-lich-truc.<tên-tài-khoản>.workers.dev`. Đây là link thực tế của web; không dùng địa chỉ minh họa này.
7. Đăng nhập quản lý, thử đổi ca; mở trình duyệt khác đăng nhập nhân viên để xác nhận chỉ xem và nhận lịch mới. Nhập bản sao JSON phiên bản 3 nếu muốn giữ lịch đã sửa trong bản cũ.
8. Chỉ gửi link và mật khẩu nhân viên cho đội ngũ. Giữ kín mật khẩu quản lý.

## Lệnh thủ công

Thiết lập mật khẩu cục bộ qua biến môi trường `SETUP_ADMIN_PASSWORD`, `SETUP_VIEWER_PASSWORD` rồi chạy `node setup.js`. Không ghi mật khẩu vào lệnh đã chia sẻ hay mã nguồn. Tiếp tục:

```powershell
npx wrangler login
npx wrangler d1 create pageops-db
# Điền database_id vào wrangler.jsonc trước khi tiếp tục.
npx wrangler d1 execute pageops-db --remote --file=.setup/init.sql
Get-Content -Raw .setup/pepper-secret.txt | npx wrangler secret put PASSWORD_PEPPER
npx wrangler deploy
```

Không chạy lại khởi tạo trên database đang dùng. Sau khi đã triển khai, cập nhật mã chỉ cần `npx wrangler deploy`; không đổi secret PASSWORD_PEPPER.

## Hoạt động

- Nhân viên nhập mật khẩu chung để xem; quản lý nhập mật khẩu riêng để sửa. Quyền được kiểm tra trên máy chủ.
- Lịch từ 01/10/2026 đến 31/12/2027; tuần thứ Hai–Chủ nhật, cân bằng theo chu kỳ 4 tuần. Máy chủ kiểm tra nghỉ 8–24 giờ và 14 ca ngày/14 ca đêm mỗi chu kỳ đầy đủ.
- Dữ liệu lưu D1; mọi người xem cùng một lịch. Trang kiểm tra lịch mới mỗi 15 giây. Phiên hết hạn sau 8 giờ; nhập sai nhiều lần bị tạm chặn.
- Đổi ca bù được kiểm tra và lưu cả hai ngày cùng lúc. Cập nhật từ phiên quản lý cũ bị chặn để tránh ghi đè.
- Quản lý đổi mật khẩu trong web, tải JSON để sao lưu. Lịch sử giữ 30 thay đổi gần nhất; chưa có nút khôi phục trực tiếp. Dữ liệu mật khẩu dùng PBKDF2-SHA256 600.000 vòng trong trình duyệt qua HTTPS, kết hợp HMAC với secret riêng chỉ có trên máy chủ; mật khẩu gốc không lưu vào D1.
- Tệp `.setup/` chứa dữ liệu khởi tạo và secret; không gửi cho nhân viên hoặc đưa vào Git. Mất hoặc thay PASSWORD_PEPPER sẽ khiến đăng nhập không hoạt động; giữ bản sao secret riêng.
- Bản miễn phí không dùng `render.yaml` hay ổ SQLite của bản Node/Render. `worker.mjs` là tệp triển khai Cloudflare; `app.html`/`login.html` chỉ là nguồn giao diện.

## Khôi phục mật khẩu quản lý

Người sở hữu tài khoản Cloudflare có thể đặt lại hash mật khẩu trong D1 bằng secret PASSWORD_PEPPER và salt hiện có. Đây là thao tác quản trị; liên hệ người triển khai, không xóa database vì sẽ mất lịch. Mật khẩu xem lịch/quản lý chỉ áp dụng cho web của bạn, không phải mật khẩu Cloudflare.
