import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import {
  rehypeCodeDefaultOptions,
  remarkDirectiveAdmonition,
} from 'fumadocs-core/mdx-plugins';
import remarkDirective from 'remark-directive';
import remarkGithubAdmonitions from 'remark-github-admonitions-to-directives';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { remarkCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough';
import { remarkCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { remarkProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
import { remarkTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';
import { remarkSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall';
import { remarkSourceReferences } from './scripts/lib/source-examples.mjs';
import { visit } from 'unist-util-visit';

function remarkMermaid() {
  return (tree: import('mdast').Root) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || index === undefined || !parent) return;
      (parent.children as unknown[])[index] = {
        type: 'mdxJsxFlowElement',
        name: 'MermaidDiagram',
        attributes: [
          {
            type: 'mdxJsxAttribute',
            name: 'chart',
            value: node.value,
          },
        ],
        children: [],
      };
    });
  };
}

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    // Convert GitHub alerts into directives, then render them as Fumadocs callouts.
    remarkPlugins: (plugins) => [
      remarkDirective,
      remarkGithubAdmonitions,
      remarkDirectiveAdmonition,
      remarkMermaid,
      remarkSourceReferences,
      [remarkD2, {
        cacheDir: '.next/cache/docs-kit/d2',
        assetsRoot: 'content/assets/d2/icons',
        defaultCaption: 'Sơ đồ',
        interactive: true,
        sketch: false,
        concurrency: 1,
      }],
      remarkCodeWalkthrough,
      remarkCodeDiff,
      remarkProtocolExchange,
      remarkTerminalSession,
      remarkSpanWaterfall,
      ...plugins,
    ],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // Shiki 4 no longer bundles some niche grammars such as Rego and PromQL.
      fallbackLanguage: 'text',
    },
  },
});
