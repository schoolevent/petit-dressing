import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  ACCESSORIES_SECTION,
  ALL_TEMPLATES,
  ICON_LIBRARY,
  INVENTORY_SECTIONS,
  SECTION_SUBTITLES,
  getAccessoryMigrationCandidates,
  groupsForSection,
  makeInitialGarments,
  normalizeGarment,
  suggestIcon,
  upgradeGarments,
  type AccessoryMigrationCandidate,
  type CatalogGarment as Garment,
  type GarmentGroup as Group,
  type InventorySection,
} from "./catalog";
import {
  applySyncMutation,
  normalizeSyncState,
  type StoredMutation,
  type SyncMutation,
  type SyncState,
} from "./syncModel";
import "./App.css";

const STORAGE_KEY = "petit-dressing-v5";
const LEGACY_STORAGE_KEYS = [
  "petit-dressing-v4",
  "petit-dressing-v3",
  "petit-dressing-v2",
  "petit-dressing-v1",
];
const SYNC_STORAGE_KEY = "petit-dressing-sync-v1";
const ACCESSORY_MIGRATION_DISMISSED_KEY =
  "petit-dressing-accessory-migration-dismissed-v1";

type View = "inventory" | "shopping" | "settings";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type SavedState = {
  version: 5;
  babyName: string;
  garments: Garment[];
};

type SyncStatus = "local" | "online" | "syncing" | "offline" | "error";

type SyncConfig = {
  code: string;
  lastSeq: number;
  pending: SyncMutation[];
  seenMutationIds: string[];
};

const EMPTY_SYNC_CONFIG: SyncConfig = {
  code: "",
  lastSeq: 0,
  pending: [],
  seenMutationIds: [],
};

function loadSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) return EMPTY_SYNC_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      code: typeof parsed.code === "string" ? normalizeSyncCode(parsed.code) : "",
      lastSeq:
        typeof parsed.lastSeq === "number" ? Math.max(0, parsed.lastSeq) : 0,
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
      seenMutationIds: Array.isArray(parsed.seenMutationIds)
        ? parsed.seenMutationIds
            .filter((value): value is string => typeof value === "string")
            .slice(-250)
        : [],
    };
  } catch {
    return EMPTY_SYNC_CONFIG;
  }
}

function normalizeSyncCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 64);
}

function formatSyncCode(value: string) {
  return normalizeSyncCode(value).match(/.{1,5}/g)?.join("-") ?? "";
}

function generateSyncCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

type MutationInput = SyncMutation extends infer Mutation
  ? Mutation extends { id: string }
    ? Omit<Mutation, "id">
    : never
  : never;

function makeMutation(mutation: MutationInput): SyncMutation {
  return { id: crypto.randomUUID(), ...mutation } as SyncMutation;
}

