import type { PromptInput } from './contracts';
export interface Asset {
  id: string;
  mime: string;
  width: number;
  height: number;
  sha256: string;
  createdAt: string;
}
export const aspectRatios = [
  {
    id: '1:1',
    name: 'Vuông tiêu chuẩn',
    pixels: '1024 × 1024',
    use: 'Ảnh đại diện, ảnh chính vuông',
  },
  { id: '2:3', name: 'Dọc cổ điển', pixels: '1024 × 1536', use: 'Ảnh sản phẩm dọc và catalogue' },
  {
    id: '3:4',
    name: 'Dọc thương mại',
    pixels: '1152 × 1536',
    use: 'Ảnh chính cho sàn thương mại điện tử',
  },
  { id: '4:5', name: 'Dọc mạng xã hội', pixels: '1229 × 1536', use: 'Bài đăng dọc cân đối' },
  {
    id: '9:16',
    name: 'Dọc toàn màn hình',
    pixels: '864 × 1536',
    use: 'Story, video dọc và màn hình điện thoại',
  },
  {
    id: '3:2',
    name: 'Ngang cổ điển',
    pixels: '1536 × 1024',
    use: 'Ảnh ngang sản phẩm và catalogue',
  },
  { id: '4:3', name: 'Ngang tiêu chuẩn', pixels: '1536 × 1152', use: 'Ảnh ngang phổ thông' },
  { id: '16:9', name: 'Ngang màn hình', pixels: '1536 × 864', use: 'Banner và màn hình rộng' },
  { id: '5:4', name: 'Vuông ngang', pixels: '1536 × 1229', use: 'Ảnh catalogue gần vuông' },
  { id: '21:9', name: 'Siêu ngang', pixels: '1536 × 659', use: 'Banner toàn cảnh' },
  {
    id: 'original',
    name: 'Giữ tỷ lệ ảnh gốc',
    pixels: 'Theo ảnh nguồn',
    use: 'Giữ nguyên tỷ lệ đã tải lên',
  },
] as const;
export type AspectRatioId = (typeof aspectRatios)[number]['id'];
export type ImageRole = 'hero' | 'infographic' | 'advertising' | 'detail';
export interface TextProposal {
  assetIndex: number;
  role: ImageRole;
  enabled: boolean;
  approved: boolean;
  titleRu: string;
  bodyRu: string;
}
export interface ImageAnalysis {
  productTypeRu: string;
  colorsRu: string[];
  productNameRu: string;
  descriptionRu: string;
  observedAttributesRu: string[];
  uncertainAttributesRu: string[];
  textProposals: TextProposal[];
}
export interface ProductProfile {
  sellerId: string;
  storeId: string;
  marketplace: string;
  productSize: string;
  updatedAt: string;
}
export type StudioState =
  | 'queued'
  | 'generating'
  | 'auditing'
  | 'awaiting_review'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'uncertain'
  | 'audit_failed';
export interface Finding {
  description: string;
  confidence: number;
}
export interface QualityReport {
  passed: Finding[];
  errors: Finding[];
  verdict: 'pass' | 'manual_review' | 'fail';
  repairPrompt: string;
}
export interface CreateStudioRequest {
  assetIds: string[];
  promptIds: string[];
  values?: Record<string, string>;
  productSize?: string;
  aspectRatio: AspectRatioId;
  aspectRatios?: Partial<Record<string, AspectRatioId>>;
  analysis?: ImageAnalysis;
}
export interface PromptSnapshot {
  master: PromptInput;
  image: PromptInput;
  audit: PromptInput;
  ids: string[];
  versions: number[];
  values: Record<string, string>;
  productSize: string;
  finalPrompt: string;
  aspectRatio: AspectRatioId;
  outputAspectRatio: AspectRatioId;
  sourceWidth: number;
  sourceHeight: number;
  analysis: ImageAnalysis | null;
  textProposals: TextProposal[];
}
export interface StudioJob {
  id: string;
  batchId: string;
  state: StudioState;
  snapshot: PromptSnapshot;
  originalAssetIds: string[];
  outputAssetIds: string[];
  qualityReport: QualityReport | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}
export interface CredentialStatus {
  source: 'environment' | 'local' | 'none';
  configured: boolean;
  canStore: boolean;
}
export interface StudioBridge {
  preview(id: string): Promise<string>;
  assets(): Promise<Asset[]>;
  importImages(): Promise<Asset[]>;
  analyze(assetIds: string[]): Promise<ImageAnalysis>;
  productProfile(): Promise<ProductProfile>;
  saveProductSize(size: string): Promise<ProductProfile>;
  thumbnail(id: string): Promise<string>;
  prepare(request: CreateStudioRequest): Promise<PromptSnapshot[]>;
  create(request: CreateStudioRequest): Promise<StudioJob[]>;
  run(id: string): Promise<void>;
  list(): Promise<StudioJob[]>;
  get(id: string): Promise<StudioJob>;
  review(id: string, decision: 'approve' | 'reject', confirmManual: boolean): Promise<StudioJob>;
  retryAudit(id: string): Promise<void>;
  cancelQueued(batchId: string): Promise<void>;
  exportApproved(id: string): Promise<boolean>;
}
export interface CredentialBridge {
  status(): Promise<CredentialStatus>;
  save(key: string): Promise<void>;
  remove(): Promise<void>;
  checkConnection(): Promise<{ ok: boolean; errorCode: string | null }>;
}
