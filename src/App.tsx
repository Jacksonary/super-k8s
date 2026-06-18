import { useLayoutEffect, useRef } from "react";
import { ConfigProvider, App as AntdApp, theme } from "antd";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./components/Layout/MainLayout";
import { ClusterStoreProvider } from "./store/clusterStore";
import { SettingsStoreProvider, useSettings } from "./store/settingsStore";

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const DARK_TOKENS = {
  colorPrimary: "#4d8bf0",
  colorBgBase: "#0d1117",
  colorBgLayout: "#0d1117",
  colorBgContainer: "#11161d",
  colorBgElevated: "#161b22",
  colorBorder: "#1f242c",
  colorBorderSecondary: "#1f242c",
  borderRadius: 6,
  fontFamily: FONT_FAMILY,
};

const LIGHT_TOKENS = {
  colorPrimary: "#326ce5",
  colorBgLayout: "#f5f7fa",
  colorBgContainer: "#ffffff",
  colorBgElevated: "#ffffff",
  colorBorder: "#e5e7eb",
  colorBorderSecondary: "#eef0f3",
  borderRadius: 6,
  fontFamily: FONT_FAMILY,
};

const MENU_DARK_OVERRIDE = {
  darkItemBg: "#0a0e14",
  darkSubMenuItemBg: "#0a0e14",
  darkItemSelectedBg: "rgba(77, 139, 240, 0.16)",
  darkItemHoverBg: "rgba(77, 139, 240, 0.08)",
};

const MENU_LIGHT_OVERRIDE = {
  itemBg: "#ffffff",
  subMenuItemBg: "#ffffff",
  itemSelectedBg: "rgba(50, 108, 229, 0.10)",
  itemHoverBg: "rgba(0, 0, 0, 0.04)",
  itemSelectedColor: "#326ce5",
};

function ThemedApp() {
  const { config } = useSettings();
  const isDark = config.theme !== "light";
  const firstRender = useRef(true);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const root = document.documentElement;
    root.classList.add("theme-switching");
    const timer = window.setTimeout(() => {
      root.classList.remove("theme-switching");
    }, 250);
    return () => {
      window.clearTimeout(timer);
      root.classList.remove("theme-switching");
    };
  }, [isDark]);

  const antTheme = {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: isDark ? DARK_TOKENS : LIGHT_TOKENS,
    components: {
      Layout: {
        siderBg: isDark ? "#0a0e14" : "#ffffff",
        headerBg: isDark ? "#0d1117" : "#ffffff",
        bodyBg: isDark ? "#0d1117" : "#f5f7fa",
      },
      Menu: isDark ? MENU_DARK_OVERRIDE : MENU_LIGHT_OVERRIDE,
    },
  };

  return (
    <ConfigProvider theme={antTheme}>
      <AntdApp>
        <ClusterStoreProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/*" element={<MainLayout />} />
            </Routes>
          </BrowserRouter>
        </ClusterStoreProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <SettingsStoreProvider>
      <ThemedApp />
    </SettingsStoreProvider>
  );
}
