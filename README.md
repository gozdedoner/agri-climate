# Agri-Climate Dashboard

Live: **https://agri-climate.vercel.app/**

A browser-based dashboard to compare **climate** (temperature, precipitation) and **agricultural land share** between two countries on the same time axis.  
Built with Vue 3 + Vite, ECharts, and Leaflet. Data sources: NASA POWER & World Bank.



---

## Features

- 🌍 **Two-country comparison** (map + chart)
- 📈 **Index-100 mode**: normalize series to 100 at the start of the visible window to compare shapes
- 🟣 **Delta band**: semi-transparent band showing the gap between the two curves (Temp/Precip)
- 📊 **12-month moving averages** (Temp/Precip)
- 🔎 **Live correlation**: Pearson r of Agri% ↔ Temp/Precip, computed for the current zoom window
- 🗺️ **Choropleth**: country polygon filled by Agri% scale
- 💾 **CSV export**
- ⚡ **Local cache**: NASA (7d) & WB (30d) via TTL’d localStorage
- 📱 **Fully responsive** (mobile/tablet/desktop)

---

## Tech Stack

- **Vue 3 + Vite**
- **ECharts** (time-series plotting)
- **Leaflet** (OSM base map)
- **Tailwind CSS** (styling)
- Deploy: **Vercel**

---

## Links

- Production: https://agri-climate.vercel.app/
- Repository: https://github.com/gozdedoner/agri-climate

---

## Setup

> Node 18+ recommended.

```bash
git clone https://github.com/gozdedoner/agri-climate.git
cd agri-climate
npm i
npm run dev

