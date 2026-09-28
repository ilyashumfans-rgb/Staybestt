import { Fragment } from "react";

/** Renders inline **bold** segments. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="text-secondary font-semibold">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Lightweight renderer for CMS page content.
 * Supports: `## ` headings, `- ` bullet lists, blank-line separated
 * paragraphs, and inline `**bold**`.
 */
export function CmsContent({ content }: { content: string }) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return (
    <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="text-base font-bold text-secondary pt-2 first:pt-0">
              <Inline text={trimmed.slice(3)} />
            </h3>
          );
        }
        const lines = trimmed.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1.5">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.trim().slice(2)} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
