import type { PromptInput } from './contracts';
export interface Asset {
  id: string;
  mime: string;
  width: number;
  height: number;
  sha256: string;
  createdAt: string;
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
  values: Record<string, string>;
  aspectRatio: '3:4' | '2:3';
}
export interface PromptSnapshot {
  master: PromptInput;
  image: PromptInput;
  audit: PromptInput;
  ids: string[];
  versions: number[];
  values: Record<string, string>;
  finalPrompt: string;
  aspectRatio: '3:4' | '2:3';
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
