import path from 'node:path';

/**
 * Import boundaries for static, re-export, dynamic import() and require() specifiers.
 * Options (dirs are repo-root relative):
 *   allowBare: bare specifiers allowed (exact, or prefix when it ends with "/")
 *   allowDirs: if set, relative imports must resolve inside one of these dirs (allowlist)
 *   denyDirs:  relative imports must not resolve inside any of these dirs (denylist)
 */
const rule = {
  meta: { type: 'problem', schema: [{ type: 'object' }], messages: { bad: '{{why}}' } },
  create(context) {
    const opts = context.options[0] ?? {};
    const root = context.cwd ?? process.cwd();
    const file = context.filename;
    const inside = (target, dir) => {
      const rel = path.relative(path.resolve(root, dir), target);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    };
    const check = (node, spec) => {
      if (typeof spec !== 'string') return;
      let why = null;
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const target = path.resolve(path.dirname(file), spec);
        if (opts.allowDirs && !opts.allowDirs.some((d) => inside(target, d)))
          why = `Import "${spec}" is outside the allowed directories: ${opts.allowDirs.join(', ')}.`;
        else if (opts.denyDirs?.some((d) => inside(target, d)))
          why = `Import "${spec}" reaches a forbidden directory.`;
      } else if (opts.allowBare) {
        const ok = opts.allowBare.some((a) => (a.endsWith('/') ? spec.startsWith(a) : spec === a));
        if (!ok)
          why = `Package "${spec}" is not allowed here (allowed: ${opts.allowBare.join(', ') || 'none'}).`;
      }
      if (why) context.report({ node, messageId: 'bad', data: { why } });
    };
    return {
      ImportDeclaration: (n) => check(n, n.source.value),
      ExportAllDeclaration: (n) => check(n, n.source.value),
      ExportNamedDeclaration: (n) => n.source && check(n, n.source.value),
      ImportExpression: (n) => n.source.type === 'Literal' && check(n, n.source.value),
      CallExpression: (n) => {
        if (
          n.callee.type === 'Identifier' &&
          n.callee.name === 'require' &&
          n.arguments[0]?.type === 'Literal'
        )
          check(n, n.arguments[0].value);
      },
    };
  },
};

export default { rules: { 'import-allowlist': rule } };
