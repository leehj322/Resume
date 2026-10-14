import path from 'node:path';

/**
 * Mechanical checks from Feature-Sliced Design v2.1.
 * Layer order, public APIs, and same-layer cross-imports.
 * Slice groups are not modeled.
 */

const SLICED_LAYERS = new Set(['pages', 'widgets', 'features', 'entities']);

const LAYER_ROOTS = [
  { root: 'src/_app', layer: 'app', rank: 1, sliced: false },
  { root: 'src/_pages', layer: 'pages', rank: 2, sliced: true },
  { root: 'src/pages', layer: 'pages', rank: 2, sliced: true },
  { root: 'src/widgets', layer: 'widgets', rank: 3, sliced: true },
  { root: 'src/features', layer: 'features', rank: 4, sliced: true },
  { root: 'src/entities', layer: 'entities', rank: 5, sliced: true },
  { root: 'src/shared', layer: 'shared', rank: 6, sliced: false },
  { root: 'src/processes', layer: 'processes', rank: 7, sliced: true },
];

const ALIASES = [
  ['@/_app', 'src/_app'],
  ['@/_pages', 'src/_pages'],
  ['@/widgets', 'src/widgets'],
  ['@/features', 'src/features'],
  ['@/entities', 'src/entities'],
  ['@/shared', 'src/shared'],
  ['@/processes', 'src/processes'],
];

const TECHNICAL_FILE_NAMES = new Set([
  'types.ts',
  'types.tsx',
  'utils.ts',
  'utils.tsx',
  'helpers.ts',
  'helpers.tsx',
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function projectPath(filename, cwd) {
  const relative = path.isAbsolute(filename) ? path.relative(cwd, filename) : filename;
  return toPosix(relative).replace(/^\.\//, '');
}

function stripExtension(filePath) {
  return filePath.replace(/\.(tsx|ts|jsx|js|mjs|cjs|css)$/, '');
}

function resolveSpecifier(specifier, fromProjectPath) {
  if (specifier.startsWith('.')) {
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromProjectPath), specifier)
    );
    return stripExtension(resolved.replace(/^\.\//, ''));
  }

  for (const [alias, target] of ALIASES) {
    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      return stripExtension(`${target}${specifier.slice(alias.length)}`);
    }
  }

  return null;
}

function locate(projectFilePath) {
  const filePath = projectFilePath.replace(/^\.\//, '');

  if (filePath === 'app' || filePath.startsWith('app/')) {
    return { layer: 'next', rank: 0, sliced: false, slice: null, rest: [] };
  }

  for (const entry of LAYER_ROOTS) {
    if (filePath !== entry.root && !filePath.startsWith(`${entry.root}/`)) continue;

    const rest = filePath.slice(entry.root.length).split('/').filter(Boolean);
    return {
      layer: entry.layer,
      rank: entry.rank,
      sliced: entry.sliced,
      slice: entry.sliced ? (rest[0] ?? null) : null,
      rest,
    };
  }

  return null;
}

function isPublicSliceImport(target) {
  if (target.rest.length === 1) return true;
  if (target.rest.length !== 2) return false;
  return (
    target.rest[1] === 'index' ||
    target.rest[1] === 'index.server' ||
    target.rest[1] === 'index.client'
  );
}

function sameSlice(source, target) {
  return (
    source.sliced && source.layer === target.layer && source.slice && source.slice === target.slice
  );
}

function isEntityAtX(source, target) {
  if (source.layer !== 'entities' || target.layer !== 'entities') return false;
  const [producer, marker, consumer] = target.rest;
  return (
    marker === '@x' && Boolean(producer) && consumer === source.slice && producer !== source.slice
  );
}

function isFeaturePublicCrossImport(source, target) {
  const allowsPublicCrossImport = source.layer === 'features' || source.layer === 'widgets';
  return (
    allowsPublicCrossImport &&
    source.layer === target.layer &&
    source.slice !== target.slice &&
    isPublicSliceImport(target)
  );
}

function sharedSegment(location) {
  return location.layer === 'shared' ? (location.rest[0] ?? null) : null;
}

const importBoundaries = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce FSD v2.1 import direction and public APIs.',
    },
    schema: [],
    messages: {
      processes: 'FSD: the processes layer is removed in v2.1.',
      upward: "FSD: '{{from}}' cannot import the higher layer '{{to}}' ({{specifier}}).",
      cross: "FSD: slice '{{slice}}' cannot import sibling '{{target}}'.",
      publicApi: "FSD: import '{{specifier}}' through the slice public API, not its internals.",
      sharedRoot: 'FSD: shared has no top-level public API. Import a segment such as @/shared/ui.',
      sharedAssets:
        'FSD: do not add a shared assets segment. Keep assets next to the code that uses them.',
      sharedDeep: "FSD: '{{specifier}}' reaches past the shared segment public API.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const source = locate(projectPath(filename, context.cwd));
    if (!source) return {};

    function check(node, specifier) {
      if (typeof specifier !== 'string') return;

      const fromPath = projectPath(filename, context.cwd);
      const resolved = resolveSpecifier(specifier, fromPath);
      if (!resolved) return;

      const target = locate(resolved);
      if (!target) return;

      if (source.layer === 'processes' || target.layer === 'processes') {
        context.report({ node, messageId: 'processes' });
        return;
      }

      if (sameSlice(source, target)) return;
      if (source.layer === 'app' && target.layer === 'app') return;

      const sourceSegment = sharedSegment(source);
      const targetSegment = sharedSegment(target);
      if (sourceSegment && sourceSegment === targetSegment) return;

      if (target.rank < source.rank) {
        context.report({
          node,
          messageId: 'upward',
          data: { from: source.layer, to: target.layer, specifier },
        });
        return;
      }

      if (target.rank === source.rank) {
        if (isEntityAtX(source, target) || isFeaturePublicCrossImport(source, target)) return;
        context.report({
          node,
          messageId: 'cross',
          data: { slice: source.slice ?? source.layer, target: target.slice ?? target.layer },
        });
        return;
      }

      if (SLICED_LAYERS.has(target.layer) && !isPublicSliceImport(target)) {
        context.report({ node, messageId: 'publicApi', data: { specifier } });
        return;
      }

      if (target.layer !== 'shared') return;
      if (target.rest.length === 0) {
        context.report({ node, messageId: 'sharedRoot' });
        return;
      }
      if (target.rest[0] === 'assets') {
        context.report({ node, messageId: 'sharedAssets' });
        return;
      }
      if (target.rest.length > 2) {
        context.report({ node, messageId: 'sharedDeep', data: { specifier } });
      }
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value);
      },
    };
  },
};

