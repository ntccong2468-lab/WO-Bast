# VN ПОЧТА — AI Studio

## Mục tiêu và phạm vi
Tiếp tục từ Kho Prompt đã hoàn thành: seller chọn ảnh nguồn, chọn prompt cá nhân/hệ thống, kiểm tra nội dung cuối, tạo ảnh, kiểm định với ảnh gốc và duyệt kết quả. Tái sử dụng Electron main/preload/React/SQLite hiện có, không tạo ứng dụng hoặc worktree mới.

Đây là giai đoạn AI Studio; không đăng lên marketplace, không lưu khóa marketplace hoặc tự tạo thông số sản phẩm. Tài liệu đầu vào vẫn là bộ yêu cầu VN ПОЧТА người dùng cung cấp. Chưa có ảnh tham khảo giao diện bổ sung.

## Cách triển khai được đề xuất
Mở rộng main process với ba thành phần: kho tài sản ảnh theo seller, service tác vụ ảnh và adapter OpenAI. React dùng bridge có kiểu, không được nhận khóa hoặc đường dẫn filesystem. Giữ một tác vụ mạng đang chạy tại một thời điểm trong ứng dụng local để kiểm soát phí và tránh trùng; có thể xem kết quả cũ trong khi chờ.

Hai phương án khác không chọn: gọi OpenAI từ renderer làm lộ credential và phá ranh giới IPC; thêm backend web/cloud làm tăng triển khai ngoài nhu cầu desktop local hiện tại.

## Ảnh nguồn và tài sản
- Chọn tối đa sáu ảnh PNG/JPEG/WebP, mỗi ảnh tối đa 20 MiB, tổng tối đa 60 MiB. Giới hạn này là lựa chọn của ứng dụng, không tuyên bố là giới hạn tối đa của API.
- Main mở hộp thoại chọn tệp, đọc có giới hạn, kiểm tra magic bytes, khả năng giải mã và kích thước pixel trước khi lưu. Từ chối ảnh vượt 40 megapixel hoặc giải mã lỗi; đuôi tệp và MIME không phải bằng chứng hợp lệ.
- Sao chép byte ảnh vào userData/assets bằng id ngẫu nhiên; ghi metadata seller, mime, kích thước và SHA-256. Không theo đường dẫn do renderer cung cấp. Khi batch lỗi, không để lại bản ghi import dở dang hoặc tệp mồ côi.
- Renderer xin nội dung ảnh bằng asset id; main kiểm tra ownership và trả bản thumbnail giới hạn cho danh sách. Ảnh gốc chỉ đọc khi service cần gửi tới API. Không expose userData bằng web server hoặc URL file tùy ý.
- Chuyển seller xóa ảnh đang chọn và preview; mọi thao tác đọc tài sản/tác vụ kiểm tra seller trong main. Không xóa ảnh gốc khi đổi trang hoặc khởi động lại.

## Ghép prompt và snapshot
- Chọn một prompt tạo ảnh hoặc chế độ Tạo bộ ảnh chuyên nghiệp với các chế độ ảnh được chọn rõ ràng. Prompt kiểm định không dùng làm prompt tạo ảnh.
- Lấy prompt tổng, prompt ảnh và prompt kiểm định từ defaults cá nhân nếu có; nếu không dùng bản hệ thống tương ứng. Prompt được chọn từ Kho Prompt được truyền bằng id và kiểm tra quyền lại trong main.
- Hỗ trợ sáu biến hiện có. Main nội suy một lần; biến thiếu hoặc không hỗ trợ chặn gửi API và báo tên biến.
- Trước khi tạo, hiển thị prompt sau ghép, số ảnh nguồn, model, kích thước đầu ra và số tác vụ sẽ gửi. Seller bấm Tạo mới phát sinh yêu cầu tính phí. Không tự chạy khi tải ảnh hoặc chọn prompt.
- Lưu snapshot toàn bộ prompt đã dùng, id/phiên bản, giá trị biến và input asset ids trong tác vụ. Sửa/xóa prompt sau đó không làm mất khả năng đọc lịch sử tác vụ.
- Ghép thêm quy tắc cố định của ứng dụng về bảo toàn sản phẩm, không bịa đặc tính, không chèn giá/logo marketplace. Prompt tùy biến không thay thế các bước kiểm tra này. Đây là hướng dẫn mô hình; không tuyên bố chống được mọi prompt injection hoặc chứng minh ảnh đúng tuyệt đối.

