/** Splits teacher-entered plain text into non-empty trimmed lines. */
export function learningLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * Renders teacher-entered plain text. Multi-line values become a bullet list,
 * single-line values stay a paragraph. Content is always rendered as React text,
 * never as HTML.
 */
export function LearningText({
  text,
  className = '',
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const lines = learningLines(text);
  if (lines.length === 0) return null;
  if (lines.length === 1)
    return <p className={`break-words [overflow-wrap:anywhere] ${className}`}>{lines[0]}</p>;
  return (
    <ul className={`list-disc space-y-1 ps-5 break-words [overflow-wrap:anywhere] ${className}`}>
      {lines.map((line, i) => (
        <li key={`${i}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}
