import "./corpus-suffix.css";

interface CorpusSuffixProps {
  label?: string | null;
}

/** Muted inline corpus title for foreign-corpus search options. */
export function CorpusSuffix({ label }: CorpusSuffixProps) {
  if (!label) return null;
  return <span className="tome-corpus-suffix">{label}</span>;
}
