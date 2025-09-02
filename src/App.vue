<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import * as echarts from 'echarts'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ——— Ülkeler (ISO3 + merkez)
const countries = [
  { iso3:'TUR', name:'Turkey',           lat:39.93,  lon:32.85,  zoom:6 },
  { iso3:'GBR', name:'United Kingdom',   lat:52.35,  lon:-1.17,  zoom:6 },
  { iso3:'USA', name:'United States',    lat:39.50,  lon:-98.35, zoom:4 },
  { iso3:'BRA', name:'Brazil',           lat:-10.81, lon:-52.97, zoom:4 },
  { iso3:'IND', name:'India',            lat:22.59,  lon:79.36,  zoom:5 },
  { iso3:'EGY', name:'Egypt',            lat:26.82,  lon:30.80,  zoom:5 },
]
const selectedA = ref(countries[0])
const selectedB = ref(countries[1])

// ——— Modlar
const metric   = ref('temp')     // 'temp' | 'precip' | 'agri'
const index100 = ref(false)      // pencere başına göre 100'e endeksle

// ——— Arama
const queryA = ref(''); const queryB = ref('')
const filteredA = computed(() => {
  const q = queryA.value.trim().toLowerCase()
  return q ? countries.filter(c => c.name.toLowerCase().includes(q)) : countries
})
const filteredB = computed(() => {
  const q = queryB.value.trim().toLowerCase()
  return q ? countries.filter(c => c.name.toLowerCase().includes(q)) : countries
})

// ——— Refs & durum
const map = ref(null);   let mapInstance = null
const chart = ref(null); let chartInstance = null
const loading = ref(false)
const statusMsg = ref('Ready')

// ——— A ekseni (YYYY-MM) ve seriler
const xLabels = ref([])      // A'nın aylık ekseni
const tempA   = ref([])      // NASA A: T2M
const precA   = ref([])      // NASA A: PRECTOT
const agriA   = ref([])      // WB A: AG.LND.AGRI.ZS (A eksenine yıllık eşleştirme)
const tempMAA = ref([])      // A: 12M
const precMAA = ref([])      // A: 12M
const agriByYearA = ref(new Map())

// ——— B serileri (A eksenine hizalanmış)
const tempB   = ref([])
const precB   = ref([])
const agriB   = ref([])
const tempMAB = ref([])
const precMAB = ref([])
const agriByYearB = ref(new Map())

// ——— Korelasyonlar (grafik penceresine göre)
const corrsA = ref({ temp: null, precip: null, nTemp: 0, nPrecip: 0 })
const corrsB = ref({ temp: null, precip: null, nTemp: 0, nPrecip: 0 })

// ——— Son dataZoom penceresi (index-100 için)
let lastWindow = { i0: 0, i1: 0 }

// ——— Yardımcılar
function yyyymm(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); return `${y}${m}` }
function previousMonthYYYYMM(){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return yyyymm(d) }
function latestAgriFrom(arr){ for(let i=arr.length-1;i>=0;i--){ const v=arr[i]; if(v!=null) return v } return null }

// TTL'li cache
async function fetchJSONWithCache(key, url, ttlMs){
  try{
    const now = Date.now()
    const raw = localStorage.getItem(key)
    if(raw){
      const { ts, data } = JSON.parse(raw)
      if(now - ts < ttlMs) return data
    }
    const res = await fetch(url)
    const data = await res.json()
    localStorage.setItem(key, JSON.stringify({ ts: now, data }))
    return data
  }catch{
    const res = await fetch(url)
    return res.json()
  }
}

// 12 aylık hareketli ortalama
function movingAverage(values, period = 12) {
  const out = []; let sum = 0, count = 0; const q = []
  for (let i=0; i<values.length; i++) {
    const v = Number(values[i]); if (Number.isFinite(v)) { sum += v; count++ }
    q.push(v)
    if (q.length > period) {
      const old = q.shift(); if (Number.isFinite(old)) { sum -= old; count-- }
    }
    out.push(q.length === period && count > 0 ? +(sum / count).toFixed(2) : null)
  }
  return out
}

