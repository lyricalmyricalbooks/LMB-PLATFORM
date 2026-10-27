import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../riso/components";
import { openWorkspace, ThemeStoreUnavailableError, type Workspace } from "../themeStore";
import { StudioEditor } from "./StudioEditor";

type Props = Parameters<typeof StudioEditor>[0];

/** Loads Studio's private working copy (draft + My themes) before opening the editor. */
export function StudioWorkspace(props: Omit<Props, "workspace">) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [failed, setFailed] = useState<false | string>(false);
  const load = useCallback(() => {
    setFailed(false);
    openWorkspace(props.settings).then(setWorkspace).catch(error => {
      console.error("Could not open the Studio draft:", error);
      setFailed(error instanceof ThemeStoreUnavailableError ? error.message : "Check your connection, then try again.");
    });
  }, [props.settings]);
  useEffect(() => { if (!workspace) load(); }, [load, workspace]);

  const shell = (child: any) => (
    <div className="rp" data-rp-appearance={props.appearance || "light"} style={{ height: "100%", display: "grid", placeItems: "center" }}>{child}</div>
  );
  if (failed) return shell(<ErrorState title="Couldn't open your design draft" description={`${failed} Nothing was changed.`} onRetry={load} />);
  if (!workspace) return shell(<LoadingState label="Opening your design draft…" />);
  return <StudioEditor {...props} settings={{ ...props.settings, draftDesign: workspace.draft, savedThemes: workspace.savedThemes }} workspace={workspace} />;
}
