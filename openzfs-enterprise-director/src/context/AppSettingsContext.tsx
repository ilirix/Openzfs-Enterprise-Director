import React, { createContext, useContext, useState, useEffect } from 'react';
import { telemetryWorkerService } from '../services/telemetryWorkerService';

export interface AppSettings {
  gpuOffload: boolean;
  rafEnabled: boolean;
  workerOffload: boolean;
  paintContainment: boolean;
  desktopAlerts: boolean;
  autoOpenInfo: boolean;
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  workerStats: ReturnType<typeof telemetryWorkerService.getStats>;
  pingWorker: () => Promise<number>;
}

const defaultSettings: AppSettings = {
  gpuOffload: true,
  rafEnabled: true,
  workerOffload: true,
  paintContainment: true,
  desktopAlerts: true,
  autoOpenInfo: true,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('zfs_app_settings');
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      // ignore
    }
    return defaultSettings;
  });

  const [workerStats, setWorkerStats] = useState(telemetryWorkerService.getStats());

  // Keep telemetryWorkerService synced with settings
  useEffect(() => {
    const isOffloadActive = settings.gpuOffload && settings.workerOffload;
    telemetryWorkerService.setOffloadEnabled(isOffloadActive);
  }, [settings.gpuOffload, settings.workerOffload]);

  // Periodic poll of worker stats for live profiler
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkerStats(telemetryWorkerService.getStats());
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem('zfs_app_settings', JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  const pingWorker = async (): Promise<number> => {
    const t0 = performance.now();
    await telemetryWorkerService.ping();
    const t1 = performance.now();
    const roundtrip = Number((t1 - t0).toFixed(2));
    setWorkerStats(telemetryWorkerService.getStats());
    return roundtrip;
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        workerStats,
        pingWorker,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    return {
      settings: defaultSettings,
      updateSettings: () => {},
      workerStats: telemetryWorkerService.getStats(),
      pingWorker: async () => 0.15,
    };
  }
  return ctx;
};