// Pearson r
function pearson(xArr, yArr) {
  const xs=[], ys=[]
  for (let i=0;i<xArr.length;i++){
    const x=xArr[i], y=yArr[i]
    if(Number.isFinite(x) && Number.isFinite(y)){ xs.push(x); ys.push(y) }
  }
  const n = xs.length; if(n<3) return { r:null, n }
  const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n
  let num=0, dx=0, dy=0
  for(let i=0;i<n;i++){ const vx=xs[i]-mx, vy=ys[i]-my; num+=vx*vy; dx+=vx*vx; dy+=vy*vy }
  const den = Math.sqrt(dx*dy); return { r: den? +(num/den).toFixed(3):null, n }
}

// Aylıkları yıllığa ortalama Map<year, mean>
function monthlyToAnnualMean(labelsYYYYMM, values){
  const byYear = new Map()
  for(let i=0;i<labelsYYYYMM.length;i++){
    const y = labelsYYYYMM[i].slice(0,4)
    const v = Number(values[i]); if(!byYear.has(y)) byYear.set(y, [])
    if(Number.isFinite(v)) byYear.get(y).push(v)
  }
  const out = new Map()
  for(const [y, arr] of byYear){ if(arr.length) out.set(y, arr.reduce((a,b)=>a+b,0)/arr.length) }
  return out
}

// ——— World Bank (yıllık tarım %)
async function fetchWorldBank(iso3){
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/AG.LND.AGRI.ZS?format=json`
  const data = await fetchJSONWithCache(`wb:${iso3}`, url, 30*24*3600*1000)
  const arr = Array.isArray(data?.[1]) ? data[1].slice().reverse() : []
  return arr.map(d => ({ date: d.date, value: d.value }))
}

// ——— NASA POWER (aylık nokta)
async function fetchNasa(lat, lon){
  const start='199001', end=previousMonthYYYYMM()
  const params = new URLSearchParams({
    parameters:'T2M,PRECTOT', start, end,
    latitude: lat, longitude: lon, community:'AG', format:'JSON'
  })
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?${params}`
  const j = await fetchJSONWithCache(`nasa:${lat},${lon}:${end}`, url, 7*24*3600*1000)
  const p = j?.properties?.parameter || {}
  const t2m = p.T2M || {}, pre = p.PRECTOT || {}
  const rows = Object.keys(t2m).sort().map(k => ({ yyyymm:k, t2m:t2m[k], pre:pre[k] }))
  return rows
}

// ——— B'yi A eksenine hizala
function alignToAxis(axisYYYYMM /* like 'YYYY-MM' */, rows /* {yyyymm,t2m,pre}[] */){
  const mapT = new Map(rows.map(r => [r.yyyymm.slice(0,4)+'-'+r.yyyymm.slice(4), r.t2m]))
  const mapP = new Map(rows.map(r => [r.yyyymm.slice(0,4)+'-'+r.yyyymm.slice(4), r.pre]))
  return {
    t: axisYYYYMM.map(lbl => mapT.get(lbl) ?? null),
    p: axisYYYYMM.map(lbl => mapP.get(lbl) ?? null)
  }
}

// ——— Index-100 (i0..i1 penceresinin başına göre)
function firstFiniteInRange(arr, i0, i1){
  for(let i=i0;i<=i1;i++){ const v=Number(arr[i]); if(Number.isFinite(v)) return v }
  return null
}
function indexRange(arr, base){
  if(!Number.isFinite(base) || base===0) return arr.slice()
  return arr.map(v => Number.isFinite(v) ? +(100 * v / base).toFixed(2) : null)
}