## Adapter OpenAI
- Main gọi API qua HTTPS tới api.openai.com, sử dụng SDK chính thức và proxy hiện có khi chạy cloud. Không cho renderer thay endpoint/host hoặc tùy ý gọi URL. Không gửi credential qua redirect sang host khác.
- Tạo ảnh qua Images edit API, gửi ảnh nguồn dưới dạng file multipart có cấu trúc; không đưa đường dẫn local vào prompt. Model ban đầu gpt-image-1; phản hồi phải có dữ liệu ảnh base64 hợp lệ và giải mã được trước khi lưu. Xác minh hợp đồng API/model bằng tài liệu chính thức khi triển khai; nếu model không khả dụng, báo lỗi rõ ràng, không âm thầm thay model.
- Dùng kích thước native dọc 1024×1536; khi người dùng chọn 3:4, thêm lề nền trắng bằng compositor local thành 1152×1536, không kéo giãn hoặc cắt sản phẩm. Lưu cả ảnh native và ảnh xuất. Các tỷ lệ xuất được hỗ trợ trong giai đoạn này: 3:4 và native 2:3; các giá trị khác bị từ chối.
- Kiểm định qua Responses API với model gpt-4.1-mini, gửi các ảnh gốc và ảnh tạo như structured image inputs. Yêu cầu JSON có schema: danh sách điểm đạt, lỗi, độ tin cậy cho từng nhận xét, kết luận pass/manual_review/fail và prompt sửa gợi ý. Validate schema ở main; output không hợp lệ hoặc refusal không được coi là đạt.
- Bộ ảnh chạy tuần tự từng tác vụ đã xác nhận; có thể dừng các mục chưa gửi. Mỗi tác vụ tạo tối đa một ảnh. Không tự retry bước tạo ảnh có tính phí sau timeout/mất kết nối; lưu trạng thái không chắc chắn để seller chủ động tạo lại.
- Thời hạn mỗi request 180 giây. Hiển thị lỗi thiếu key, quyền model, quota/rate limit, timeout, mất mạng và phản hồi không hợp lệ bằng thông điệp đã lọc; không hiển thị payload/header/token hoặc lưu raw lỗi API.
- Không sử dụng API giả trong đường chạy sản phẩm. Kiểm thử adapter dùng transport fixture có nhãn rõ ràng; kiểm chứng live là bước riêng cần key/tài khoản và ảnh thử nghiệm phù hợp.

## Credential và cấu hình
- Desktop: nhập key qua ô mật khẩu, IPC chỉ gửi tới main, không đọc trả lại renderer. Lưu blob mã hóa bằng Electron safeStorage trong userData; không lưu plaintext trong SQLite/log. Chỉ lưu khi có encryption backend an toàn; trên Linux basic_text hoặc không khả dụng thì từ chối lưu và giải thích.
- Key local gắn seller. Thay seller không được dùng key local của seller khác. Xóa key chỉ xóa credential của seller hiện hành. Không đưa key vào thông điệp lỗi hoặc telemetry.
- Cloud: cho phép credential môi trường VN_POCHTA_OPENAI_KEY như credential chung do chủ môi trường quản lý; UI ghi rõ là credential môi trường dùng chung, không tuyên bố đây là key cá nhân từng seller. Tái sử dụng OPENAI_API_KEY đã được inject nếu có và chưa có biến riêng; không sao chép giá trị vào cấu hình lưu.
- Kiểm tra kết nối là hành động riêng của seller, dùng read-only API, không tạo ảnh hoặc suy diễn có quyền model tạo ảnh chỉ từ việc kiểm tra key thành công.
- Hiện tại đã kiểm tra metadata cấu hình và tên/trạng thái biến: chưa có credential cần dùng. Cần bổ sung an toàn qua Environment settings để kiểm chứng API live; không gửi key trong chat.

## Dữ liệu và trạng thái
Migration v2 bổ sung assets, image_jobs và app_credentials mà không sửa/xóa bảng prompt. image_jobs gồm seller_id, batch_id tùy chọn, prompt_snapshot_json, original_asset_ids_json, state, output_asset_ids_json, quality_report_json, safe_error_code, created_at, updated_at, reviewed_at.

