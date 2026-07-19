export type SyncGarment = {
  id: string;
  key: string;
  label: string;
  icon: string;
  group: string;
  size: string;
  quantity: number;
  target: number;
  custom?: boolean;
  hidden?: boolean;
};

export type SyncState = {
  babyName: string;
  garments: SyncGarment[];
};

export type SyncMutation =
  | { id: string; type: "quantity-delta"; garmentId: string; delta: number }
  | { id: string; type: "target-set"; garmentId: string; target: number }
  | { id: string; type: "baby-name-set"; babyName: string }
  | { id: string; type: "custom-add"; garment: SyncGarment }
  | { id: string; type: "custom-delete"; garmentId: string }
  | { id: string; type: "size-reset"; size: string }
  | { id: string; type: "targets-restore"; targets: Record<string, number> }
  | { id: string; type: "category-rename"; key: string; label: string }
  | { id: string; type: "category-hidden-set"; key: string; hidden: boolean }
  | {
      id: string;
      type: "categories-restore";
      labels: Record<string, string>;
    }
  | { id: string; type: "state-replace"; state: SyncState };

export type StoredMutation = {
  seq: number;
  mutation: SyncMutation;
};

function clampInteger(value: number, minimum = 0) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.round(value));
}

export function applySyncMutation(
  state: SyncState,
  mutation: SyncMutation,
): SyncState {
  switch (mutation.type) {
    case "quantity-delta":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.id === mutation.garmentId
            ? {
                ...item,
                quantity: clampInteger(item.quantity + mutation.delta),
              }
            : item,
        ),
      };

    case "target-set":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.id === mutation.garmentId
            ? { ...item, target: clampInteger(mutation.target) }
            : item,
        ),
      };

    case "baby-name-set":
      return { ...state, babyName: mutation.babyName.slice(0, 30) };

    case "custom-add":
      if (state.garments.some((item) => item.id === mutation.garment.id)) {
        return state;
      }
      return {
        ...state,
        garments: [...state.garments, mutation.garment],
      };

    case "custom-delete":
      return {
        ...state,
        garments: state.garments.filter(
          (item) => item.id !== mutation.garmentId,
        ),
      };

    case "size-reset":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.size === mutation.size ? { ...item, quantity: 0 } : item,
        ),
      };

    case "targets-restore":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.custom || mutation.targets[item.id] === undefined
            ? item
            : { ...item, target: clampInteger(mutation.targets[item.id]) },
        ),
      };

    case "category-rename":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.key === mutation.key && !item.custom
            ? { ...item, label: mutation.label.slice(0, 80) }
            : item,
        ),
      };

    case "category-hidden-set":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.key === mutation.key && !item.custom
            ? { ...item, hidden: mutation.hidden }
            : item,
        ),
      };

    case "categories-restore":
      return {
        ...state,
        garments: state.garments.map((item) =>
          item.custom
            ? item
            : {
                ...item,
                label: mutation.labels[item.key] ?? item.label,
                hidden: false,
              },
        ),
      };

    case "state-replace":
      return {
        babyName: mutation.state.babyName,
        garments: mutation.state.garments,
      };
  }
}
