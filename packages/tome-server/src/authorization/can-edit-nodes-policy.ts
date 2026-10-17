import type { Graph } from "imp-core-types";
import { compileImpGraphToTomeSql } from "tome-imp-sql";
import type {
  AuthorizationDecision,
  AuthorizationPrincipal,
  ModificationAuthorizationContext,
} from "tome-interfaces/authorization";
import type { TomeQueryCache } from "tome-service-interfaces";
import { IDENTITY_CORPUS_IDS } from "../../fixtures/identity-corpus/ids";

/**
 * Imp collection: nodes where id = $accountNodeId, then traverse has-permission.
 * Result rows are Permission nodes; host checks for can-edit-nodes id.
 * Prefer compileImpGraphToTomeSql + queryAll (not executeImp).
 *
 * Note: a second Imp `filter` on `id` after `traverse` currently lowers to an
 * ambiguous SQL `WHERE "id" = ?`; existence of the permission is checked in TS.
 */
export function buildCanEditNodesPolicyGraph(): Graph {
  const hasPerm = IDENTITY_CORPUS_IDS.hasPermRel;
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      accountParam: {
        id: "accountParam",
        type: "parameter",
        inputs: { label: "accountNodeId", value: "" },
      },
      idCol: { id: "idCol", type: "column", inputs: { name: "id" } },
      eqAccount: { id: "eqAccount", type: "equals", inputs: {} },
      filterAccount: { id: "filterAccount", type: "filter", inputs: {} },
      hop: {
        id: "hop",
        type: "traverse",
        inputs: { association: hasPerm, direction: 0 },
      },
      out: { id: "out", type: "output", inputs: {} },
    },
    edges: {
      e_id: {
        from: { node: "idCol", port: "value" },
        to: { node: "eqAccount", port: "left" },
      },
      e_param: {
        from: { node: "accountParam", port: "value" },
        to: { node: "eqAccount", port: "right" },
      },
      e_pred_a: {
        from: { node: "eqAccount", port: "value" },
        to: { node: "filterAccount", port: "predicate" },
      },
      e_in: {
        from: { node: "in", port: "value" },
        to: { node: "filterAccount", port: "collection" },
      },
      e_hop: {
        from: { node: "filterAccount", port: "collection" },
        to: { node: "hop", port: "collection" },
      },
      e_out: {
        from: { node: "hop", port: "collection" },
        to: { node: "out", port: "value" },
      },
    },
  };
}

function applyParameters(graph: Graph, parameters: Record<string, unknown>): Graph {
  const nodes = { ...graph.nodes };
  for (const node of Object.values(nodes)) {
    if (node.type !== "parameter") continue;
    const label = node.inputs?.label;
    if (typeof label !== "string" || !(label in parameters)) continue;
    nodes[node.id] = {
      ...node,
      inputs: {
        ...node.inputs,
        value: parameters[label] as string | number | boolean | null,
      },
    };
  }
  return { ...graph, nodes };
}

export type CanEditNodesPolicyOptions = {
  /** Shared ephemeral session query cache. */
  queryAll: TomeQueryCache["queryAll"];
  /** Optional Imp graph override (defaults to built-in can-edit-nodes policy). */
  policyGraph?: Graph;
  /** Permission node id that grants node edit (defaults to fixture can-edit-nodes). */
  canEditNodesPermissionId?: string;
};

/**
 * Evaluate whether the principal may perform a node-edit modification:
 * existence query for Account → can-edit-nodes grant in the shared cache.
 */
export function createCanEditNodesEvaluator(
  options: CanEditNodesPolicyOptions,
): (
  principal: AuthorizationPrincipal | null,
  context: ModificationAuthorizationContext,
) => Promise<AuthorizationDecision> {
  const baseGraph = options.policyGraph ?? buildCanEditNodesPolicyGraph();
  const permissionId =
    options.canEditNodesPermissionId ?? IDENTITY_CORPUS_IDS.permCanEdit;

  return async (principal) => {
    if (!principal?.accountNodeId?.trim()) return "deny";
    try {
      const graph = applyParameters(baseGraph, {
        accountNodeId: principal.accountNodeId.trim(),
      });
      const compiled = await compileImpGraphToTomeSql(graph);
      const rows = await options.queryAll(compiled.sql, ...compiled.parameters);
      const hasGrant = rows.some(
        (row) => typeof row.id === "string" && row.id === permissionId,
      );
      return hasGrant ? "allow" : "deny";
    } catch (err) {
      console.error("[tome-server] can-edit-nodes policy evaluation failed:", err);
      return "deny";
    }
  };
}
