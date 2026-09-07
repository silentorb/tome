import { describe, expect, test } from "bun:test";
import {
  emptyRedirectsFile,
  normalizeRedirectPath,
  parseRedirectsFile,
  serializeRedirectsFile,
  REDIRECTS_FILE_VERSION,
} from "../../src/content/redirects-file";

const NODE_ID = "01KWN86X6KNBWXKBG5EGFMQJXA";

describe("redirects-file", () => {
  test("round-trips a path→nodeId map", () => {
    const file = {
      version: REDIRECTS_FILE_VERSION,
      redirects: {
        "old/about": NODE_ID,
        legacy: NODE_ID,
      },
    };
    const parsed = parseRedirectsFile(serializeRedirectsFile(file));
    expect(parsed).toEqual(file);
  });

  test("normalizes path keys on parse", () => {
    const parsed = parseRedirectsFile(
      JSON.stringify({
        version: 1,
        redirects: { "/Old/About/": NODE_ID },
      }),
    );
    expect(parsed.redirects).toEqual({ "old/about": NODE_ID });
  });

  test("emptyRedirectsFile returns versioned empty map", () => {
    expect(emptyRedirectsFile()).toEqual({ version: REDIRECTS_FILE_VERSION, redirects: {} });
  });

  test("normalizeRedirectPath rejects reserved and empty paths", () => {
    expect(normalizeRedirectPath("design/page")).toBe("design/page");
    expect(normalizeRedirectPath("/Design/Page/")).toBe("design/page");
    expect(normalizeRedirectPath("")).toBeNull();
    expect(normalizeRedirectPath("/")).toBeNull();
    expect(normalizeRedirectPath("../x")).toBeNull();
    expect(normalizeRedirectPath("_astro/foo")).toBeNull();
  });

  test("rejects non-object redirects map", () => {
    expect(() =>
      parseRedirectsFile(JSON.stringify({ version: 1, redirects: [] })),
    ).toThrow("redirects must be an object map");
  });

  test("rejects invalid node id values", () => {
    expect(() =>
      parseRedirectsFile(JSON.stringify({ version: 1, redirects: { old: "not-a-ulid" } })),
    ).toThrow("must be a node id");
  });

  test("rejects invalid path keys", () => {
    expect(() =>
      parseRedirectsFile(JSON.stringify({ version: 1, redirects: { "_astro": NODE_ID } })),
    ).toThrow("invalid redirect path");
  });

  test("rejects paths that normalize to the same key", () => {
    expect(() =>
      parseRedirectsFile(
        JSON.stringify({
          version: 1,
          redirects: {
            "Old/About": NODE_ID,
            "old/about": NODE_ID,
          },
        }),
      ),
    ).toThrow("duplicate redirect path");
  });

  test("rejects unsupported version", () => {
    expect(() =>
      parseRedirectsFile(JSON.stringify({ version: 99, redirects: {} })),
    ).toThrow("unsupported version");
  });
});
