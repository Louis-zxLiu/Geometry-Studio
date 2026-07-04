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
    sidebar: "#f3f3f1",
    main: "#ffffff",
    ink: "#2c2c2c",
    smoke: "#9c9a94",
    accent: "#e9e7e2",
    dark: false,
  },
  {
    id: "warm",
    label: "暖阳素纸",
    preview: "#fdf8ee",
    bg: "#f6f1e4",
    sidebar: "#f1ead7",
    main: "#fdf8ee",
    ink: "#453728",
    smoke: "#988a79",
    accent: "#e8dfca",
    dark: false,
  },
  {
    id: "cyan",
    label: "青蓝莫兰迪",
    preview: "#e4eaea",
    bg: "#e4eaea",
    sidebar: "#dbe3e3",
    main: "#f4f8f8",
    ink: "#37444a",
    smoke: "#87979a",
    accent: "#cfdada",
    dark: false,
  },
  {
    id: "black",
    label: "玄武墨黑",
    preview: "#1c1c1b",
    bg: "#1c1c1b",
    sidebar: "#1f1e1d",
    main: "#252423",
    ink: "#e6e4df",
    smoke: "#8a8880",
    accent: "#373631",
    dark: true,
  },
];

export const defaultThemeId: ThemeId = "moon";
