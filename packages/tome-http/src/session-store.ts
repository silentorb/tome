import type { Session } from "./identity";

export type SessionCreateInput = {
  subjectId: string;
};

export interface SessionStore {
  create(input: SessionCreateInput): Session | Promise<Session>;
  get(id: string): Session | null | Promise<Session | null>;
  delete(id: string): void | Promise<void>;
}

/** Process-local sessions for phase-1 authn (not durable across restarts). */
export class InMemorySessionStore implements SessionStore {
  readonly #sessions = new Map<string, Session>();

  create(input: SessionCreateInput): Session {
    const subjectId = input.subjectId.trim();
    if (!subjectId) {
      throw new Error("subjectId must be a non-empty string");
    }
    const session: Session = {
      id: crypto.randomUUID(),
      subjectId,
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | null {
    return this.#sessions.get(id) ?? null;
  }

  delete(id: string): void {
    this.#sessions.delete(id);
  }
}
