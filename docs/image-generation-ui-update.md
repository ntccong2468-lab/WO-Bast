# Cập nhật giao diện tạo ảnh

Luồng AI Studio hiện chỉ yêu cầu seller chọn ảnh nguồn, nhập Size nếu có, chọn tỷ lệ và xem trước prompt. Sáu biến kỹ thuật cũ không còn là ô nhập trong phần tạo ảnh; dữ liệu cần thiết được suy ra từ phân tích ảnh, tỷ lệ đã chọn và hồ sơ seller.

Tỷ lệ gồm 1:1, 2:3, 3:4, 4:5, 9:16, 3:2, 4:3, 16:9, 5:4, 21:9 và “Giữ tỷ lệ ảnh gốc”. Mỗi lựa chọn hiển thị tên tiếng Việt, kích thước tham khảo và mục đích sử dụng. Batch có thể dùng một tỷ lệ chung hoặc đặt tỷ lệ riêng cho từng prompt.

Ảnh nguồn được gửi tới vision model `gpt-4.1-mini` khi seller đã cấu hình OpenAI. Kết quả tách thuộc tính quan sát được và chưa xác minh, đồng thời đề xuất nội dung tiếng Nga theo vai trò ảnh. Mọi chữ đều bắt đầu ở trạng thái tắt và chưa duyệt; seller có thể sửa, bật và duyệt từng đề xuất. Khi xuất, chữ đã duyệt được chèn bằng lớp SVG/Sharp với phông chữ có hỗ trợ Cyrillic; ảnh không bị kéo giãn.

`gpt-image-1` chỉ nhận các kích thước native được hỗ trợ (`1024x1024`, `1024x1536`, `1536x1024`). Tỷ lệ đích được chọn native gần nhất, sau đó ảnh được căn vừa và mở rộng nền trắng để đạt tỷ lệ xuất. Dữ liệu Size được lưu trong bảng `seller_product_profiles` ở migration v3 và được giữ nguyên qua các phiên bản.
