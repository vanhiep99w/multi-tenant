import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import {
  rehypeCodeDefaultOptions,
  remarkDirectiveAdmonition,
} from 'fumadocs-core/mdx-plugins';
import remarkDirective from 'remark-directive';
import remarkGithubAdmonitions from 'remark-github-admonitions-to-directives';
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
      ...plugins,
    ],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // Shiki 4 no longer bundles some niche grammars such as Rego and PromQL.
      fallbackLanguage: 'text',
    },
  },
});
