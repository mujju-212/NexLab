'use client';

/**
 * blocks.tsx — the block-type registry for the authoring studio.
 *
 * One entry per ContentModule type. Adding a new block type = adding one row
 * here (+ its editor branch in editors.tsx and preview branch in CellPreview.tsx).
 * The `defaultData` shapes MUST match what the student pre-lab page reads
 * (frontend/app/student/pre-lab/[experimentId]/page.tsx) and what the backend
 * allow-list accepts (backend/app/instructor/content.py:_ALLOWED).
 *
 * Constraint: module_type is a VARCHAR(10) column — every key here is ≤10 chars.
 */
import type { ComponentType } from 'react';
import {
  FileCode, FileText, Code2, Image as ImageIcon, Video, FileCheck2,
  HelpCircle, Globe, Link2, Download, ClipboardCheck, Mic2,
} from 'lucide-react';

export type BlockType =
  | 'markdown' | 'text' | 'code' | 'image'
  | 'video' | 'pdf' | 'html' | 'link' | 'file' | 'quiz' | 'assign' | 'viva';

/** A content block as the studio manipulates it (mirrors listContent rows). */
export interface ContentBlock {
  id: string;
  module_type: BlockType | string;
  title: string;
  content_data: Record<string, unknown>;
  display_order: number;
  min_watch_pct: number;
  question_count?: number;
}

type IconType = ComponentType<{ size?: number | string; color?: string; className?: string }>;

export interface BlockMeta {
  label: string;
  icon: IconType;
  group: 'Content' | 'Media' | 'Interactive';
  hint: string;
  defaultTitle: string;
  defaultData: () => Record<string, unknown>;
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  markdown: {
    label: 'Markdown', icon: FileCode, group: 'Content',
    hint: 'Formatted notes with live preview', defaultTitle: 'Notes',
    defaultData: () => ({ md: '' }),
  },
  text: {
    label: 'Rich text', icon: FileText, group: 'Content',
    hint: 'HTML / plain theory text', defaultTitle: 'Theory',
    defaultData: () => ({ html: '' }),
  },
  code: {
    label: 'Code cell', icon: Code2, group: 'Content',
    hint: 'Runnable or read-only snippet', defaultTitle: 'Code example',
    defaultData: () => ({ language: 'python', code: '', runnable: true, stdin: '' }),
  },
  image: {
    label: 'Image', icon: ImageIcon, group: 'Media',
    hint: 'Diagram or screenshot by URL', defaultTitle: 'Image',
    defaultData: () => ({ url: '', alt: '', caption: '' }),
  },
  video: {
    label: 'Video', icon: Video, group: 'Media',
    hint: 'Embedded lecture video', defaultTitle: 'Video',
    defaultData: () => ({ url: '' }),
  },
  pdf: {
    label: 'PDF', icon: FileCheck2, group: 'Media',
    hint: 'Embedded PDF document', defaultTitle: 'Reading',
    defaultData: () => ({ url: '' }),
  },
  html: {
    label: 'HTML embed', icon: Globe, group: 'Media',
    hint: 'Inline interactive simulation', defaultTitle: 'Simulation',
    defaultData: () => ({ html: '' }),
  },
  link: {
    label: 'Link', icon: Link2, group: 'Media',
    hint: 'External reference button', defaultTitle: 'Reference',
    defaultData: () => ({ url: '', label: '', description: '' }),
  },
  file: {
    label: 'Download', icon: Download, group: 'Media',
    hint: 'Downloadable resource', defaultTitle: 'Resource',
    defaultData: () => ({ url: '', filename: '', kind: 'pdf' }),
  },
  quiz: {
    label: 'Quiz', icon: HelpCircle, group: 'Interactive',
    hint: 'Auto-graded MCQ gate', defaultTitle: 'Quiz',
    defaultData: () => ({ pass_threshold: 70, max_attempts: 3, cooldown_minutes: 30, shuffle: true }),
  },
  assign: {
    label: 'Coding task', icon: ClipboardCheck, group: 'Interactive',
    hint: 'Graded code vs. test cases', defaultTitle: 'Coding assignment',
    defaultData: () => ({
      language: 'python', starter_code: '', instructions: '',
      pass_threshold: 60, time_limit_sec: 5, test_cases: [],
    }),
  },
  viva: {
    label: 'AI Viva', icon: Mic2, group: 'Interactive',
    hint: 'AI-generated oral questions', defaultTitle: 'Viva',
    defaultData: () => ({
      mode: 'topics', topics: [], count: 5, difficulty: 2,
      pass_threshold: 70, questions: [],
    }),
  },
};

/** Palette layout — order groups + the blocks inside each. */
export const PALETTE: { group: BlockMeta['group']; types: BlockType[] }[] = [
  { group: 'Content', types: ['markdown', 'text', 'code'] },
  { group: 'Media', types: ['image', 'video', 'pdf', 'html', 'link', 'file'] },
  { group: 'Interactive', types: ['quiz', 'assign', 'viva'] },
];

export const metaFor = (type: string): BlockMeta =>
  BLOCK_META[type as BlockType] ?? BLOCK_META.text;

/** UI-only keys persisted in content_data; ignored by grading + student read. */
export const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
export const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
export const asBool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;
