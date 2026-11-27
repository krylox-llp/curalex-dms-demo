"use client";

import { useSyncExternalStore } from "react";

/**
 * Files picked for sharing, kept in sessionStorage so the selection survives moving between folders.
 * Keyed by document id; each document contributes one chosen version.
 */
export type Selection = Record<string, { versionId: string }>;

const KEY = "curalex.share-selection";
const TARGET_KEY = "curalex.share-target";

/** Exporter chosen up front when sharing starts from that exporter's page. */
export type ShareTarget = { id: string; name: string } | null;
let targetCache: ShareTarget | undefined;

function readTarget(): ShareTarget {
  if (targetCache === undefined) {
    try {
      targetCache = JSON.parse(sessionStorage.getItem(TARGET_KEY) ?? "null") as ShareTarget;
    } catch {
      targetCache = null;
    }
  }
  return targetCache;
}

export function setShareTarget(target: ShareTarget) {
  targetCache = target;
  if (target) sessionStorage.setItem(TARGET_KEY, JSON.stringify(target));
  else sessionStorage.removeItem(TARGET_KEY);
  listeners.forEach((l) => l());
}

export function useShareTarget(): ShareTarget {
  return useSyncExternalStore(subscribe, readTarget, () => null);
}
const EMPTY: Selection = {};
const listeners = new Set<() => void>();
let cache: Selection | null = null;

function read(): Selection {
  if (cache === null) {
    try {
      cache = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Selection;
    } catch {
      cache = {};
    }
  }
  return cache;
}

function write(next: Selection) {
  cache = next;
  sessionStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelection() {
  const selection = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    selection,
    count: Object.keys(selection).length,
    versionIds: Object.values(selection).map((s) => s.versionId),
    select: (documentId: string, versionId: string) => write({ ...read(), [documentId]: { versionId } }),
    unselect: (documentId: string) => {
      const next = { ...read() };
      delete next[documentId];
      write(next);
    },
    clear: () => write({}),
  };
}
