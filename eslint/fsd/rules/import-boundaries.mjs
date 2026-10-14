import {
  SLICED_LAYERS,
  isEntityAtX,
  isFeaturePublicCrossImport,
  isPublicSliceImport,
  locate,
  projectPath,
  resolveSpecifier,
  sameSlice,
  sharedSegment,
} from '../layers.mjs';
import { visitImports } from '../visit-imports.mjs';

/**
 * import 방향, 슬라이스 공개 API, 같은 레이어 교차 import를 한 규칙으로 본다.
 * 배치 판단(페이지에 둘지 feature로 뺄지)은 검사하지 않는다. 그건 사용처를 세야 해서다.
 */
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
    // `eslint.config.mjs`처럼 레이어 밖 파일은 방문자를 등록하지 않는다.
    if (!source) return {};

    function check(node, specifier) {
      if (typeof specifier !== 'string') return;

      const fromPath = projectPath(filename, context.cwd);
      const resolved = resolveSpecifier(specifier, fromPath);
      // 패키지 import는 FSD 경로가 아니므로 넘어간다.
      if (!resolved) return;

      const target = locate(resolved);
      if (!target) return;

      // 제거된 레이어는 방향보다 먼저 막는다. 위에 있든 아래에 있든 쓰면 안 된다.
      if (source.layer === 'processes' || target.layer === 'processes') {
        context.report({ node, messageId: 'processes' });
        return;
      }

      // 슬라이스 내부와 FSD app 세그먼트끼리는 공개 index를 강제하지 않는다.
      // app은 슬라이스가 없어서 `src/_app/fonts`를 라우트와 페이지가 직접 가져간다.
      if (sameSlice(source, target)) return;
      if (source.layer === 'app' && target.layer === 'app') return;

      // shared/ui 안의 파일끼리 깊은 상대 경로는 그 세그먼트 구현이다.
      // shared/ui가 shared/lib를 가져가는 경우는 여기 걸리지 않고, 아래 공개 범위 검사를 받는다.
      const sourceSegment = sharedSegment(source);
      const targetSegment = sharedSegment(target);
      if (sourceSegment && sourceSegment === targetSegment) return;

      // rank가 더 작으면 위 레이어다. pages → app, entities → features가 여기 해당한다.
      if (target.rank < source.rank) {
        context.report({
          node,
          messageId: 'upward',
          data: { from: source.layer, to: target.layer, specifier },
        });
        return;
      }

      // 같은 rank는 형제 슬라이스다. entities `@x`와 features·widgets의 공개 API만 통과한다.
      if (target.rank === source.rank) {
        if (isEntityAtX(source, target) || isFeaturePublicCrossImport(source, target)) return;
        context.report({
          node,
          messageId: 'cross',
          data: { slice: source.slice ?? source.layer, target: target.slice ?? target.layer },
        });
        return;
      }

      // 아래의 슬라이스 레이어는 index만. `@/_pages/home/ui/home-page`는 여기서 거절한다.
      if (SLICED_LAYERS.has(target.layer) && !isPublicSliceImport(target)) {
        context.report({ node, messageId: 'publicApi', data: { specifier } });
        return;
      }

      // shared는 슬라이스가 없다. `@/shared` 루트 index는 없고, 세그먼트별로 연다.
      // 허용 깊이는 `shared/<segment>` 또는 `shared/<segment>/<파일이나 폴더>`까지다.
      // `shared/ui/button/button`은 폴더 공개 경계를 지나므로 거절한다.
      // `assets` 세그먼트는 두지 않는다. 파일은 쓰는 코드 옆에 둔다.
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

    return visitImports(check);
  },
};

export default importBoundaries;
