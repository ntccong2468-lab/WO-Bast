export type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateManifest {
  version: string;
  title: string;
  notes: string[];
  releaseUrl: string;
  installerUrl: string;
  installerName: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  title: string;
  notes: string[];
  releaseUrl: string;
  installerUrl: string;
  state: UpdateState;
  downloadedBytes: number;
  totalBytes: number | null;
  localPath: string | null;
  error: string | null;
}

export interface UpdateBridge {
  check(): Promise<UpdateInfo>;
  download(): Promise<UpdateInfo>;
  install(): Promise<void>;
  openRelease(): Promise<void>;
  onProgress(listener: (info: UpdateInfo) => void): () => void;
}

export const updateManifest: UpdateManifest = {
  version: '0.2.2',
  title: 'VN ПОЧТА 0.2.2',
  notes: [
    'Sửa lỗi bộ cài chặn cập nhật khi VN ПОЧТА vẫn đang đóng cửa sổ.',
    'Giao diện tạo ảnh được Việt hóa và tự lấy thông tin sản phẩm từ ảnh nguồn.',
    'Giữ lại ô Kích thước sản phẩm (Size), hỗ trợ nhiều khoảng size và lưu theo seller.',
    'Bổ sung đủ 10 tỷ lệ ảnh, gồm 9:16, với xử lý mở rộng nền không kéo giãn sản phẩm.',
    'Thêm đề xuất chữ tiếng Nga theo từng ảnh để seller xem, sửa và phê duyệt trước khi xuất.',
    'Bảo toàn prompt, ảnh nguồn và cấu hình đã lưu trong quy trình tạo ảnh.',
  ],
  releaseUrl: 'https://github.com/ntccong2468-lab/WO-Bast/releases/tag/v0.2.2',
  installerUrl:
    'https://github.com/ntccong2468-lab/WO-Bast/releases/download/v0.2.2/VN-Pochta-Setup-0.2.2-x64.exe',
  installerName: 'VN-Pochta-Setup-0.2.2-x64.exe',
};
