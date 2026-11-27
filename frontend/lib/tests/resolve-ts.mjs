// Lets Node's built-in TypeScript support run the graph's unit tests without a
// bundler: the sources import siblings without an extension ('./text'), which
// Node does not resolve on its own, so try `<specifier>.ts` first.
// Used by `npm run test:unit`.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.[cm]?[jt]s$/.test(specifier)
    ) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
