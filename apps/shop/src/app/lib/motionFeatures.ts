// The animation engine for every storefront `m.*` element, in its own chunk so it never delays first paint.
// domAnimation covers animate/exit/variants, hover/tap/focus and whileInView (no layout or drag, which the
// storefront doesn't use). Admin screens keep the full `motion.*` components, which carry their own features.
import { domAnimation } from "motion/react";

export default domAnimation;
