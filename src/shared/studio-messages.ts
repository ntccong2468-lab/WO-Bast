export const studioMessages: Record<string, string> = {
  credential_missing: 'Chưa có khóa API. Mở Cấu hình để nhập khóa.',
  credential_unavailable: 'Kho mã hóa hệ điều hành chưa khả dụng.',
  invalid_api_key: 'OpenAI không chấp nhận khóa này (401).',
  access_denied: 'Không có quyền truy cập model OpenAI.',
  quota: 'Tài khoản OpenAI hết hạn mức.',
  rate_limited: 'OpenAI giới hạn tốc độ. Hãy thử lại sau.',
  timeout: 'Yêu cầu hết thời gian. Tác vụ tạo ảnh có thể đã phát sinh phí.',
  network: 'Lỗi kết nối. Tác vụ tạo ảnh có thể đã phát sinh phí.',
  invalid_response: 'Phản hồi API không hợp lệ.',
  refused: 'API từ chối yêu cầu.',
  model_unavailable: 'Model không khả dụng cho tài khoản.',
  invalid_prompt: 'Prompt vượt giới hạn 32.000 ký tự của model.',
  invalid_size:
    'Size phải là các khoảng hoặc cỡ chữ phân cách bằng dấu chấm phẩy, ví dụ 48-56; M; One Size.',
  interrupted: 'Tác vụ bị ngắt khi đóng ứng dụng.',
  unexpected_error: 'Không thể hoàn tất tác vụ. Kiểm tra kết nối hoặc quyền ghi dữ liệu.',
};
