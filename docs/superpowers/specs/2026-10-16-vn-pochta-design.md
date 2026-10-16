# VN ПОЧТА — đặc tả nền tảng và Kho Prompt

## Mục tiêu đã thống nhất
Xây dựng ứng dụng Windows VN ПОЧТА bằng Electron, React, TypeScript và SQLite. Bước đầu hoàn thành Kho Prompt có lưu trữ, lịch sử và cách ly seller; sau đó triển khai AI Studio và các tích hợp marketplace theo các giai đoạn riêng. Không tuyên bố các API chưa nối hoạt động thật.

Tài liệu đầu vào là VN_POCHTA_Codex_UI_PromptLibrary.md và vn_pochta_default_prompts.json do người dùng cung cấp. ZIP chứa hai tệp giống hệt bản riêng. Chưa có ảnh tham khảo; dùng giao diện đen/trắng, logo chữ trắng trên nền đen, không dùng tài nguyên thương hiệu bên ngoài.

## Phạm vi triển khai đầu tiên
- Khung ứng dụng với tám mục: Tổng quan, AI Studio, Nội dung sản phẩm, Kho Prompt, Đăng sản phẩm, Kiểm thử, Lịch sử, Cấu hình.
- Kho Prompt là tính năng hoàn chỉnh đầu tiên. Các trang tích hợp khác hiển thị rõ trạng thái chưa kết nối, không giả lập kết quả thành công.
- Seed đầy đủ chín prompt Unicode từ JSON. Seed idempotent theo định danh và phiên bản; giữ nguyên body, không ghi đè chỉnh sửa cá nhân.
- Tìm kiếm không phân biệt hoa thường trên tên Việt/Nga, mô tả, body và nhãn; hỗ trợ bỏ dấu tiếng Việt. Bộ lọc danh mục, nguồn và yêu thích.
- Xem, tạo, sửa, lưu, lưu thành bản mới, nhân bản, đổi tên, yêu thích, xóa prompt riêng, nhập/xuất JSON, khôi phục phiên bản, khôi phục mặc định, đặt mặc định theo chế độ.
- Hiển thị nguồn, phiên bản, thời gian sửa và lần dùng cuối. Biên tập mô tả, nhãn, nhóm và chế độ ảnh; cảnh báo trước khi bỏ thay đổi chưa lưu.
- Preview nội suy sáu biến được hỗ trợ; báo biến thiếu và biến không hỗ trợ. Hiển thị biến được nhận diện bên cạnh trình soạn thảo.

## Kiến trúc và ranh giới tin cậy
Renderer React chỉ gọi API IPC có kiểu qua preload. Tắt nodeIntegration, bật contextIsolation và sandbox; không cho renderer SQL, truy cập filesystem tùy ý hoặc mở nội dung từ xa. Main process quản lý SQLite, xác thực dữ liệu IPC và thực hiện các giao dịch.

Mỗi thao tác dữ liệu nhận seller hiện hành từ session do main quản lý; không tin seller_id do renderer gửi kèm đối tượng prompt. Prompt riêng luôn được kiểm tra ownership ở main. Chuyển seller xóa trạng thái editor và tải lại dữ liệu. Giai đoạn đầu có hai hồ sơ local để kiểm thử cách ly; đây không phải đăng nhập hay phân quyền nhiều người dùng trên máy chủ. Người có quyền đọc filesystem của hệ điều hành vẫn có thể truy cập cơ sở dữ liệu local.

Lưu database trong thư mục userData của Electron, không trong thư mục cài đặt. Chạy migration có phiên bản trong transaction, không xóa dữ liệu cũ. SQLite driver và Electron phải dùng phiên bản tương thích; kiểm chứng build native nếu driver cần ABI của Electron.

