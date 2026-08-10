import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type EditorBundleBuildResult =
  | { ok: true; js: string; css: string[] }
  | { ok: false; error: string };

/**
 * Run Bun.build in a fresh subprocess.
 *
 * In-process Bun.build is unreliable under `bun --watch` (throws opaque
 * "Bundle failed" for some entrypoints after the server has imported them).
 */
export async function buildEditorBundleInSubprocess(
  extensionId: string,
  entrypoint: string,
): Promise<EditorBundleBuildResult> {
  const workDir = mkdtempSync(join(tmpdir(), `tome-ext-${extensionId}-`));
  const resultPath = join(workDir, "result.json");
  const workerPath = join(workDir, "build-worker.mjs");

  const workerSource = `
const entrypoint = ${JSON.stringify(entrypoint)};
const resultPath = ${JSON.stringify(resultPath)};
const extensionId = ${JSON.stringify(extensionId)};

let result;
try {
  result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "esm",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    jsx: {
      runtime: "automatic",
      importSource: "react",
      development: false,
    },
    external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const logs =
    err && typeof err === "object" && Array.isArray(err.logs)
      ? err.logs.map((log) => (typeof log?.message === "string" ? log.message : String(log)))
      : [];
  await Bun.write(
    resultPath,
    JSON.stringify({ ok: false, error: [message, ...logs].filter(Boolean).join("\\n") || "Bundle failed" }),
  );
  process.exit(0);
}

if (!result.success || result.outputs.length === 0) {
  const error =
    result.logs.map((log) => log.message).join("\\n") ||
    \`Failed to bundle editor extension \${extensionId}\`;
  await Bun.write(resultPath, JSON.stringify({ ok: false, error }));
  process.exit(0);
}

const jsOutput =
  result.outputs.find((output) => output.kind === "entry-point") ??
  result.outputs.find((output) => output.path.endsWith(".js")) ??
  result.outputs[0];
const js = await jsOutput.text();
const css = [];
for (const output of result.outputs) {
  if (output === jsOutput) continue;
  if (output.type.startsWith("text/css") || output.path.endsWith(".css")) {
    css.push(await output.text());
  }
}
await Bun.write(resultPath, JSON.stringify({ ok: true, js, css }));
`;

  try {
    writeFileSync(workerPath, workerSource, "utf-8");
    const proc = Bun.spawn(["bun", workerPath], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    let parsed: EditorBundleBuildResult | null = null;
    try {
      parsed = JSON.parse(readFileSync(resultPath, "utf-8")) as EditorBundleBuildResult;
    } catch {
      parsed = null;
    }

    if (parsed?.ok) return parsed;
    if (parsed && !parsed.ok) return parsed;

    const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
    return {
      ok: false,
      error:
        detail ||
        `Editor bundle subprocess failed for ${extensionId} (exit ${exitCode})`,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
