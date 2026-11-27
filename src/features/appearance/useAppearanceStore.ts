import { create } from "zustand";
import {
  initialAppTheme,
  initialMotion,
  type AppTheme,
  type MotionPreference,
} from "../../lib/appearance";
import { loadSettings, saveSettings } from "../../lib/storage/db";

const settings = loadSettings();

type AppearanceState = {
  theme: AppTheme;
  motion: MotionPreference;
  setTheme: (theme: AppTheme) => void;
  setMotion: (motion: MotionPreference) => void;
};

export const useAppearance = create<AppearanceState>((set) => ({
  theme: initialAppTheme(settings),
  motion: initialMotion(settings),
  setTheme: (theme) => {
    set({ theme });
    saveSettings({ appTheme: theme });
  },
  setMotion: (motion) => {
    set({ motion });
    saveSettings({ motion });
  },
}));
