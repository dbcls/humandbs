import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

const WIDTH = 1200;
const HEIGHT = 760;

const palettes = [
  { light: "#f2dddd", mid: "#d7b6be", dark: "#b89eb7" },
  { light: "#ece6c8", mid: "#d9d1b3", dark: "#b7bfbe" },
  { light: "#d8f0ca", mid: "#abd7be", dark: "#93c8b8" },
  { light: "#d2ebf5", mid: "#a4d4e4", dark: "#8ec7dc" },
  { light: "#e6dcef", mid: "#c8badf", dark: "#aea3cd" },
  { light: "#f2e7db", mid: "#d9c9b4", dark: "#bda891" },
  { light: "#d9ece9", mid: "#acd2cc", dark: "#86b8b1" },
  { light: "#dfebee", mid: "#bad1d5", dark: "#9dbcc4" },
];

function hashUnit(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function normalizeStatsResponse(payload) {
  const data = payload?.data ?? payload;

  if (!data?.research?.total && !data?.dataset?.total && !data?.facets) {
    return null;
  }

  const systems = [];

  for (const [facet, values] of Object.entries(data.facets ?? {})) {
    const satellites = [];

    for (const [value, counts] of Object.entries(values ?? {})) {
      const research = Number(counts?.research ?? 0);
      const dataset = Number(counts?.dataset ?? 0);
      const total = research + dataset;

      if (total <= 0) continue;

      satellites.push({
        id: `${facet}:${value}`,
        facet,
        value,
        research,
        dataset,
        total,
      });
    }

    satellites.sort((a, b) => b.total - a.total);
    if (satellites.length === 0) continue;

    systems.push({
      facet,
      total: d3.sum(satellites, (d) => d.total),
      satellites,
    });
  }

  systems.sort((a, b) => a.total - b.total);

  return {
    researchTotal: Number(data.research?.total ?? 0),
    datasetTotal: Number(data.dataset?.total ?? 0),
    systems,
    nodes: systems.flatMap((s) => s.satellites),
  };
}

function useStats() {
  const [state, setState] = useState({ loading: true, error: "", stats: null });

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/stats");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const normalized = normalizeStatsResponse(payload);

        if (!normalized) {
          throw new Error("Unexpected stats payload format");
        }

        if (mounted) {
          setState({ loading: false, error: "", stats: normalized });
        }
      } catch (err) {
        if (mounted) {
          setState({
            loading: false,
            error: `Could not load /api/stats (${err.message}). Start backend on localhost:8080.`,
            stats: null,
          });
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

function ellipsis(text, max = 16) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function PlanetChart({ stats }) {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);

  const systems = useMemo(() => stats.systems.slice(0, 8), [stats.systems]);
  const satellites = useMemo(
    () => systems.flatMap((s) => s.satellites.slice(0, 24)),
    [systems],
  );

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const centerX = 110;
    const centerY = HEIGHT * 0.53;
    const root = svg.append("g");
    const defs = svg.append("defs");

    palettes.forEach((palette, i) => {
      const grad = defs.append("radialGradient").attr("id", `planet-grad-${i}`);
      grad
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", palette.light);
      grad.append("stop").attr("offset", "62%").attr("stop-color", palette.mid);
      grad
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", palette.dark);
    });

    root
      .append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", 220)
      .attr("fill", "none")
      .attr("stroke", "#b9bec5")
      .attr("stroke-width", 1.2);

    const orbitRadii = [320, 440, 560, 700, 860];

    orbitRadii.forEach((r) => {
      root
        .append("circle")
        .attr("cx", centerX)
        .attr("cy", centerY)
        .attr("r", r)
        .attr("fill", "none")
        .attr("stroke", "#bfc5ca")
        .attr("stroke-width", 1)
        .attr("opacity", 0.8);
    });

    const satExtent = d3.extent(satellites, (d) => d.total);
    const minSatTotal = satExtent[0] ?? 0;
    const satSize = d3
      .scaleSqrt()
      .domain([Math.max(1, satExtent[0] ?? 1), satExtent[1] ?? 1])
      .range([5, 60]);

    const tooltip = d3.select(tooltipRef.current);
    const datasetTotal = stats.datasetTotal;
    const systemsLayer = root.append("g").attr("class", "systems-layer");
    const hubAnchors = [];
    const satelliteSystems = [];

    root
      .append("text")
      .attr("x", centerX - 52)
      .attr("y", centerY + 12)
      .attr("fill", "#0d0f14")
      .attr("font-size", 72)
      .attr("font-weight", 500)
      .text(datasetTotal);

    root
      .append("text")
      .attr("x", centerX - 52)
      .attr("y", centerY + 58)
      .attr("fill", "#0d0f14")
      .attr("font-size", 48)
      .attr("font-weight", 700)
      .text("Datasets");

    const angleStops = [-52, -18, 14, 38, 66, 92, 124, 148];
    const ringStops = [320, 440, 560, 700, 860, 560, 700, 440];

    systems.forEach((system, i) => {
      const theta = (angleStops[i % angleStops.length] * Math.PI) / 180;
      const radius = ringStops[i % ringStops.length];
      const x = centerX + Math.cos(theta) * radius;
      const y = centerY + Math.sin(theta) * radius;
      const paletteIndex = i % palettes.length;
      const localSatellites = system.satellites.slice(0, 24);
      const satLayout = localSatellites.map((sat, satIdx) => {
        const seedAngle = hashUnit(`${sat.id}:angle`);
        const seedRadius = hashUnit(`${sat.id}:radius`);
        const seedSpeed = hashUnit(`${sat.id}:speed`);
        const radiusPx = satSize(sat.total);
        return {
          sat,
          satIdx,
          seedAngle,
          seedRadius,
          seedSpeed,
          radiusPx,
        };
      });
      const hubRadius = Math.max(
        16,
        Math.sqrt(d3.sum(satLayout, (d) => d.radiusPx * d.radiusPx)),
      );
      const baseOrbit = hubRadius + 26;
      const orbitStep = 6;
      const maxOrbitRadius =
        satLayout.length > 0
          ? baseOrbit + (satLayout.length - 1) * orbitStep + 2.2
          : baseOrbit;
      const maxSatRadius =
        satLayout.length > 0 ? (d3.max(satLayout, (d) => d.radiusPx) ?? 0) : 0;
      // Include hub, satellites, and rough label reach before recycling this system.
      const visibilityRadius = Math.max(
        hubRadius,
        maxOrbitRadius + maxSatRadius + 120,
      );

      const baseSpeed = 0.02 + i * 0.002 + (i % 3) * 0.0015;
      const recycleAngle = -1.78 + i * 0.06;

      const hub = systemsLayer
        .append("g")
        .attr("transform", `translate(${x},${y})`)
        .datum({
          angle: theta,
          radius,
          speed: baseSpeed,
          recycleAngle,
          visibilityRadius,
          wasVisible: true,
          recycledAfterInvisible: false,
        });

      hubAnchors.push(hub);

      hub
        .append("circle")
        .attr("r", hubRadius)
        .attr("fill", `url(#planet-grad-${paletteIndex})`)
        .attr("stroke", d3.color(palettes[paletteIndex].dark).darker(0.35))
        .attr("stroke-opacity", 0.25)
        .on("mousemove", (event) => {
          const researchTotal = d3.sum(localSatellites, (d) => d.research);
          const datasetTotalFacet = d3.sum(localSatellites, (d) => d.dataset);
          const satellitesRows = localSatellites
            .map(
              (d) =>
                `<div class="tt-row"><span>${d.value}</span><strong>${d.total}</strong></div>`,
            )
            .join("");
          tooltip
            .style("opacity", 1)
            .style("left", `${event.offsetX + 18}px`)
            .style("top", `${event.offsetY + 18}px`).html(`
              <div class="tt-title">${system.facet}</div>
              <div class="tt-row"><span>Research</span><strong>${researchTotal}</strong></div>
              <div class="tt-row"><span>Dataset</span><strong>${datasetTotalFacet}</strong></div>
              <div class="tt-row"><span>Total</span><strong>${system.total}</strong></div>
              <div class="tt-row"><span>Satellites</span><strong>${localSatellites.length}</strong></div>
              <div class="tt-divider"></div>
              ${satellitesRows}
            `);
        })
        .on("mouseleave", () => {
          tooltip.style("opacity", 0);
        });

      const anchor = hubRadius > 66 ? "middle" : "start";
      const textX = hubRadius > 66 ? 0 : hubRadius + 12;
      const textY = hubRadius > 66 ? -hubRadius - 14 : 2;

      hub
        .append("text")
        .attr("x", textX)
        .attr("y", textY)
        .attr("text-anchor", anchor)
        .attr("fill", "#01122b")
        .attr("font-size", 20)
        .attr("font-weight", 700)
        .text(ellipsis(system.facet, 22));

      const satellitesLayer = hub.append("g");
      const satEntries = [];

      satLayout.forEach(
        ({ sat, satIdx, seedAngle, seedRadius, seedSpeed, radiusPx }) => {
          const orbitRadius = baseOrbit + satIdx * orbitStep + seedRadius * 2.2;
          const angle = seedAngle * Math.PI * 2;
          const sx = Math.cos(angle) * orbitRadius;
          const sy = Math.sin(angle) * orbitRadius;
          const labelDx = sx >= 0 ? radiusPx + 6 : -radiusPx - 6;
          const labelAnchor = sx >= 0 ? "start" : "end";

          const circle = satellitesLayer
            .append("circle")
            .datum(sat)
            .attr("cx", sx)
            .attr("cy", sy)
            .attr("r", radiusPx)
            .attr(
              "fill",
              `url(#planet-grad-${(paletteIndex + satIdx + 2) % palettes.length})`,
            )
            .attr("stroke", "#ecf0f1")
            .attr("stroke-width", 0.9);

          let label = null;
          if (sat.total >= minSatTotal) {
            label = satellitesLayer
              .append("text")
              .attr("class", "sat-label")
              .attr("x", sx + labelDx)
              .attr("y", sy + 4)
              .attr("text-anchor", labelAnchor)
              .attr("fill", "#00132d")
              .attr("font-size", 11)
              .attr("font-weight", 700)
              .text(ellipsis(sat.value, 24));
          }

          satEntries.push({
            circle,
            label,
            angle,
            speed: -(0.05 + seedSpeed * 0.2 + satIdx * 0.004),
            orbitRadius,
            radiusPx,
            labelPad: 6,
          });
        },
      );

      satelliteSystems.push({
        entries: satEntries,
      });
    });

    let running = true;
    let lastFrameMs = 0;
    let lastTickMs = 0;

    const spin = d3.timer((elapsedMs) => {
      if (!running) return;
      if (elapsedMs - lastFrameMs < 33) return;
      lastFrameMs = elapsedMs;
      if (lastTickMs === 0) {
        lastTickMs = elapsedMs;
      }
      const dt = (elapsedMs - lastTickMs) / 1000;
      lastTickMs = elapsedMs;

      hubAnchors.forEach((hub) => {
        const d = hub.datum();
        d.angle += d.speed * dt;

        let tx = centerX + Math.cos(d.angle) * d.radius;
        let ty = centerY + Math.sin(d.angle) * d.radius;
        const vr = d.visibilityRadius ?? 0;
        const visible =
          tx + vr >= 0 && tx - vr <= WIDTH && ty + vr >= 0 && ty - vr <= HEIGHT;

        if (visible) {
          d.wasVisible = true;
          d.recycledAfterInvisible = false;
        } else if (d.wasVisible && !d.recycledAfterInvisible) {
          d.angle = d.recycleAngle;
          d.recycledAfterInvisible = true;
          d.wasVisible = false;
          tx = centerX + Math.cos(d.angle) * d.radius;
          ty = centerY + Math.sin(d.angle) * d.radius;
        }

        hub.attr("transform", `translate(${tx},${ty})`);
      });

      satelliteSystems.forEach((system) => {
        system.entries.forEach((entry) => {
          entry.angle += entry.speed * dt;
          const sx = Math.cos(entry.angle) * entry.orbitRadius;
          const sy = Math.sin(entry.angle) * entry.orbitRadius;

          entry.circle.attr("cx", sx).attr("cy", sy);
          if (entry.label) {
            const rightSide = sx >= 0;
            const dx = rightSide
              ? entry.radiusPx + entry.labelPad
              : -entry.radiusPx - entry.labelPad;
            entry.label
              .attr("x", sx + dx)
              .attr("y", sy + 4)
              .attr("text-anchor", rightSide ? "start" : "end");
          }
        });
      });
    });

    const onVisibilityChange = () => {
      running = !document.hidden;
      if (running) {
        lastFrameMs = 0;
        lastTickMs = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      spin.stop();
    };
  }, [satellites, stats.datasetTotal, systems]);

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Multi-planet stats chart"
      />
      <div ref={tooltipRef} className="tooltip" />
    </div>
  );
}

export default function App() {
  const { loading, error, stats } = useStats();

  return (
    <main className="page">
      {loading && <p className="message">Loading stats...</p>}
      {error && <p className="message error">{error}</p>}

      {stats && (
        <>
          <PlanetChart stats={stats} />
        </>
      )}
    </main>
  );
}
