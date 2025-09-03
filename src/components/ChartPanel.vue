<template>
  <div class="rounded-2xl border bg-white p-4 shadow-sm">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold">Two-Country Comparison</h3>
      <div class="text-xs text-slate-500">
        <span class="mr-2"
          >A: <b>{{ countryAName }}</b></span
        >
        <span
          >B: <b>{{ countryBName }}</b></span
        >
      </div>
    </div>

    <div
      ref="chartEl"
      class="mt-3 h-[360px] rounded-xl border bg-slate-50"
    ></div>

    <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
      <span>Hover to see values • Scroll/drag to zoom/pan</span>
      <div class="flex items-center gap-2">
        <button
          @click="resetZoom"
          class="rounded-lg border px-2 py-1 hover:bg-slate-50"
        >
          Reset Zoom
        </button>
        <button
          @click="$emit('export')"
          class="rounded-lg border px-2 py-1 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

const props = defineProps({
  // İKİ ÜLKE için ayrı diziler
  tempA: Array,
  precipA: Array,
  agriA: Array,
  tempB: Array,
  precipB: Array,
  agriB: Array,
  countryAName: { type: String, default: "A" },
  countryBName: { type: String, default: "B" },
  normalize: { type: Boolean, default: false }, // Index-100
  movingAvg: { type: Boolean, default: false }, // 12-ay MA
});

const chartEl = ref(null);
let chart;

// helpers
const toPairs = (arr = []) =>
  (arr || []).map((d) => [new Date(d.date).getTime(), d.value]);
function ma(arr, win = 12) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - win + 1);
    const slice = arr.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v[1], 0) / slice.length;
    out.push([arr[i][0], +avg.toFixed(3)]);
  }
  return out;
}
function index100(arr) {
  if (!arr?.length) return arr;
  const base = arr[0][1];
  if (!isFinite(base) || base === 0) return arr;
  return arr.map(([t, v]) => [t, +((v / base) * 100).toFixed(3)]);
}
function prep(arr) {
  let a = toPairs(arr);
  if (props.movingAvg) a = ma(a);
  if (props.normalize) a = index100(a);
  return a;
}

function render() {
  if (!chart) return;
  chart.setOption(
    {
      grid: { left: 40, right: 24, top: 28, bottom: 40 },
      tooltip: { trigger: "axis", axisPointer: { type: "line" } },
      legend: { top: 0 },
      xAxis: {
        type: "time",
        axisLabel: { formatter: (v) => String(new Date(v).getUTCFullYear()) },
      },
      yAxis: { type: "value", scale: true },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 8 }],
      series: [
        // Ülke A — düz çizgiler
        {
          name: `${props.countryAName} • Temp`,
          type: "line",
          showSymbol: false,
          itemStyle: { color: "#e53935" },
          lineStyle: { width: 2 },
          data: prep(props.tempA),
        },
        {
          name: `${props.countryAName} • Precip`,
          type: "line",
          showSymbol: false,
          itemStyle: { color: "#1e88e5" },
          lineStyle: { width: 2 },
          data: prep(props.precipA),
        },
        {
          name: `${props.countryAName} • Agri%`,
          type: "line",
          showSymbol: false,
          itemStyle: { color: "#43a047" },
          lineStyle: { width: 2 },
          data: prep(props.agriA),
        },
        // Ülke B — kesikli çizgiler
        {
          name: `${props.countryBName} • Temp`,
          type: "line",
          showSymbol: false,
          itemStyle: { color: "#e53935" },
          lineStyle: { width: 2, type: "dashed" },
          data: prep(props.tempB),
        },
        {
          name: `${props.countryBName} • Precip`,
          type: "line",
          showSymbol: false,
          itemStyle: { color: "#1e88e5" },
          lineStyle: { width: 2, type: "dashed" },
          data: prep(props.precipB),
        },
        {
          name: `${props.countryBName} • Agri%`,
          type: "line",
          showSymbol: false,
          itemStyle: { color: "#43a047" },
          lineStyle: { width: 2, type: "dashed" },
          data: prep(props.agriB),
        },
      ],
    },
    { notMerge: true }
  );
}

function resetZoom() {
  chart?.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
}

onMounted(() => {
  chart = echarts.init(chartEl.value);
  render();
  window.addEventListener("resize", () => chart?.resize());
});
onBeforeUnmount(() => {
  chart?.dispose();
});

watch(
  () => [
    props.tempA,
    props.precipA,
    props.agriA,
    props.tempB,
    props.precipB,
    props.agriB,
    props.normalize,
    props.movingAvg,
  ],
  render,
  { deep: true }
);
</script>
