import type { Graph } from "imp-core-types";
import { compileImpGraphToTomeSql } from "tome-imp-sql";
import { loadOntologyFileFromContent } from "tome-flatfile";
import type { TomeQueryCache } from "tome-service-interfaces";
import { IDENTITY_CORPUS_IDS } from "../../fixtures/identity-corpus/ids";

export type IdpClaim = {
  issuer: string;
  subject: string;
};

/**
 * Imp: filter nodes by issuer + subject, then traverse Account↔IdP Binding (dir 1)
 * from binding → Account. Prefer compileImpGraphToTomeSql + queryAll (not executeImp).
 */
export function buildIdpBindingResolveGraph(
  accountBindingRelId: string = IDENTITY_CORPUS_IDS.hasIdpBindingRel,
): Graph {
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      issuerParam: {
        id: "issuerParam",
        type: "parameter",
        inputs: { label: "issuer", value: "" },
      },
      subjectParam: {
        id: "subjectParam",
        type: "parameter",
        inputs: { label: "subject", value: "" },
      },
      issuerCol: { id: "issuerCol", type: "column", inputs: { name: "issuer" } },
      subjectCol: { id: "subjectCol", type: "column", inputs: { name: "subject" } },
      eqIssuer: { id: "eqIssuer", type: "equals", inputs: {} },
      eqSubject: { id: "eqSubject", type: "equals", inputs: {} },
      filterIssuer: { id: "filterIssuer", type: "filter", inputs: {} },
      filterSubject: { id: "filterSubject", type: "filter", inputs: {} },
      hop: {
        id: "hop",
        type: "traverse",
        inputs: { association: accountBindingRelId, direction: 1 },
      },
      out: { id: "out", type: "output", inputs: {} },
    },
    edges: {
      e_issuer_col: {
        from: { node: "issuerCol", port: "value" },
        to: { node: "eqIssuer", port: "left" },
      },
      e_issuer_param: {
        from: { node: "issuerParam", port: "value" },
        to: { node: "eqIssuer", port: "right" },
      },
      e_issuer_pred: {
        from: { node: "eqIssuer", port: "value" },
        to: { node: "filterIssuer", port: "predicate" },
      },
      e_in: {
        from: { node: "in", port: "value" },
        to: { node: "filterIssuer", port: "collection" },
      },
      e_subject_col: {
        from: { node: "subjectCol", port: "value" },
        to: { node: "eqSubject", port: "left" },
      },
      e_subject_param: {
        from: { node: "subjectParam", port: "value" },
        to: { node: "eqSubject", port: "right" },
      },
      e_subject_pred: {
        from: { node: "eqSubject", port: "value" },
        to: { node: "filterSubject", port: "predicate" },
      },
      e_issuer_to_subject: {
        from: { node: "filterIssuer", port: "collection" },
        to: { node: "filterSubject", port: "collection" },
      },
      e_hop: {
        from: { node: "filterSubject", port: "collection" },
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

/** True when ontology.json declares types.idpBinding. */
export function contentHasIdpBindingType(contentDir: string): boolean {
  return Boolean(loadOntologyFileFromContent(contentDir).types.idpBinding);
}

/** Read types.idpBinding type-table id, or null if omitted. */
export function loadIdpBindingTypeId(contentDir: string): string | null {
  const typeId = loadOntologyFileFromContent(contentDir).types.idpBinding;
  return typeof typeId === "string" && typeId.trim() ? typeId.trim() : null;
}

export type ResolveAccountFromIdpClaimOptions = {
  queryAll: TomeQueryCache["queryAll"];
  /** Optional Imp graph override (defaults to built-in issuer/subject → Account hop). */
  resolveGraph?: Graph;
};

/**
 * Resolve IdP `(issuer, subject)` to a single Account node id via the session SQL cache.
 * Zero or ambiguous matches → null (fail closed).
 */
export function createResolveAccountFromIdpClaim(
  options: ResolveAccountFromIdpClaimOptions,
): (claim: IdpClaim) => Promise<string | null> {
  const baseGraph = options.resolveGraph ?? buildIdpBindingResolveGraph();

  return async (claim) => {
    const issuer = claim.issuer.trim();
    const subject = claim.subject.trim();
    if (!issuer || !subject) return null;
    try {
      const graph = applyParameters(baseGraph, { issuer, subject });
      const compiled = await compileImpGraphToTomeSql(graph);
      const rows = await options.queryAll(compiled.sql, ...compiled.parameters);
      const ids = [
        ...new Set(
          rows
            .map((row) => row.id)
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
            .map((id) => id.trim()),
        ),
      ];
      if (ids.length !== 1) return null;
      return ids[0]!;
    } catch (err) {
      console.error("[tome-server] IdP binding resolve failed:", err);
      return null;
    }
  };
}
