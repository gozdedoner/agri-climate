import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import "leaflet/dist/leaflet.css";
createApp(App).mount("#app");

console.log(
  "A lens:",
  seriesA.value.temp.length,
  seriesA.value.precip.length,
  seriesA.value.agri.length
);
console.log(
  "B lens:",
  seriesB.value.temp.length,
  seriesB.value.precip.length,
  seriesB.value.agri.length
);
