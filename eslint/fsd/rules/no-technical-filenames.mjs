import path from 'node:path';
import { projectPath } from '../layers.mjs';

/**
 * 역할만 드러내는 파일 이름. 스킬이 예로 든 `types.ts`, `utils.ts`, `helpers.ts`만 막는다.
 * `format-date.ts`나 `home.ts`처럼 대상을 이름에 적은 파일은 허용한다.
 * `.tsx`도 포함한다. 컴포넌트 파일을 같은 이름으로 두는 경우가 있기 때문이다.
 */
const TECHNICAL_FILE_NAMES = new Set([
  'types.ts',
  'types.tsx',
  'utils.ts',
  'utils.tsx',
  'helpers.ts',
  'helpers.tsx',
]);

/**
 * `src` 안의 FSD 파일만 본다. Next.js 라우트 파일 이름은 프레임워크가 정하므로 제외한다.
 * 위반은 파일당 한 번, Program에서 보고한다. import가 없어도 이름 자체가 위반이기 때문이다.
 */
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

export { TECHNICAL_FILE_NAMES };
export default noTechnicalFilenames;
