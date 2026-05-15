import { createApp } from "vue";
import App from "./App.vue";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components/sidebar.css";
import "./styles/components/topbar.css";
import "./styles/components/editor.css";
import "./styles/components/environment.css";
import "./styles/components/dialog.css";
import "./styles/components/dialog-enter.css";
import "./styles/components/dialog-exit.css";
import "./styles/components/notebook.css";
import "./styles/components/runtime-loading.css";
import "katex/dist/katex.min.css";

createApp(App).mount("#app");
