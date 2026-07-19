import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "./App.css";

const STORAGE_KEY = "petit-dressing-v3";
const LEGACY_STORAGE_KEYS = ["petit-dressing-v2", "petit-dressing-v1"];

const SIZES = [
  "Naissance",
  "1 mois",
  "3 mois",
  "6 mois",
  "9 mois",
  "12 mois",
  "18 mois",
  "24 mois",
] as const;

type Size = (typeof SIZES)[number];
type View = "inventory" | "shopping" | "settings";
type Group = "Dodo" | "Essentiels" | "Tenues" | "Extérieur" | "Autres";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type GarmentTemplate = {
  key: string;
  label: string;
  icon: string;
  group: Group;
  targets: Record<Size, number>;
};

type Garment = {
  id: string;
  key: string;
  label: string;
  icon: string;
  group: Group;
  size: Size;
  quantity: number;
  target: number;
  custom?: boolean;
  hidden?: boolean;
};

type SavedState = {
  version: 3;
  babyName: string;
  garments: Garment[];
};

const SIZE_SEASONS: Record<Size, string> = {
  Naissance: "Plein hiver",
  "1 mois": "Hiver",
  "3 mois": "Fin d’hiver",
  "6 mois": "Printemps",
  "9 mois": "Été",
  "12 mois": "Hiver suivant",
  "18 mois": "Été suivant",
  "24 mois": "Hiver suivant",
};

function targets(
  naissance: number,
  one: number,
  three: number,
  six: number,
  nine: number,
  twelve: number,
  eighteen: number,
  twentyFour: number,
): Record<Size, number> {
  return {
    Naissance: naissance,
    "1 mois": one,
    "3 mois": three,
    "6 mois": six,
    "9 mois": nine,
    "12 mois": twelve,
    "18 mois": eighteen,
    "24 mois": twentyFour,
  };
}

const GARMENT_TEMPLATES: GarmentTemplate[] = [
  {
    key: "pyjama-velours",
    label: "Pyjamas velours",
    icon: "🌙",
    group: "Dodo",
    targets: targets(7, 8, 6, 3, 1, 5, 1, 5),
  },
  {
    key: "pyjama-coton",
    label: "Pyjamas coton",
    icon: "☁️",
    group: "Dodo",
    targets: targets(2, 3, 4, 5, 6, 3, 6, 3),
  },
  {
    key: "gigoteuse-chaude",
    label: "Gigoteuses TOG 2,5",
    icon: "🛏️",
    group: "Dodo",
    targets: targets(2, 2, 2, 1, 0, 2, 0, 2),
  },
  {
    key: "gigoteuse-legere",
    label: "Gigoteuses légères",
    icon: "🪽",
    group: "Dodo",
    targets: targets(0, 0, 1, 2, 2, 1, 2, 1),
  },
  {
    key: "body-long",
    label: "Bodies manches longues",
    icon: "👕",
    group: "Essentiels",
    targets: targets(7, 8, 7, 5, 2, 6, 3, 6),
  },
  {
    key: "body-short",
    label: "Bodies manches courtes",
    icon: "👚",
    group: "Essentiels",
    targets: targets(0, 1, 2, 5, 7, 3, 7, 3),
  },
  {
    key: "chaussettes",
    label: "Paires de chaussettes",
    icon: "🧦",
    group: "Essentiels",
    targets: targets(4, 5, 6, 6, 6, 6, 6, 6),
  },
  {
    key: "bavoir",
    label: "Bavoirs",
    icon: "🍪",
    group: "Essentiels",
    targets: targets(6, 8, 8, 8, 8, 8, 8, 8),
  },
  {
    key: "pantalon",
    label: "Pantalons",
    icon: "👖",
    group: "Tenues",
    targets: targets(2, 3, 4, 5, 5, 5, 5, 5),
  },
  {
    key: "haut",
    label: "Hauts",
    icon: "🧸",
    group: "Tenues",
    targets: targets(2, 3, 4, 5, 6, 5, 6, 5),
  },
  {
    key: "pull-gilet",
    label: "Pulls et gilets",
    icon: "🧶",
    group: "Tenues",
    targets: targets(2, 3, 3, 3, 1, 3, 1, 3),
  },
  {
    key: "ensemble",
    label: "Ensembles / tenues",
    icon: "✨",
    group: "Tenues",
    targets: targets(2, 3, 3, 4, 4, 4, 4, 4),
  },
  {
    key: "combinaison",
    label: "Manteau / combinaison",
    icon: "🧥",
    group: "Extérieur",
    targets: targets(1, 1, 1, 1, 0, 1, 0, 1),
  },
  {
    key: "bonnet-chaud",
    label: "Bonnets chauds",
    icon: "🧢",
    group: "Extérieur",
    targets: targets(2, 2, 1, 0, 0, 2, 0, 2),
  },
  {
    key: "bonnet-leger",
    label: "Bonnets légers / soleil",
    icon: "☀️",
    group: "Extérieur",
    targets: targets(1, 1, 1, 2, 2, 1, 2, 1),
  },
  {
    key: "chaussons",
    label: "Chaussons",
    icon: "🐾",
    group: "Extérieur",
    targets: targets(1, 1, 1, 1, 1, 1, 1, 1),
  },
];

