// Details › "<Type> facts" (product types plan, change 7): the facts this kind of product is known by, each with an
// example, the ones the law asks for marked, and the type's safety line. Saved as Details rows (typeFacts.ts).
import { SectionCard, TextArea, TextField } from "./riso/components";
import type { ProductType } from "../../shared/productTypes";
import { factValue, safetyLine, withFact, withSafety } from "./typeFacts";

export function TypeFactsCard({ form, type, onPatch }: { form: any; type: ProductType; onPatch: (patch: Record<string, any>) => void }) {
  const facts = type.facts;
  const safety = safetyLine(form);
  if (!facts.length && !type.traits.safety && !safety) return null;
  const law = facts.some((f) => f.law);
  return (
    <SectionCard title={`${type.name}: the facts`}
      description={law ? "Shown in the product's Details. The law asks for the marked ones before it goes on sale." : "Shown in the product's Details. Empty boxes don't show."}>
      <div className="be-grid">
        {facts.map((fact) => (
          <TextField key={fact.key} name={`fact-${fact.key}`} label={fact.law ? `${fact.label} (required by law)` : fact.label}
            value={factValue(form, fact.key)} maxLength={500} placeholder={fact.example ? `e.g. ${fact.example}` : undefined}
            onChange={(e) => onPatch(withFact(form, fact, e.target.value))} />
        ))}
        {(type.traits.safety || safety) && (
          <div className="be-span-2">
            <TextArea label="Safety line" rows={3} maxLength={500} value={safety}
              hint={safety ? "Shoppers see this under Safety in the product's Details." : "Empty: no safety line shows."}
              onChange={(e) => onPatch(withSafety(form, e.target.value))} />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
