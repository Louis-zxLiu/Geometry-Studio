import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";

export const HELP_CENTER_URL = "https://tour.5051001.xyz";

export function openHelpCenter() {
  BrowserOpenURL(HELP_CENTER_URL);
}
