# VN ПОЧТА

Ứng dụng desktop Electron + React + TypeScript, lưu dữ liệu bằng SQLite. Giai đoạn hiện tại hoàn thành **Kho Prompt**; AI Studio, nội dung sản phẩm và đăng lên Wildberries/Ozon/Yandex chưa nối API.

## Chạy trên máy phát triển

Cần Node.js **24 LTS** và npm **11**. Trên Windows dùng PowerShell hoặc terminal thông thường:

```sh
npm ci
npx install-electron --no
npm run typecheck
npm test
npm run build
npm start
```

Electron 44 tải binary khi chạy bước install-electron hoặc lần mở đầu. Nếu mạng yêu cầu proxy, cấu hình HTTP_PROXY/HTTPS_PROXY và ELECTRON_GET_USE_PROXY=1; giữ xác minh TLS/checksum. better-sqlite3 13 cung cấp Node-API prebuilds cho Windows/macOS/Linux x64/arm64, không cần electron-rebuild cho các nền tảng đó. Nền tảng ngoài danh sách này chưa được hỗ trợ trong quy trình cài đặt.

```sh
npm run test:e2e
npm run format:check
```

`test:e2e` chạy Electron thật, SQLite thật trong thư mục tạm riêng và dọn sau test. Trên Linux cần display/Xvfb và các thư viện GTK/NSS. Chưa tạo bộ cài Windows; kiểm thử đóng gói và vận hành Windows cần chạy riêng trên Windows.

## Cloud Linux hiện tại

```sh
bash scripts/setup-cloud.sh
npm test
npm run test:e2e:cloud
```

Script setup dùng cache ở `/workspace/.vn-pochta-tools`, cài dependencies từ lockfile, tải Electron qua proxy và chuẩn bị Xvfb từ kho Debian được xác thực khi máy chưa có. Chỉ dành cho cloud Debian với các thư viện desktop có sẵn; không dùng script này trên Windows. Script chạy lặp lại được.

Harness `test:e2e:cloud` khởi động rồi dừng Xvfb riêng, chuyển thư mục cấu hình/cache tạm và truyền `--no-sandbox` **chỉ cho tiến trình kiểm thử trong container**. Đây không phải kiểm chứng thực thi sandbox Linux. `npm start` và cấu hình sản phẩm không tắt sandbox; không thêm cờ này vào quy trình chạy Windows. Không cần API key hoặc dịch vụ ngoài để dùng Kho Prompt.

## Chức năng đã có

- Chín prompt gốc đầy đủ Unicode Việt/Nga/Anh từ tệp người dùng cung cấp; seed theo id/phiên bản, không tạo trùng.
- Tìm kiếm không dấu tiếng Việt, tên tiếng Nga, nội dung; lọc danh mục, nguồn và yêu thích.
- Tạo, sửa, lưu bản mới, nhân bản, đổi tên trong trường tên rồi Lưu, xóa prompt cá nhân, nhập/xuất JSON qua hộp thoại lưu tệp.
- Sửa prompt hệ thống tạo override cá nhân; bản hệ thống không xóa/sửa qua seller.
- Lịch sử snapshot đầy đủ, khôi phục tạo phiên bản mới; khôi phục mặc định vẫn giữ lịch sử.
- Yêu thích, chế độ mặc định và lần sử dụng riêng từng seller; preview sáu biến có báo giá trị thiếu/biến lạ.
- Cảnh báo trước khi bỏ nội dung chưa lưu, chuyển seller hoặc đóng cửa sổ; trạng thái loading, lỗi và thành công.
- Chọn prompt sang AI Studio để chuẩn bị quy trình tiếp theo. Chưa gửi ảnh, tạo ảnh hay đăng thật.

## Dữ liệu và cách ly seller

SQLite nằm tại `app.getPath('userData')/vn-pochta.db` (Windows thường là `%APPDATA%/vn-pochta/vn-pochta.db`). Không xóa thư mục userData khi cập nhật. Sao lưu database khi đã đóng ứng dụng; không chỉ sao chép tệp `.db` khi ứng dụng còn dùng WAL. Migration có phiên bản, từ chối mở database của phiên bản mới hơn ứng dụng.

Seller local A/B dùng để phát triển và kiểm thử cách ly trong cùng máy. Đây **không phải đăng nhập bảo mật hoặc phân quyền nhiều người dùng trên server**. Người đọc được filesystem hệ điều hành vẫn có thể đọc SQLite. Renderer không nhận SQL hoặc filesystem API; IPC xác thực sender, payload và ownership ở main process. Ứng dụng chưa nhận/lưu khóa API.

Nhập JSON tối đa 2 MiB, 100 prompt/lần; một mục sai khiến toàn bộ lần nhập bị từ chối. Chấp nhận schema gốc `vn_pochta_default_prompts.json` và schema ứng dụng xuất. Nhập luôn tạo id mới cho seller hiện hành, không tin owner/is_builtin từ tệp. Xuất là nội dung đã lưu; nếu cần xuất bản nháp, Lưu trước.

## Cấu trúc mã

- `resources/default-prompts.json`: dữ liệu nguồn nguyên vẹn.
- `src/main`: SQLite, migration, seed, service ownership/version, JSON transfer và IPC.
- `src/shared`: contracts và nội suy biến.
- `src/preload`: bridge Electron có kiểu, không expose ipcRenderer.
- `src/renderer`: khung điều hướng, danh sách, editor, preview và lịch sử.
- `tests`: unit/integration trên SQLite thật, UI và Playwright Electron.
- `docs/superpowers`: đặc tả và kế hoạch đã duyệt.

Các bước API tiếp theo cần kết nối OpenAI với đầu vào ảnh thật, kiểm định ảnh, seller duyệt và adapter marketplace theo category/cửa hàng. Chỉ báo thành công sau kiểm chứng API và tài khoản hợp lệ. Giai đoạn này không thực hiện các bước đó.