const noTechnicalFilenames = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow technical-role filenames such as types.ts and utils.ts inside FSD layers.',
    },
    schema: [],
    messages: {
      technical: "FSD: name '{{name}}' after its domain, not its technical role.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const projectFile = projectPath(filename, context.cwd);
    if (!projectFile.startsWith('src/')) return {};

    const base = path.posix.basename(projectFile);
    if (!TECHNICAL_FILE_NAMES.has(base)) return {};

    return {
      Program(node) {
        context.report({ node, messageId: 'technical', data: { name: base } });
      },
    };
  },
};

const noWidgets = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Discourage the FSD widgets layer.',
    },
    schema: [],
    messages: {
      file: 'FSD: the widgets layer is discouraged. Keep this on the page, in features, in shared, or in app.',
      import: 'FSD: the widgets layer is discouraged ({{specifier}}).',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const projectFile = projectPath(filename, context.cwd);
    const source = locate(projectFile);

    function reportImport(node, specifier) {
      const resolved = resolveSpecifier(specifier, projectFile);
      if (!resolved) return;
      const target = locate(resolved);
      if (target?.layer === 'widgets') {
        context.report({ node, messageId: 'import', data: { specifier } });
      }
    }

    return {
      Program(node) {
        if (source?.layer === 'widgets') context.report({ node, messageId: 'file' });
      },
      ImportDeclaration(node) {
        reportImport(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        reportImport(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) reportImport(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') reportImport(node, node.source.value);
      },
    };
  },
};

const fsdPlugin = {
  meta: { name: 'fsd', version: '1.0.0' },
  rules: {
    'import-boundaries': importBoundaries,
    'no-technical-filenames': noTechnicalFilenames,
    'no-widgets': noWidgets,
  },
};

export default fsdPlugin;
