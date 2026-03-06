import { useState, useEffect, useRef, useCallback } from 'react';

import './index.css';

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )

// --- Seeded RNG (Mulberry32) ---
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randExp(rng, rate = 1) {
  return -Math.log(1 - rng()) / rate;
}

function generatePopulation(n = 30000, seed = 42) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => randExp(rng));
}

function sampleFrom(pop, n, rng) {
  return Array.from({ length: n }, () => pop[Math.floor(rng() * pop.length)]);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// --- Histogram helpers ---
function makeHistogram(data, bins, xMin, xMax) {
  const binWidth = (xMax - xMin) / bins;
  const counts = Array(bins).fill(0);
  for (const v of data) {
    const idx = Math.min(bins - 1, Math.floor((v - xMin) / binWidth));
    if (idx >= 0) counts[idx]++;
  }
  return counts.map((count, i) => ({
    x: xMin + (i + 0.5) * binWidth,
    x0: xMin + i * binWidth,
    x1: xMin + (i + 1) * binWidth,
    count,
    density: count / (data.length * binWidth),
  }));
}

function stackMeans(meansArr, bins, xMin, xMax) {
  const binWidth = (xMax - xMin) / bins;
  const stacks = {};
  return meansArr.map((m) => {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor((m - xMin) / binWidth))
    );
    const cx = xMin + (idx + 0.5) * binWidth;
    stacks[idx] = (stacks[idx] || 0) + 1;
    return { x: cx, stack: stacks[idx], idx };
  });
}

// --- SVG Chart helpers ---
function scaleX(val, xMin, xMax, width, pad) {
  return pad + ((val - xMin) / (xMax - xMin)) * (width - 2 * pad);
}
function scaleY(val, yMax, height, padT, padB) {
  return padT + (1 - val / yMax) * (height - padT - padB);
}

const POP_COLOR = '#334155';
const SAMPLE_COLOR = '#94a3b8';
const GOLD = '#f59e0b';
const GOLD_DARK = '#92400e';
const STEEL = '#3b82f6';

