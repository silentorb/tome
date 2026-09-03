/** Write a minimal site-data.json when missing so `tsc` can resolve the import. */

import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const outFile = join(dirname(fileURLToPath(import.meta.url)), "generated", "site-data.json")

if (!existsSync(outFile)) {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        homeNodeId: "",
        staticSiteHeader: "",
        base: "/",
        nodes: [],
        pathById: {},
        aliasToId: {},
        tabItemsPayloads: {},
        tabRoutes: [],
      },
      null,
      2,
    )}\n`,
  )
}
