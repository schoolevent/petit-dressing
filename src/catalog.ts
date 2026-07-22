export const CLOTHING_SIZES = [
  "Naissance",
  "1 mois",
  "3 mois",
  "6 mois",
  "9 mois",
  "12 mois",
  "18 mois",
  "24 mois",
] as const;

export const ACCESSORIES_SECTION = "Accessoires" as const;
export const INVENTORY_SECTIONS = [ACCESSORIES_SECTION, ...CLOTHING_SIZES] as const;

export type ClothingSize = (typeof CLOTHING_SIZES)[number];
export type InventorySection = (typeof INVENTORY_SECTIONS)[number];

export const CLOTHING_GROUPS = [
  "Dodo",
  "Essentiels",
  "Tenues",
  "Extérieur",
  "Autres",
] as const;

export const ACCESSORY_GROUPS = ["Repas", "Bain", "Soin", "Autres"] as const;
export const ALL_GROUPS = Array.from(
  new Set([...CLOTHING_GROUPS, ...ACCESSORY_GROUPS]),
) as GarmentGroup[];

export type ClothingGroup = (typeof CLOTHING_GROUPS)[number];
export type AccessoryGroup = (typeof ACCESSORY_GROUPS)[number];
export type GarmentGroup = ClothingGroup | AccessoryGroup;

export type CatalogGarment = {
  id: string;
  key: string;
  label: string;
  icon: string;
  group: GarmentGroup;
  size: InventorySection;
  quantity: number;
  target: number;
  custom?: boolean;
  hidden?: boolean;
};

export type CatalogTemplate = {
  key: string;
  label: string;
  icon: string;
  group: GarmentGroup;
  targets: Record<InventorySection, number>;
};

export type AccessoryMove = {
  sourceId: string;
  destinationKey: AccessoryTemplateKey;
};

export type AccessoryMigrationCandidate = {
  sourceId: string;
  sourceLabel: string;
  sourceSection: InventorySection;
  quantity: number;
  destinationKey: AccessoryTemplateKey;
  destinationLabel: string;
  destinationIcon: string;
};

export const SECTION_SUBTITLES: Record<InventorySection, string> = {
  Accessoires: "Pour tous les âges",
  Naissance: "Plein hiver",
  "1 mois": "Hiver",
  "3 mois": "Fin d’hiver",
  "6 mois": "Printemps",
  "9 mois": "Été",
  "12 mois": "Hiver suivant",
  "18 mois": "Été suivant",
  "24 mois": "Hiver suivant",
};