Trạng thái: queued → generating → auditing → awaiting_review → approved hoặc rejected. Lỗi trước request là failed; timeout sau gửi có khả năng phát sinh phí là uncertain; ảnh đã tạo nhưng audit lỗi là audit_failed, cho phép chỉ kiểm định lại. Không có đường chuyển trực tiếp từ generating sang approved. Seller chỉ duyệt ảnh có audit hợp lệ kết luận pass hoặc manual_review; manual_review cần xác nhận rõ. Kết luận fail chặn duyệt. UI luôn nhắc audit là hỗ trợ, không phải chứng nhận tính đúng thực tế.

Main sở hữu các transition, không nhận state/output/report từ renderer. Batch lưu id riêng từng tác vụ. Khi khởi động lại, các mục generating chuyển uncertain và auditing chuyển audit_failed; không tự gọi lại API. queued giữ lại để seller xác nhận tiếp tục, không tự phát sinh phí sau restart. Không cho chuyển seller trong một mutation hoặc chọn tệp; tác vụ mạng đã bắt đầu thuộc seller được chụp tại thời điểm gửi và kết quả chỉ ghi cho seller đó.

## Giao diện
- AI Studio gồm chọn ảnh nguồn có thumbnail, chọn prompt/chế độ bộ ảnh, các biến, preview prompt và nút Tạo với xác nhận gửi ảnh tới OpenAI.
- Có trạng thái chuẩn bị/đang tạo/đang kiểm định/lỗi; khi chưa cấu hình key, vẫn có thể tải ảnh, chọn prompt và xem preview nhưng nút gọi API giải thích lý do chưa khả dụng.
- Kết quả hiển thị ảnh, audit từng nhận xét, nút Duyệt/Từ chối, Kiểm định lại nếu audit lỗi và Xuất ảnh đã duyệt qua dialog native. Không có nút đăng thật trong giai đoạn này.
- Lịch sử truy vấn theo seller, xem lại snapshot và tải kết quả sau restart. Cấu hình cung cấp trạng thái credential, lưu/xóa key và kiểm tra kết nối; renderer chỉ nhận trạng thái có/không và nguồn local/environment.
- Infographic ở giai đoạn này tạo nền không chữ. Lớp chữ Nga có thể chỉnh sửa và thông số xác minh là bước riêng tiếp theo; không ghi chữ thành dữ liệu thật do mô hình tự suy đoán.

## Kiểm thử nghiệm thu
- Migration từ database v1 chứa prompt cá nhân và lịch sử: giữ nguyên dữ liệu, nâng phiên bản idempotent.
- Asset import kiểm tra bytes/kích thước/số lượng; batch thất bại không lưu dở; seller B không đọc/xuất/sử dụng ảnh của A.
- Job service kiểm tra ownership toàn bộ input ids, snapshot prompt, biến thiếu, transition sai, audit lỗi/fail/manual review và restart không tự gửi API.
- Adapter transport tests kiểm tra multipart có byte ảnh thật, audit có structured images, response schema/refusal/base64 lỗi, timeout không retry tạo ảnh và secret redaction. Không gọi API tính phí trong suite tự động.
- Credential tests xác minh không trả key về renderer, từ chối basic_text, cách ly key local và ưu tiên credential môi trường theo quy tắc đã nêu.
- UI tests: không mất draft/kết quả khi đổi seller hoặc callback cũ hoàn tất; tạo không thể bấm trùng; thiếu key/biến báo đúng; prompt từ Kho Prompt đi vào AI Studio đúng id.
- Electron smoke-test bằng SQLite và assets thật, không gọi API: import ảnh, xem preview, tạo chưa cấu hình bị chặn đúng, reopen giữ ảnh/lịch sử, seller isolation và cửa sổ nhỏ.
- Live validation tách riêng: key/model có quyền và ảnh thử được phép gửi; tạo → audit → duyệt → xuất thật. Nếu thiếu điều kiện, ghi rõ live chưa kiểm chứng, không mô tả fixture là tích hợp thật.

## Điều kiện chuyển sang triển khai
Thiết kế này cụ thể hóa phân hệ AI Studio sau Kho Prompt. Sau duyệt đặc tả, lập kế hoạch triển khai có task và hợp đồng IPC/migration/test cụ thể, giữ phương án thực hiện trực tiếp đã chọn. Không thay đổi mã sản phẩm trước bước này.
