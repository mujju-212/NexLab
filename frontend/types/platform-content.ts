export type PlatformContentBlockType =
  | 'markdown' | 'text' | 'code' | 'html' | 'image' | 'video' | 'pdf' | 'link';

export interface PlatformContentBlock {
  id: string;
  module_type: PlatformContentBlockType;
  title: string;
  content_data: Record<string, unknown>;
}