export default function CLTVisualizer() {
  const [n, setN] = useState(30);
  const [T, setT] = useState(300);
  const [binsPop, setBinsPop] = useState(40);
  const [binsMeans, setBinsMeans] = useState(35);
  const [t, setT_val] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(350);
  const [highlightedIdx, setHighlightedIdx] = useState(null);

  function pickRandom() {
    if (stackedAll.length === 0) return;
    const idx = Math.floor(Math.random() * stackedAll.length);
    setHighlightedIdx(idx);
  }

  // Animation state for the "drop" token
  const [tokenAnim, setTokenAnim] = useState(null); // {phase: 'compress'|'fly'|'drop'|null, ...}
  const animRef = useRef(null);
  const prevT = useRef(0);
  const plot2Ref = useRef(null);
  const plot3Ref = useRef(null);

  const population = useRef(generatePopulation());
  const simRef = useRef(null);

  // Regenerate sim when T or n changes
  useEffect(() => {
    const rng = mulberry32(999 + n * 7 + T * 3);
    const pop = population.current;
    const samples = Array.from({ length: T }, () => sampleFrom(pop, n, rng));
    const means = samples.map(mean);
    simRef.current = { samples, means };
    setT_val(0);
    setPlaying(false);
  }, [n, T]);

  // Playback
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT_val((prev) => {
        if (prev >= T) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [playing, speed, T]);

  // Trigger animation whenever t increases
  useEffect(() => {
    if (t > 0 && t > prevT.current && simRef.current) {
      // Start compress animation
      setTokenAnim({ phase: 'compress', t });
      const t1 = setTimeout(() => setTokenAnim({ phase: 'fly', t }), 500);
      const t2 = setTimeout(() => setTokenAnim({ phase: 'drop', t }), 1100);
      const t3 = setTimeout(() => setTokenAnim(null), 1700);
      animRef.current = [t1, t2, t3];
    }
    prevT.current = t;
    return () => animRef.current?.forEach(clearTimeout);
  }, [t]);

  const sim = simRef.current;
  const pop = population.current;

  // Layout
  const W = 340,
    H = 280;
  const padL = 36,
    padR = 10,
    padT = 28,
    padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Population histogram
  const popXMin = 0,
    popXMax = 8;
  const popHist = makeHistogram(pop, binsPop, popXMin, popXMax);
  const popDensityMax = Math.max(...popHist.map((b) => b.density)) * 1.1;

  // Sample plot
  const sampleVals = t > 0 && sim ? sim.samples[t - 1] : [];
  const sampleMean = sampleVals.length ? mean(sampleVals) : null;
  const sampleHist = sampleVals.length
    ? makeHistogram(
        sampleVals,
        Math.max(8, Math.floor(binsPop / 2)),
        popXMin,
        popXMax
      )
    : [];

  // Stacked means
  const meansXMin = 0,
    meansXMax = 4;
  const stackedAll =
    sim && t > 0
      ? stackMeans(sim.means.slice(0, t), binsMeans, meansXMin, meansXMax)
      : [];
  const maxStack = stackedAll.length
    ? Math.max(...stackedAll.map((d) => d.stack))
    : 1;
  const newest = stackedAll[stackedAll.length - 1];
  const binWidth3 = (meansXMax - meansXMin) / binsMeans;
  const tileH3 = (innerH - 10) / (maxStack + 2);
  const tileW3 = Math.max(3, (innerW / binsMeans) * 0.88);

  // Coordinates for token animation
  // Source: vertical line in plot 2
  const plot2MeanX =
    sampleMean != null ? scaleX(sampleMean, popXMin, popXMax, W, padL) : W / 2;
  const plot2TokenY = padT + 10; // top of plot 2

  // Destination: newest tile in plot 3
  const plot3DestX = newest
    ? scaleX(newest.x, meansXMin, meansXMax, W, padL)
    : W / 2;
  const plot3DestY = newest
    ? padT + innerH - newest.stack * tileH3 - tileH3 / 2
    : H / 2;

  // Token animation interpolation
  let tokenStyle = null;
  if (tokenAnim && sampleMean != null) {
    const { phase } = tokenAnim;
    if (phase === 'compress') {
      tokenStyle = {
        x: plot2MeanX - 8,
        y: plot2TokenY,
        w: 16,
        h: 14,
        opacity: 1,
        scale: 1,
      };
    } else if (phase === 'fly') {
      tokenStyle = {
        x: plot2MeanX - 8,
        y: plot2TokenY - 18,
        w: 16,
        h: 14,
        opacity: 0.85,
        scale: 1.1,
      };
    } else if (phase === 'drop') {
      tokenStyle = {
        x: plot3DestX - 8,
        y: plot3DestY - 7,
        w: 16,
        h: 14,
        opacity: 1,
        scale: 1,
      };
    }
  }

  function renderAxes(xMin, xMax, yMax, labels = true) {
    const ticks = 5;
    return (
      <>
        {/* X axis */}
        <line
          x1={padL}
          y1={H - padB}
          x2={W - padR}
          y2={H - padB}
          stroke="#475569"
          strokeWidth={1}
        />
        {/* Y axis */}
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={H - padB}
          stroke="#475569"
          strokeWidth={1}
        />
        {labels &&
          Array.from({ length: ticks + 1 }, (_, i) => {
            const v = xMin + (i / ticks) * (xMax - xMin);
            const px = scaleX(v, xMin, xMax, W, padL);
            return (
              <g key={i}>
                <line
                  x1={px}
                  y1={H - padB}
                  x2={px}
                  y2={H - padB + 4}
                  stroke="#475569"
                  strokeWidth={1}
                />
                <text
                  x={px}
                  y={H - padB + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {v.toFixed(1)}
                </text>
              </g>
            );
          })}
        {labels &&
          Array.from({ length: 4 }, (_, i) => {
            const v = (yMax * (i + 1)) / 4;
            const py = scaleY(v, yMax, H, padT, padB);
            return (
              <g key={i}>
                <line
                  x1={padL - 3}
                  y1={py}
                  x2={padL}
                  y2={py}
                  stroke="#475569"
                  strokeWidth={1}
                />
                <text
                  x={padL - 5}
                  y={py + 3}
                  textAnchor="end"
                  fontSize={8}
                  fill="#94a3b8"
                >
                  {v.toFixed(2)}
                </text>
              </g>
            );
          })}
      </>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '24px 16px',
        background: '#1C2739',
        fontFamily: "'Courier New', monospace",
        color: '#e2e8f0',
      }}
    >
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 6,
            color: '#f59e0b',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Central Limit Theorem
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#f1f5f9',
            letterSpacing: 1,
          }}
        >
          Sampling Distribution Builder
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
          Watch each sample mean compress into a gold token and drop into the
          distribution
        </div>
      </div>

      <div
        style={{ display: 'flex', gap: 16, maxWidth: 1200, margin: '0 auto' }}
      >
        {/* Controls */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: '16px 14px',
            fontSize: 11,
          }}
        >
          <ControlSlider
            label="Sample size (n)"
            value={n}
            min={2}
            max={100}
            onChange={setN}
          />
          <ControlSlider
            label="Num. samples (T)"
            value={T}
            min={20}
            max={500}
            step={10}
            onChange={(v) => {
              setT(v);
            }}
          />
          <ControlSlider
            label="Pop. bins"
            value={binsPop}
            min={10}
            max={60}
            onChange={setBinsPop}
          />
          <ControlSlider
            label="Mean bins"
            value={binsMeans}
            min={10}
            max={60}
            onChange={setBinsMeans}
          />
          <ControlSlider
            label="Delay (ms)"
            value={speed}
            min={30}
            max={600}
            step={10}
            onChange={setSpeed}
          />

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn
                onClick={() => setPlaying(true)}
                active={playing}
                color="#f59e0b"
              >
                ▶ Play
              </Btn>
              <Btn onClick={() => setPlaying(false)} color="#64748b">
                ⏸ Pause
              </Btn>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn
                  onClick={() => {
                    setPlaying(false);
                    setT_val(0);
                    setHighlightedIdx(null);
                  }}
                  color="#475569"
              >
                ↺ Reset
              </Btn>
              <Btn
                onClick={() => setT_val((p) => Math.min(p + 1, T))}
                color="#334155"
              >
                +1 Step
              </Btn>
            </div>
          </div>

          <div style={{ marginTop: 6 }}>
            <Btn onClick={pickRandom} color="#c27d0a" active={highlightedIdx !== null}
              >
              🎲 Random Sample
            </Btn>
          </div>

          

          <div
            style={{
              marginTop: 14,
              borderTop: '1px solid #334155',
              paddingTop: 10,
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            <div style={{ color: '#f59e0b', marginBottom: 4 }}>
              ● Sample drawn: {t}/{T}
            </div>
            {sampleMean != null && (
              <div>
                ● Current mean:{' '}
                <span style={{ color: GOLD }}>{sampleMean.toFixed(3)}</span>
              </div>
            )}
            {t > 0 && <div>● True mean ≈ 1.000</div>}
          </div>
        </div>

        {/* Three plots */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          {/* Plot 1: Population */}
          <PlotCard title="① Population">
            <svg width={W} height={H}>
              {popHist.map((b, i) => {
                const x = scaleX(b.x0, popXMin, popXMax, W, padL);
                const x2 = scaleX(b.x1, popXMin, popXMax, W, padL);
                const y = scaleY(b.density, popDensityMax, H, padT, padB);
                const bh = H - padB - y;
                return (
                  <rect
                    key={i}
                    x={x + 0.5}
                    y={y}
                    width={Math.max(1, x2 - x - 1)}
                    height={bh}
                    fill={POP_COLOR}
                    opacity={0.9}
                  />
                );
              })}
              {renderAxes(popXMin, popXMax, popDensityMax)}
              <text
                x={W / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                Y
              </text>
              <text
                x={12}
                y={H / 2}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
                transform={`rotate(-90,12,${H / 2})`}
              >
                Density
              </text>
            </svg>
          </PlotCard>

          {/* Plot 2: One Sample */}
          <PlotCard
            title="② One Sample Draw"
            subtitle={
              t > 0
                ? `Sample #${t} · n=${n} · mean=${sampleMean?.toFixed(3)}`
                : 'Press Play or Step'
            }
          >
            <svg
              ref={plot2Ref}
              width={W}
              height={H}
              style={{ overflow: 'visible' }}
            >
              {/* Pop density background */}
              {popHist.map((b, i) => {
                const x = scaleX(b.x0, popXMin, popXMax, W, padL);
                const x2 = scaleX(b.x1, popXMin, popXMax, W, padL);
                const y = scaleY(b.density, popDensityMax, H, padT, padB);
                return (
                  <rect
                    key={i}
                    x={x + 0.5}
                    y={y}
                    width={Math.max(1, x2 - x - 1)}
                    height={H - padB - y}
                    fill={POP_COLOR}
                    opacity={0.35}
                  />
                );
              })}
              {/* Sample histogram */}
              {sampleHist.map((b, i) => {
                const x = scaleX(b.x0, popXMin, popXMax, W, padL);
                const x2 = scaleX(b.x1, popXMin, popXMax, W, padL);
                const y = scaleY(b.density, popDensityMax, H, padT, padB);
                return (
                  <rect
                    key={i}
                    x={x + 0.5}
                    y={y}
                    width={Math.max(1, x2 - x - 1)}
                    height={H - padB - y}
                    fill={SAMPLE_COLOR}
                    opacity={0.8}
                  />
                );
              })}
              {renderAxes(popXMin, popXMax, popDensityMax)}

              {/* Mean line */}
              {sampleMean != null && (
                <>
                  <line
                    x1={scaleX(sampleMean, popXMin, popXMax, W, padL)}
                    y1={padT}
                    x2={scaleX(sampleMean, popXMin, popXMax, W, padL)}
                    y2={H - padB}
                    stroke={GOLD}
                    strokeWidth={2}
                    strokeDasharray={
                      tokenAnim?.phase === 'compress' ? '3,2' : 'none'
                    }
                    opacity={
                      tokenAnim?.phase === 'fly' || tokenAnim?.phase === 'drop'
                        ? 0.3
                        : 1
                    }
                    style={{ transition: 'opacity 0.3s' }}
                  />
                  {/* Compression animation: box at top squeezing */}
                  <g style={{ transition: 'transform 0.3s' }}>
                    <rect
                      x={scaleX(sampleMean, popXMin, popXMax, W, padL) - 8}
                      y={padT + 4}
                      width={16}
                      height={14}
                      fill={GOLD}
                      stroke={GOLD_DARK}
                      strokeWidth={1}
                      rx={2}
                      opacity={
                        tokenAnim?.phase === 'fly' ||
                        tokenAnim?.phase === 'drop'
                          ? 0
                          : 1
                      }
                      style={{ transition: 'opacity 0.25s' }}
                    />
                    {/* Arrow from token down */}
                    <line
                      x1={scaleX(sampleMean, popXMin, popXMax, W, padL)}
                      y1={padT + 20}
                      x2={scaleX(sampleMean, popXMin, popXMax, W, padL)}
                      y2={padT + 42}
                      stroke={GOLD}
                      strokeWidth={1.2}
                      markerEnd="url(#arrow)"
                      opacity={tokenAnim?.phase === 'compress' ? 1 : 0}
                      style={{ transition: 'opacity 0.2s' }}
                    />
                  </g>
                  <defs>
                    <marker
                      id="arrow"
                      markerWidth="6"
                      markerHeight="6"
                      refX="3"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L6,3 z" fill={GOLD} />
                    </marker>
                  </defs>
                </>
              )}
              <text
                x={W / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                Y
              </text>
            </svg>
          </PlotCard>

          {/* Plot 3: Sampling Distribution */}
          <PlotCard
            title="③ Sampling Distribution of Means"
            subtitle={
              t > 0
                ? `${t} means stacked · Gold = Newest Sample Mean`
                : 'Means will stack here'
            }
          >
            <svg
              ref={plot3Ref}
              width={W}
              height={H}
              style={{ overflow: 'visible' }}
            >
              {stackedAll.map((d, i) => {
                const isNewest = i === stackedAll.length - 1;
                const isHighlighted = i === highlightedIdx;
                const px = scaleX(d.x, meansXMin, meansXMax, W, padL);
                const py = padT + innerH - d.stack * tileH3 + tileH3 * 0.08;
                return (
                  <rect
                    key={i}
                    x={px - tileW3 / 2}
                    y={py}
                    width={tileW3}
                    height={Math.max(1, tileH3 * 0.88)}
                    fill={isHighlighted ? GOLD : STEEL}
                    opacity={isHighlighted ? 1 : isNewest && !highlightedIdx ? (tokenAnim ? 0.2 : 1) : 0.85}
                    rx={1}
                    style={{ transition: 'opacity 0.3s' }}
                  />
                );
              })}
              {/* Ghost token (drop target)
              {newest && tokenAnim?.phase === 'fly' && (
                <rect
                  x={
                    scaleX(newest.x, meansXMin, meansXMax, W, padL) - tileW3 / 2
                  }
                  y={padT + innerH - newest.stack * tileH3 - tileH3}
                  width={tileW3}
                  height={Math.max(1, tileH3 * 0.88)}
                  fill={GOLD}
                  opacity={0.4}
                  rx={1}
                  strokeDasharray="3,2"
                  stroke={GOLD_DARK}
                  strokeWidth={1}
                />
              )} */}
              {renderAxes(meansXMin, meansXMax, maxStack + 1, true)}
              <text
                x={W / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                Sample Mean
              </text>
            </svg>
          </PlotCard>
        </div>
      </div>

      {/* Flying token overlay — positioned absolutely over the whole viz area */}
      {tokenAnim &&
        sampleMean != null &&
        (() => {
          const { phase } = tokenAnim;

          // Use actual DOM positions from refs for accuracy
          const r2 = plot2Ref.current?.getBoundingClientRect();
          const r3 = plot3Ref.current?.getBoundingClientRect();
          if (!r2 || !r3) return null;

          // Source: mean line x position in plot 2, near the top
          const srcX =
            r2.left + scaleX(sampleMean, popXMin, popXMax, W, padL) - 8;
          const srcY = r2.top + padT + 4;

          // Destination: newest tile position in plot 3
          const dstX = newest
            ? r3.left +
              scaleX(newest.x, meansXMin, meansXMax, W, padL) -
              tileW3 / 2
            : r3.left + W / 2;
          const dstY = newest
            ? r3.top + padT + innerH - newest.stack * tileH3 + tileH3 * 0.08
            : r3.top + H / 2;

          let left, top, opacity;
          if (phase === 'compress') {
            left = srcX;
            top = srcY - 22;
            opacity = 1;
          } else if (phase === 'fly') {
            left = (srcX + dstX) / 2;
            top = srcY - 48;
            opacity = 0.92;
          } else {
            left = dstX;
            top = dstY;
            opacity = 1;
          }

          return (
            <div
              style={{
                position: 'fixed',
                left,
                top,
                width: Math.max(10, tileW3),
                height: 14,
                background: GOLD,
                border: `1px solid ${GOLD_DARK}`,
                borderRadius: 2,
                pointerEvents: 'none',
                zIndex: 999,
                opacity,
                boxShadow: '0 0 12px #f59e0b88',
                transition:
                  phase === 'compress'
                    ? 'none'
                    : phase === 'fly'
                    ? 'left 0.55s cubic-bezier(.4,0,.2,1), top 0.55s cubic-bezier(.4,0,.2,1)'
                    : 'left 0.5s ease-in, top 0.5s ease-in',
              }}
            />
          );
        })()}

      {/* Frame scrubber */}
      <div
        style={{
          maxWidth: 1200,
          margin: '14px auto 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 10, color: '#64748b', minWidth: 60 }}>
          Frame: {t}
        </span>
        <input
          type="range"
          min={0}
          max={T}
          value={t}
          step={1}
          onChange={(e) => {
            setPlaying(false);
            setT_val(Number(e.target.value));
          }}
          style={{ flex: 1, accentColor: GOLD }}
        />
        <span style={{ fontSize: 10, color: '#64748b', minWidth: 30 }}>
          {T}
        </span>
      </div>
    </div>
  );
}

function PlotCard({ title, subtitle, children }) {
  return (
    <div
      style={{
        flex: 1,
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '10px 8px 6px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#f1f5f9',
          marginBottom: 1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#64748b',
          marginBottom: 6,
          minHeight: 12,
        }}
      >
        {subtitle}
      </div>
      {children}
    </div>
  );
}

function Btn({ onClick, children, color = '#334155', active }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 0',
        fontSize: 10,
        cursor: 'pointer',
        background: active ? '#f59e0b' : color,
        color: active ? '#0f172a' : '#e2e8f0',
        border: 'none',
        borderRadius: 5,
        fontFamily: 'inherit',
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function ControlSlider({ label, value, min, max, step = 1, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 2,
          color: '#94a3b8',
          fontSize: 10,
        }}
      >
        <span>{label}</span>
        <span style={{ color: '#f59e0b' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#f59e0b' }}
      />
    </div>
  );
}