function loadState(): SavedState {
  const fallback: SavedState = {
    version: 5,
    babyName: "",
    garments: makeInitialGarments(),
  };

  try {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as {
        babyName?: unknown;
        garments?: unknown;
      };

      if (Array.isArray(parsed.garments)) {
        return {
          version: 5,
          babyName:
            typeof parsed.babyName === "string" ? parsed.babyName.slice(0, 30) : "",
          garments: upgradeGarments(parsed.garments),
        };
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function getStatus(quantity: number, target: number) {
  if (target === 0 && quantity === 0) {
    return { label: "Optionnel", tone: "optional" };
  }
  if (target === 0 && quantity > 0) {
    return { label: "En stock", tone: "good" };
  }
  if (quantity === 0) {
    return { label: "À prévoir", tone: "empty" };
  }
  if (quantity < target) {
    return { label: `Encore ${target - quantity}`, tone: "warning" };
  }
  if (quantity >= target + 4) {
    return { label: "Bien assez", tone: "over" };
  }
  return { label: "C’est bon", tone: "good" };
}

function fileSafeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function App() {
  const [savedState] = useState(loadState);
  const [babyName, setBabyName] = useState(savedState.babyName);
  const [garments, setGarments] = useState<Garment[]>(savedState.garments);
  const [view, setView] = useState<View>("inventory");
  const [activeSize, setActiveSize] = useState<InventorySection>("Naissance");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemGroup, setNewItemGroup] = useState<Group>("Autres");
  const [newItemIcon, setNewItemIcon] = useState("🍼");
  const [iconManuallySelected, setIconManuallySelected] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAccessoryMigration, setShowAccessoryMigration] = useState(
    () => localStorage.getItem(ACCESSORY_MIGRATION_DISMISSED_KEY) !== "1",
  );
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    const iosNavigator = navigator as Navigator & { standalone?: boolean };
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      iosNavigator.standalone === true
    );
  });
  const importInputRef = useRef<HTMLInputElement>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(loadSyncConfig);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    navigator.onLine ? (loadSyncConfig().code ? "online" : "local") : "offline",
  );
  const [joinCode, setJoinCode] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(false);
  const syncConfigRef = useRef(syncConfig);
  const appStateRef = useRef<SyncState>({ babyName, garments });
  const syncBusyRef = useRef(false);

  useEffect(() => {
    const payload: SavedState = {
      version: 5,
      babyName,
      garments,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    appStateRef.current = { babyName, garments };
  }, [babyName, garments]);

  useEffect(() => {
    syncConfigRef.current = syncConfig;
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncConfig));
  }, [syncConfig]);

  useEffect(() => {
    if (!syncConfig.code) {
      setSyncStatus(navigator.onLine ? "local" : "offline");
      return;
    }

    void syncNow();
    const timer = window.setInterval(() => void syncNow(), 5000);
    const handleOnline = () => void syncNow();
    const handleOffline = () => setSyncStatus("offline");
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncNow();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncConfig.code]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      setNotice("Petit Dressing est installé.");
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const activeGarments = useMemo(
    () => garments.filter((item) => !item.hidden),
    [garments],
  );

  const sizeGarments = useMemo(
    () => activeGarments.filter((item) => item.size === activeSize),
    [activeGarments, activeSize],
  );

  const visibleGarments = useMemo(
    () =>
      onlyMissing
        ? sizeGarments.filter((item) => item.target > item.quantity)
        : sizeGarments,
    [sizeGarments, onlyMissing],
  );

  const inventorySummary = useMemo(() => {
    const total = sizeGarments.reduce((sum, item) => sum + item.quantity, 0);
    const tracked = sizeGarments.filter((item) => item.target > 0);
    const completed = tracked.filter((item) => item.quantity >= item.target).length;
    const missing = tracked.reduce(
      (sum, item) => sum + Math.max(item.target - item.quantity, 0),
      0,
    );

    return {
      total,
      missing,
      completed,
      tracked: tracked.length,
    };
  }, [sizeGarments]);

  const activeGroups = useMemo(() => groupsForSection(activeSize), [activeSize]);

  const groupedGarments = useMemo(
    () =>
      activeGroups
        .map((group) => ({
          group,
          items: visibleGarments.filter((item) => item.group === group),
        }))
        .filter((section) => section.items.length > 0),
    [activeGroups, visibleGarments],
  );

  const shoppingList = useMemo(
    () =>
      INVENTORY_SECTIONS.map((size) => ({
        size,
        season: SECTION_SUBTITLES[size],
        items: activeGarments.filter(
          (item) => item.size === size && item.target > item.quantity,
        ),
      })).filter((section) => section.items.length > 0),
    [activeGarments],
  );

  const shoppingSummary = useMemo(() => {
    const missingPieces = shoppingList.reduce(
      (sum, section) =>
        sum +
        section.items.reduce(
          (sectionSum, item) => sectionSum + item.target - item.quantity,
          0,
        ),
      0,
    );

    const categories = shoppingList.reduce(
      (sum, section) => sum + section.items.length,
      0,
    );

    return {
      missingPieces,
      categories,
      sections: shoppingList.length,
    };
  }, [shoppingList]);

  const catalog = useMemo(
    () =>
      ALL_TEMPLATES.map((template) => {
        const item = garments.find(
          (garment) => garment.key === template.key && !garment.custom,
        );

        return {
          key: template.key,
          icon: template.icon,
          group: template.group,
          defaultLabel: template.label,
          label: item?.label ?? template.label,
          hidden: item?.hidden ?? false,
        };
      }),
    [garments],
  );



  const accessoryMigrationCandidates = useMemo(
    () => getAccessoryMigrationCandidates(garments),
    [garments],
  );

  const accessoryMigrationSummary = useMemo(() => {
    const grouped = new Map<
      string,
      { icon: string; label: string; quantity: number }
    >();

    for (const candidate of accessoryMigrationCandidates) {
      const current = grouped.get(candidate.destinationKey);
      grouped.set(candidate.destinationKey, {
        icon: candidate.destinationIcon,
        label: candidate.destinationLabel,
        quantity: (current?.quantity ?? 0) + candidate.quantity,
      });
    }

    return Array.from(grouped.values());
  }, [accessoryMigrationCandidates]);

  useEffect(() => {
    setNewItemGroup("Autres");
    setShowAddForm(false);
    setNewItemName("");
    setNewItemIcon("🍼");
    setIconManuallySelected(false);
  }, [activeSize]);

  useEffect(() => {
    if (accessoryMigrationCandidates.length === 0) {
      setShowAccessoryMigration(false);
      localStorage.removeItem(ACCESSORY_MIGRATION_DISMISSED_KEY);
    }
  }, [accessoryMigrationCandidates.length]);

  function updateSyncConfigState(
    updater: (current: SyncConfig) => SyncConfig,
  ) {
    setSyncConfig((current) => {
      const next = updater(current);
      syncConfigRef.current = next;
      return next;
    });
  }

  function applyMutationLocally(mutation: SyncMutation) {
    if (mutation.type === "state-replace") {
      const nextState = normalizeSyncState(mutation.state);
      setBabyName(nextState.babyName);
      setGarments(nextState.garments);
      return;
    }

    if (mutation.type === "baby-name-set") {
      setBabyName(mutation.babyName);
      return;
    }

    setGarments((current) =>
      applySyncMutation(
        { babyName: appStateRef.current.babyName, garments: current },
        mutation,
      ).garments as Garment[],
    );
  }

  function enqueueMutation(mutation: SyncMutation) {
    if (!syncConfigRef.current.code) return;

    updateSyncConfigState((current) => ({
      ...current,
      pending: [...current.pending, mutation],
    }));

    if (navigator.onLine) {
      window.setTimeout(() => void syncNow(), 0);
    }
  }

  function commitMutation(input: MutationInput) {
    const mutation = makeMutation(input);
    applyMutationLocally(mutation);
    enqueueMutation(mutation);
  }

  async function syncFetch(
    path: string,
    options: RequestInit = {},
    code = syncConfigRef.current.code,
  ) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeSyncCode(code)}`,
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP_${response.status}`);
    }

    return response;
  }

  async function flushPendingMutations() {
    while (syncConfigRef.current.pending.length > 0) {
      const current = syncConfigRef.current;
      const mutation = current.pending[0];

      await syncFetch("/api/sync/mutate", {
        method: "POST",
        body: JSON.stringify({ mutation }),
      });

      updateSyncConfigState((latest) => ({
        ...latest,
        pending: latest.pending.filter((item) => item.id !== mutation.id),
        seenMutationIds: [
          ...latest.seenMutationIds.filter((id) => id !== mutation.id),
          mutation.id,
        ].slice(-250),
      }));
    }
  }

  async function pullRemoteMutations() {
    let hasMore = true;

    while (hasMore) {
      const current = syncConfigRef.current;
      const response = await syncFetch(`/api/sync?since=${current.lastSeq}`);
      const payload = (await response.json()) as {
        mutations: StoredMutation[];
        lastSeq: number;
        hasMore: boolean;
      };

      const seen = new Set(current.seenMutationIds);
      for (const item of payload.mutations) {
        if (!seen.has(item.mutation.id)) {
          applyMutationLocally(item.mutation);
        }
        seen.add(item.mutation.id);
      }

      updateSyncConfigState((latest) => ({
        ...latest,
        lastSeq: Math.max(latest.lastSeq, payload.lastSeq),
        seenMutationIds: Array.from(
          new Set([...latest.seenMutationIds, ...seen]),
        ).slice(-250),
      }));

      hasMore = payload.hasMore;
    }
  }

  async function syncNow() {
    if (!syncConfigRef.current.code) {
      setSyncStatus(navigator.onLine ? "local" : "offline");
      return;
    }
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    if (syncBusyRef.current) return;

    syncBusyRef.current = true;
    setSyncStatus("syncing");

    try {
      await flushPendingMutations();
      await pullRemoteMutations();
      setSyncStatus("online");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
    } finally {
      syncBusyRef.current = false;
    }
  }

  async function createSharedSpace() {
    const code = generateSyncCode();
    setSyncStatus("syncing");

    try {
      await syncFetch(
        "/api/sync/create",
        {
          method: "POST",
          body: JSON.stringify({ state: appStateRef.current }),
        },
        code,
      );

      const next: SyncConfig = {
        code,
        lastSeq: 0,
        pending: [],
        seenMutationIds: [],
      };
      syncConfigRef.current = next;
      setSyncConfig(next);
      setJoinCode(formatSyncCode(code));
      setSyncStatus("online");
      setNotice("Espace partagé créé.");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      window.alert("Impossible de créer l’espace partagé pour le moment.");
    }
  }

  async function joinSharedSpace() {
    const code = normalizeSyncCode(joinCode);
    if (code.length < 16) {
      window.alert("Le code de synchronisation est incomplet.");
      return;
    }

    setSyncStatus("syncing");
    try {
      const response = await syncFetch("/api/sync", {}, code);
      const payload = (await response.json()) as {
        state: SyncState;
        lastSeq: number;
      };

      const confirmed = window.confirm(
        "Charger le dressing partagé sur cet appareil ? Les données locales actuelles seront remplacées.",
      );
      if (!confirmed) {
        setSyncStatus(syncConfigRef.current.code ? "online" : "local");
        return;
      }

      const sharedState = normalizeSyncState(payload.state);
      setBabyName(sharedState.babyName);
      setGarments(sharedState.garments);
      const next: SyncConfig = {
        code,
        lastSeq: payload.lastSeq,
        pending: [],
        seenMutationIds: [],
      };
      syncConfigRef.current = next;
      setSyncConfig(next);
      setShowJoinForm(false);
      setSyncStatus("online");
      setNotice("Dressing partagé connecté.");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      window.alert(
        "Code introuvable ou synchronisation indisponible. Vérifie le code puis réessaie.",
      );
    }
  }

  function disconnectSharedSpace() {
    const confirmed = window.confirm(
      "Déconnecter cet appareil ? Le dressing restera enregistré localement.",
    );
    if (!confirmed) return;

    syncConfigRef.current = EMPTY_SYNC_CONFIG;
    setSyncConfig(EMPTY_SYNC_CONFIG);
    setJoinCode("");
    setSyncStatus(navigator.onLine ? "local" : "offline");
    setNotice("Synchronisation déconnectée.");
  }

  async function copySyncCode() {
    try {
      await navigator.clipboard.writeText(formatSyncCode(syncConfig.code));
      setNotice("Code copié.");
    } catch {
      window.prompt(
        "Copie ce code :",
        formatSyncCode(syncConfig.code),
      );
    }
  }

  function updateQuantity(id: string, delta: number) {
    commitMutation({ type: "quantity-delta", garmentId: id, delta });
  }

  function completeItem(id: string) {
    const item = garments.find((garment) => garment.id === id);
    if (!item) return;
    const delta = Math.max(0, item.target - item.quantity);
    if (delta === 0) return;
    commitMutation({ type: "quantity-delta", garmentId: id, delta });
  }

  function updateTarget(id: string, target: number) {
    commitMutation({ type: "target-set", garmentId: id, target });
  }

  function updateBabyName(value: string) {
    commitMutation({ type: "baby-name-set", babyName: value });
  }

  function migrateAccessories(candidates: AccessoryMigrationCandidate[]) {
    if (candidates.length === 0) return;

    commitMutation({
      type: "accessories-migrate",
      moves: candidates.map((candidate) => ({
        sourceId: candidate.sourceId,
        destinationKey: candidate.destinationKey,
      })),
    });
    localStorage.removeItem(ACCESSORY_MIGRATION_DISMISSED_KEY);
    setShowAccessoryMigration(false);
    setActiveSize(ACCESSORIES_SECTION);
    setView("inventory");
    setNotice("Accessoires regroupés sans perte de données.");
  }

  function postponeAccessoryMigration() {
    localStorage.setItem(ACCESSORY_MIGRATION_DISMISSED_KEY, "1");
    setShowAccessoryMigration(false);
  }

  function reopenAccessoryMigration() {
    localStorage.removeItem(ACCESSORY_MIGRATION_DISMISSED_KEY);
    setShowAccessoryMigration(true);
  }

  function addCustomItem() {
    const label = newItemName.trim();
    if (!label) return;

    const id = `${activeSize}-custom-${crypto.randomUUID()}`;
    const garment: Garment = {
      id,
      key: id,
      label,
      icon: newItemIcon,
      group: newItemGroup,
      size: activeSize,
      quantity: 0,
      target: 1,
      custom: true,
      hidden: false,
    };

    commitMutation({ type: "custom-add", garment });
    setNewItemName("");
    setNewItemGroup("Autres");
    setNewItemIcon("🍼");
    setIconManuallySelected(false);
    setShowAddForm(false);
  }

  function deleteCustomItem(id: string) {
    const confirmed = window.confirm("Supprimer cet élément personnalisé ?");
    if (!confirmed) return;
    commitMutation({ type: "custom-delete", garmentId: id });
  }

  function resetCurrentSize() {
    const confirmed = window.confirm(
      `Remettre toutes les quantités de la section « ${activeSize} » à zéro ?`,
    );
    if (!confirmed) return;

    commitMutation({ type: "size-reset", size: activeSize });
  }

  function restoreWinterTargets() {
    const confirmed = window.confirm(
      "Rétablir tous les objectifs conseillés pour un bébé d’hiver ? Les quantités déjà encodées seront conservées.",
    );
    if (!confirmed) return;

    const recommended = Object.fromEntries(
      makeInitialGarments().map((item) => [item.id, item.target]),
    );

    commitMutation({ type: "targets-restore", targets: recommended });
    setNotice("Objectifs hiver rétablis.");
  }

  function renameCategory(key: string, label: string) {
    commitMutation({ type: "category-rename", key, label });
  }

  function toggleCategory(key: string) {
    const currentItem = garments.find(
      (item) => item.key === key && !item.custom,
    );
    commitMutation({
      type: "category-hidden-set",
      key,
      hidden: !(currentItem?.hidden ?? false),
    });
  }

  function restoreDefaultCategories() {
    const confirmed = window.confirm(
      "Rétablir les noms d’origine et réafficher toutes les catégories ?",
    );
    if (!confirmed) return;

    const labels = Object.fromEntries(
      ALL_TEMPLATES.map((item) => [item.key, item.label]),
    );

    commitMutation({ type: "categories-restore", labels });
    setNotice("Catégories rétablies.");
  }

  function resetEverything() {
    const confirmed = window.confirm(
      "Effacer tout l’inventaire et revenir aux réglages de départ ?",
    );
    if (!confirmed) return;

    commitMutation({
      type: "state-replace",
      state: { babyName: "", garments: makeInitialGarments() },
    });
    setActiveSize("Naissance");
    setView("inventory");
    setNotice("Inventaire réinitialisé.");
  }

  function exportBackup() {
    const backup: SavedState = {
      version: 5,
      babyName,
      garments,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const name = fileSafeName(babyName) || "bebe";

    anchor.href = url;
    anchor.download = `petit-dressing-${name}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("Sauvegarde téléchargée.");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as {
        babyName?: unknown;
        garments?: unknown;
      };

      if (!Array.isArray(parsed.garments)) {
        throw new Error("Format invalide");
      }

      const imported = parsed.garments
        .map(normalizeGarment)
        .filter((item): item is Garment => item !== null);

      if (imported.length === 0) {
        throw new Error("Aucun vêtement valide");
      }

      const confirmed = window.confirm(
        "Remplacer les données actuelles par cette sauvegarde ?",
      );
      if (!confirmed) return;

      commitMutation({
        type: "state-replace",
        state: {
          babyName: typeof parsed.babyName === "string" ? parsed.babyName : "",
          garments: upgradeGarments(imported),
        },
      });
      setNotice("Sauvegarde importée.");
    } catch {
      window.alert("Ce fichier ne semble pas être une sauvegarde Petit Dressing valide.");
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }

  const dressingTitle = babyName.trim()
    ? `Le dressing de ${babyName.trim()}`
    : "Petit Dressing";

  return (
    <main className="app-shell">
      {notice && <div className="toast">{notice}</div>}

      {showAccessoryMigration && accessoryMigrationCandidates.length > 0 && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="migration-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="migration-title"
          >
            <div className="migration-heading">
              <span aria-hidden="true">🧺</span>
              <div>
                <p className="eyebrow">Mise à jour du dressing</p>
                <h2 id="migration-title">Regrouper les accessoires ?</h2>
              </div>
            </div>
            <p>
              J’ai retrouvé des articles sans taille dans Naissance, 1 mois ou
              d’autres tailles. Ils peuvent être déplacés dans la nouvelle section
              Accessoires sans modifier les quantités.
            </p>

            <div className="migration-summary">
              {accessoryMigrationSummary.map((item) => (
                <article key={item.label}>
                  <span>{item.icon}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.quantity} pièce{item.quantity > 1 ? "s" : ""}</small>
                  </div>
                </article>
              ))}
            </div>

            <details className="migration-details">
              <summary>Voir d’où viennent les articles</summary>
              <ul>
                {accessoryMigrationCandidates.map((candidate) => (
                  <li key={candidate.sourceId}>
                    <span>{candidate.sourceLabel}</span>
                    <small>
                      {candidate.sourceSection} · {candidate.quantity}
                    </small>
                  </li>
                ))}
              </ul>
            </details>

            <div className="migration-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => migrateAccessories(accessoryMigrationCandidates)}
              >
                Déplacer automatiquement
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={postponeAccessoryMigration}
              >
                Plus tard
              </button>
            </div>
          </section>
        </div>
      )}

      <header className="hero">
        <div className="brand-block">
          <p className="eyebrow">Inventaire bébé</p>
          <h1>{dressingTitle}</h1>
          <p className="hero-copy">
            Vêtements, accessoires et liste d’achats réunis au même endroit.
          </p>
        </div>

        <nav className="main-nav" aria-label="Navigation principale">
          <button
            type="button"
            className={view === "inventory" ? "nav-button active" : "nav-button"}
            onClick={() => setView("inventory")}
          >
            <span>🧺</span>
            Dressing
          </button>
          <button
            type="button"
            className={view === "shopping" ? "nav-button active" : "nav-button"}
            onClick={() => setView("shopping")}
          >
            <span>🛒</span>
            À acheter
            {shoppingSummary.missingPieces > 0 && (
              <strong>{shoppingSummary.missingPieces}</strong>
            )}
          </button>
          <button
            type="button"
            className={view === "settings" ? "nav-button active" : "nav-button"}
            onClick={() => setView("settings")}
          >
            <span>⚙️</span>
            Réglages
          </button>
        </nav>
      </header>

      {view === "inventory" && (
        <>
          <nav className="size-tabs" aria-label="Sections du dressing">
            {INVENTORY_SECTIONS.map((size) => (
              <button
                key={size}
                type="button"
                className={[
                  "size-tab",
                  size === activeSize ? "active" : "",
                  size === ACCESSORIES_SECTION ? "accessories-tab" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveSize(size)}
              >
                <span>{size}</span>
                <small>{SECTION_SUBTITLES[size]}</small>
              </button>
            ))}
          </nav>

          <section className="summary-grid" aria-label={`Résumé ${activeSize}`}>
            <article className="summary-card">
              <span>Dans l’armoire</span>
              <strong>{inventorySummary.total}</strong>
              <small>pièces encodées</small>
            </article>
            <article className="summary-card">
              <span>Objectifs atteints</span>
              <strong>
                {inventorySummary.completed}/{inventorySummary.tracked}
              </strong>
              <small>catégories prêtes</small>
            </article>
            <article
              className={
                inventorySummary.missing > 0
                  ? "summary-card attention"
                  : "summary-card success"
              }
            >
              <span>À compléter</span>
              <strong>{inventorySummary.missing}</strong>
              <small>pièces manquantes</small>
            </article>
          </section>

          <section className="toolbar">
            <label className="toggle">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(event) => setOnlyMissing(event.target.checked)}
              />
              <span aria-hidden="true" />
              Voir uniquement ce qu’il manque
            </label>

            <button type="button" className="text-button" onClick={resetCurrentSize}>
              {activeSize === ACCESSORIES_SECTION
                ? "Réinitialiser les accessoires"
                : "Réinitialiser cette taille"}
            </button>
          </section>

          <section className="wardrobe">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{SECTION_SUBTITLES[activeSize]}</p>
                <h2>{activeSize}</h2>
                <p className="section-description">
                  Les objectifs sont des repères de départ et restent modifiables.
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowAddForm((current) => !current)}
              >
                + Ajouter
              </button>
            </div>

            {showAddForm && (
              <div className="add-form">
                <div className="add-form-fields">
                  <div className="selected-item-icon" aria-hidden="true">
                    {newItemIcon}
                  </div>
                  <input
                    autoFocus
                    value={newItemName}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNewItemName(value);
                      if (!iconManuallySelected) {
                        setNewItemIcon(suggestIcon(value));
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addCustomItem();
                      if (event.key === "Escape") setShowAddForm(false);
                    }}
                    placeholder={
                      activeSize === ACCESSORIES_SECTION
                        ? "Ex. gants de toilette, couvertures…"
                        : "Ex. salopettes, moufles…"
                    }
                  />
                  <select
                    value={newItemGroup}
                    onChange={(event) =>
                      setNewItemGroup(event.target.value as Group)
                    }
                  >
                    {groupsForSection(activeSize).map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={addCustomItem}>
                    Ajouter
                  </button>
                </div>

                <div className="icon-library">
                  <span>Icône de l’article</span>
                  <div className="icon-grid" role="list" aria-label="Bibliothèque d’icônes">
                    {ICON_LIBRARY.map((icon) => (
                      <button
                        type="button"
                        key={icon}
                        className={icon === newItemIcon ? "selected" : ""}
                        onClick={() => {
                          setNewItemIcon(icon);
                          setIconManuallySelected(true);
                        }}
                        aria-label={`Utiliser l’icône ${icon}`}
                        aria-pressed={icon === newItemIcon}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {groupedGarments.length === 0 ? (
              <div className="empty-state">
                <span>🎉</span>
                <h3>Tout est prêt dans cette section</h3>
                <p>Désactive le filtre pour revoir l’inventaire complet.</p>
              </div>
            ) : (
              groupedGarments.map((section) => (
                <div className="garment-group" key={section.group}>
                  <h3>{section.group}</h3>
                  <div className="garment-list">
                    {section.items.map((item) => {
                      const status = getStatus(item.quantity, item.target);

                      return (
                        <article className="garment-card" key={item.id}>
                          <div className="garment-main">
                            <div className="garment-icon" aria-hidden="true">
                              {item.icon}
                            </div>
                            <div className="garment-info">
                              <div className="garment-title-row">
                                <h4>{item.label}</h4>
                                <span className={`status ${status.tone}`}>
                                  {status.label}
                                </span>
                              </div>

                              <div className="target-row">
                                <span>Objectif</span>
                                <button
                                  type="button"
                                  aria-label={`Diminuer l’objectif de ${item.label}`}
                                  onClick={() =>
                                    updateTarget(item.id, item.target - 1)
                                  }
                                >
                                  −
                                </button>
                                <strong>{item.target}</strong>
                                <button
                                  type="button"
                                  aria-label={`Augmenter l’objectif de ${item.label}`}
                                  onClick={() =>
                                    updateTarget(item.id, item.target + 1)
                                  }
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="quantity-control">
                            <button
                              type="button"
                              aria-label={`Retirer un article : ${item.label}`}
                              onClick={() => updateQuantity(item.id, -1)}
                              disabled={item.quantity === 0}
                            >
                              −
                            </button>
                            <strong>{item.quantity}</strong>
                            <button
                              type="button"
                              aria-label={`Ajouter un article : ${item.label}`}
                              onClick={() => updateQuantity(item.id, 1)}
                            >
                              +
                            </button>
                          </div>

                          {item.custom && (
                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => deleteCustomItem(item.id)}
                              aria-label={`Supprimer ${item.label}`}
                              title="Supprimer cet élément"
                            >
                              ×
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {view === "shopping" && (
        <section className="shopping-page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Liste automatique</p>
              <h2>Ce qu’il reste à acheter</h2>
              <p>
                Chaque ajout ici augmente directement la quantité dans le dressing.
              </p>
            </div>
          </div>

          <section className="shopping-summary">
            <article>
              <strong>{shoppingSummary.missingPieces}</strong>
              <span>pièces manquantes</span>
            </article>
            <article>
              <strong>{shoppingSummary.categories}</strong>
              <span>catégories à compléter</span>
            </article>
            <article>
              <strong>{shoppingSummary.sections}</strong>
              <span>sections concernées</span>
            </article>
          </section>

          {shoppingList.length === 0 ? (
            <div className="shopping-empty">
              <span>🎉</span>
              <h3>La garde-robe est complète</h3>
              <p>Tous les objectifs définis sont atteints.</p>
            </div>
          ) : (
            <div className="shopping-sections">
              {shoppingList.map((section) => (
                <section className="shopping-size" key={section.size}>
                  <div className="shopping-size-heading">
                    <div>
                      <h3>{section.size}</h3>
                      <span>{section.season}</span>
                    </div>
                    <strong>
                      {section.items.reduce(
                        (sum, item) => sum + item.target - item.quantity,
                        0,
                      )}{" "}
                      à trouver
                    </strong>
                  </div>

                  <div className="shopping-list">
                    {section.items.map((item) => {
                      const missing = item.target - item.quantity;

                      return (
                        <article className="shopping-item" key={item.id}>
                          <div className="shopping-item-icon">{item.icon}</div>
                          <div className="shopping-item-info">
                            <h4>{item.label}</h4>
                            <p>
                              Tu en as {item.quantity} sur {item.target}
                            </p>
                          </div>
                          <span className="missing-badge">
                            {missing} manquant{missing > 1 ? "s" : ""}
                          </span>
                          <div className="shopping-actions">
                            <button
                              type="button"
                              className="small-primary"
                              onClick={() => updateQuantity(item.id, 1)}
                            >
                              +1 rangé
                            </button>
                            <button
                              type="button"
                              className="small-secondary"
                              onClick={() => completeItem(item.id)}
                            >
                              Tout ajouté
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "settings" && (
        <section className="settings-page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Personnalisation</p>
              <h2>Réglages et sauvegarde</h2>
              <p>Les données restent enregistrées automatiquement sur cet appareil.</p>
            </div>
          </div>

          <div className="settings-grid">
            <article className="settings-card">
              <div className="settings-icon">👶</div>
              <div>
                <h3>Prénom du bébé</h3>
                <p>Il apparaîtra dans le titre de l’application.</p>
                <input
                  value={babyName}
                  onChange={(event) => updateBabyName(event.target.value)}
                  placeholder="À compléter plus tard"
                  maxLength={30}
                />
              </div>
            </article>

            {accessoryMigrationCandidates.length > 0 && (
              <article className="settings-card migration-settings-card">
                <div className="settings-icon">🧺</div>
                <div>
                  <h3>Articles à reclasser</h3>
                  <p>
                    {accessoryMigrationCandidates.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    )}{" "}
                    pièce(s) peuvent être regroupées dans la nouvelle section
                    Accessoires, sans rien réencoder.
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={reopenAccessoryMigration}
                  >
                    Vérifier et déplacer
                  </button>
                </div>
              </article>
            )}

            <article className="settings-card sync-card">
              <div className="settings-icon">🔄</div>
              <div className="sync-card-content">
                <div className="sync-heading">
                  <div>
                    <h3>Synchronisation familiale</h3>
                    <p>
                      Le même dressing sur ton téléphone et celui d’Amélie, avec
                      fonctionnement hors ligne et rattrapage automatique.
                    </p>
                  </div>
                  <span className={`sync-status ${syncStatus}`}>
                    {syncStatus === "online" && "À jour"}
                    {syncStatus === "syncing" && "Synchronisation…"}
                    {syncStatus === "offline" && "Hors ligne"}
                    {syncStatus === "error" && "À vérifier"}
                    {syncStatus === "local" && "Local uniquement"}
                  </span>
                </div>

                {syncConfig.code ? (
                  <div className="sync-connected">
                    <div className="sync-code-box">
                      <span>Code du dressing partagé</span>
                      <strong>{formatSyncCode(syncConfig.code)}</strong>
                      <small>
                        À transmettre uniquement à la personne avec qui tu veux
                        partager le dressing.
                      </small>
                    </div>
                    <div className="settings-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={copySyncCode}
                      >
                        Copier le code
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void syncNow()}
                      >
                        Synchroniser maintenant
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={disconnectSharedSpace}
                      >
                        Déconnecter cet appareil
                      </button>
                    </div>
                    {syncConfig.pending.length > 0 && (
                      <p className="sync-pending">
                        {syncConfig.pending.length} modification
                        {syncConfig.pending.length > 1 ? "s" : ""} en attente
                        d’envoi.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="sync-setup">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void createSharedSpace()}
                    >
                      Créer le dressing partagé
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowJoinForm((current) => !current)}
                    >
                      Rejoindre avec un code
                    </button>

                    {showJoinForm && (
                      <div className="join-form">
                        <input
                          value={joinCode}
                          onChange={(event) =>
                            setJoinCode(formatSyncCode(event.target.value))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void joinSharedSpace();
                          }}
                          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void joinSharedSpace()}
                        >
                          Rejoindre
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>

            <article className="settings-card">
              <div className="settings-icon">📱</div>
              <div>
                <h3>Installer l’application</h3>
                {isStandalone ? (
                  <p className="positive-text">
                    Petit Dressing est déjà installé sur cet appareil.
                  </p>
                ) : installPrompt ? (
                  <>
                    <p>
                      Installe-la pour l’ouvrir en plein écran et l’utiliser hors
                      connexion après une première ouverture.
                    </p>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={installApp}
                    >
                      Installer Petit Dressing
                    </button>
                  </>
                ) : (
                  <p>
                    L’installation apparaîtra depuis la version de production. Sur
                    iPhone : Partager → Sur l’écran d’accueil.
                  </p>
                )}
              </div>
            </article>

            <article className="settings-card">
              <div className="settings-icon">❄️</div>
              <div>
                <h3>Objectifs conseillés</h3>
                <p>
                  Les objectifs suivent les saisons probables de chaque taille et
                  incluent maintenant les accessoires. Ils restent entièrement modifiables.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={restoreWinterTargets}
                >
                  Rétablir tous les objectifs conseillés
                </button>
              </div>
            </article>

            <article className="settings-card">
              <div className="settings-icon">💾</div>
              <div>
                <h3>Sauvegarde</h3>
                <p>
                  Télécharge une copie avant de changer de navigateur ou d’appareil.
                </p>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={exportBackup}
                  >
                    Exporter
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => importInputRef.current?.click()}
                  >
                    Importer
                  </button>
                  <input
                    ref={importInputRef}
                    className="hidden-input"
                    type="file"
                    accept="application/json,.json"
                    onChange={importBackup}
                  />
                </div>
              </div>
            </article>

            <article className="settings-card catalog-card">
              <div className="settings-icon">🧾</div>
              <div className="catalog-content">
                <div className="catalog-heading">
                  <div>
                    <h3>Catégories et accessoires</h3>
                    <p>
                      Renomme une catégorie ou masque-la partout, sans supprimer les
                      quantités déjà encodées.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={restoreDefaultCategories}
                  >
                    Tout rétablir
                  </button>
                </div>

                <div className="catalog-list">
                  {catalog.map((item) => (
                    <div
                      className={item.hidden ? "catalog-row hidden" : "catalog-row"}
                      key={item.key}
                    >
                      <span className="catalog-icon">{item.icon}</span>
                      <label>
                        <span>{item.group}</span>
                        <input
                          value={item.label}
                          onChange={(event) =>
                            renameCategory(item.key, event.target.value)
                          }
                          aria-label={`Nom de la catégorie ${item.defaultLabel}`}
                        />
                      </label>
                      <button
                        type="button"
                        className={
                          item.hidden
                            ? "visibility-button hidden"
                            : "visibility-button"
                        }
                        onClick={() => toggleCategory(item.key)}
                      >
                        {item.hidden ? "Masquée" : "Visible"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="settings-card danger-card">
              <div className="settings-icon">🧹</div>
              <div>
                <h3>Repartir de zéro</h3>
                <p>Efface toutes les quantités et les éléments personnalisés.</p>
                <button
                  type="button"
                  className="danger-button"
                  onClick={resetEverything}
                >
                  Réinitialiser toute l’application
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      <footer>
        Sauvegarde locale + synchronisation familiale · Petit Dressing v0.5
      </footer>
    </main>
  );
}