## Dữ liệu
- system_prompts: định danh ổn định, phiên bản gói, tên Việt/Nga, mô tả, danh mục, body nguyên gốc. Bản hệ thống không sửa/xóa qua API seller.
- seller_prompts: id, seller_id, system_prompt_id tùy chọn, tên, mô tả, danh mục, body, nhãn, nhóm, chế độ ảnh, phiên bản hiện tại, thời gian tạo/sửa.
- prompt_versions: prompt_id, seller_id, phiên bản, snapshot đầy đủ các trường biên tập, người sửa, thời gian. Khôi phục tạo phiên bản mới; không xóa lịch sử.
- seller_prompt_preferences: seller_id, prompt_id, yêu thích, lần dùng cuối; không thay đổi bản hệ thống.
- seller_prompt_defaults: seller_id, mode, prompt_id. Kiểm tra prompt đích thuộc system hoặc seller hiện hành; xóa prompt thì dọn liên kết trong transaction.
- Một override hoạt động cho mỗi seller và system_prompt_id. Sửa bản hệ thống tạo override và snapshot đầu tiên. Khôi phục mặc định yêu cầu xác nhận, đưa nội dung hệ thống mới nhất vào override bằng một phiên bản mới; giữ lịch sử.

## Luồng giao diện
Sidebar có thể thu gọn, header hiển thị seller local và trạng thái OpenAI chưa cấu hình. Kho Prompt gồm tìm kiếm/bộ lọc, danh sách cuộn và editor/preview. Cửa sổ nhỏ chuyển sang bố cục một cột, không che nút thao tác. Mọi thao tác bất đồng bộ có trạng thái đang xử lý và thông báo lỗi; thao tác phá hủy cần xác nhận. Phím điều hướng và nhãn truy cập được hỗ trợ.

Nhập JSON kiểm tra schema, giới hạn kích thước và độ dài trường, không tin owner/id/is_builtin từ tệp. Nhập tạo prompt riêng với id mới và không ghi đè dữ liệu sẵn có. Xuất chỉ gồm dữ liệu prompt đang có quyền đọc, không có bí mật hoặc định danh seller khác. Chấp nhận JSON mặc định được cung cấp và schema xuất của ứng dụng qua adapter rõ ràng.

## Ranh giới các giai đoạn tiếp theo
AI Studio sẽ nhận ảnh nguồn có cấu trúc, ghép prompt tổng và chuyên biệt, kiểm tra chất lượng rồi yêu cầu seller duyệt. Infographic chỉ sinh nền; chữ và thông số xác minh nằm ở lớp chỉnh sửa riêng. Prompt người dùng không thay thế các kiểm tra bắt buộc. Giai đoạn đầu không gửi ảnh hoặc gọi API từ nút chưa kết nối.

Đăng sản phẩm sẽ có adapter riêng cho Wildberries, Ozon và Yandex Market, mapping theo category và phản hồi đã loại bí mật. Kiểm thử dữ liệu không gửi yêu cầu đăng thật. Đăng thật cần xác nhận và theo dõi từng cửa hàng; gửi API thành công không đồng nghĩa đang bán. Chưa triển khai các adapter trong phạm vi Kho Prompt.

Khóa API tương lai phải lưu qua cơ chế bảo mật hệ điều hành; không lưu plaintext trong SQLite, log hoặc renderer. Không cần khóa API để nghiệm thu Kho Prompt.

## Kiểm thử và nghiệm thu giai đoạn đầu
- Unit/integration bằng database tạm thật: seed hai lần vẫn đủ chín prompt, body khớp JSON; update seed không mất dữ liệu seller.
- Seller A tạo/sửa/nhân bản/yêu thích/đặt mặc định; seller B không đọc, sửa, xóa, khôi phục hay đặt mặc định với id của A.
- Sửa system tạo override, không đổi bản gốc; khôi phục lịch sử tạo phiên bản mới; khôi phục mặc định không mất lịch sử.
- Nhập JSON sai bị từ chối nguyên tử; xuất/nhập giữ nguyên Unicode và nội dung; reopen database giữ dữ liệu.
- Nội suy báo đủ biến thiếu/không hỗ trợ, không thực thi nội dung prompt.
- Typecheck, build renderer/main/preload và smoke-test Electron với SQLite thật. Môi trường Linux kiểm chứng runtime Linux; đóng gói Windows và bảo mật credential Windows cần kiểm chứng trên Windows riêng.
- Kiểm tra thao tác UI cơ bản, trạng thái lỗi, cảnh báo chưa lưu và bố cục cửa sổ hẹp. Các trang chưa tích hợp ghi rõ trạng thái và không thực hiện API giả.

## Điều kiện hoàn tất
Báo cáo các tệp thay đổi, lệnh kiểm thử và kết quả thực tế, cách chạy, cùng các giới hạn còn lại. Không coi giai đoạn đầu là đã hoàn thành toàn bộ ứng dụng hoặc tích hợp API thật.
