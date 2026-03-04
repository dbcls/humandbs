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

function computeVisibleAngleRange(
  centerX,
  centerY,
  radius,
  margin,
  width,
  height,
  referenceAngle,
) {
  const samples = 720;
  const angles = [];
  for (let i = 0; i < samples; i += 1) {
    const raw = (i / samples) * Math.PI * 2;
    // Unwrap around the reference so intervals crossing 0/2PI stay contiguous.
    const a = referenceAngle + angleDelta(referenceAngle, raw);
    const x = centerX + Math.cos(a) * radius;
    const y = centerY + Math.sin(a) * radius;
    if (
      x >= margin &&
      x <= width - margin &&
      y >= margin &&
      y <= height - margin
    ) {
      angles.push(a);
    }
  }
  if (angles.length === 0) {
    return null;
  }

  const sorted = angles.sort((a, b) => a - b);
  let bestStart = sorted[0];
  let bestEnd = sorted[0];
  let runStart = sorted[0];
  let prev = sorted[0];
  const step = ((Math.PI * 2) / samples) * 1.6;

  for (let i = 1; i < sorted.length; i += 1) {
    const curr = sorted[i];
    if (curr - prev > step) {
      if (prev - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = prev;
      }
      runStart = curr;
    }
    prev = curr;
  }
  if (prev - runStart > bestEnd - bestStart) {
    bestStart = runStart;
    bestEnd = prev;
  }

  return { min: bestStart, max: bestEnd };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
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
    const svgNode = svg.node();
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

      const speedSeed = hashUnit(`${system.facet}:hub-speed`);
      const dirSeed = hashUnit(`${system.facet}:hub-dir`);
      const phaseSeed = hashUnit(`${system.facet}:hub-phase`);
      const direction = dirSeed < 0.5 ? -1 : 1;
      const baseSpeedMag = 0.008 + i * 0.001 + speedSeed * 0.0018;
      const baseSpeed = direction * baseSpeedMag;
      const visibleArc = computeVisibleAngleRange(
        centerX,
        centerY,
        radius,
        Math.max(12, hubRadius + 6),
        WIDTH,
        HEIGHT,
        theta,
      );
      const arcMin = visibleArc?.min ?? theta - 0.22;
      const arcMax = visibleArc?.max ?? theta + 0.22;
      const clampedTheta = Math.max(arcMin, Math.min(arcMax, theta));
      const clampedX = centerX + Math.cos(clampedTheta) * radius;
      const clampedY = centerY + Math.sin(clampedTheta) * radius;

      const hub = systemsLayer
        .append("g")
        .attr("transform", `translate(${clampedX},${clampedY})`)
        .datum({
          angle: clampedTheta,
          radius,
          speed: baseSpeed,
          baseSpeed,
          noisePhase: phaseSeed * Math.PI * 2,
          noiseAmp: 0.0012 + speedSeed * 0.0015,
          minAngle: arcMin,
          maxAngle: arcMax,
          hubRadius,
          visibilityRadius,
        });

      hubAnchors.push(hub);

      const dragHub = d3
        .drag()
        .on("start", () => {
          const d = hub.datum();
          d.dragging = true;
          d.speed = 0;
          d.dragStartAngle = d.angle;
          d.dragStartPointerAngle = null;
          tooltip.style("opacity", 0);
        })
        .on("drag", (event) => {
          const d = hub.datum();
          const [px, py] = d3.pointer(event, svgNode);
          const pointerAngle = Math.atan2(py - centerY, px - centerX);
          if (d.dragStartPointerAngle === null) {
            d.dragStartPointerAngle = pointerAngle;
          }
          const delta = angleDelta(d.dragStartPointerAngle, pointerAngle);
          const nextAngle = d.dragStartAngle + delta;
          d.angle = clamp(nextAngle, d.minAngle, d.maxAngle);
          const tx = centerX + Math.cos(d.angle) * d.radius;
          const ty = centerY + Math.sin(d.angle) * d.radius;
          hub.attr("transform", `translate(${tx},${ty})`);
        })
        .on("end", () => {
          const d = hub.datum();
          d.dragging = false;
          d.dragStartPointerAngle = null;
          d.speed = d.baseSpeed * 0.5;
        });

      hub.call(dragHub);

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
              <div class="tt-divider"></div>
              ${satellitesRows}
            `);
        })
        .on("mouseleave", () => {
          tooltip.style("opacity", 0);
        });

      hub
        .append("text")
        .attr("x", 0)
        .attr("y", -hubRadius - 12)
        .attr("text-anchor", "middle")
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
              .attr("x", sx)
              .attr("y", sy - radiusPx - 6)
              .attr("text-anchor", "middle")
              .attr("fill", "#00132d")
              .attr("font-size", 11)
              .attr("font-weight", 700)
              .text(ellipsis(sat.value, 24));
          }

          satEntries.push({
            circle,
            label,
            angle,
            speed: -(0.025 + seedSpeed * 0.1 + satIdx * 0.002),
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

      const hubData = hubAnchors.map((hub) => ({ hub, d: hub.datum() }));

      hubData.forEach(({ d }) => {
        if (d.dragging) return;
        const wobble =
          Math.sin(elapsedMs * 0.00025 + d.noisePhase) * d.noiseAmp;
        d.speed += (d.baseSpeed - d.speed) * Math.min(1, dt * 2.2);
        d.speed += wobble * dt;
      });

      for (let i = 0; i < hubData.length; i += 1) {
        for (let j = i + 1; j < hubData.length; j += 1) {
          const a = hubData[i].d;
          const b = hubData[j].d;
          if (a.dragging || b.dragging) continue;
          const ax = centerX + Math.cos(a.angle) * a.radius;
          const ay = centerY + Math.sin(a.angle) * a.radius;
          const bx = centerX + Math.cos(b.angle) * b.radius;
          const by = centerY + Math.sin(b.angle) * b.radius;
          const dx = ax - bx;
          const dy = ay - by;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const minDist = a.hubRadius + b.hubRadius + 30;
          if (dist < minDist) {
            const overlap = (minDist - dist) / minDist;
            const taX = -Math.sin(a.angle);
            const taY = Math.cos(a.angle);
            const tbX = -Math.sin(b.angle);
            const tbY = Math.cos(b.angle);
            const pushA = dx * taX + dy * taY >= 0 ? 1 : -1;
            const pushB = dx * tbX + dy * tbY >= 0 ? -1 : 1;
            const impulse = overlap * 0.028;
            a.speed += pushA * impulse;
            b.speed += pushB * impulse;
          }
        }
      }

      hubData.forEach(({ hub, d }) => {
        if (!d.dragging) {
          d.angle += d.speed * dt;
          if (d.angle < d.minAngle) {
            d.angle = d.minAngle;
            const bounce = Math.max(
              Math.abs(d.speed) * 0.75,
              Math.abs(d.baseSpeed) * 0.8,
              0.004,
            );
            d.baseSpeed = Math.abs(d.baseSpeed);
            d.speed = bounce;
          } else if (d.angle > d.maxAngle) {
            d.angle = d.maxAngle;
            const bounce = Math.max(
              Math.abs(d.speed) * 0.75,
              Math.abs(d.baseSpeed) * 0.8,
              0.004,
            );
            d.baseSpeed = -Math.abs(d.baseSpeed);
            d.speed = -bounce;
          }
        }
        const tx = centerX + Math.cos(d.angle) * d.radius;
        const ty = centerY + Math.sin(d.angle) * d.radius;
        hub.attr("transform", `translate(${tx},${ty})`);
      });

      satelliteSystems.forEach((system) => {
        system.entries.forEach((entry) => {
          entry.angle += entry.speed * dt;
          const sx = Math.cos(entry.angle) * entry.orbitRadius;
          const sy = Math.sin(entry.angle) * entry.orbitRadius;

          entry.circle.attr("cx", sx).attr("cy", sy);
          if (entry.label) {
            entry.label
              .attr("x", sx)
              .attr("y", sy - entry.radiusPx - entry.labelPad)
              .attr("text-anchor", "middle");
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
