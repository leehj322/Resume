/**
 * import 경계에 쓰는 구문만 모은다.
 *
 * - `import ... from`
 * - `export ... from`, `export * from`
 * - `import('모듈')` 중 인자가 문자열 리터럴인 경우
 *
 * `import(variable)`은 대상 경로를 규칙이 알 수 없어 건너뛴다.
 * export 선언이라도 `source`가 없으면 재export가 아니므로 검사하지 않는다.
 */
function visitImports(check) {
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
}

export { visitImports };
