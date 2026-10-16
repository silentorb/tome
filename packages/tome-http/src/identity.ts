/** Stable subject for a request after authentication (minimal LCD shape). */
export type Principal = {
  subjectId: string;
};

/** Thin session record — enough to create, delete, and resolve a principal. */
export type Session = {
  id: string;
  subjectId: string;
};
