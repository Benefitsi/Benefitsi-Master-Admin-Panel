// Offline SSR loader. Only transport/runtime boundaries are stubbed; displayed components are real.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  cache = new Map(),
  root = resolve(".");
const blocked = () => {
  throw new Error("Offline preview: mutations and network are disabled");
};
export function loadPreview(relative) {
  const file = resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    cache.set(file, value);
    return value;
  }
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  const m = { exports: {} };
  cache.set(file, m.exports);
  new Function("require", "module", "exports", js)(
    (id) => {
      if (id === "next/navigation")
        return {
          useRouter: () => ({
            refresh: blocked,
            push: blocked,
            replace: blocked,
          }),
          usePathname: () => "/partner",
        };
      if (
        id.includes("actions") ||
        id.includes("supabase/") ||
        id === "server-only"
      )
        return new Proxy({}, { get: () => blocked });
      // A browser Worker is never initialized in this offline SSR harness.
      if (id.endsWith("partner-image-upscaler")) return { upscalePartnerMediaFile: blocked };
      if (id.endsWith("microsite-panel")) return { MicrositePanel: () => null };
      if (id.endsWith("menu-ai-import-dialog"))
        return { MenuAiImportDialog: () => null };
      if (id.startsWith("@/") || id.startsWith(".")) {
        let base = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(file), id);
        const path = [base, base + ".tsx", base + ".ts"].find((p) =>
          existsSync(p),
        );
        if (!path) throw new Error("Missing " + base);
        return loadPreview(path);
      }
      return require(id);
    },
    m,
    m.exports,
  );
  cache.set(file, m.exports);
  return m.exports;
}
