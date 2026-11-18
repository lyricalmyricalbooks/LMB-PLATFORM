// The shop's own product types (product types plan, change 4): loaded once per admin visit and shared by every
// "What is it?" window and Settings › What you sell, so a type named in one place shows in the others at once.
import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { cleanOwnTypes, ownTypeId, type OwnType } from "../../shared/productTypes";

let cache: OwnType[] | null = null;
let loading: Promise<OwnType[]> | null = null;
const listeners = new Set<(own: OwnType[]) => void>();

function publish(own: OwnType[]) {
  cache = own;
  listeners.forEach((fn) => fn(own));
}

export function loadOwnTypes(): Promise<OwnType[]> {
  if (cache) return Promise.resolve(cache);
  loading ??= Promise.resolve()
    .then(() => adminApi.getOwnTypes())
    .then((own) => { publish(own); return own; })
    .catch(() => { loading = null; return []; });
  return loading;
}

/** The shop's own types, [] until they load (or when they can't). */
export function useOwnTypes(): OwnType[] {
  const [own, setOwn] = useState<OwnType[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setOwn);
    void loadOwnTypes().then(setOwn);
    return () => { listeners.delete(setOwn); };
  }, []);
  return own;
}

/** Saves a new own type (or returns the one already named so) and shares it with every open window. */
export async function addOwnType(name: string, base: string): Promise<OwnType> {
  const own = await loadOwnTypes();
  const made = cleanOwnTypes([{ id: ownTypeId(name), name, base }])[0];
  if (!made) throw new Error("That name can't be used.");
  const same = own.find((t) => t.id === made.id);
  if (same) return same;
  const next = [...own, made];
  await adminApi.saveOwnTypes(next);
  publish(next);
  return made;
}

/** Removes an own type. Products already using it keep its name and its base type's questions. */
export async function removeOwnType(id: string): Promise<void> {
  const own = await loadOwnTypes();
  const next = own.filter((t) => t.id !== id);
  await adminApi.saveOwnTypes(next);
  publish(next);
}

/** For tests: forget what was loaded. */
export function resetOwnTypes() { cache = null; loading = null; }
