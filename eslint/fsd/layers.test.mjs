import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isPublicSliceImport, locate, resolveSpecifier, sameSlice } from './layers.mjs';

describe('resolveSpecifier', () => {
  test('maps an FSD alias onto src', () => {
    assert.equal(resolveSpecifier('@/_pages/home', 'app/page.tsx'), 'src/_pages/home');
  });

  test('resolves a relative import inside the same slice', () => {
    assert.equal(
      resolveSpecifier('./ui/home-page', 'src/_pages/home/index.ts'),
      'src/_pages/home/ui/home-page'
    );
  });

  test('ignores a package import', () => {
    assert.equal(resolveSpecifier('next/font/google', 'src/_app/fonts.ts'), null);
  });
});

describe('locate', () => {
  test('treats the Next.js app directory as the router, not the FSD app layer', () => {
    assert.equal(locate('app/page.tsx').layer, 'next');
    assert.equal(locate('src/_app/fonts.ts').layer, 'app');
  });

  test('reads the slice name from a sliced layer', () => {
    const location = locate('src/_pages/home/ui/home-page');
    assert.equal(location.layer, 'pages');
    assert.equal(location.slice, 'home');
  });
});

describe('slice boundaries', () => {
  test('a slice public API is the slice root or an index entry', () => {
    assert.equal(isPublicSliceImport(locate('src/_pages/home')), true);
    assert.equal(isPublicSliceImport(locate('src/_pages/home/index.server')), true);
    assert.equal(isPublicSliceImport(locate('src/_pages/home/ui/home-page')), false);
  });

  test('relative files in one slice stay in that slice', () => {
    const source = locate('src/_pages/home/index');
    const target = locate('src/_pages/home/ui/home-page');
    assert.equal(sameSlice(source, target), true);
    assert.equal(sameSlice(source, locate('src/_pages/other/index')), false);
  });
});