const GROUPS: Group[] = ["Dodo", "Essentiels", "Tenues", "Extérieur", "Autres"];

const LEGACY_KEY_MAP: Partial<Record<string, string>> = {
  "pyjama-velours": "pyjama",
  "gigoteuse-chaude": "gigoteuse",
  combinaison: "manteau",
  "bonnet-chaud": "bonnet",
};

function makeInitialGarments(): Garment[] {
  return SIZES.flatMap((size) =>
    GARMENT_TEMPLATES.map((item) => ({
      id: `${size}-${item.key}`,
      key: item.key,
      label: item.label,
      icon: item.icon,
      group: item.group,
      size,
      quantity: 0,
      target: item.targets[size],
      hidden: false,
    })),
  );
}

function normalizeGarment(value: unknown): Garment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Garment>;

  if (
    typeof item.id !== "string" ||
    typeof item.key !== "string" ||
    typeof item.label !== "string" ||
    typeof item.icon !== "string" ||
    typeof item.size !== "string" ||
    !SIZES.includes(item.size as Size) ||
    typeof item.quantity !== "number" ||
    typeof item.target !== "number"
  ) {
    return null;
  }

  const safeGroup = GROUPS.includes(item.group as Group)
    ? (item.group as Group)
    : "Autres";

  return {
    id: item.id,
    key: item.key,
    label: item.label,
    icon: item.icon,
    group: safeGroup,
    size: item.size as Size,
    quantity: Math.max(0, Math.round(item.quantity)),
    target: Math.max(0, Math.round(item.target)),
    custom: Boolean(item.custom),
    hidden: Boolean(item.hidden),
  };
}

function migrateGarments(existing: unknown[]): Garment[] {
  const cleanExisting = existing
    .map(normalizeGarment)
    .filter((item): item is Garment => item !== null);

  const byId = new Map(cleanExisting.map((item) => [item.id, item]));
  const fresh = makeInitialGarments().map((item) => {
    const exact = byId.get(item.id);
    if (exact) {
      return {
        ...item,
        label: exact.label,
        quantity: exact.quantity,
        target: exact.target,
        hidden: exact.hidden,
      };
    }

    const legacyKey = LEGACY_KEY_MAP[item.key];
    if (legacyKey) {
      const legacy = byId.get(`${item.size}-${legacyKey}`);
      if (legacy) {
        return {
          ...item,
          quantity: legacy.quantity,
        };
      }
    }

    return item;
  });

  const customItems = cleanExisting.filter((item) => item.custom);
  return [...fresh, ...customItems];
}

