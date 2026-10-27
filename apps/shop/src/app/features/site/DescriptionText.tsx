import { Fragment } from "react";
import { Link } from "react-router";
import { descriptionBlocks, inlineParts } from "./descriptionLinks";

const LINK_CLASS = "fm-pdp-desc-link underline underline-offset-2 break-words hover:opacity-80";

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, i) => {
        if (part.href) {
          if (part.href.startsWith("/")) return <Link key={i} to={part.href} className={LINK_CLASS}>{part.text}</Link>;
          const external = /^https?:/i.test(part.href);
          return <a key={i} href={part.href} className={LINK_CLASS} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{part.text}</a>;
        }
        if (part.bold) return <strong key={i}>{part.text}</strong>;
        if (part.italic) return <em key={i}>{part.text}</em>;
        return <Fragment key={i}>{part.text}</Fragment>;
      })}
    </>
  );
}

/**
 * A book description with its formatting (Books › edit › Details › Description toolbar) drawn:
 * links, bold, italic, headings, lists, quotes and dividers. Plain text renders as before.
 * Styled by Studio › Style › Product page · buy card & details › Description text (`fm-pdp-desc-*`).
 */
export function DescriptionText({ text }: { text: string }) {
  return (
    <>
      {descriptionBlocks(text).map((b, i) => {
        switch (b.type) {
          case "h3": return <h3 key={i} className="fm-pdp-desc-heading">{<Inline text={b.text} />}</h3>;
          case "h4": return <h4 key={i} className="fm-pdp-desc-heading fm-pdp-desc-subheading">{<Inline text={b.text} />}</h4>;
          case "ul": return <ul key={i} className="fm-pdp-desc-list">{b.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}</ul>;
          case "ol": return <ol key={i} className="fm-pdp-desc-list">{b.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}</ol>;
          case "quote": return <blockquote key={i} className="fm-pdp-desc-quote"><Inline text={b.text} /></blockquote>;
          case "hr": return <hr key={i} className="fm-pdp-desc-rule" />;
          default: return <span key={i} className="fm-pdp-desc-para block"><Inline text={b.text} /></span>;
        }
      })}
    </>
  );
}
