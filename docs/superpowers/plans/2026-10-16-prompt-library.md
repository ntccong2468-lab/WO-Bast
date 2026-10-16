# Kho Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Hoàn thành Kho Prompt desktop có dữ liệu bền vững và cách ly seller local.

**Architecture:** Electron main giữ session và SQLite; preload cung cấp IPC có kiểu; React chỉ dùng API đó. Domain service thực hiện ownership, phiên bản, seed và giao dịch; renderer không nhận SQL hoặc đường dẫn filesystem tùy ý.

**Tech Stack:** Electron, React, TypeScript strict, Vite, better-sqlite3, Zod, Vitest, Testing Library, Playwright Electron. Dùng npm lockfile và electron-rebuild để đồng bộ ABI driver khi chạy Electron; test service dùng ABI Node, chạy rebuild theo runtime trước mỗi suite.

**Spec:** `docs/superpowers/specs/2026-10-16-vn-pochta-design.md`

## Global Constraints
- Seed đầy đủ chín prompt Unicode từ JSON. Seed idempotent theo định danh và phiên bản; giữ nguyên body, không ghi đè chỉnh sửa cá nhân.
- Tắt nodeIntegration, bật contextIsolation và sandbox; không cho renderer SQL, truy cập filesystem tùy ý hoặc mở nội dung từ xa.
- Mỗi thao tác dữ liệu nhận seller hiện hành từ session do main quản lý; không tin seller_id do renderer gửi kèm đối tượng prompt.
- Khôi phục tạo phiên bản mới; không xóa lịch sử.
- Các trang tích hợp khác hiển thị rõ trạng thái chưa kết nối, không giả lập kết quả thành công.
- Môi trường Linux kiểm chứng runtime Linux; đóng gói Windows và bảo mật credential Windows cần kiểm chứng trên Windows riêng.
- Dùng checkout hiện tại trong cloud; không tạo worktree. Không cần secret cho giai đoạn này.

## Review Focus
- JSON quá lớn hoặc chứa một mục lỗi: từ chối toàn bộ, không nhập một phần (Task 3).
- Chuyển seller khi editor bẩn hoặc yêu cầu cũ đang chạy: xác nhận bỏ thay đổi và bỏ kết quả của session cũ (Task 5).
- Xóa prompt đang làm mặc định: dọn liên kết, không để mặc định hỏng (Task 2).
- Nội dung Unicode, HTML và biến lặp: hiển thị như văn bản, không thực thi và báo lỗi ổn định (Tasks 3, 5).
- Reopen database và nâng phiên bản seed: giữ prompt cá nhân, lịch sử và preferences (Tasks 1, 2).

## Cấu trúc và hợp đồng dùng chung
- `resources/default-prompts.json`: sao chép nguyên JSON được cung cấp.
- `src/shared/contracts.ts`: `SellerId = 'seller-a' | 'seller-b'`, `Category = 'system' | 'image' | 'quality'`; `PromptInput {name,nameRu,description,category,body,tags:string[],group,mode}`; `Prompt extends PromptInput {id,systemPromptId:string|null,source:'system'|'seller',version:number,updatedAt:string,isFavorite:boolean,lastUsedAt:string|null}`; `PromptVersion {version:number,snapshot:PromptInput,editedBy:SellerId,createdAt:string}`.
- `src/main/db.ts`, `migrations.ts`, `seed.ts`: mở/đóng SQLite và seed.
- `src/main/prompt-service.ts`: CRUD, ownership và lịch sử.
- `src/shared/interpolation.ts`, `src/main/transfer.ts`: nội suy và JSON.
- `src/main/session.ts`, `ipc.ts`, `index.ts`, `src/preload/index.ts`: session, bridge và startup.
- `src/renderer/{App,PromptLibrary,PromptEditor,PromptPreview,PromptHistory}.tsx`, `styles.css`, `main.tsx`, `index.html`: giao diện.
- `tests/{seed,service,transfer,interpolation,ipc}.test.ts`, `tests/ui/*.test.tsx`, `tests/e2e/electron.spec.ts`: các tầng kiểm chứng.

