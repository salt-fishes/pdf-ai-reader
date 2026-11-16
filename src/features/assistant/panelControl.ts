import { useAssistant } from "./useAssistantStore";

type Control = {
  minimize: () => void;
  close: () => void;
};

const fallback: Control = {
  minimize: () => useAssistant.getState().minimize(),
  close: () => useAssistant.getState().close(),
};

let current: Control = fallback;

export function registerPanelControl(control: Control): () => void {
  current = control;
  return () => {
    if (current === control) current = fallback;
  };
}

export function minimizePanel(): void {
  current.minimize();
}

export function closePanel(): void {
  current.close();
}