function loadState(): SavedState {
  const fallback: SavedState = {
    version: 3,
    babyName: "",
    garments: makeInitialGarments(),
  };

  try {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as {
        babyName?: unknown;
        garments?: unknown;
      };

      if (Array.isArray(parsed.garments)) {
        return {
          version: 3,
          babyName: typeof parsed.babyName === "string" ? parsed.babyName : "",
          garments: migrateGarments(parsed.garments),
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
  const [activeSize, setActiveSize] = useState<Size>("Naissance");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemGroup, setNewItemGroup] = useState<Group>("Autres");
  const [showAddForm, setShowAddForm] = useState(false);
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

  useEffect(() => {
    const payload: SavedState = {
      version: 3,
      babyName,
      garments,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [babyName, garments]);

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

  const groupedGarments = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        items: visibleGarments.filter((item) => item.group === group),
      })).filter((section) => section.items.length > 0),
    [visibleGarments],
  );

  const shoppingList = useMemo(
    () =>
      SIZES.map((size) => ({
        size,
        season: SIZE_SEASONS[size],
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
      sizes: shoppingList.length,
    };
  }, [shoppingList]);

  const catalog = useMemo(
    () =>
      GARMENT_TEMPLATES.map((template) => {
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

  function updateQuantity(id: string, delta: number) {
    setGarments((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item,
      ),
    );
  }

  function completeItem(id: string) {
    setGarments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: item.target } : item,
      ),
    );
  }

  function updateTarget(id: string, target: number) {
    setGarments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, target: Math.max(0, target) } : item,
      ),
    );
  }

  function addCustomItem() {
    const label = newItemName.trim();
    if (!label) return;

    const id = `${activeSize}-custom-${crypto.randomUUID()}`;
    setGarments((current) => [
      ...current,
      {
        id,
        key: id,
        label,
        icon: "🍼",
        group: newItemGroup,
        size: activeSize,
        quantity: 0,
        target: 1,
        custom: true,
        hidden: false,
      },
    ]);

    setNewItemName("");
    setNewItemGroup("Autres");
    setShowAddForm(false);
  }

  function deleteCustomItem(id: string) {
    const confirmed = window.confirm("Supprimer cet élément personnalisé ?");
    if (!confirmed) return;
    setGarments((current) => current.filter((item) => item.id !== id));
  }

  function resetCurrentSize() {
    const confirmed = window.confirm(
      `Remettre toutes les quantités de la taille « ${activeSize} » à zéro ?`,
    );
    if (!confirmed) return;

    setGarments((current) =>
      current.map((item) =>
        item.size === activeSize ? { ...item, quantity: 0 } : item,
      ),
    );
  }

  function restoreWinterTargets() {
    const confirmed = window.confirm(
      "Rétablir les objectifs conseillés pour un bébé d’hiver ? Les quantités déjà encodées seront conservées.",
    );
    if (!confirmed) return;

    const recommended = new Map(
      makeInitialGarments().map((item) => [item.id, item.target]),
    );

    setGarments((current) =>
      current.map((item) =>
        item.custom
          ? item
          : {
              ...item,
              target: recommended.get(item.id) ?? item.target,
            },
      ),
    );
    setNotice("Objectifs hiver rétablis.");
  }

  function renameCategory(key: string, label: string) {
    setGarments((current) =>
      current.map((item) =>
        item.key === key && !item.custom ? { ...item, label } : item,
      ),
    );
  }

  function toggleCategory(key: string) {
    setGarments((current) => {
      const currentItem = current.find(
        (item) => item.key === key && !item.custom,
      );
      const nextHidden = !(currentItem?.hidden ?? false);

      return current.map((item) =>
        item.key === key && !item.custom
          ? { ...item, hidden: nextHidden }
          : item,
      );
    });
  }

  function restoreDefaultCategories() {
    const confirmed = window.confirm(
      "Rétablir les noms d’origine et réafficher toutes les catégories ?",
    );
    if (!confirmed) return;

    const defaults = new Map(
      GARMENT_TEMPLATES.map((item) => [item.key, item.label]),
    );

    setGarments((current) =>
      current.map((item) =>
        item.custom
          ? item
          : {
              ...item,
              label: defaults.get(item.key) ?? item.label,
              hidden: false,
            },
      ),
    );
    setNotice("Catégories rétablies.");
  }

  function resetEverything() {
    const confirmed = window.confirm(
      "Effacer tout l’inventaire et revenir aux réglages de départ ?",
    );
    if (!confirmed) return;

    setBabyName("");
    setGarments(makeInitialGarments());
    setActiveSize("Naissance");
    setView("inventory");
    setNotice("Inventaire réinitialisé.");
  }

  function exportBackup() {
    const backup: SavedState = {
      version: 3,
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

      setBabyName(typeof parsed.babyName === "string" ? parsed.babyName : "");
      setGarments(migrateGarments(imported));
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

      <header className="hero">
        <div className="brand-block">
          <p className="eyebrow">Inventaire bébé</p>
          <h1>{dressingTitle}</h1>
          <p className="hero-copy">
            Un inventaire simple, adapté à l’arrivée d’un bébé en hiver.
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
          <nav className="size-tabs" aria-label="Tailles">
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={size === activeSize ? "size-tab active" : "size-tab"}
                onClick={() => setActiveSize(size)}
              >
                <span>{size}</span>
                <small>{SIZE_SEASONS[size]}</small>
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
              Réinitialiser cette taille
            </button>
          </section>

          <section className="wardrobe">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{SIZE_SEASONS[activeSize]}</p>
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
                <input
                  autoFocus
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addCustomItem();
                    if (event.key === "Escape") setShowAddForm(false);
                  }}
                  placeholder="Ex. salopettes, moufles…"
                />
                <select
                  value={newItemGroup}
                  onChange={(event) => setNewItemGroup(event.target.value as Group)}
                >
                  {GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addCustomItem}>
                  Ajouter
                </button>
              </div>
            )}

            {groupedGarments.length === 0 ? (
              <div className="empty-state">
                <span>🎉</span>
                <h3>Tout est prêt pour cette taille</h3>
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
              <strong>{shoppingSummary.sizes}</strong>
              <span>tailles concernées</span>
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
                  onChange={(event) => setBabyName(event.target.value)}
                  placeholder="À compléter plus tard"
                  maxLength={30}
                />
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
                <h3>Profil bébé d’hiver</h3>
                <p>
                  Les objectifs suivent les saisons probables de chaque taille. Tu peux
                  toujours les modifier directement dans le dressing.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={restoreWinterTargets}
                >
                  Rétablir les objectifs conseillés
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
                    <h3>Catégories du dressing</h3>
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
        Sauvegarde automatique locale · Petit Dressing v0.3
      </footer>
    </main>
  );
}
