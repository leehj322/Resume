import path from 'node:path';

/**
 * FSD v2.1에서 import 대상을 고를 때 쓰는 경로 모델.
 *
 * rank가 작을수록 위 레이어다. 한 파일은 자기보다 rank가 큰 아래 레이어만 가져올 수 있다.
 *
 *   next(0) → app(1) → pages(2) → widgets(3) → features(4) → entities(5) → shared(6)
 *
 * `next`는 FSD 레이어가 아니다. 프로젝트 루트의 `app/`은 Next.js 라우트 폴더이고,
 * 여기서는 페이지를 조립하는 최상위로만 본다. FSD app 레이어는 `src/_app`이다.
 * Next.js `app/`, `pages/`와 이름이 겹치지 않게 언더스코어를 붙인다.
 * `src/pages`도 pages로 인식한다. 접두사 없는 예전 경로가 들어와도 같은 레이어로 보게 하려는 것이다.
 *
 * `sliced`인 레이어는 첫 경로 조각이 슬라이스다.
 * `src/_pages/home/ui/home-page`의 슬라이스는 `home`이다.
 * app과 shared는 슬라이스가 없고 세그먼트만 있다. 세그먼트끼리는 서로 가져올 수 있다.
 *
 * `processes`는 v2.1에서 제거됐지만, 그 경로를 만들거나 가져오면 규칙이 막을 수 있게 rank를 남겨 둔다.
 *
 * 슬라이스 그룹(예: `features/payment/checkout`)은 여기서 슬라이스로 오인한다.
 * 그룹 폴더를 쓰기 시작하면 `locate`가 그룹과 슬라이스를 구분해야 한다.
 */

/**
 * 슬라이스가 있는 레이어. 바깥에서는 이 레이어의 `index`만 가져올 수 있다.
 * app과 shared는 여기 없다.
 */
const SLICED_LAYERS = new Set(['pages', 'widgets', 'features', 'entities']);

/**
 * 위 레이어가 앞이다. `root`는 프로젝트 기준 폴더이고, `rank`는 import 방향에 쓴다.
 * 같은 `layer` 이름이 두 폴더에 있으면(`_pages`, `pages`) 먼저 일치하는 쪽을 쓴다.
 */
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

/**
 * tsconfig `paths`와 같은 별칭이다. `@/app`은 일부러 없다.
 * 그 별칭은 Next.js `app/`과 FSD `src/_app` 중 어디를 가리키는지 규칙만으로 정할 수 없다.
 */
const ALIASES = [
  ['@/_app', 'src/_app'],
  ['@/_pages', 'src/_pages'],
  ['@/widgets', 'src/widgets'],
  ['@/features', 'src/features'],
  ['@/entities', 'src/entities'],
  ['@/shared', 'src/shared'],
  ['@/processes', 'src/processes'],
];

/**
 * Windows 구분자를 `/`로 바꾼다. 이후 경로는 모두 posix로 비교한다.
 */
function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * ESLint가 넘긴 절대 경로를 프로젝트 루트 기준 상대 경로로 만든다.
 * `cwd`는 `eslint`를 실행한 디렉터리다.
 */
