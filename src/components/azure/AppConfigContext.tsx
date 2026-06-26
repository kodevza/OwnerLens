import { createContext, useContext } from "react";

import { appConfig, type AppConfig } from "../../core/config";

const AppConfigContext = createContext<AppConfig>(appConfig);

export const AppConfigProvider = AppConfigContext.Provider;

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext);
}
