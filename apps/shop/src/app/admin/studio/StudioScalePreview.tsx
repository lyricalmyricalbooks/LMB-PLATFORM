// Theme settings › Design scales (3.0 phase 2): a live picture of the scales above their controls, like
// Stripe's branding preview — the heading sizes (desktop and phone), the spacing steps and the corner set.
import { RADIUS_SCALES, SPACE_STEPS, spaceUnits, typeSteps } from "../../features/site/designTokens";

const STEP_TAGS = ["Body text", "Large text", "Small heading (h4)", "Heading (h3)", "Section title (h2)", "Page title (h1)"];

export function StudioScalePreview({ design }: { design: any }) {
  const steps = typeSteps(design);
  const { unit, phoneScale } = spaceUnits(design);
  const radius = RADIUS_SCALES[design?.radiusScale];
  return (
    <div className="studio-scale-preview" data-studio-scale-preview>
      <section>
        <h4>Heading sizes</h4>
        {steps.length ? <ol className="studio-scale-type">
          {[...steps].reverse().map(s => (
            <li key={s.step}>
              <span style={{ fontSize: `${Math.min(s.desktop, 48)}px` }}>Aa</span>
              <small>{STEP_TAGS[s.step]} · {Math.round(s.desktop)}px{s.phone !== s.desktop ? ` → ${Math.round(s.phone)}px on phones` : ""}</small>
            </li>
          ))}
        </ol> : <p className="studio-hint">Off. Choose a heading size scale below and every section heading follows it (a section's own heading size still wins).</p>}
      </section>
      <section>
        <h4>Space above and below sections</h4>
        <ul className="studio-scale-space">
          {SPACE_STEPS.map(s => (
            <li key={s.value}>
              <span aria-hidden style={{ width: `${Math.min(160, unit * s.units)}px` }} />
              <small>{s.label} · {unit * s.units}px{phoneScale !== 1 ? ` (${Math.round(unit * s.units * phoneScale)}px on phones)` : ""}</small>
            </li>
          ))}
        </ul>
        <p className="studio-hint">Pick one per section: click a section › Layout › Spacing › Space above and below.</p>
      </section>
      {radius && <section>
        <h4>Corners</h4>
        <div className="studio-scale-radius">{(["s", "m", "l"] as const).map(k => <span key={k} style={{ borderRadius: `${radius[k]}px` }}>{radius[k]}px</span>)}</div>
      </section>}
    </div>
  );
}