function clothingTargets(
  naissance: number,
  one: number,
  three: number,
  six: number,
  nine: number,
  twelve: number,
  eighteen: number,
  twentyFour: number,
): Record<InventorySection, number> {
  return {
    Accessoires: 0,
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

function accessoryTarget(target: number): Record<InventorySection, number> {
  return Object.fromEntries(
    INVENTORY_SECTIONS.map((section) => [
      section,
      section === ACCESSORIES_SECTION ? target : 0,
    ]),
  ) as Record<InventorySection, number>;
}

export const CLOTHING_TEMPLATES: CatalogTemplate[] = [
  {
    key: "pyjama-velours",
    label: "Pyjamas velours",
    icon: "🌙",
    group: "Dodo",
    targets: clothingTargets(7, 8, 6, 3, 1, 5, 1, 5),
  },
  {
    key: "pyjama-coton",
    label: "Pyjamas coton",
    icon: "☁️",
    group: "Dodo",
    targets: clothingTargets(2, 3, 4, 5, 6, 3, 6, 3),
  },
  {
    key: "gigoteuse-chaude",
    label: "Gigoteuses TOG 2,5",
    icon: "🛏️",
    group: "Dodo",
    targets: clothingTargets(2, 2, 2, 1, 0, 2, 0, 2),
  },
  {
    key: "gigoteuse-legere",
    label: "Gigoteuses légères",
    icon: "🪽",
    group: "Dodo",
    targets: clothingTargets(0, 0, 1, 2, 2, 1, 2, 1),
  },
  {
    key: "body-long",
    label: "Bodies manches longues",
    icon: "👕",
    group: "Essentiels",
    targets: clothingTargets(7, 8, 7, 5, 2, 6, 3, 6),
  },
  {
    key: "body-short",
    label: "Bodies manches courtes",
    icon: "👚",
    group: "Essentiels",
    targets: clothingTargets(0, 1, 2, 5, 7, 3, 7, 3),
  },
  {
    key: "chaussettes",
    label: "Paires de chaussettes",
    icon: "🧦",
    group: "Essentiels",
    targets: clothingTargets(4, 5, 6, 6, 6, 6, 6, 6),
  },
  {
    key: "pantalon",
    label: "Pantalons",
    icon: "👖",
    group: "Tenues",
    targets: clothingTargets(2, 3, 4, 5, 5, 5, 5, 5),
  },
  {
    key: "haut",
    label: "Hauts",
    icon: "🧸",
    group: "Tenues",
    targets: clothingTargets(2, 3, 4, 5, 6, 5, 6, 5),
  },
  {
    key: "pull-gilet",
    label: "Pulls et gilets",
    icon: "🧶",
    group: "Tenues",
    targets: clothingTargets(2, 3, 3, 3, 1, 3, 1, 3),
  },
  {
    key: "ensemble",
    label: "Ensembles / tenues",
    icon: "✨",
    group: "Tenues",
    targets: clothingTargets(2, 3, 3, 4, 4, 4, 4, 4),
  },
  {
    key: "combinaison",
    label: "Manteau / combinaison",
    icon: "🧥",
    group: "Extérieur",
    targets: clothingTargets(1, 1, 1, 1, 0, 1, 0, 1),
  },
  {
    key: "bonnet-chaud",
    label: "Bonnets chauds",
    icon: "🧢",
    group: "Extérieur",
    targets: clothingTargets(2, 2, 1, 0, 0, 2, 0, 2),
  },
  {
    key: "bonnet-leger",
    label: "Bonnets légers / soleil",
    icon: "☀️",
    group: "Extérieur",
    targets: clothingTargets(1, 1, 1, 2, 2, 1, 2, 1),
  },
  {
    key: "chaussons",
    label: "Chaussons",
    icon: "🐾",
    group: "Extérieur",
    targets: clothingTargets(1, 1, 1, 1, 1, 1, 1, 1),
  },
];

export const ACCESSORY_TEMPLATES = [
  {
    key: "accessory-bavoir",
    label: "Bavoirs",
    icon: "🍪",
    group: "Repas",
    targets: accessoryTarget(8),
  },
  {
    key: "accessory-bavette",
    label: "Bavettes / bavoirs repas",
    icon: "🥣",
    group: "Repas",
    targets: accessoryTarget(4),
  },
  {
    key: "accessory-tetra",
    label: "Tétras / langes coton",
    icon: "🧺",
    group: "Soin",
    targets: accessoryTarget(10),
  },
  {
    key: "accessory-cape-bain",
    label: "Capes de bain",
    icon: "🛁",
    group: "Bain",
    targets: accessoryTarget(2),
  },
] as const satisfies readonly CatalogTemplate[];

export type AccessoryTemplateKey = (typeof ACCESSORY_TEMPLATES)[number]["key"];

export const ALL_TEMPLATES: CatalogTemplate[] = [
  ...CLOTHING_TEMPLATES,
  ...ACCESSORY_TEMPLATES,
];

const ACCESSORY_TEMPLATE_BY_KEY = new Map(
  ACCESSORY_TEMPLATES.map((template) => [template.key, template]),
);

const LEGACY_KEY_MAP: Partial<Record<string, string>> = {
  "pyjama-velours": "pyjama",
  "gigoteuse-chaude": "gigoteuse",
  combinaison: "manteau",
  "bonnet-chaud": "bonnet",
};

export const ICON_LIBRARY = [
  "🍼",
  "🧸",
  "👕",
  "👚",
  "👖",
  "🧦",
  "🧢",
  "🧤",
  "🧥",
  "👗",
  "🩳",
  "👟",
  "🥿",
  "🛏️",
  "🌙",
  "☁️",
  "🪽",
  "🧶",
  "✨",
  "🛁",
  "🧼",
  "🧴",
  "🪥",
  "🧺",
  "🧻",
  "🥣",
  "🍽️",
  "🍪",
  "🥛",
  "🫧",
  "🧷",
  "🎀",
  "👜",
  "🚗",
  "☀️",
  "❄️",
  "🌧️",
  "🐾",
  "💛",
  "📦",
] as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suggestIcon(label: string) {
  const text = normalizeText(label);

  const rules: Array<[RegExp, string]> = [
    [/biberon|lait/, "🍼"],
    [/bavette|repas|assiette|cuillere/, "🥣"],
    [/bavoir/, "🍪"],
    [/tetra|lange|mousseline/, "🧺"],
    [/cape.*bain|sortie.*bain|serviette/, "🛁"],
    [/gant/, "🧤"],
    [/body|t shirt|tee shirt|haut/, "👕"],
    [/robe/, "👗"],
    [/pantalon|jean/, "👖"],
    [/short/, "🩳"],
    [/chaussette/, "🧦"],
    [/chausson|chaussure|basket/, "👟"],
    [/bonnet|casquette|chapeau/, "🧢"],
    [/manteau|veste|combinaison/, "🧥"],
    [/moufle|gant/, "🧤"],
    [/pyjama|nuit/, "🌙"],
    [/gigoteuse|lit|drap/, "🛏️"],
    [/pull|gilet|laine/, "🧶"],
    [/bain|savon|shampoing/, "🫧"],
    [/creme|lotion|huile/, "🧴"],
    [/sac/, "👜"],
    [/voiture|siege auto/, "🚗"],
    [/couverture|plaid/, "☁️"],
    [/peluche|doudou|jouet/, "🧸"],
  ];

  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "🍼";
}

export function groupsForSection(section: InventorySection): GarmentGroup[] {
  return section === ACCESSORIES_SECTION
    ? [...ACCESSORY_GROUPS]
    : [...CLOTHING_GROUPS];
}

function templateId(section: InventorySection, key: string) {
  return `${section}-${key}`;
}

export function makeInitialGarments(): CatalogGarment[] {
  const clothes = CLOTHING_SIZES.flatMap((size) =>
    CLOTHING_TEMPLATES.map((item) => ({
      id: templateId(size, item.key),
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

  const accessories = ACCESSORY_TEMPLATES.map((item) => ({
    id: templateId(ACCESSORIES_SECTION, item.key),
    key: item.key,
    label: item.label,
    icon: item.icon,
    group: item.group,
    size: ACCESSORIES_SECTION,
    quantity: 0,
    target: item.targets[ACCESSORIES_SECTION],
    hidden: false,
  }));

  return [...clothes, ...accessories];
}

export function normalizeGarment(value: unknown): CatalogGarment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CatalogGarment>;

  if (
    typeof item.id !== "string" ||
    typeof item.key !== "string" ||
    typeof item.label !== "string" ||
    typeof item.icon !== "string" ||
    typeof item.size !== "string" ||
    !INVENTORY_SECTIONS.includes(item.size as InventorySection) ||
    typeof item.quantity !== "number" ||
    typeof item.target !== "number"
  ) {
    return null;
  }

  const safeGroup = ALL_GROUPS.includes(item.group as GarmentGroup)
    ? (item.group as GarmentGroup)
    : "Autres";

  return {
    id: item.id,
    key: item.key,
    label: item.label.slice(0, 80),
    icon: item.icon.slice(0, 12) || "🍼",
    group: safeGroup,
    size: item.size as InventorySection,
    quantity: Math.max(0, Math.round(item.quantity)),
    target: Math.max(0, Math.round(item.target)),
    custom: Boolean(item.custom),
    hidden: Boolean(item.hidden),
  };
}

export function accessoryDestinationKey(
  item: Pick<CatalogGarment, "key" | "label" | "size">,
): AccessoryTemplateKey | null {
  if (item.size === ACCESSORIES_SECTION) return null;

  const key = normalizeText(item.key);
  const label = normalizeText(item.label);
  const text = `${key} ${label}`;

  if (/bavette|bavoir repas|bavoir plastifie/.test(text)) {
    return "accessory-bavette";
  }
  if (key === "bavoir" || /\bbavoir/.test(text)) {
    return "accessory-bavoir";
  }
  if (/\btetra\b|\btetras\b|\blange\b|\blanges\b|mousseline/.test(text)) {
    return "accessory-tetra";
  }
  if (/cape de bain|cape bain|sortie de bain/.test(text)) {
    return "accessory-cape-bain";
  }

  return null;
}

export function upgradeGarments(existing: unknown[]): CatalogGarment[] {
  const cleanExisting = existing
    .map(normalizeGarment)
    .filter((item): item is CatalogGarment => item !== null);

  const byId = new Map(cleanExisting.map((item) => [item.id, item]));
  const fresh = makeInitialGarments().map((item) => {
    const exact = byId.get(item.id);
    if (exact) {
      return {
        ...item,
        label: exact.label,
        icon: exact.icon,
        group: exact.group,
        quantity: exact.quantity,
        target: exact.target,
        hidden: exact.hidden,
      };
    }

    const legacyKey = LEGACY_KEY_MAP[item.key];
    if (legacyKey && item.size !== ACCESSORIES_SECTION) {
      const legacy = byId.get(templateId(item.size, legacyKey));
      if (legacy) {
        return {
          ...item,
          quantity: legacy.quantity,
        };
      }
    }

    return item;
  });

  const freshIds = new Set(fresh.map((item) => item.id));
  const preserved = cleanExisting.filter((item) => {
    if (freshIds.has(item.id)) return false;
    if (item.custom) return true;

    const destination = accessoryDestinationKey(item);
    return destination !== null && item.quantity > 0;
  });

  return [...fresh, ...preserved];
}

export function upgradeState(value: unknown): {
  babyName: string;
  garments: CatalogGarment[];
} {
  if (!value || typeof value !== "object") {
    return { babyName: "", garments: makeInitialGarments() };
  }

  const state = value as { babyName?: unknown; garments?: unknown };
  return {
    babyName: typeof state.babyName === "string" ? state.babyName.slice(0, 30) : "",
    garments: Array.isArray(state.garments)
      ? upgradeGarments(state.garments)
      : makeInitialGarments(),
  };
}

export function getAccessoryMigrationCandidates(
  garments: CatalogGarment[],
): AccessoryMigrationCandidate[] {
  return garments.flatMap((item) => {
    const destinationKey = accessoryDestinationKey(item);
    if (!destinationKey || item.quantity <= 0) return [];

    const destination = ACCESSORY_TEMPLATE_BY_KEY.get(destinationKey);
    if (!destination) return [];

    return [
      {
        sourceId: item.id,
        sourceLabel: item.label,
        sourceSection: item.size,
        quantity: item.quantity,
        destinationKey,
        destinationLabel: destination.label,
        destinationIcon: destination.icon,
      },
    ];
  });
}

export function applyAccessoryMoves(
  garments: CatalogGarment[],
  moves: AccessoryMove[],
): CatalogGarment[] {
  let result = upgradeGarments(garments);

  for (const move of moves) {
    const source = result.find((item) => item.id === move.sourceId);
    const destinationTemplate = ACCESSORY_TEMPLATE_BY_KEY.get(move.destinationKey);
    if (!source || !destinationTemplate || source.size === ACCESSORIES_SECTION) {
      continue;
    }

    const destinationId = templateId(ACCESSORIES_SECTION, move.destinationKey);
    result = result.map((item) =>
      item.id === destinationId
        ? {
            ...item,
            quantity: item.quantity + source.quantity,
            target: Math.max(item.target, source.target),
          }
        : item,
    );
    result = result.filter((item) => item.id !== source.id);
  }

  return upgradeGarments(result);
}