// ——— Grafik
function buildSeriesAndRender() {
  if(!chartInstance){
    chartInstance = echarts.init(chart.value)
    window.addEventListener('resize', ()=>chartInstance?.resize())

    // dataZoom değişince: pencereyi ve index-100 serilerini yenile + korelasyonu güncelle
    chartInstance.on('dataZoom', () => {
      const opt = chartInstance.getOption()
      const dz = (opt.dataZoom && opt.dataZoom[0]) || {}
      const start = (dz.start ?? 0) / 100
      const end   = (dz.end   ?? 100) / 100
      const n = xLabels.value.length
      lastWindow.i0 = Math.max(0, Math.floor(start * (n-1)))
      lastWindow.i1 = Math.max(lastWindow.i0, Math.floor(end * (n-1)))
      // sadece serileri güncelle
      chartInstance.setOption(seriesOption(), { replaceMerge: ['series','yAxis','legend'] })
      recalcCorrForWindow(lastWindow.i0, lastWindow.i1)
    })
  }
  // ilk çağrıda lastWindow set et
  lastWindow.i0 = 0
  lastWindow.i1 = xLabels.value.length-1
  chartInstance.setOption(fullOption())        // ilk çizim
  recalcCorrForWindow(lastWindow.i0, lastWindow.i1)
}

function fullOption(){
  return {
    tooltip:{ trigger:'axis' },
    legend:{ type:'scroll', top:10 },
    grid:{ left:50, right:60, top:60, bottom:60 },
    xAxis:{ type:'category', data:xLabels.value },
    yAxis: yAxesOption(),
    series: seriesOption(),
    dataZoom:[{type:'inside', start:70, end:100},{type:'slider', start:70, end:100}]
  }
}
function yAxesOption(){
  const y0name = index100.value && (metric.value==='temp') ? 'Index (Temp=100)' : '°C'
  const y1name = index100.value && (metric.value==='precip') ? 'Index (Precip=100)' : 'mm'
  const y2name = index100.value && (metric.value==='agri') ? 'Index (Agri=100)' : '%'
  return [
    { type:'value', name:y0name, position:'left',
      min: v => Math.floor((v.min ?? 0) - 2), max: v => Math.ceil((v.max ?? 40) + 2), scale:true },
    { type:'value', name:y1name, position:'right', min:0, scale:true },
    { type:'value', name:y2name, position:'right', offset:55, min:0, max:100 },
  ]
}
function seriesOption(){
  // Paletler
  const COL_A = '#2A9D8F', COL_A_MA = '#1F9E8F'
  const COL_B = '#7C6FF0', COL_B_MA = '#6B5BE6'
  const COL_AGRI = ['#6D9773', '#8F5DA8']

  // pencere ve base
  const { i0, i1 } = lastWindow
  // ham diziler
  const A = metric.value==='temp' ? tempA.value : metric.value==='precip' ? precA.value : agriA.value
  const B = metric.value==='temp' ? tempB.value : metric.value==='precip' ? precB.value : agriB.value
  const MA_A = metric.value==='temp' ? tempMAA.value : metric.value==='precip' ? precMAA.value : []
  const MA_B = metric.value==='temp' ? tempMAB.value : metric.value==='precip' ? precMAB.value : []

  // endeksli/normal diziler
  let dA = A, dB = B, dMA_A = MA_A, dMA_B = MA_B
  if(index100.value){
    const baseA = firstFiniteInRange(A, i0, i1)
    const baseB = firstFiniteInRange(B, i0, i1)
    dA = indexRange(A, baseA)
    dB = indexRange(B, baseB)
    dMA_A = MA_A.length ? indexRange(MA_A, baseA) : []
    dMA_B = MA_B.length ? indexRange(MA_B, baseB) : []
  }

  const legend = []
  const series = []

  if(metric.value === 'temp'){
    legend.push(`${selectedA.value.name} Temp`, `${selectedA.value.name} Temp MA(12m)`,
                `${selectedB.value.name} Temp`, `${selectedB.value.name} Temp MA(12m)`, 'Δ band')
    series.push(
      { name: `${selectedA.value.name} Temp`, type:'line', yAxisIndex:0, data: dA, smooth:true, lineStyle:{width:2}, itemStyle:{color:COL_A}},
      { name: `${selectedA.value.name} Temp MA(12m)`, type:'line', yAxisIndex:0, data: dMA_A, smooth:true, symbol:'none', lineStyle:{width:2, type:'dashed'}, itemStyle:{color:COL_A_MA}},
      { name: `${selectedB.value.name} Temp`, type:'line', yAxisIndex:0, data: dB, smooth:true, lineStyle:{width:2}, itemStyle:{color:COL_B}},
      { name: `${selectedB.value.name} Temp MA(12m)`, type:'line', yAxisIndex:0, data: dMA_B, smooth:true, symbol:'none', lineStyle:{width:2, type:'dashed'}, itemStyle:{color:COL_B_MA}},
      ...deltaBandSeries(dA, dB, 0) // yAxisIndex 0
    )
  } else if(metric.value === 'precip'){
    legend.push(`${selectedA.value.name} Precip`, `${selectedA.value.name} Precip MA(12m)`,
                `${selectedB.value.name} Precip`, `${selectedB.value.name} Precip MA(12m)`, 'Δ band')
    series.push(
      { name: `${selectedA.value.name} Precip`, type:'line', yAxisIndex:1, data: dA, smooth:true, lineStyle:{width:2}, itemStyle:{color:COL_A}},
      { name: `${selectedA.value.name} Precip MA(12m)`, type:'line', yAxisIndex:1, data: dMA_A, smooth:true, symbol:'none', lineStyle:{width:2, type:'dashed'}, itemStyle:{color:COL_A_MA}},
      { name: `${selectedB.value.name} Precip`, type:'line', yAxisIndex:1, data: dB, smooth:true, lineStyle:{width:2}, itemStyle:{color:COL_B}},
      { name: `${selectedB.value.name} Precip MA(12m)`, type:'line', yAxisIndex:1, data: dMA_B, smooth:true, symbol:'none', lineStyle:{width:2, type:'dashed'}, itemStyle:{color:COL_B_MA}},
      ...deltaBandSeries(dA, dB, 1) // yAxisIndex 1
    )
  } else { // agri
    legend.push(`${selectedA.value.name} Agri %`, `${selectedB.value.name} Agri %`)
    series.push(
      { name: `${selectedA.value.name} Agri %`, type:'line', yAxisIndex:2, data: dA, smooth:true, lineStyle:{width:2}, itemStyle:{color:COL_AGRI[0]} },
      { name: `${selectedB.value.name} Agri %`, type:'line', yAxisIndex:2, data: dB, smooth:true, lineStyle:{width:2}, itemStyle:{color:COL_AGRI[1]} },
    )
  }

  return { legend: { data: legend }, series }
}

