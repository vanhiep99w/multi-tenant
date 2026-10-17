import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import { visit } from 'unist-util-visit';
import { parseDocument } from 'yaml';
import { readSourceURL, validateSourceRequest } from '@vanhiep99w/docs-kit/source-explorer';

const parser = unified().use(remarkParse).use(remarkMdx);
const ID = /^[a-z0-9][a-z0-9_-]*$/;
const DESCRIPTORS = new Set(['code-walkthrough', 'code-diff']);

export function sourceMetadata(meta = '') {
  const attributes = {};
  // Consume all quoted attributes so source= inside a title is not treated as metadata.
  const remaining = meta.replace(/(?:^|\s)([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g, (raw, key, double, single, plain) => {
    if (key === 'source' || key === 'file') {
      if (attributes[key] !== undefined) throw new Error(`Duplicate ${key} metadata`);
      attributes[key] = double ?? single ?? plain;
    }
    return '';
  });
  if (/(?:^|\s)source\s*=/.test(remaining)) throw new Error('Malformed source metadata');
  if (attributes.source === undefined) return null;
  const request = { project: attributes.source, file: attributes.file };
  validateSourceRequest(request);
  if (!request.file) throw new Error('source metadata requires file');
  assertPath(request.file);
  if (!ID.test(request.project)) throw new Error(`Invalid project ID: ${request.project}`);
  return request;
}

function assertPath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error(`Invalid source file path: ${path}`);
  }
}

export function remarkSourceReferences() {
  return tree => {
    visit(tree, 'code', (node, index, parent) => {
      const request = sourceMetadata(node.meta ?? '');
      if (!request || index === undefined || !parent) return;
      const reference = {
        type: 'mdxJsxFlowElement', name: 'SourceRef',
        attributes: Object.entries({ ...request, variant: 'button' }).map(([name, value]) => ({
          type: 'mdxJsxAttribute', name, value,
        })),
        children: [{ type: 'text', value: 'Mở ví dụ và các file liên quan' }],
      };
      parent.children.splice(index, 0, reference);
      return index + 2;
    });
  };
}

/** Source stays in repository-authored Markdown; generated assets are public, never executed. */
export function collectSourceExamples(documents) {
  const projects = new Map();
  const references = [];

  function addFile(request, language, code, title, origin) {
    validateSourceRequest(request);
    if (!ID.test(request.project)) throw new Error(`${origin}: invalid project ID`);
    const snapshot = request.snapshot ?? 'guide';
    if (!ID.test(snapshot)) throw new Error(`${origin}: invalid snapshot ID`);
    assertPath(request.file);
    let project = projects.get(request.project);
    if (!project) {
      project = { id: request.project, title, snapshots: new Map() };
      projects.set(request.project, project);
    }
    let data = project.snapshots.get(snapshot);
    if (!data) {
      data = { project: request.project, snapshot, defaultFile: request.file, files: [] };
      project.snapshots.set(snapshot, data);
    }
    if (data.files.some(file => file.path === request.file)) {
      throw new Error(`${origin}: duplicate source file ${request.project}/${snapshot}/${request.file}`);
    }
    data.files.push({ path: request.file, language, code, regions: {} });
  }

  for (const { path, content } of documents) {
    const title = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? path;
    const tree = parser.parse({ value: content, path });
    visit(tree, node => {
      const origin = `${path}:${node.position?.start.line ?? 1}`;
      if (node.type === 'code') {
        let request;
        try { request = sourceMetadata(node.meta ?? ''); }
        catch (error) { throw new Error(`${origin}: ${error.message}`, { cause: error }); }
        if (request) {
          if (!node.lang || DESCRIPTORS.has(node.lang)) throw new Error(`${origin}: source metadata needs a regular code fence`);
          addFile(request, node.lang, node.value, title, origin);
          references.push({ request, origin });
        }
        if (DESCRIPTORS.has(node.lang)) {
          const yaml = parseDocument(node.value, { uniqueKeys: true });
          if (yaml.errors.length) throw new Error(`${origin}: ${yaml.errors[0].message}`);
          const descriptor = yaml.toJS({ maxAliasCount: 50 });
          const versions = node.lang === 'code-diff' ? [descriptor.before, descriptor.after] : descriptor.snapshots;
          for (const version of versions ?? []) {
            if (!version?.source) continue;
            // Every adapter reference also publishes that exact displayed code: no duplicate sources to maintain.
            addFile(version.source, version.language ?? descriptor.language ?? 'text', version.code, title, origin);
            references.push({ request: version.source, origin });
          }
        }
        if (node.lang === 'd2') {
          for (const match of node.value.matchAll(/\blink:\s*("(?:\\.|[^"\\])*"|'[^']*'|[^\s;}]+)/g)) {
            let link = match[1];
            link = link.startsWith('"') ? JSON.parse(link) : link.replace(/^'|'$/g, '');
            const url = new URL(link, 'https://docs.example/current/');
            if (url.origin !== 'https://docs.example' || url.pathname !== '/current/') continue;
            const request = readSourceURL(url);
            if (url.searchParams.has('source') && !request) throw new Error(`${origin}: empty D2 source reference`);
            if (request) references.push({ request, origin });
          }
        }
      }
      if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === 'SourceRef') {
        const request = {};
        for (const attr of node.attributes) {
          if (!['project', 'snapshot', 'file', 'region', 'lines'].includes(attr.name)) continue;
          if (typeof attr.value !== 'string') throw new Error(`${origin}: SourceRef attributes must be static strings`);
          request[attr.name] = attr.value;
        }
        references.push({ request, origin });
      }
    });
  }

  for (const { request, origin } of references) {
    try {
      validateSourceRequest(request);
      const project = projects.get(request.project);
      if (!project) throw new Error(`unknown project ${request.project}`);
      const snapshot = project.snapshots.get(request.snapshot ?? (project.snapshots.has('guide') ? 'guide' : project.snapshots.keys().next().value));
      if (!snapshot) throw new Error(`unknown snapshot ${request.snapshot}`);
      const file = snapshot.files.find(file => file.path === (request.file ?? snapshot.defaultFile));
      if (!file) throw new Error(`unknown file ${request.file}`);
      if (request.region && !file.regions[request.region]) throw new Error(`unknown region ${request.region}`);
      if (request.lines) {
        const match = /^(\d+)(?:-(\d+))?$/.exec(request.lines);
        const start = Number(match?.[1]);
        const end = Number(match?.[2] ?? match?.[1]);
        if (!match || start < 1 || end < start || end > file.code.split('\n').length) {
          throw new Error(`invalid line range ${request.lines} in ${file.path}`);
        }
      }
    } catch (error) {
      throw new Error(`${origin}: ${error.message}`, { cause: error });
    }
  }
  return [...projects.values()];
}

export async function highlightSourceFile(file, highlighter) {
  const language = highlighter.getLoadedLanguages().includes(file.language) ? file.language : 'text';
  let line = 0;
  const html = highlighter.codeToHtml(file.code, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
    transformers: [{ line(node) { node.properties['data-line'] = ++line; } }],
  });
  return { ...file, html };
}
