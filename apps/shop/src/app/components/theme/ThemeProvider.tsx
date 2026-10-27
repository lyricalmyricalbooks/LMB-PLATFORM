import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes renders an inline <script> meant for server rendering. This app renders in the browser (and the prerender
// snapshot leaves it out), so it never runs; React 19 logs a warning for every client-rendered <script> unless it is a
// data block, so mark it as one.
const SCRIPT_PROPS = { type: "application/json" };

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={SCRIPT_PROPS} {...props}>{children}</NextThemesProvider>;
}
