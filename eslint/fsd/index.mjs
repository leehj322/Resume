import importBoundaries from './rules/import-boundaries.mjs';
import noTechnicalFilenames from './rules/no-technical-filenames.mjs';
import noWidgets from './rules/no-widgets.mjs';

/**
 * `eslint.config.mjs`에 `fsd` 플러그인으로 등록한다.
 * 규칙 이름은 설정 파일의 `'fsd/import-boundaries'` 같은 키와 맞아야 한다.
 *
 * `import-boundaries`와 `no-technical-filenames`는 error다.
 * `no-widgets`만 warn이다. widgets는 제거된 레이어가 아니라 권장하지 않는 레이어기 때문이다.
 */
const fsdPlugin = {
  meta: { name: 'fsd', version: '1.0.0' },
  rules: {
    'import-boundaries': importBoundaries,
    'no-technical-filenames': noTechnicalFilenames,
    'no-widgets': noWidgets,
  },
};

export { importBoundaries, noTechnicalFilenames, noWidgets };
export default fsdPlugin;