// ——— İki eğri arasındaki “delta bandı”
function deltaBandSeries(a, b, yAxisIndex){
  const bottom = []
  const size = []
  for(let i=0;i<a.length;i++){
    const va = Number(a[i]), vb = Number(b[i])
    if(Number.isFinite(va) && Number.isFinite(vb)){
      const lo = Math.min(va, vb), hi = Math.max(va, vb)
      bottom.push(lo); size.push(+(hi - lo).toFixed(4))
    }else{ bottom.push(null); size.push(null) }
  }
  return [
    { name:'Δ band base', type:'line', yAxisIndex, data: bottom, stack:'delta', symbol:'none',
      lineStyle:{ width:0 }, areaStyle:{ opacity: 0 }, emphasis:{ disabled:true } },
    { name:'Δ band', type:'line', yAxisIndex, data: size, stack:'delta', symbol:'none',
      lineStyle:{ width:0 }, areaStyle:{ opacity: 0.18 }, emphasis:{ disabled:true } },
  ]
}

function recalcCorrForWindow(i0, i1){
  i0 = Math.max(0, i0); i1 = Math.min(xLabels.value.length-1, i1)
  if(i1 < i0) return
  const labels = xLabels.value.slice(i0, i1+1).map(x=>x.replace('-',''))

  if(metric.value === 'temp' || metric.value === 'precip'){
    const aSeries = metric.value === 'temp' ? tempA.value : precA.value
    const bSeries = metric.value === 'temp' ? tempB.value : precB.value
    const aWin = aSeries.slice(i0, i1+1)
    const bWin = bSeries.slice(i0, i1+1)

    const annualA = monthlyToAnnualMean(labels, aWin)
    const annualB = monthlyToAnnualMean(labels, bWin)

    const years = Array.from(new Set([
      ...annualA.keys(), ...annualB.keys(), ...agriByYearA.value.keys(), ...agriByYearB.value.keys()
    ])).sort()

    const aTarget = years.map(y => annualA.get(y))
    const bTarget = years.map(y => annualB.get(y))
    const aAgri   = years.map(y => agriByYearA.value.get(y))
    const bAgri   = years.map(y => agriByYearB.value.get(y))

    const cA = pearson(aTarget, aAgri)
    const cB = pearson(bTarget, bAgri)
    corrsA.value = { temp: metric.value==='temp'?cA.r:null, precip: metric.value==='precip'?cA.r:null, nTemp: cA.n, nPrecip: cA.n }
    corrsB.value = { temp: metric.value==='temp'?cB.r:null, precip: metric.value==='precip'?cB.r:null, nTemp: cB.n, nPrecip: cB.n }
  } else {
    corrsA.value = { temp:null, precip:null, nTemp:0, nPrecip:0 }
    corrsB.value = { temp:null, precip:null, nTemp:0, nPrecip:0 }
  }
}

