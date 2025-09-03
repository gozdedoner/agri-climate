<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <main class="mx-auto max-w-[1200px] p-4 md:p-6 space-y-4">
      <!-- Controls -->
      <section class="rounded-2xl border bg-white p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold">
            Agri-Climate — Two-Country Comparison
          </h1>
          <div class="text-xs text-slate-500">
            A: <b>{{ countryName(countryA) }}</b> • B:
            <b>{{ countryName(countryB) }}</b>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-12 gap-3">
          <div class="col-span-12 sm:col-span-3">
            <label class="text-xs text-slate-500">Country A</label>
            <select
              v-model="countryA"
              class="mt-1 w-full rounded-lg border px-3 py-2 bg-white"
            >
              <option v-for="c in countries" :key="c.code" :value="c.code">
                {{ c.name }}
              </option>
            </select>
          </div>
          <div class="col-span-12 sm:col-span-3">
            <label class="text-xs text-slate-500">Country B</label>
            <select
              v-model="countryB"
              class="mt-1 w-full rounded-lg border px-3 py-2 bg-white"
            >
              <option v-for="c in countries" :key="c.code" :value="c.code">
                {{ c.name }}
              </option>
            </select>
          </div>
          <div class="col-span-6 sm:col-span-3">
            <label class="text-xs text-slate-500">From (YYYY-MM)</label>
            <input
              v-model="fromStr"
              type="month"
              class="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div class="col-span-6 sm:col-span-3">
            <label class="text-xs text-slate-500">To (YYYY-MM)</label>
            <input
              v-model="toStr"
              type="month"
              class="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-4">
          <label class="flex items-center gap-2 text-sm">
            <input v-model="ui.normalize" type="checkbox" class="h-4 w-4" />
            Normalize (Index-100)
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="ui.movingAvg" type="checkbox" class="h-4 w-4" />
            12-month moving average
          </label>

          <div class="ml-auto flex items-center gap-2">
            <button
              @click="swap"
              class="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
            >
              Swap
            </button>
            <button
              @click="rebuild"
              class="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm hover:bg-emerald-700"
            >
              Update
            </button>
          </div>
        </div>
      </section>

      <!-- Chart -->
      <ChartPanel
        :tempA="seriesA.temp"
        :precipA="seriesA.precip"
        :agriA="seriesA.agri"
        :tempB="seriesB.temp"
        :precipB="seriesB.precip"
        :agriB="seriesB.agri"
        :countryAName="countryName(countryA)"
        :countryBName="countryName(countryB)"
        :normalize="ui.normalize"
        :movingAvg="ui.movingAvg"
      />

      <!-- Map -->
      <MapPanel :geojson="geojson" :height="360" />
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import ChartPanel from "./components/ChartPanel.vue";
import MapPanel from "./components/MapPanel.vue";

// Ülkeler (merkez koordinat & temel bias değerleri)
const countries = [
  {
    code: "TUR",
    name: "Türkiye",
    center: [39, 35],
    bias: { temp: 15, precip: 45, agri: 32 },
  },
  {
    code: "NLD",
    name: "Netherlands",
    center: [52.1, 5.3],
    bias: { temp: 11, precip: 70, agri: 54 },
  },
  {
    code: "USA",
    name: "United States",
    center: [39.8, -98.6],
    bias: { temp: 13, precip: 60, agri: 44 },
  },
  {
    code: "DEU",
    name: "Germany",
    center: [51.2, 10.4],
    bias: { temp: 9, precip: 66, agri: 48 },
  },
];

const countryA = ref("TUR");
const countryB = ref("NLD");
const fromStr = ref("2010-01");
const toStr = ref("2020-12");
const ui = ref({ normalize: false, movingAvg: false });

// İki ülke için ayrı seriler
const seriesA = ref({ temp: [], precip: [], agri: [] });
const seriesB = ref({ temp: [], precip: [], agri: [] });

// Harita için GeoJSON
const geojson = ref({ type: "FeatureCollection", features: [] });