function projectPath(filename, cwd) {
  const relative = path.isAbsolute(filename) ? path.relative(cwd, filename) : filename;
  return toPosix(relative).replace(/^\.\//, '');
}

/**
 * 확장자를 떼어 `index.ts`와 `index`를 같은 공개 API로 본다.
 * `.css`도 포함한다. `globals.css`처럼 스타일을 직접 가져오는 경로가 있기 때문이다.
 */
function stripExtension(filePath) {
  return filePath.replace(/\.(tsx|ts|jsx|js|mjs|cjs|css)$/, '');
}

/**
 * import 문자열을 `src/...` 또는 `app/...` 경로로 바꾼다.
 * `next/font` 같은 패키지는 null이다. FSD 경계 밖이라 이 규칙이 보지 않는다.
 *
 * 상대 경로는 그 파일을 기준으로 정규화한다.
 * `src/_pages/home/index.ts`의 `./ui/home-page`는 `src/_pages/home/ui/home-page`가 된다.
 */
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

/**
 * 프로젝트 경로가 어느 레이어인지 반환한다. FSD 경로가 아니면 null이다.
 *
 * 루트 `app/`은 `layer: 'next'`다. `src/_app`보다 먼저 짧게 닫혀야
 * `app/page.tsx`가 FSD app으로 들어가지 않는다. `src/`로 시작하는 경로는 이 분기를 타지 않는다.
 *
 * `rest`는 레이어 루트 아래 조각이다.
 * 슬라이스 레이어면 `rest[0]`이 슬라이스 이름이고, 그 다음이 세그먼트다.
 */
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

/**
 * 슬라이스 밖에서는 공개 진입점만 허용한다.
 *
 * - `src/_pages/home` → `@/_pages/home`
 * - `src/_pages/home/index`, `index.server`, `index.client` → 환경별 진입점
 *
 * `ui/home-page`처럼 세그먼트 파일은 그 슬라이스 안에서만 가져온다.
 * `index.server`는 서버 전용 공개 API가 하나뿐일 때 스킬이 허용하는 예외다.
 */
function isPublicSliceImport(target) {
  if (target.rest.length === 1) return true;
  if (target.rest.length !== 2) return false;
  return (
    target.rest[1] === 'index' ||
    target.rest[1] === 'index.server' ||
    target.rest[1] === 'index.client'
  );
}

/**
 * 같은 슬라이스 안의 상대 경로는 공개 API를 거치지 않아도 된다.
 * `pages/home`이 `pages/profile`을 가리키면 false다.
 */
function sameSlice(source, target) {
  return (
    source.sliced && source.layer === target.layer && source.slice && source.slice === target.slice
  );
}

/**
 * entities의 `@x`는 같은 레이어 교차 import의 마지막 예외다.
 *
 * `entities/user/@x/order`는 user가 order에게만 여는 표면이다.
 * producer는 `user`, consumer는 `order`다. 가져오는 슬라이스가 `order`일 때만 통과한다.
 * `cart`가 이 경로를 가져오거나, pages·features가 `@x`를 가져오면 거부한다.
 * `@x`는 entities 전용이다.
 */
function isEntityAtX(source, target) {
  if (source.layer !== 'entities' || target.layer !== 'entities') return false;
  const [producer, marker, consumer] = target.rest;
  return (
    marker === '@x' && Boolean(producer) && consumer === source.slice && producer !== source.slice
  );
}

/**
 * features와 widgets의 교차 import는 상대 슬라이스의 공개 API만 허용한다.
 * 스킬의 strategy D다. 내부 `ui/`, `model/`은 여전히 금지다.
 * pages에는 이 예외가 없다. 페이지끼리는 서로 가져오지 않는다.
 */
function isFeaturePublicCrossImport(source, target) {
  const allowsPublicCrossImport = source.layer === 'features' || source.layer === 'widgets';
  return (
    allowsPublicCrossImport &&
    source.layer === target.layer &&
    source.slice !== target.slice &&
    isPublicSliceImport(target)
  );
}

/**
 * shared의 세그먼트 이름. `src/shared/ui/button`이면 `ui`다.
 * 같은 세그먼트 안의 깊은 파일은 그 세그먼트 구현이라 허용하고,
 * 다른 세그먼트나 상위 레이어는 세그먼트 공개 범위만 가져간다.
 */
function sharedSegment(location) {
  return location.layer === 'shared' ? (location.rest[0] ?? null) : null;
}

export {
  ALIASES,
  LAYER_ROOTS,
  SLICED_LAYERS,
  isEntityAtX,
  isFeaturePublicCrossImport,
  isPublicSliceImport,
  locate,
  projectPath,
  resolveSpecifier,
  sameSlice,
  sharedSegment,
};
