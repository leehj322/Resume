import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { Linter } from 'eslint';
import fsd from './index.mjs';

const linter = new Linter({ configType: 'flat' });
const config = [
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { fsd },
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'fsd/import-boundaries': 'error',
      'fsd/no-technical-filenames': 'error',
      'fsd/no-widgets': 'warn',
    },
  },
];

function problemsFor(file, code) {
  return linter.verify(code, config, { filename: path.join(process.cwd(), file) });
}

function messagesFor(file, code) {
  return problemsFor(file, code).map((problem) => problem.message);
}

describe('fsd/import-boundaries', () => {
  test('allows a route to re-export a page public API', () => {
    assert.deepEqual(messagesFor('app/page.tsx', "export { HomePage } from '@/_pages/home';"), []);
  });

  test('allows a page to import its own files', () => {
    assert.deepEqual(
      messagesFor('src/_pages/home/index.ts', "export { HomePage } from './ui/home-page';"),
      []
    );
  });

  test('rejects an upward import', () => {
    const messages = messagesFor(
      'src/_pages/home/ui/home-page.tsx',
      "import { fontVariables } from '@/_app/fonts';"
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0], /cannot import the higher layer/);
  });

  test('rejects a sibling page import', () => {
    const messages = messagesFor(
      'src/_pages/home/ui/home-page.tsx',
      "import { Other } from '@/_pages/other';"
    );
    assert.match(messages[0], /cannot import sibling/);
  });

  test('allows a feature to import another feature only through its public API', () => {
    assert.deepEqual(
      messagesFor('src/features/a/index.ts', "import { B } from '@/features/b';"),
      []
    );
    assert.match(
      messagesFor('src/features/a/index.ts', "import { B } from '@/features/b/ui/b';")[0],
      /sibling|public API/
    );
  });

  test('allows @x only for the named entity consumer', () => {
    assert.deepEqual(
      messagesFor(
        'src/entities/order/ui/order.ts',
        "import { name } from '@/entities/user/@x/order';"
      ),
      []
    );
    assert.match(
      messagesFor(
        'src/entities/order/ui/order.ts',
        "import { name } from '@/entities/user/@x/cart';"
      )[0],
      /sibling|public API/
    );
  });

  test('limits shared imports to a segment public API', () => {
    assert.deepEqual(
      messagesFor('src/_pages/home/ui/home-page.tsx', "import { Button } from '@/shared/ui';"),
      []
    );
    assert.match(
      messagesFor(
        'src/_pages/home/ui/home-page.tsx',
        "import { Button } from '@/shared/ui/button/button';"
      )[0],
      /shared segment public API/
    );
  });
});

describe('fsd/no-widgets', () => {
  test('warns when a page imports widgets', () => {
    const problems = problemsFor(
      'src/_pages/home/ui/home-page.tsx',
      "import { Card } from '@/widgets/card';"
    );
    assert.equal(problems.length, 1);
    assert.equal(problems[0].severity, 1);
    assert.match(problems[0].message, /widgets layer is discouraged/);
  });
});

describe('fsd/no-technical-filenames', () => {
  test('rejects types.ts and utils.ts under src', () => {
    assert.match(messagesFor('src/shared/lib/types.ts', 'export {}')[0], /technical role/);
    assert.match(messagesFor('src/_pages/home/model/utils.ts', 'export {}')[0], /technical role/);
  });

  test('allows a domain filename', () => {
    assert.deepEqual(messagesFor('src/_pages/home/model/home.ts', 'export {}'), []);
  });
});
