/** Client-managed dropdown lists (see lib/options.ts). Stored in settings under "options". */
import type { Option } from "@/lib/constants";
import { DEFAULT_OPTIONS, MANAGED_KEYS, MANAGED_LISTS, OPTION_VALUE_RE, type ManagedListKey, type StoredList } from "@/lib/options";
import { Setting } from "../models";
import { getRoles } from "./roles";

const KEY = "options";
type Stored = Partial<Record<ManagedListKey, StoredList>>;

let cache: { at: number; data: Stored } | null = null;
const TTL_MS = 30_000;

async function stored(): Promise<Stored> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const doc = await Setting.findById(KEY).lean<{ value?: Stored }>();
  cache = { at: Date.now(), data: doc?.value ?? {} };
  return cache.data;
}

export function isManagedList(key: string): key is ManagedListKey {
  return (MANAGED_KEYS as string[]).includes(key);
}

export async function currentItems(key: ManagedListKey): Promise<Option[]> {
  const s = (await stored())[key];
  return s?.items?.length ? s.items : DEFAULT_OPTIONS[key];
}

/** Everything the app needs to draw its dropdowns. */
export async function optionsPayload() {
  const s = await stored();
  const lists = Object.fromEntries(
    MANAGED_KEYS.map((k) => [k, { items: s[k]?.items?.length ? s[k]!.items : DEFAULT_OPTIONS[k], removed: s[k]?.removed ?? [], customized: !!s[k]?.items?.length }])
  );
  const roles = (await getRoles()).map(({ value, label, color, builtIn }) => ({ value, label, color, builtIn }));
  return { lists, roles };
}

export class OptionsError extends Error {}

function check(key: ManagedListKey, items: Option[]) {
  if (!items.length) throw new OptionsError("Keep at least one option in the list.");
  if (items.length > 300) throw new OptionsError("A list can have at most 300 options.");
  const seenV = new Set<string>();
  const seenL = new Set<string>();
  for (const o of items) {
    const label = o.label.trim();
    if (!label) throw new OptionsError("Every option needs a name.");
    if (label.length > 80) throw new OptionsError(`"${label.slice(0, 30)}…" is too long – keep names under 80 characters.`);
    if (!OPTION_VALUE_RE.test(o.value)) throw new OptionsError(`"${label}" has an invalid code.`);
    if (seenV.has(o.value)) throw new OptionsError(`Two options have the same code "${o.value}".`);
    if (seenL.has(label.toLowerCase())) throw new OptionsError(`"${label}" is in the list twice.`);
    seenV.add(o.value);
    seenL.add(label.toLowerCase());
  }
  const locked = MANAGED_LISTS[key].locked ?? [];
  const missing = locked.filter((v) => !seenV.has(v));
  if (missing.length) {
    const names = missing.map((v) => DEFAULT_OPTIONS[key].find((d) => d.value === v)?.label ?? v);
    throw new OptionsError(`${names.join(", ")} can be renamed but not deleted – the software uses ${missing.length > 1 ? "them" : "it"}.`);
  }
}

async function write(key: ManagedListKey, entry: StoredList | null, userId: string) {
  const all = { ...(await stored()) };
  if (entry) all[key] = entry;
  else delete all[key];
  await Setting.updateOne({ _id: KEY }, { $set: { value: all, updatedBy: userId } }, { upsert: true });
  cache = null;
}

/** Replace a list. Options that disappear are remembered so old records keep their names. */
export async function saveList(key: ManagedListKey, items: Option[], userId: string) {
  const clean = items.map((o) => ({ value: o.value.trim(), label: o.label.trim(), ...(o.color ? { color: o.color } : {}) }));
  check(key, clean);
  const prev = (await stored())[key];
  const current = await currentItems(key);
  const keep = new Set(clean.map((o) => o.value));
  const removed = new Map<string, Option>();
  for (const r of prev?.removed ?? []) if (!keep.has(r.value)) removed.set(r.value, r);
  for (const c of current) if (!keep.has(c.value)) removed.set(c.value, { value: c.value, label: c.label });
  await write(key, { items: clean, removed: [...removed.values()] }, userId);
}

/** Back to the shipped defaults (custom options are remembered as removed). */
export async function resetList(key: ManagedListKey, userId: string) {
  const prev = (await stored())[key];
  if (!prev) return;
  const defaults = new Set(DEFAULT_OPTIONS[key].map((o) => o.value));
  const removed = new Map<string, Option>();
  for (const r of [...(prev.removed ?? []), ...(prev.items ?? [])]) if (!defaults.has(r.value)) removed.set(r.value, { value: r.value, label: r.label });
  await write(key, removed.size ? { items: DEFAULT_OPTIONS[key], removed: [...removed.values()] } : null, userId);
}
