import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
import { D2InteractiveDiagram } from '@vanhiep99w/docs-kit/components/d2-interactive';
import { SourceRef } from '@vanhiep99w/docs-kit/components/source-explorer';
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';
import { CodeWalkthroughWithSource } from '@vanhiep99w/docs-kit/components/code-walkthrough-source';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import { CodeDiffWithSource } from '@vanhiep99w/docs-kit/components/code-diff-source';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';
import type { MDXComponents } from 'mdx/types';

// Build-time plugins stay in source.config.ts, never in this component map.
export const docsKitComponents = {
  D2Diagram,
  D2InteractiveDiagram,
  SourceRef,
  CodeWalkthrough,
  CodeWalkthroughWithSource,
  CodeDiff,
  CodeDiffWithSource,
  ProtocolExchange,
  TerminalSession,
  SpanWaterfall,
} satisfies MDXComponents;
