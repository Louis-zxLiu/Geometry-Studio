export type ThemeId = "moon" | "warm" | "cyan" | "black";

export type ThemeSeed = {
  id: ThemeId;
  label: string;
  preview: string;
  bg: string;
  sidebar: string;
  main: string;
  ink: string;
  smoke: string;
  accent: string;
  dark: boolean;
};

export const themeSeeds: ThemeSeed[] = [
  {
    id: "moon",
    label: "月白",
    preview: "#f7f8f7",
    bg: "#f7f8f7",
    sidebar: "#f9f8f7",
    main: "#ffffff",
    ink: "#2c2c2c",
    smoke: "#999999",
    accent: "#eeeeee",
    dark: false,
  },
  {
    id: "warm",
    label: "暖阳素纸",
    preview: "#fef8ec",
    bg: "#f5f0e1",
    sidebar: "#f2ead3",
    main: "#fef8ec",
    ink: "#433422",
    smoke: "#948675",
    accent: "#e8dfca",
    dark: false,
  },
  {
    id: "cyan",
    label: "青蓝莫兰迪",
    preview: "#e0e8e8",
    bg: "#e0e8e8",
    sidebar: "#d0dbdb",
    main: "#f2f7f7",
    ink: "#3d4a4a",
    smoke: "#8a9a9a",
    accent: "#c5d1d1",
    dark: false,
  },
  {
    id: "black",
    label: "玄武墨黑",
    preview: "#1a1a1a",
    bg: "#1a1a1a",
    sidebar: "#242424",
    main: "#121212",
    ink: "#d1d1d1",
    smoke: "#666666",
    accent: "#333333",
    dark: true,
  },
];

export const defaultThemeId: ThemeId = "moon";