function countryName(code) {
  return countries.find((c) => c.code === code)?.name || code;
}
function swap() {
  const a = countryA.value;
  countryA.value = countryB.value;
  countryB.value = a;
}

// Sentetik aylık veri üretici (gerçek API yerine demo)
function genSeriesOne(fromYm, toYm, bias) {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, 1));
  const end = new Date(Date.UTC(ty, tm - 1, 1));
  const temp = [],
    precip = [],
    agri = [];
  let t = new Date(start),
    i = 0;
  while (t <= end) {
    const m = t.getUTCMonth() + 1;
    const season = Math.sin((2 * Math.PI * m) / 12);
    const d = t.toISOString().slice(0, 10);
    temp.push({
      date: d,
      value: +(bias.temp + 6 * season + 0.05 * i).toFixed(2),
    });
    precip.push({
      date: d,
      value: +Math.max(
        10,
        bias.precip + 25 * Math.cos((2 * Math.PI * m) / 12)
      ).toFixed(2),
    });
    agri.push({
      date: d,
      value: +Math.max(5, bias.agri + 0.01 * i - 0.0005 * i * i).toFixed(2),
    });
    i++;
    t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
  }
  return { temp, precip, agri };
}

// Harita için basit dikdörtgen geometri
const rect = ([lat, lon], dx = 6, dy = 4) => [
  [
    [lon - dx, lat - dy],
    [lon + dx, lat - dy],
    [lon + dx, lat + dy],
    [lon - dx, lat + dy],
    [lon - dx, lat - dy],
  ],
];

function rebuild() {
  const A = countries.find((c) => c.code === countryA.value);
  const B = countries.find((c) => c.code === countryB.value);
  if (!A || !B) return;
  seriesA.value = genSeriesOne(fromStr.value, toStr.value, A.bias);
  seriesB.value = genSeriesOne(fromStr.value, toStr.value, B.bias);

  const last = (a) => a[a.length - 1];
  geojson.value = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: A.name,
          agriPercent: last(seriesA.value.agri)?.value ?? A.bias.agri,
          temp: last(seriesA.value.temp)?.value ?? A.bias.temp,
          precip: last(seriesA.value.precip)?.value ?? A.bias.precip,
        },
        geometry: { type: "Polygon", coordinates: rect(A.center) },
      },
      {
        type: "Feature",
        properties: {
          name: B.name,
          agriPercent: last(seriesB.value.agri)?.value ?? B.bias.agri,
          temp: last(seriesB.value.temp)?.value ?? B.bias.temp,
          precip: last(seriesB.value.precip)?.value ?? B.bias.precip,
        },
        geometry: { type: "Polygon", coordinates: rect(B.center) },
      },
    ],
  };
}

// CSV export (mevcut serileri dışa aktar)
function exportCsv() {
  const rows = [
    ["date", "tempA", "precipA", "agriA", "tempB", "precipB", "agriB"],
  ];
  const len = Math.max(
    seriesA.value.temp.length,
    seriesA.value.precip.length,
    seriesA.value.agri.length,
    seriesB.value.temp.length,
    seriesB.value.precip.length,
    seriesB.value.agri.length
  );
  for (let i = 0; i < len; i++) {
    const d = seriesA.value.temp[i]?.date || seriesB.value.temp[i]?.date || "";
    const ta = seriesA.value.temp[i]?.value ?? "";
    const pa = seriesA.value.precip[i]?.value ?? "";
    const aa = seriesA.value.agri[i]?.value ?? "";
    const tb = seriesB.value.temp[i]?.value ?? "";
    const pb = seriesB.value.precip[i]?.value ?? "";
    const ab = seriesB.value.agri[i]?.value ?? "";
    rows.push([d, ta, pa, aa, tb, pb, ab]);
  }
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agri-climate_${fromStr.value}_${toStr.value}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ilk yükleme + değişikliklerde güncelle
rebuild();
watch([countryA, countryB, fromStr, toStr], rebuild);
</script>
