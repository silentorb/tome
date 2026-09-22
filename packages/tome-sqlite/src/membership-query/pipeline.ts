import { analyzeMemberPage, type MemberPageQueryLike } from "./analyze";
import { bindExpressions } from "./bind";
import { emitMembershipSql } from "./emit";
import { planMembershipQuery } from "./plan";
import type { EmittedSql } from "./types";

/**
 * Analyze → Bind → Plan → Emit for a unified member-page (or ids) read.
 */
export function compileMemberPage(
  setId: string,
  query: MemberPageQueryLike,
  mode?: "page" | "ids",
): EmittedSql {
  const intent = analyzeMemberPage(setId, {
    ...query,
    mode: mode ?? query.mode ?? "page",
  });
  const catalog = bindExpressions(intent);
  const plan = planMembershipQuery(intent, catalog);
  return emitMembershipSql(plan);
}