### Task 1: Database thật và seed đầy đủ
**Files:** `package.json`, `package-lock.json`, `.gitignore`, `tsconfig.json`, `vite.config.ts`, `resources/default-prompts.json`, `src/shared/contracts.ts`, `src/main/{db,migrations,seed}.ts`, `tests/seed.test.ts`.
**Interfaces:** `openDatabase(path:string): Database`; `migrate(db:Database):void`; `seed(db:Database,bundle:unknown):void`. Database là kiểu better-sqlite3, đóng bằng `close()`.
- [x] Viết `seed_is_idempotent_and_preserves_unicode`: seed hai lần, assert số system prompt là 9 và từng body bằng JSON nguồn; reopen file tạm rồi assert lại.
- [x] Thêm cấu hình npm, TypeScript, Vitest và dependencies; chạy `npm test -- tests/seed.test.ts` để thấy thiếu module triển khai.
- [x] Triển khai migration theo user_version trong transaction; bảng theo spec, unique override `(seller_id,system_prompt_id)`, unique version `(seller_id,prompt_id,version)`; bật foreign_keys. Seed chỉ cập nhật khi phiên bản bundle lớn hơn.
- [x] Thêm `seed_upgrade_keeps_seller_rows`: nâng version system trong fixture, assert seller row và snapshot không thay đổi. Chạy suite seed, mong tất cả PASS.
- [x] Commit database, seed, contracts và cấu hình.

### Task 2: Domain service có ownership và lịch sử
**Files:** `src/main/prompt-service.ts`, `tests/service.test.ts`.
**Interfaces:** `PromptService(db)` có `list(seller):Prompt[]`, `get(seller,id):Prompt`, `create(seller,input):Prompt`, `save(seller,id,input):Prompt`, `clone(seller,id):Prompt`, `remove(seller,id):void`, `versions(seller,id):PromptVersion[]`, `restore(seller,id,version):Prompt`, `reset(seller,id):Prompt`, `favorite(seller,id,value:boolean):void`, `setDefault(seller,mode,id):void`, `defaults(seller):Record<string,string>`, `markUsed(seller,id):void`.
- [x] Viết test A tạo prompt, B không list thấy và mọi get/save/clone/remove/versions/restore/reset/favorite/setDefault/markUsed với id của A đều throw; system remove cũng throw.
- [x] Chạy `npm test -- tests/service.test.ts`, xác nhận FAIL trước triển khai.
- [x] Triển khai service; save system tạo hoặc cập nhật một override, mỗi lần lưu tạo snapshot đầy đủ và tăng version trong transaction. Preference riêng seller; reset chép nội dung system mới nhất thành version mới. Validate PromptInput bằng Zod: tên 1–200 ký tự, body 1–50000, mô tả tối đa 2000, tối đa 30 nhãn mỗi nhãn 80 ký tự, group/mode tối đa 100.
- [x] Test restore giữ metadata, phiên bản tăng; reset giữ lịch sử; xóa dọn default/preference; reopen giữ dữ liệu; hai seller có override độc lập; seed nâng version không mất thay đổi. Chạy suite service và seed, mong PASS.
- [x] Commit service và tests.

### Task 3: Nhập/xuất và nội suy an toàn
**Files:** `src/main/transfer.ts`, `src/shared/interpolation.ts`, `tests/{transfer,interpolation}.test.ts`.
**Interfaces:** `exportPrompts(service,seller,ids:string[]):string`, `importPrompts(db,service,seller,json:string):Prompt[]`; `interpolate(body:string,values:Record<string,string>):{text:string,missing:string[],unsupported:string[]}`.
- [x] Viết test export/import giữ body Unicode, tạo id mới thuộc seller hiện hành, bỏ owner/is_builtin đầu vào; nhập JSON nguồn tạo 9 prompt riêng. Một mục sai, file trên 2 MiB, trên 100 prompt phải bị từ chối và database không đổi.
- [x] Viết test sáu biến product_name, marketplace, category, aspect_ratio, language, verified_attributes; biến thiếu/rỗng và biến lạ trả danh sách không trùng; giá trị chứa HTML hoặc cú pháp biến không bị thực thi/nội suy lần hai.
- [x] Chạy `npm test -- tests/transfer.test.ts tests/interpolation.test.ts`, xác nhận FAIL.
- [x] Implement schema xuất `{schema_version:1,prompts:PromptInput[]}` và adapter JSON mặc định; validate toàn bộ trước transaction import. Nội suy một lượt, trả lỗi biến thay vì che mất dữ liệu thiếu.
- [x] Chạy hai suite và suite domain, mong PASS. Commit.

### Task 4: Electron và bridge có kiểm soát
**Files:** `src/main/{session,ipc,index}.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`, `tests/ipc.test.ts`, cấu hình build.
**Interfaces:** `window.vnPochta` cung cấp `session():Promise<{seller:SellerId}>`, `switchSeller(seller):Promise<void>`, `list/get/create/save/clone/remove/versions/restore/reset/favorite/setDefault/defaults/markUsed` như service nhưng không có tham số seller; `importJson(json):Promise<Prompt[]>`, `exportJson(ids):Promise<string>`.
- [x] Viết test dispatcher từ chối channel, seller và payload không hợp lệ; bỏ owner giả mạo; sender không phải main frame của cửa sổ local bị từ chối. Sau switch, request mới dùng seller mới.
- [x] Chạy `npm test -- tests/ipc.test.ts`, xác nhận FAIL.
- [x] Implement session main và allowlist IPC; validate payload ở main. Preload chỉ expose hàm có kiểu, không expose ipcRenderer. Main mở database ở userData, chặn navigation/window.open, áp CSP cho tài nguyên local, đóng DB khi quit. Chỉ load bundle local; workflow dev build/watch local thay vì cho phép arbitrary URL.
- [x] Chạy tests IPC và `npm run typecheck`; `npm run build` phải tạo main, preload CJS tương thích sandbox, renderer và bundle seed.
- [x] Commit bridge và startup.

