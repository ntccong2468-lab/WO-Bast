# Kết quả triển khai Kho Prompt — 2026-10-16

Hoàn thành giai đoạn Kho Prompt theo đặc tả đã duyệt. Mã được commit trên nhánh `work`; chưa push/merge. Chưa tạo bộ cài hoặc nghiệm thu trên Windows.

## Phạm vi tệp thay đổi

- `resources/default-prompts.json`: giữ nguyên dữ liệu nguồn với đủ chín prompt.
- `src/main/db.ts`, `migrations.ts`, `seed.ts`, `prompt-service.ts`: SQLite, seed theo phiên bản, ownership, CRUD, defaults và lịch sử snapshot.
- `src/main/transfer.ts`, `ipc.ts`, `session.ts`, `index.ts`: JSON validation/transaction, seller session, IPC và hộp thoại xuất tệp native.
- `src/shared/contracts.ts`, `interpolation.ts`, `src/preload/index.ts`: hợp đồng kiểu và bridge có giới hạn.
- `src/renderer`: khung desktop, Kho Prompt, editor, preview biến, lịch sử và giao diện responsive.
- `tests`: sáu tệp unit/integration/UI và bốn kịch bản Electron thật.
- `scripts`, cấu hình npm/TypeScript/Vite/Playwright/Prettier, README và kế hoạch: quy trình build, cài và chạy lặp lại.

## Bằng chứng kiểm chứng cuối

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | 18/18 PASS, 6 test files |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, main/preload/renderer |
| `npm run test:e2e:cloud` | 4/4 PASS, Electron + SQLite thật |
| `npm run format:check` | PASS |
| `git diff --check` | PASS |
| `bash scripts/setup-cloud.sh` | PASS hai lần, không đổi source/lockfile |

Kịch bản Electron kiểm tra seed, sửa system thành override, chuyển seller, đóng/mở giữ dữ liệu, cấu hình bridge, cửa sổ 640/1280, cuộn danh sách, cảnh báo đóng khi chưa lưu, mặc định cá nhân, khôi phục phiên bản/mặc định, xuất rồi nhập JSON qua tệp thật và xóa prompt riêng. Kiểm thử dùng thư mục dữ liệu tạm, không chạm dữ liệu của người dùng.

Rà soát độc lập phát hiện hai lỗi Important: tải khởi động có thể ghi đè editor đang sửa; đọc tệp nhập có thể kéo dài qua lúc chuyển seller. Đã thêm kiểm thử tái hiện thất bại trước sửa. Khởi động hiện khóa chỉnh sửa tới khi sẵn sàng; đọc tệp nằm trong operation guard, khóa editor/seller và kiểm tra session epoch trước import IPC. Toàn bộ suite xanh sau sửa. Không có finding Minor bị hoãn.

## Các quyết định triển khai

1. Giữ checkout cloud hiện tại trên nhánh work theo đặc tả; không tạo worktree. Không có chi phí chuyển đổi workspace.
2. better-sqlite3 13 có Node-API prebuild, đã chạy cùng addon trong Node và Electron; bỏ electron-rebuild không cần thiết. Nền tảng ngoài các prebuild được hỗ trợ sẽ cần quy trình build native riêng.
3. Cloud container không chạy được SUID helper Chromium: chỉ harness cloud truyền --no-sandbox. Cấu hình sản phẩm vẫn sandbox:true. Chưa chứng minh thực thi sandbox Linux trong môi trường này.
4. Xuất JSON dùng hộp thoại lưu tệp native ở main thay cho Blob download renderer, sau khi smoke-test phát hiện download chưa hoạt động. Renderer không được truyền đường dẫn ghi tùy ý; thao tác xuất cần desktop dialog.

## Cấu hình và giới hạn

Đã lưu `install_script` gọi setup-cloud.sh và unit tests, cùng `start_skill` nêu cách build, kiểm thử, khởi động, dùng checkout hiện tại và giới hạn API/sandbox. Lưu draft không đồng nghĩa đã Publish. Muốn tái sử dụng cấu hình đã chuẩn bị: xem và lưu trong Environment settings rồi Publish. Chưa kiểm chứng phục hồi trong một task mới.

Không cần secret cho Kho Prompt. Seller A/B là profile local để phát triển, không phải đăng nhập server. AI Studio thật, xử lý ảnh, OpenAI, Wildberries, Ozon và Yandex chưa tích hợp; không có yêu cầu đăng thật nào được gửi. Kiểm chứng Windows/đóng gói và credential OS cần giai đoạn tiếp theo.
