// Get started's look step for a press that designed its website before the store was made (join/ › Design my shop
// first). The design is put on as soon as the step shows: published, because the shop is still private, so the press
// sees in its own shop exactly what it made. A failure offers Try again, or the look gallery instead.
import { useEffect, useRef, useState } from "react";
import { openWorkspace, publishDesign, ThemeConflictError } from "../themeStore";
import { designWelcomeTheme } from "../setupHandover";
import type { WelcomeDone } from "../firstWeek";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";

/** Publish the design, retried once when another tab saved in between. */
export async function putOnDesign(design: Record<string, any>, settings: any): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const ws = await openWorkspace(settings);
    try {
      await publishDesign(ws, design, ws.rev);
      return;
    } catch (error) {
      if (!(error instanceof ThemeConflictError) || attempt >= 1) throw error;
    }
  }
}

export function SignupDesignStage({ design, settings, onDone, onPickLook }: {
  design: Record<string, any>;
  settings: any;
  onDone: (welcome: WelcomeDone) => Promise<void>;
  onPickLook: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const run = async () => {
    setFailed(false);
    try {
      await putOnDesign(design, settings);
      await onDone({ theme: designWelcomeTheme(design), at: new Date().toISOString() });
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, []);
  return (
    <SectionCard title="Your design" collapsible={false}>
      {failed ? (
        <div className="rp-stack">
          <p role="alert">Your design couldn't be put on yet.</p>
          <div className="rp-row">
            <PrimaryButton onClick={() => void run()}>Try again</PrimaryButton>
            <SecondaryButton onClick={onPickLook}>Pick a look instead</SecondaryButton>
          </div>
        </div>
      ) : <LoadingState label="Putting on your design…" />}
    </SectionCard>
  );
}
