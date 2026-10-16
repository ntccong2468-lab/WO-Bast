# AI Studio 0.2 — kết quả triển khai

Ngày 2026-10-16. Nhánh work, mã triển khai trực tiếp theo kế hoạch đã được người dùng cho phép tiếp tục; kiểm thử live được người dùng để lại khi có app.

## Đã triển khai

Asset store theo seller, migration SQLite v1→v2, kiểm tra định dạng và pixel, giới hạn 6 ảnh/20 MiB mỗi ảnh/60 MiB tổng mỗi tác vụ, thumbnail và xem lớn 1600px. Ảnh được sao chép vào userData/assets; renderer chỉ dùng asset id, không đọc filesystem tùy ý.

Snapshot ghép prompt tổng, ảnh và audit; dùng defaults cá nhân cho lựa chọn thông thường/batch, giữ lựa chọn trực tiếp từ Kho Prompt. Snapshot giữ id/phiên bản/nội dung khi prompt bị sửa/xóa. Main kiểm tra ownership và biến trước tạo job.

Images edit qua OpenAI SDK chính thức gửi multipart bytes thật, gpt-image-1, native 1024×1536; 3:4 thêm lề trắng, không kéo giãn/cắt sản phẩm. Responses audit dùng gpt-4.1-mini với structured images và JSON schema đã validate. SDK maxRetries=0, timeout 180s, host cố định và proxy kế thừa, không chuyển Authorization theo redirect.

Batch chạy tuần tự; dừng queued trong lúc generating vẫn khả dụng. Timeout/network sau gửi chuyển uncertain; restart không tự gửi API. Audit lỗi giữ ảnh, chỉ audit lại; audit fail không approve; manual_review cần xác nhận. Lịch sử hiển thị được ảnh gốc của chính job và ảnh tạo để đối chiếu, kể cả sau restart.

Cấu hình app có ô password, lưu/xóa khóa riêng seller qua safeStorage và kiểm tra kết nối chỉ đọc. Từ chối Linux basic_text; trên Windows dùng cơ chế OS. Nếu có credential môi trường, UI ghi rõ nguồn dùng chung và ưu tiên môi trường. Không trả khóa về renderer, lưu plaintext trong DB, hoặc đóng gói khóa vào bản phân phối.

## Kiểm chứng cuối

| Lệnh | Kết quả |
| --- | --- |
| npm test | 38/38 PASS, 13 test files |
| npm run typecheck | PASS |
| npm run build | PASS main/preload/renderer |
| npm run test:e2e:cloud | 6/6 PASS, Electron/SQLite/filesystem thật |
| npm run format:check | PASS |
| git diff --check | PASS |

Hai ca Electron mới kiểm tra tải ảnh qua dialog native, thumbnail, preview prompt chưa có key, chặn tạo thiếu key, reopen giữ assets, seller isolation, password field và cửa sổ 640/1280. Không có API tính phí trong suite; SDK transport fixtures kiểm tra multipart, structured vision/schema, 401 redaction, invalid response/refusal, redirect và timeout không retry.

Review độc lập toàn nhánh tìm bốn Important: cancellation bị vô hiệu khi chạy; thiếu ảnh gốc trong history; tổng dung lượng vượt qua các lần import; default prompt ảnh bị bỏ qua. Cả bốn có kiểm thử tái hiện RED và đã sửa GREEN; suite đầy đủ đạt sau sửa. Thêm hồi quy nhận job trước await đọc ảnh để cancel không ghi đè state.

## Quyết định và giới hạn

- Dùng checkout cloud hiện tại, không worktree; không có chi phí chuyển đổi workspace.
- Pad theo kích thước native thực tế, không scale ảnh. Adapter bắt buộc 1024×1536, nên 3:4 thực tế là 1152×1536; fixture nhỏ giữ nguyên pixel để test nhanh.
- Bổ sung ZIP portable Windows x64: user giải nén rồi chạy exe, không cần Node.js. Đã kiểm checksum Electron theo gói chính thức và binary PE của dependencies Windows. Build không ký số; đóng gói trên Linux không chứng minh chạy được trên Windows.
- Cloud test dùng cờ --no-sandbox chỉ trong harness container; sản phẩm giữ sandbox:true. Chưa nghiệm thu thực thi sandbox Linux hoặc runtime Windows.
- Minor hoãn: thông báo lỗi biến thiếu/không hỗ trợ từ IPC còn tổng quát, chưa liệt kê tên biến. Có thể xem biến trong Kho Prompt để sửa trước khi preview lại.
- Những lần kiểm tra key trước triển khai nhận 401 invalid_api_key. Người dùng sẽ nhập/kiểm tra key trong app; chưa có ảnh tạo/audit API thật được nghiệm thu. Không mô tả fixture là API live.
- Infographic mới tạo nền, chưa có lớp chữ chỉnh sửa. Wildberries/Ozon/Yandex và mapping nội dung sản phẩm chưa triển khai; app không gửi yêu cầu đăng marketplace.

## Phạm vi tệp

`src/main/studio/` quản lý assets, credentials, jobs, OpenAI và IPC; `src/shared/studio-contracts.ts`/`studio-messages.ts` là hợp đồng và thông báo; `src/renderer/studio/` là source gallery, editor, result/review/history và API settings. `src/main/migrations.ts`, main/preload, App và build script nối phân hệ. `tests/studio-*.test.ts`, `tests/ui/studio.test.tsx`, `tests/e2e/studio.spec.ts` cung cấp kiểm chứng. `scripts/package-windows.mjs` đóng gói binary Windows và dependencies production từ lockfile, không có dữ liệu user.
