import { locate, projectPath, resolveSpecifier } from '../layers.mjs';
import { visitImports } from '../visit-imports.mjs';

/**
 * widgets 레이어를 경고로만 알린다.
 *
 * 스킬은 widgets를 금지하지 않고 권하지 않는다. 이미 있는 레이어는 유효하므로 error가 아니다.
 * 화면 전용 블록은 pages, 재사용되는 사용자 동작은 features, 문맥 없는 UI는 shared, 앱 전역 레이아웃은 app에 둔다.
 * import 방향 규칙과는 별개다. pages가 `@/widgets/card`를 가져가면 방향은 맞지만 이 경고가 난다.
 */
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

    function check(node, specifier) {
      if (typeof specifier !== 'string') return;
      const resolved = resolveSpecifier(specifier, projectFile);
      if (!resolved) return;
      const target = locate(resolved);
      if (target?.layer === 'widgets') {
        context.report({ node, messageId: 'import', data: { specifier } });
      }
    }

    return {
      // 파일 자체가 `src/widgets` 아래에 있으면 import가 없어도 경고한다.
      Program(node) {
        if (source?.layer === 'widgets') context.report({ node, messageId: 'file' });
      },
      ...visitImports(check),
    };
  },
};

export default noWidgets;