### Task 5: Kho Prompt tương tác đầy đủ
**Files:** `src/renderer/*`, `tests/ui/library.test.tsx`.
**Interfaces:** App dùng duy nhất `window.vnPochta`; renderer giữ session epoch để bỏ response cũ. `PromptEditor` phát PromptInput, không tự truy cập DB. Search normalize NFD, bỏ dấu và đ/Đ trước lowercase.
- [x] Viết test tìm tên Việt không dấu, Nga và body Anh; lọc category/source/favorite; editor chưa lưu chuyển prompt/trang/seller phải xác nhận; hủy xác nhận giữ dữ liệu.
- [x] Chạy `npm test -- tests/ui/library.test.tsx`, xác nhận FAIL.
- [x] Implement sidebar tám mục, header seller local, trạng thái API chưa kết nối, danh sách/editor/preview/history. Tạo/sửa/lưu/lưu bản mới/clone/rename/delete/favorite/reset/default và import/export dùng API có loading, error và success. JSON file qua input giới hạn dung lượng, xuất Blob không chứa metadata seller.
- [x] Thêm sáu ô giá trị biến, preview text qua React escaping, danh sách biến; metadata tags/group/mode; lịch sử xem snapshot và restore có xác nhận. Dùng trong AI Studio ghi nhận lần dùng rồi chuyển trang hiển thị prompt đã chọn và trạng thái chưa nối API; nút kiểm thử ảnh bị vô hiệu hóa kèm giải thích.
- [x] Thêm test lỗi lưu giữ draft, response seller cũ không xuất hiện sau switch, HTML hiển thị nguyên văn và không tạo element, empty search có trạng thái rỗng. Thêm beforeunload và xác nhận đóng cửa sổ Electron khi dirty qua bridge giới hạn.
- [x] CSS responsive một cột tại 760px, sidebar thu gọn, cuộn độc lập, focus-visible và label đầy đủ. Chạy UI tests và typecheck, mong PASS. Commit.

### Task 6: Nghiệm thu Electron thật và hướng dẫn chạy
**Files:** `tests/e2e/electron.spec.ts`, `playwright.config.ts`, `scripts/verify-runtime.mjs`, `README.md`, `package.json`.
**Interfaces:** `npm run test:unit` rebuild driver cho Node rồi chạy Vitest; `npm run test:e2e` rebuild driver Electron rồi chạy Playwright Electron dưới display/Xvfb; `npm start` rebuild driver Electron và mở bundle đã build.
- [x] Viết e2e Electron: userData tạm, thấy 9 prompt, sửa system tạo override, đổi seller không thấy override, quay lại A và reopen app còn dữ liệu; kiểm tra window config và bridge không expose Node.
- [x] Viết e2e cửa sổ 640×800 và 1280×800: thao tác lưu/xóa có thể tiếp cận, không tràn ngang, list dài cuộn được; đóng app khi dirty có xác nhận. Chạy để thấy FAIL trước khi hoàn thiện harness.
- [x] Implement harness startup/cleanup, ABI rebuild scripts và npm commands. Chạy `npm run test:unit`, `npm run typecheck`, `npm run build`, `npm run test:e2e`; ghi đúng số pass/fail và blocker thực tế, không dùng mock DB thay smoke-test Electron.
- [x] README tiếng Việt: npm ci, test:unit, build, start, test:e2e; vị trí dữ liệu, local seller không phải auth thật, API chưa nối và Windows chưa nghiệm thu. Nếu môi trường cloud cần bước cài/khởi động bổ sung, lưu install_script/start_skill đã kiểm chứng.
- [x] Chạy `git diff --check`, kiểm tra không có credential/generated DB trong tracked files; commit. Review toàn bộ diff theo đặc tả, sửa vấn đề và chạy lại checks bị ảnh hưởng trước báo cáo.

## Tự rà soát kế hoạch
Các mục seed, CRUD, lịch sử, ownership, import/export, interpolation, IPC, giao diện và smoke-test đều có task chịu trách nhiệm. AI Studio thật, ảnh, marketplace adapters và đóng gói Windows nằm ngoài giai đoạn đầu đã duyệt. Các tên service/bridge thống nhất; bridge tự bổ sung seller từ session. Năm Review Focus đều có test cụ thể trong task tương ứng.