// ——— Harita
function initMap(){
  if(mapInstance) mapInstance.remove()
  mapInstance = L.map(map.value).setView([selectedA.value.lat, selectedA.value.lon], selectedA.value.zoom)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap contributors' }).addTo(mapInstance)
}

// ——— Choropleth
let worldGeo = null
let geoLayerA = null, geoLayerB = null

async function ensureWorldGeo(){
  if(worldGeo) return worldGeo
  const url = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
  const res = await fetch(url)
  worldGeo = await res.json()
  return worldGeo
}
function colorForPct(p, which='A'){
  if(p==null) return '#dddddd'
  // A: teal skala, B: lavender skala
  const TINT_A=[234,247,244], ACC_A=[42,157,143]
  const TINT_B=[240,238,252], ACC_B=[124,111,240]
  const useT = which==='A'? TINT_A : TINT_B
  const useA = which==='A'? ACC_A  : ACC_B
  const t = Math.max(0, Math.min(100, p)) / 100
  const mix=(a,b,t)=>Math.round(a*(1-t)+b*t)
  return `rgb(${mix(useT[0],useA[0],t)},${mix(useT[1],useA[1],t)},${mix(useT[2],useA[2],t)})`
}
function fitMapToLayers(){
  try{
    const g = new L.featureGroup([geoLayerA, geoLayerB].filter(Boolean))
    if(g.getLayers().length) mapInstance.fitBounds(g.getBounds(), { padding:[20,20] })
  }catch{}
}
async function updateChoroplethBoth(pctA, pctB){
  await ensureWorldGeo()
  const featA = worldGeo.features.find(f => f.properties?.ISO_A3 === selectedA.value.iso3 || f.properties?.ADM0_A3 === selectedA.value.iso3)
  const featB = worldGeo.features.find(f => f.properties?.ISO_A3 === selectedB.value.iso3 || f.properties?.ADM0_A3 === selectedB.value.iso3)
  if(geoLayerA) geoLayerA.remove()
  if(geoLayerB) geoLayerB.remove()
  if(featA) geoLayerA = L.geoJSON(featA, { style:{ color:'#134e4a', weight:2, fillColor: colorForPct(pctA,'A'), fillOpacity:.7 } }).addTo(mapInstance)
  if(featB) geoLayerB = L.geoJSON(featB, { style:{ color:'#4338ca', weight:2, fillColor: colorForPct(pctB,'B'), fillOpacity:.6 } }).addTo(mapInstance)
  if(geoLayerA) geoLayerA.bringToFront()
  if(geoLayerB) geoLayerB.bringToFront()
  fitMapToLayers()
}

