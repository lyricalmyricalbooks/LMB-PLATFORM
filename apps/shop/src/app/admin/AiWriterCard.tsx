import { useEffect, useState, type ReactNode } from "react";
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../../lib/firebase";
import { HowTo, friendlyError } from "./settingsLayout";
import { DEFAULT_OPENROUTER_MODEL, aiKeyProblem, checkAiKey, openRouterKeyProblem, openRouterModelProblem, type AiProvider } from "./aiWriter";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField, useConfirm } from "./riso/components";

type Check = { ok: boolean; message: string } | null;
const VOICE_MAX = 1000;
const NAMES: Record<AiProvider, string> = { openrouter: "OpenRouter", gemini: "Google Gemini" };
const FIELDS: Record<AiProvider, string> = { openrouter: "openrouterKey", gemini: "geminiKey" };
const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");
const aiDoc = () => doc(db, "adminSecrets", "ai");

// Keys for the admin's Write with AI buttons: Google Gemini (free) and/or OpenRouter. Stored in the admin-only
// adminSecrets/ai doc (firestore.rules) and used only by the createStripeCheckoutSession `aiWrite` action; never
// sent to shoppers. With both saved, `provider` says which one writes (functions/aiWriter.js pickProvider).
export function AiWriterCard() {
  const [stored, setStored] = useState<Record<AiProvider, boolean> | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [provider, setProvider] = useState<AiProvider | "">("");
  const [model, setModel] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const [voice, setVoice] = useState("");
  const [savedVoice, setSavedVoice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setReadFailed(false);
    setStored(null);
    getDoc(aiDoc())
      .then((snap) => {
        const data = snap.exists() ? snap.data() || {} : {};
        setStored({ gemini: Boolean(data.geminiKey), openrouter: Boolean(data.openrouterKey) });
        setProvider(data.provider === "gemini" || data.provider === "openrouter" ? data.provider : "");
        setModel(String(data.openrouterModel || ""));
        setSavedModel(String(data.openrouterModel || ""));
        setVoice(String(data.voice || ""));
        setSavedVoice(String(data.voice || ""));
      })
      .catch(() => setReadFailed(true));
  };
  useEffect(() => { load(); }, []);

  // Same order as the server: the owner's choice when that key is saved, else OpenRouter, else Gemini.
  const active: AiProvider | null = !stored ? null
    : provider && stored[provider] ? provider : stored.openrouter ? "openrouter" : stored.gemini ? "gemini" : null;

  const save = async (fields: Record<string, unknown>, done: string) => {
    setSaving(true);
    try {
      await setDoc(aiDoc(), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
      toast.success(done);
      return true;
    } catch (err: any) {
      toast.error(friendlyError(err, "save the AI settings"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async (which: AiProvider, value: string) => {
    const ok = await save({ [FIELDS[which]]: value || deleteField() }, value ? `${NAMES[which]} key saved` : `${NAMES[which]} key removed`);
    if (ok) setStored((s) => ({ ...(s || { gemini: false, openrouter: false }), [which]: Boolean(value) }));
    return ok;
  };

  const saveProvider = async (next: AiProvider) => {
    const before = provider;
    setProvider(next);
    if (!(await save({ provider: next }, `${NAMES[next]} writes the drafts now`))) setProvider(before);
  };

  const saveModel = async () => {
    const next = model.trim();
    if (await save({ openrouterModel: next || deleteField() }, next ? "OpenRouter model saved" : `OpenRouter uses ${DEFAULT_OPENROUTER_MODEL} again`)) {
      setModel(next);
      setSavedModel(next);
    }
  };

  const saveVoice = async () => {
    const next = voice.trim().slice(0, VOICE_MAX);
    if (await save({ voice: next }, "House style saved")) {
      setVoice(next);
      setSavedVoice(next);
    }
  };

  const modelProblem = openRouterModelProblem(model);

  return (
    <SectionCard title="AI writing assistant"
      description="Drafts titles, blurbs and photo text. You approve."
      actions={stored !== null && <StatusBadge tone={active ? "success" : "neutral"}>{active ? `On · ${NAMES[active]}` : "Off"}</StatusBadge>}>
      <p className="rp-hint" style={{ margin: "0 0 12px" }}>Only public catalog facts go out. Never customers, orders or costs.</p>
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "0 0 12px", color: "var(--rp-danger)" }}>
          ✕ Couldn't read which keys are saved. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={load}>Try again</button>
        </p>
      )}
      {stored?.gemini && stored?.openrouter && (
        <div style={{ marginBottom: 16 }}>
          <SelectField label="Which AI writes the drafts" value={active || "openrouter"} disabled={saving}
            hint="If this one runs dry, the other takes over."
            onChange={(e) => saveProvider(e.target.value as AiProvider)}>
            <option value="openrouter">OpenRouter</option>
            <option value="gemini">Google Gemini</option>
          </SelectField>
        </div>
      )}

      <KeySlot which="openrouter" stored={stored?.openrouter ?? null} saving={saving} problem={openRouterKeyProblem} placeholder="sk-or-…"
        steps={<>
          <li>Open <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a> and sign in (a Google account works).</li>
          <li>Choose <strong>Create API key</strong>, give it a name such as "Shop", and copy the key (it starts with sk-or-). You can set a spending limit on the key there.</li>
          <li>Paste it here and choose Save key. Paid models need credits at <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer">openrouter.ai/credits</a>; models whose name ends in <strong>:free</strong> cost nothing but allow only a few drafts a minute.</li>
        </>}
        onSave={(v) => saveKey("openrouter", v)} />
      {stored?.openrouter && (
        <div style={{ marginTop: 12 }}>
          <TextField label="OpenRouter model (optional)" value={model} autoComplete="off" spellCheck={false}
            placeholder={DEFAULT_OPENROUTER_MODEL}
            hint={`Leave blank for ${DEFAULT_OPENROUTER_MODEL}. Copy any model's name from openrouter.ai/models. Describe with AI needs a model that can read images.`}
            error={modelProblem || undefined}
            onChange={(e) => setModel(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <SecondaryButton disabled={saving || readFailed || Boolean(modelProblem) || model.trim() === savedModel} onClick={saveModel}>Save model</SecondaryButton>
          </div>
        </div>
      )}

      <KeySlot which="gemini" stored={stored?.gemini ?? null} saving={saving} problem={aiKeyProblem} placeholder="AIza…"
        steps={<>
          <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> and sign in with the shop's Google account.</li>
          <li>Choose <strong>Create API key</strong> (pick or create any Google Cloud project). The free tier needs no card.</li>
          <li>Paste the key here and choose Save key. The free tier allows about 10 drafts a minute and a few hundred a day.</li>
        </>}
        onSave={(v) => saveKey("gemini", v)} />
      <p className="rp-hint" style={{ margin: "12px 0 0" }}>Capped at 40 drafts per 10 minutes.</p>

      <div style={{ marginTop: 16 }}>
        <TextArea label="House style (optional)" rows={3} maxLength={VOICE_MAX} value={voice}
          placeholder="e.g. Warm and plain-spoken. Canadian spelling. Mention that our books are risograph-printed in Toronto when it's true."
          hint={`Guidance the AI follows for every draft. ${voice.length}/${VOICE_MAX} characters.`}
          onChange={(e) => setVoice(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <SecondaryButton disabled={saving || readFailed || voice.trim() === savedVoice} onClick={saveVoice}>Save house style</SecondaryButton>
        </div>
      </div>
    </SectionCard>
  );
}

/** One service's key: how to get it, the password box, Save / Check / Remove and the check result. */
function KeySlot({ which, stored, saving, problem, placeholder, steps, onSave }: {
  which: AiProvider; stored: boolean | null; saving: boolean; problem: (v: string) => string; placeholder: string;
  steps: ReactNode; onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<Check>(null);
  const [confirm, confirmNode] = useConfirm();
  const name = NAMES[which];
  const cleaned = draft.trim();
  const error = problem(cleaned);

  const verify = async () => {
    setChecking(true);
    setCheck(null);
    setCheck(await checkAiKey(which));
    setChecking(false);
  };
  const save = async (value: string) => {
    if (!(await onSave(value))) return;
    setDraft("");
    setCheck(null);
    if (value) await verify();
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Remove the ${name} key?`,
      message: `The shop stops using ${name}. If the other key is saved, it writes the drafts instead; with no key the Write with AI buttons ask you to add one. Auto-fill (without AI) keeps working.`,
      confirmLabel: "Remove key",
    });
    if (ok) await save("");
  };

  return (
    <section aria-label={`${name} key`} style={{ marginTop: 20 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: "var(--rp-text-base)", fontWeight: 800 }}>{name}</h3>
      <HowTo summary={`Get ${which === "openrouter" ? "an" : "a"} ${name} key`} open={stored === false}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>{steps}</ol>
      </HowTo>
      <TextField label={`${name} API key`} type="password" value={draft} autoComplete="off"
        placeholder={stored ? "Stored — enter a new key to replace it" : placeholder}
        hint={stored === null ? "Checking…" : stored ? "✓ A key is stored. It is never shown here." : "No key yet."}
        error={error || undefined}
        onChange={(e) => setDraft(e.target.value)} />
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <PrimaryButton disabled={!cleaned || Boolean(error) || saving} onClick={() => save(cleaned)}>
          {saving ? "Saving…" : "Save key"}
        </PrimaryButton>
        {stored && <SecondaryButton disabled={checking || saving} onClick={verify}>{checking ? "Checking…" : "Check key"}</SecondaryButton>}
        {stored && <GhostButton disabled={saving} onClick={remove}>Remove</GhostButton>}
      </div>
      {check && (
        <p role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${tone(check.ok)})`, color: `var(${tone(check.ok)})`, background: `var(${tone(check.ok)}-tint)` }}>
          {check.ok ? "✓ " : "✕ "}{check.message}
        </p>
      )}
      {confirmNode}
    </section>
  );
}
