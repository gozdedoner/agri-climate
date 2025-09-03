<template>
  <div class="rounded-2xl border bg-white p-4 shadow-sm">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold">Choropleth Map (Agri%)</h3>
      <div class="text-xs text-slate-500">Leaflet</div>
    </div>

    <!-- Height garantili -->
    <div
      ref="mapEl"
      class="mt-3 rounded-xl overflow-hidden"
      :style="{ height: typeof height === 'number' ? `${height}px` : height }"
    ></div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import L from "leaflet";

/**
 * Props
 * - geojson: FeatureCollection (feature.properties: { name, agriPercent, temp, precip })
 * - height: px (number) veya CSS string (örn. "50vh")
 * - tileUrl / tileAttribution: istersen özelleştir
 */
const props = defineProps({
  geojson: { type: Object, default: () => null },
  height: { type: [Number, String], default: 320 },
  tileUrl: {
    type: String,
    default: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  tileAttribution: {
    type: String,
    default: "&copy; OpenStreetMap contributors",
  },
});

const mapEl = ref(null);
let map, layer, ro;

function getColor(d) {
  return d > 60 ? "#1b5e20"
       : d > 40 ? "#43a047"
       : d > 20 ? "#81c784"
                : "#c8e6c9";
}

function style(f) {
  const v = f?.properties?.agriPercent ?? 0;
  return {
    fillColor: getColor(v),
    weight: 0.8,
    opacity: 1,
    color: "#ffffff",
    fillOpacity: 0.75,
  };
}

function onEachFeature(feature, lyr) {
  const p = feature.properties || {};
  const html = `
    <div style="font-size:12px">
      <strong>${p.name ?? "—"}</strong><br/>
      🌡️ Temp: <b style="color:#e53935">${p.temp ?? "—"}</b> °C<br/>
      🌧️ Precip: <b style="color:#1e88e5">${p.precip ?? "—"}</b> mm<br/>
      🌱 Agri%: <b style="color:#43a047">${p.agriPercent ?? "—"}%</b>
    </div>`;
  lyr.bindTooltip(html, { sticky: true });
}

function render() {
  if (!map) return;
  if (layer) layer.remove();
  if (props.geojson) {
    layer = L.geoJSON(props.geojson, { style, onEachFeature }).addTo(map);
    try {
      map.fitBounds(layer.getBounds(), { padding: [16, 16] });
    } catch {}
  }
}

onMounted(() => {
  map = L.map(mapEl.value, { zoomControl: true });
  L.tileLayer(props.tileUrl, { attribution: props.tileAttribution }).addTo(map);
  map.setView([20, 0], 2);
  render();

  // İlk yükleme ve layout değişimlerinde boyutu düzelt
  setTimeout(() => { try { map.invalidateSize() } catch {} }, 0);
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => { try { map.invalidateSize() } catch {} });
    ro.observe(mapEl.value);
  }
});

onBeforeUnmount(() => {
  try { ro?.disconnect?.() } catch {}
  try { map?.remove() } catch {}
});

// GeoJSON değişince yeniden çiz
watch(() => props.geojson, render, { deep: true });
</script>

<style>
/* Leaflet CSS'yi globalde import et:
   import 'leaflet/dist/leaflet.css'  (src/main.js | src/main.ts) */
</style>