// ——— CSV dışa aktar (A eksenine hizalı)
function downloadCSV(){
  const rows = [['date',
    `${selectedA.value.iso3}_tempC`, `${selectedA.value.iso3}_precipMm`, `${selectedA.value.iso3}_agriPct`,
    `${selectedB.value.iso3}_tempC`, `${selectedB.value.iso3}_precipMm`, `${selectedB.value.iso3}_agriPct`
  ]]
  for(let i=0;i<xLabels.value.length;i++){
    rows.push([
      xLabels.value[i],
      tempA.value[i] ?? '', precA.value[i] ?? '', agriA.value[i] ?? '',
      tempB.value[i] ?? '', precB.value[i] ?? '', agriB.value[i] ?? '',
    ])
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type:'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${selectedA.value.iso3}_${selectedB.value.iso3}_compare.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// ——— Veri yükle
async function loadAll(){
  loading.value = true; statusMsg.value = 'Fetching data…'
  try{
    // A & B NASA paralel
    const [nasaA, nasaB] = await Promise.all([
      fetchNasa(selectedA.value.lat, selectedA.value.lon),
      fetchNasa(selectedB.value.lat, selectedB.value.lon)
    ])
    xLabels.value = nasaA.map(d => d.yyyymm.slice(0,4)+'-'+d.yyyymm.slice(4))
    tempA.value   = nasaA.map(d => d.t2m)
    precA.value   = nasaA.map(d => d.pre)

    const alignedB = alignToAxis(xLabels.value, nasaB)
    tempB.value = alignedB.t
    precB.value = alignedB.p

    // WB (yıllık)
    const [wbA, wbB] = await Promise.all([
      fetchWorldBank(selectedA.value.iso3),
      fetchWorldBank(selectedB.value.iso3),
    ])
    agriByYearA.value = new Map(wbA.map(d => [d.date, d.value]))
    agriByYearB.value = new Map(wbB.map(d => [d.date, d.value]))
    agriA.value = xLabels.value.map(lbl => agriByYearA.value.get(lbl.slice(0,4)) ?? null)
    agriB.value = xLabels.value.map(lbl => agriByYearB.value.get(lbl.slice(0,4)) ?? null)

    // 12M ortalamalar
    tempMAA.value = movingAverage(tempA.value, 12)
    precMAA.value = movingAverage(precA.value, 12)
    tempMAB.value = movingAverage(tempB.value, 12)
    precMAB.value = movingAverage(precB.value, 12)

    statusMsg.value = 'Rendering…'
    buildSeriesAndRender()
    await updateChoroplethBoth(latestAgriFrom(agriA.value), latestAgriFrom(agriB.value))
    statusMsg.value = 'Ready'
  }catch(e){
    console.error(e)
    statusMsg.value = 'Error fetching data'
  }finally{
    loading.value = false
  }
}

onMounted(async ()=>{ initMap(); await loadAll() })
watch([selectedA, selectedB, metric, index100], async ()=>{
  initMap(); await loadAll()
})
</script>

<template>
  <div class="app-bg p-4 sm:p-6">
    <div class="max-w-7xl mx-auto space-y-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl sm:text-2xl font-semibold">Agri-Climate — Country Compare</h1>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Metric buttons -->
          <div class="button flex gap-1">
            <button class="px-2 py-1 rounded hover:bg-apricot/80" :class="{'font-semibold': metric==='temp'}"   @click="metric='temp'">Temp</button>
            <button class="px-2 py-1 rounded hover:bg-apricot/80" :class="{'font-semibold': metric==='precip'}" @click="metric='precip'">Precip</button>
            <button class="px-2 py-1 rounded hover:bg-apricot/80" :class="{'font-semibold': metric==='agri'}"   @click="metric='agri'">Agri%</button>
          </div>

          <!-- Index 100 toggle -->
          <label class="button flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="index100" />
            <span class="hidden sm:inline">Index 100 (window start)</span>
            <span class="sm:hidden">Idx100</span>
          </label>

          <button class="button" @click="loadAll" :disabled="loading">Refresh</button>
          <button class="button" @click="downloadCSV" :disabled="loading">Export CSV</button>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section class="card lg:col-span-1">
          <h2 class="font-medium mb-3">Country A</h2>
          <div class="flex gap-2 mb-2">
            <input v-model="queryA" type="text" placeholder="Search…" class="button w-full" />
          </div>
          <select v-model="selectedA" class="button w-full mb-2">
            <option v-for="c in filteredA" :key="c.iso3" :value="c">{{ c.name }}</option>
          </select>

          <h2 class="font-medium mb-3 mt-4">Country B</h2>
          <div class="flex gap-2 mb-2">
            <input v-model="queryB" type="text" placeholder="Search…" class="button w-full" />
          </div>
          <select v-model="selectedB" class="button w-full">
            <option v-for="c in filteredB" :key="c.iso3" :value="c">{{ c.name }}</option>
          </select>
        </section>

        <section class="card lg:col-span-2 relative">
          <h2 class="font-medium mb-2">Map (two countries)</h2>
          <div id="map" ref="map" class="rounded-xl overflow-hidden h-72 sm:h-80 lg:h-[420px]"></div>
          <div class="absolute right-4 bottom-4 bg-white/90 rounded-lg px-3 py-1 text-xs sm:text-sm shadow">
            A: teal, B: lavender — fill scales by Agri%
          </div>
        </section>
      </div>

      <section class="card">
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-medium">
            Comparison — {{ metric==='temp' ? 'Temperature' : metric==='precip' ? 'Precipitation' : 'Agriculture land (%)' }}
            <span v-if="index100" class="text-gray-600 text-sm"> (Index 100)</span>
          </h2>
        </div>

        <!-- Responsive chart heights -->
        <div id="chart" ref="chart" class="h-[380px] sm:h-[460px] lg:h-[520px]"></div>

        <div class="mt-3 text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <strong>A — {{ selectedA.name }}</strong>
            <span v-if="metric==='temp'"> · Corr(Agri %, Temp): <strong>{{ corrsA.temp ?? '—' }}</strong> <span class="text-gray-500">(n={{ corrsA.nTemp }})</span></span>
            <span v-else-if="metric==='precip'"> · Corr(Agri %, Precip): <strong>{{ corrsA.precip ?? '—' }}</strong> <span class="text-gray-500">(n={{ corrsA.nPrecip }})</span></span>
            <span v-else> · Corr: —</span>
          </div>
          <div>
            <strong>B — {{ selectedB.name }}</strong>
            <span v-if="metric==='temp'"> · Corr(Agri %, Temp): <strong>{{ corrsB.temp ?? '—' }}</strong> <span class="text-gray-500">(n={{ corrsB.nTemp }})</span></span>
            <span v-else-if="metric==='precip'"> · Corr(Agri %, Precip): <strong>{{ corrsB.precip ?? '—' }}</strong> <span class="text-gray-500">(n={{ corrsB.nPrecip }})</span></span>
            <span v-else> · Corr: —</span>
          </div>
        </div>

        <p class="text-xs text-gray-500 mt-1">
          * Index-100: Grafik penceresinin başındaki değeri 100 kabul eder. Delta bandı iki eğri arasındaki farkı yarı saydam gösterir.
        </p>
      </section>

      <footer class="text-sm text-gray-600">Status: {{ statusMsg }}</footer>
    </div>
  </div>
</template>

<style>
.leaflet-container{ z-index:0; }
</style>
