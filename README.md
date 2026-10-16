# VN ПОЧТА

Ứng dụng desktop Electron + React + TypeScript, lưu dữ liệu bằng SQLite. Bản 0.2 hoàn thành **Kho Prompt và AI Studio**. Adapter OpenAI đã có trong mã ứng dụng; tạo/kiểm định bằng API thật chưa được nghiệm thu. Nội dung sản phẩm và đăng lên Wildberries/Ozon/Yandex chưa triển khai.

## Bản Windows x64 để kiểm thử

Giải nén toàn bộ `VN-Pochta-win32-x64.zip`, mở `VN-Pochta.exe`; không cần cài Node.js. Vào **Cấu hình → Khóa OpenAI API → Lưu khóa an toàn → Kiểm tra kết nối**. Sau đó mở **AI Studio**, tải ảnh thật, chọn prompt, điền biến nếu có, xem trước và xác nhận tạo ảnh có tính phí. Ảnh tạo xong cần audit và seller duyệt trước khi xuất. Bấm thumbnail để xem ảnh lớn; Lịch sử có cả ảnh gốc của từng tác vụ.

Đây là bản thử nghiệm chưa ký số, đóng gói trên Linux; chưa chạy nghiệm thu trực tiếp trên Windows. Khóa không có sẵn trong gói app. Các tác vụ OpenAI có thể phát sinh phí và cần tài khoản có quyền model/hạn mức phù hợp.

Để đóng gói lại trên máy cloud Linux có Python 3:

```sh
ELECTRON_GET_USE_PROXY=1 npm run package:windows
```

Kết quả ở `release/` (hoặc `VN_POCHTA_ARTIFACT_DIR` nếu được đặt). Script xác minh checksum Electron chính thức, cài dependencies Windows từ lockfile, kiểm tra định dạng PE của exe/native modules và tạo ZIP kèm SHA-256. Không đóng gói userData/khóa API.

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

`test:e2e` chạy Electron thật, SQLite thật trong thư mục tạm riêng và dọn sau test. Trên Linux cần display/Xvfb và các thư viện GTK/NSS. Đã có quy trình đóng gói Windows dạng ZIP portable. Kiểm thử vận hành Windows vẫn cần chạy riêng trên Windows.

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
- AI Studio: nhập ảnh nguồn PNG/JPEG/WebP, tối đa 6 ảnh, 20 MiB/ảnh và tổng 60 MiB cho mỗi tác vụ; chọn lại ảnh đã lưu.
- Prompt mặc định cá nhân hoặc chọn trực tiếp từ Kho Prompt; snapshot giữ id/phiên bản và nội dung đã nội suy cho từng job.
- Tạo ảnh qua OpenAI `gpt-image-1`, audit có schema qua `gpt-4.1-mini`; source được gửi dưới dạng file/structured image inputs thật. Không có API giả trong app.
- Batch chạy tuần tự; dừng các mục chưa gửi ngay khi một mục đang chạy. Timeout/mất kết nối không tự thử lại tạo ảnh; tác vụ bị ngắt được khôi phục trạng thái an toàn khi mở lại.
- Audit fail chặn duyệt; manual_review cần xác nhận riêng. Seller xem ảnh gốc và kết quả trước khi duyệt, sau đó xuất PNG qua hộp thoại.
- Cấu hình khóa riêng từng seller qua Electron safeStorage; từ chối lưu trên Linux `basic_text`. Nếu có `VN_POCHTA_OPENAI_KEY`/`OPENAI_API_KEY` từ môi trường, khóa môi trường được ưu tiên và UI ghi rõ nguồn dùng chung.
- Chưa có đăng marketplace hoặc lớp chữ infographic; không coi ảnh AI là bằng chứng đặc tính sản phẩm.

## Dữ liệu và cách ly seller

SQLite nằm tại `app.getPath('userData')/vn-pochta.db` (Windows thường là `%APPDATA%/vn-pochta/vn-pochta.db`). Không xóa thư mục userData khi cập nhật. Sao lưu database khi đã đóng ứng dụng; không chỉ sao chép tệp `.db` khi ứng dụng còn dùng WAL. Migration có phiên bản, từ chối mở database của phiên bản mới hơn ứng dụng.

Seller local A/B dùng để phát triển và kiểm thử cách ly trong cùng máy. Đây **không phải đăng nhập bảo mật hoặc phân quyền nhiều người dùng trên server**. Người đọc được filesystem hệ điều hành vẫn có thể đọc SQLite. Renderer không nhận SQL hoặc filesystem API; IPC xác thực sender, payload và ownership ở main process. Khóa cá nhân lưu dạng blob mã hóa OS trong bảng app_credentials, không trả giá trị về renderer. Không xuất khóa trong JSON, lỗi hoặc log. Sao lưu ảnh và DB khi đóng app; khóa mã hóa gắn hệ điều hành có thể cần nhập lại trên máy khác.

Nhập JSON tối đa 2 MiB, 100 prompt/lần; một mục sai khiến toàn bộ lần nhập bị từ chối. Chấp nhận schema gốc `vn_pochta_default_prompts.json` và schema ứng dụng xuất. Nhập luôn tạo id mới cho seller hiện hành, không tin owner/is_builtin từ tệp. Xuất là nội dung đã lưu; nếu cần xuất bản nháp, Lưu trước.

## Cấu trúc mã

- `resources/default-prompts.json`: dữ liệu nguồn nguyên vẹn.
- `src/main`: SQLite, migration, seed, service ownership/version, JSON transfer và IPC.
- `src/shared`: contracts và nội suy biến.
- `src/preload`: bridge Electron có kiểu, không expose ipcRenderer.
- `src/renderer`: khung điều hướng, danh sách, editor, preview và lịch sử.
- `tests`: unit/integration trên SQLite thật, UI và Playwright Electron.
- `docs/superpowers`: đặc tả và kế hoạch đã duyệt.

Luồng API OpenAI đã có mã thật nhưng chưa kiểm chứng với khóa hợp lệ và ảnh thử do người dùng cho phép gửi. Các lần kiểm tra khóa trước triển khai nhận HTTP 401 invalid_api_key; không có tác vụ tạo ảnh thật nào được chạy trong kiểm thử tự động. Chỉ báo thành công sau kiểm chứng API/model/tài khoản hợp lệ. Các bước tiếp theo là nghiệm thu Windows, lớp chữ infographic và adapter marketplace theo category/cửa hàng.

Chi tiết kiểm thử, quyết định triển khai và giới hạn tại `docs/ai-studio-validation.md`.
