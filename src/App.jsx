import { useState, useEffect, useRef, useMemo } from 'react';
import './index.css';

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePopulation(n = 30000, seed = 42, dist = 'exponential') {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => {
    switch (dist) {
      case 'uniform': return rng() * 6;
      case 'normal': {
        const u1 = Math.max(1e-10, rng()), u2 = rng();
        return 3 + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
      case 'bimodal': {
        const u1 = Math.max(1e-10, rng()), u2 = rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return rng() < 0.5 ? 1.5 + z * 0.6 : 4.5 + z * 0.6;
      }
      case 'beta': {
        const u1 = Math.max(1e-10, rng()), u2 = Math.max(1e-10, rng());
        const x = Math.pow(u1, 2), y = Math.pow(u2, 2);
        return (x / (x + y)) * 6;
      }
      case 'skewed': return Math.pow(-Math.log(1 - Math.min(rng(), 0.9999)), 0.4) * 2;
      default: return -Math.log(1 - Math.min(rng(), 0.9999));
    }
  });
}

function sampleFrom(pop, n, rng) {
  return Array.from({ length: n }, () => pop[Math.floor(rng() * pop.length)]);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function makeHistogram(data, bins, xMin, xMax) {
  const binWidth = (xMax - xMin) / bins;
  const counts = Array(bins).fill(0);
  for (const v of data) {
    if (v >= xMin && v <= xMax) {
      const idx = Math.min(bins - 1, Math.floor((v - xMin) / binWidth));
      if (idx >= 0) counts[idx]++;
    }
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
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((m - xMin) / binWidth)));
    const cx = xMin + (idx + 0.5) * binWidth;
    stacks[idx] = (stacks[idx] || 0) + 1;
    return { x: cx, stack: stacks[idx], idx };
  });
}

function scaleX(val, xMin, xMax, width, pad) {
  return pad + ((val - xMin) / (xMax - xMin)) * (width - 2 * pad);
}
function scaleY(val, yMax, height, padT, padB) {
  return padT + (1 - val / yMax) * (height - padT - padB);
}

function computeRange(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const xMin = sorted[Math.floor(sorted.length * 0.005)];
  const xMax = sorted[Math.floor(sorted.length * 0.995)];
  const pad = (xMax - xMin) * 0.05;
  return { xMin: Math.max(0, xMin - pad), xMax: xMax + pad };
}

const GOLD = '#f59e0b';
const GOLD_DARK = '#92400e';
const STEEL = '#3b82f6';

export default function CLTVisualizer() {
  const [n, setN] = useState(30);
  const [T, setT] = useState(300);
  const [binsPop, setBinsPop] = useState(40);
  const [distType, setDistType] = useState('exponential');
  const [binsMeans, setBinsMeans] = useState(35);
  const [t, setT_val] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(350);
  const [highlightedIdx, setHighlightedIdx] = useState(null);
  const [tokenAnim, setTokenAnim] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  const animRef = useRef(null);
  const prevT = useRef(0);
  const plot2Ref = useRef(null);
  const plot3Ref = useRef(null);
  const simRef = useRef(null);

  const theme = {
    bg:        darkMode ? '#1C2739' : '#f0f4f8',
    panel:     darkMode ? '#0f172a' : '#ffffff',
    controls:  darkMode ? '#1e293b' : '#e2e8f0',
    border:    darkMode ? '#334155' : '#cbd5e1',
    text:      darkMode ? '#e2e8f0' : '#1e293b',
    subtext:   darkMode ? '#64748b' : '#64748b',
    axis:      darkMode ? '#475569' : '#94a3b8',
    tick:      darkMode ? '#94a3b8' : '#475569',
    popBar:    darkMode ? '#334155' : '#94a3b8',
    select:    darkMode ? '#334155' : '#ffffff',
    sampleBar: darkMode ? '#94a3b8' : '#475569',
  };

  const pop = useMemo(() => generatePopulation(30000, 42, distType), [distType]);
  const { xMin: popXMin, xMax: popXMax } = useMemo(() => computeRange(pop), [pop]);

  useEffect(() => {
    const rng = mulberry32(999 + n * 7 + T * 3);
    const samples = Array.from({ length: T }, () => sampleFrom(pop, n, rng));
    const means = samples.map(mean);
    simRef.current = { samples, means };
    setT_val(0);
    setPlaying(false);
    setHighlightedIdx(null);
  }, [n, T, pop]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT_val((prev) => {
        if (prev >= T) { setPlaying(false); return prev; }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [playing, speed, T]);

  useEffect(() => {
    if (t > 0 && t > prevT.current && simRef.current) {
      setHighlightedIdx(null);
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

  const W = 340, H = 280, W3 = 340;
  const padL = 36, padR = 10, padT = 28, padB = 36;
  const innerW = W - padL - padR;
  const innerW3 = W3 - padL - padR;
  const innerH = H - padT - padB;

  const popHist = useMemo(
    () => makeHistogram(pop, binsPop, popXMin, popXMax),
    [pop, binsPop, popXMin, popXMax]
  );
  const popDensityMax = Math.max(...popHist.map((b) => b.density)) * 1.1;

  const sampleVals = t > 0 && sim ? sim.samples[t - 1] : [];
  const sampleMean = sampleVals.length ? mean(sampleVals) : null;
  const sampleHist = sampleVals.length
    ? makeHistogram(sampleVals, Math.max(8, Math.floor(binsPop / 2)), popXMin, popXMax)
    : [];

  const drawnMeans = sim && t > 0 ? sim.means.slice(0, t) : [];
  const popMean = mean(pop);
  const popStd = Math.sqrt(mean(pop.map(x => Math.pow(x - popMean, 2))));
  const seMean = popStd / Math.sqrt(n);
  const meansXMin = Math.max(popXMin, popMean - 4 * seMean);
  const meansXMax = Math.min(popXMax, popMean + 4 * seMean);

  const stackedAll = drawnMeans.length > 0
    ? stackMeans(drawnMeans, binsMeans, meansXMin, meansXMax)
    : [];
  const maxStack = stackedAll.length ? Math.max(...stackedAll.map((d) => d.stack)) : 1;
  const newest = stackedAll[stackedAll.length - 1];
  const tileH3 = (innerH - 10) / (maxStack + 2);
  const tileW3 = Math.max(3, (innerW3 / binsMeans) * 0.88);

  function pickRandom() {
    if (stackedAll.length === 0) return;
    setHighlightedIdx(Math.floor(Math.random() * stackedAll.length));
  }

  function renderAxes(xMin, xMax, yMax, w = W) {
    const ticks = 5;
    return (
      <>
        <line x1={padL} y1={H - padB} x2={w - padR} y2={H - padB} stroke={theme.axis} strokeWidth={1} />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={theme.axis} strokeWidth={1} />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = xMin + (i / ticks) * (xMax - xMin);
          const px = scaleX(v, xMin, xMax, w, padL);
          return (
            <g key={i}>
              <line x1={px} y1={H - padB} x2={px} y2={H - padB + 4} stroke={theme.axis} strokeWidth={1} />
              <text x={px} y={H - padB + 14} textAnchor="middle" fontSize={9} fill={theme.tick}>{v.toFixed(1)}</text>
            </g>
          );
        })}
        {Array.from({ length: 4 }, (_, i) => {
          const v = (yMax * (i + 1)) / 4;
          const py = scaleY(v, yMax, H, padT, padB);
          return (
            <g key={i}>
              <line x1={padL - 3} y1={py} x2={padL} y2={py} stroke={theme.axis} strokeWidth={1} />
              <text x={padL - 5} y={py + 3} textAnchor="end" fontSize={8} fill={theme.tick}>{v.toFixed(2)}</text>
            </g>
          );
        })}
      </>
    );
  }

  return (
    <div style={{
      width: '100%', minHeight: '100vh', padding: '24px 16px',
      background: theme.bg, fontFamily: "'Courier New', monospace", color: theme.text,
      position: 'relative',
    }}>

      {/* Theme toggle — top right */}
      <button
        onClick={() => setDarkMode(d => !d)}
        className="theme-toggle"
        style={{
          position: 'absolute', top: 20, right: 20,
          background: darkMode ? theme.controls : theme.bg,
          borderColor: theme.border,
          color: theme.subtext,
          zIndex: 10,
        }}
      >
        {darkMode ? '☀ Light' : '☾ Dark'}
      </button>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 6, color: GOLD, textTransform: 'uppercase', marginBottom: 4 }}>
          Central Limit Theorem
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, letterSpacing: 1 }}>
          Sampling Distribution Builder
        </div>
        <div style={{ fontSize: 11, color: theme.subtext, marginTop: 3 }}>
          Watch each sample mean compress into a gold token and drop into the distribution
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Three plots */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

          {/* Plot 1: Population */}
          <PlotCard title="① Population" subtitle={distType.charAt(0).toUpperCase() + distType.slice(1)} theme={theme} flex={1}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto">
              <defs>
                <clipPath id="clip1">
                  <rect x={padL} y={padT} width={innerW} height={innerH} />
                </clipPath>
              </defs>
              <g clipPath="url(#clip1)">
                {popHist.map((b, i) => {
                  const x = scaleX(b.x0, popXMin, popXMax, W, padL);
                  const x2 = scaleX(b.x1, popXMin, popXMax, W, padL);
                  const y = scaleY(b.density, popDensityMax, H, padT, padB);
                  return <rect key={i} x={x + 0.5} y={y} width={Math.max(1, x2 - x - 1)} height={H - padB - y} fill={theme.popBar} opacity={0.9} />;
                })}
              </g>
              {renderAxes(popXMin, popXMax, popDensityMax, W)}
              <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill={theme.subtext}>Y</text>
              <text x={12} y={H / 2} textAnchor="middle" fontSize={9} fill={theme.subtext} transform={`rotate(-90,12,${H / 2})`}>Density</text>
            </svg>
          </PlotCard>

          {/* Plot 2: One Sample */}
          <PlotCard
            title="② One Sample Draw"
            subtitle={t > 0 ? `Sample #${t} · n=${n} · mean=${sampleMean?.toFixed(3)}` : 'Press Play or Step'}
            theme={theme} flex={1}
          >
            <svg ref={plot2Ref} viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ overflow: 'visible' }}>
              <defs>
                <clipPath id="clip2">
                  <rect x={padL} y={padT} width={innerW} height={innerH} />
                </clipPath>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={GOLD} />
                </marker>
              </defs>
              <g clipPath="url(#clip2)">
                {popHist.map((b, i) => {
                  const x = scaleX(b.x0, popXMin, popXMax, W, padL);
                  const x2 = scaleX(b.x1, popXMin, popXMax, W, padL);
                  const y = scaleY(b.density, popDensityMax, H, padT, padB);
                  return <rect key={i} x={x + 0.5} y={y} width={Math.max(1, x2 - x - 1)} height={H - padB - y} fill={theme.popBar} opacity={0.35} />;
                })}
                {sampleHist.map((b, i) => {
                  const x = scaleX(b.x0, popXMin, popXMax, W, padL);
                  const x2 = scaleX(b.x1, popXMin, popXMax, W, padL);
                  const y = scaleY(b.density, popDensityMax, H, padT, padB);
                  return <rect key={i} x={x + 0.5} y={y} width={Math.max(1, x2 - x - 1)} height={H - padB - y} fill={theme.sampleBar} opacity={0.8} />;
                })}
              </g>
              {renderAxes(popXMin, popXMax, popDensityMax, W)}
              {sampleMean != null && (
                <>
                  <line
                    x1={scaleX(sampleMean, popXMin, popXMax, W, padL)} y1={padT}
                    x2={scaleX(sampleMean, popXMin, popXMax, W, padL)} y2={H - padB}
                    stroke={GOLD} strokeWidth={2}
                    strokeDasharray={tokenAnim?.phase === 'compress' ? '3,2' : 'none'}
                    opacity={tokenAnim?.phase === 'fly' || tokenAnim?.phase === 'drop' ? 0.3 : 1}
                    style={{ transition: 'opacity 0.3s' }}
                  />
                  <rect
                    x={scaleX(sampleMean, popXMin, popXMax, W, padL) - 8} y={padT + 4}
                    width={16} height={14} fill={GOLD} stroke={GOLD_DARK} strokeWidth={1} rx={2}
                    opacity={tokenAnim?.phase === 'fly' || tokenAnim?.phase === 'drop' ? 0 : 1}
                    style={{ transition: 'opacity 0.25s' }}
                  />
                  <line
                    x1={scaleX(sampleMean, popXMin, popXMax, W, padL)} y1={padT + 20}
                    x2={scaleX(sampleMean, popXMin, popXMax, W, padL)} y2={padT + 42}
                    stroke={GOLD} strokeWidth={1.2} markerEnd="url(#arrow)"
                    opacity={tokenAnim?.phase === 'compress' ? 1 : 0}
                    style={{ transition: 'opacity 0.2s' }}
                  />
                </>
              )}
              <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill={theme.subtext}>Y</text>
            </svg>
          </PlotCard>

          {/* Plot 3: Sampling Distribution */}
          <PlotCard
            flex={1}
            title="③ Sampling Distribution"
            subtitle={t > 0 ? `${t} means stacked · Gold = Newest` : 'Means will stack here'}
            theme={theme}
          >
            <svg ref={plot3Ref} viewBox={`0 0 ${W3} ${H}`} width="100%" height="auto" style={{ overflow: 'visible' }}>
              <defs>
                <clipPath id="clip3">
                  <rect x={padL} y={padT} width={innerW3} height={innerH} />
                </clipPath>
              </defs>
              <g clipPath="url(#clip3)">
                {stackedAll.map((d, i) => {
                  const isNewest = i === stackedAll.length - 1;
                  const isHighlighted = i === highlightedIdx;
                  const px = scaleX(d.x, meansXMin, meansXMax, W3, padL);
                  const py = padT + innerH - d.stack * tileH3 + tileH3 * 0.08;
                  return (
                    <rect
                      key={i}
                      x={px - tileW3 / 2} y={py}
                      width={tileW3} height={Math.max(1, tileH3 * 0.88)}
                      fill={(isHighlighted || (isNewest && highlightedIdx === null)) ? GOLD : STEEL}
                      opacity={(isHighlighted || (isNewest && highlightedIdx === null)) ? (tokenAnim && isNewest ? 0.2 : 1) : 0.85}
                      rx={1} style={{ transition: 'opacity 0.3s' }}
                    />
                  );
                })}
              </g>
              {renderAxes(meansXMin, meansXMax, maxStack + 1, W3)}
              <text x={W3 / 2} y={H - 4} textAnchor="middle" fontSize={9} fill={theme.subtext}>Sample Mean</text>
            </svg>
          </PlotCard>
        </div>

        {/* Controls — horizontal bar below plots */}
        <div style={{
          background: theme.controls,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: '14px 20px',
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}>

          {/* Distribution picker */}
          <div style={{ minWidth: 150 }}>
            <div style={{ color: theme.subtext, fontSize: 10, marginBottom: 6 }}>Population Distribution</div>
            <select
              value={distType}
              onChange={(e) => setDistType(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', fontSize: 10,
                background: theme.select, color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: 5, fontFamily: "'Courier New', monospace", cursor: 'pointer',
              }}
            >
              <option value="exponential">📉 Exponential</option>
              <option value="uniform">▬ Uniform</option>
              <option value="normal">🔔 Normal</option>
              <option value="bimodal">🐫 Bimodal</option>
              <option value="beta">∪ Beta (U-shaped)</option>
              <option value="skewed">📊 Skewed</option>
            </select>
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: theme.border }} />

          {/* Sliders in a grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0 20px', minWidth: 400 }}>
            <ControlSlider label="Sample size (n)" value={n} min={2} max={1000} onChange={setN} theme={theme} />
            <ControlSlider label="Num. samples (T)" value={T} min={20} max={1000} step={10} onChange={setT} theme={theme} />
            <ControlSlider label="Pop. bins" value={binsPop} min={10} max={60} onChange={setBinsPop} theme={theme} />
            <ControlSlider label="Mean bins" value={binsMeans} min={10} max={60} onChange={setBinsMeans} theme={theme} />
            <ControlSlider label="Delay (ms)" value={speed} min={30} max={600} step={10} onChange={setSpeed} theme={theme} />
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: theme.border }} />

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn onClick={() => setPlaying(true)} active={playing} color="#f59e0b">▶ Play</Btn>
              <Btn onClick={() => setPlaying(false)} color="#64748b">⏸ Pause</Btn>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn onClick={() => { setPlaying(false); setT_val(0); setHighlightedIdx(null); }} color="#475569">↺ Reset</Btn>
              <Btn onClick={() => setT_val((p) => Math.min(p + 1, T))} color="#334155">+1 Step</Btn>
            </div>
            <div style={{ display: 'flex' }}>
              <Btn onClick={pickRandom} color="#c27d0a" active={highlightedIdx !== null}>🎲 Random Sample</Btn>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: theme.border }} />

          {/* Stats */}
          <div style={{ fontSize: 11, color: theme.subtext, lineHeight: 2, minWidth: 130 }}>
            <div style={{ color: GOLD }}>● Sample drawn: {t}/{T}</div>
            {sampleMean != null && (
              <div>● Mean: <span style={{ color: GOLD }}>{sampleMean.toFixed(3)}</span></div>
            )}
            {t > 0 && <div>● True mean ≈ {mean(pop).toFixed(3)}</div>}
          </div>

        </div>
      </div>

      {/* Flying token overlay */}
      {tokenAnim && sampleMean != null && (() => {
        const { phase } = tokenAnim;
        const r2 = plot2Ref.current?.getBoundingClientRect();
        const r3 = plot3Ref.current?.getBoundingClientRect();
        if (!r2 || !r3) return null;

        const scaleFactorX2 = r2.width / W;
        const scaleFactorX3 = r3.width / W3;
        const scaleFactorY2 = r2.height / H;
        const scaleFactorY3 = r3.height / H;

        const srcX = r2.left + scaleX(sampleMean, popXMin, popXMax, W, padL) * scaleFactorX2 - 8;
        const srcY = r2.top + (padT + 4) * scaleFactorY2;

        const dstX = newest
          ? r3.left + scaleX(newest.x, meansXMin, meansXMax, W3, padL) * scaleFactorX3 - (tileW3 * scaleFactorX3) / 2
          : r3.left + (W3 / 2) * scaleFactorX3;
        const dstY = newest
          ? r3.top + (padT + innerH - newest.stack * tileH3 + tileH3 * 0.08) * scaleFactorY3
          : r3.top + (H / 2) * scaleFactorY3;

        let left, top, opacity;
        if (phase === 'compress') { left = srcX; top = srcY - 22; opacity = 1; }
        else if (phase === 'fly') { left = (srcX + dstX) / 2; top = Math.min(srcY, dstY) - 48; opacity = 0.92; }
        else { left = dstX; top = dstY; opacity = 1; }

        return (
          <div style={{
            position: 'fixed', left, top,
            width: Math.max(10, tileW3 * scaleFactorX3),
            height: 14,
            background: GOLD, border: `1px solid ${GOLD_DARK}`,
            borderRadius: 2, pointerEvents: 'none', zIndex: 999,
            opacity, boxShadow: '0 0 12px #f59e0b88',
            transition: phase === 'compress' ? 'none'
              : phase === 'fly' ? 'left 0.55s cubic-bezier(.4,0,.2,1), top 0.55s cubic-bezier(.4,0,.2,1)'
              : 'left 0.5s ease-in, top 0.5s ease-in',
          }} />
        );
      })()}

      {/* Frame scrubber */}
      <div style={{ maxWidth: 1200, margin: '14px auto 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 10, color: theme.subtext, minWidth: 60 }}>Frame: {t}</span>
        <input
          type="range" min={0} max={T} value={t} step={1}
          onChange={(e) => { setPlaying(false); setT_val(Number(e.target.value)); }}
          style={{ flex: 1, accentColor: GOLD }}
        />
        <span style={{ fontSize: 10, color: theme.subtext, minWidth: 30 }}>{T}</span>
      </div>
    </div>
  );
}

function PlotCard({ title, subtitle, children, flex = 1, theme }) {
  return (
    <div style={{ flex, minWidth: 0, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '10px 8px 6px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 1 }}>{title}</div>
      <div style={{ fontSize: 12, color: theme.subtext, marginBottom: 6, minHeight: 12 }}>{subtitle}</div>
      {children}
    </div>
  );
}

function Btn({ onClick, children, color = '#334155', active }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '5px 0', fontSize: 10, cursor: 'pointer',
      background: active ? GOLD : color,
      color: active ? '#0f172a' : '#e2e8f0',
      border: 'none', borderRadius: 5, fontFamily: 'inherit', fontWeight: 600,
    }}>
      {children}
    </button>
  );
}

function ControlSlider({ label, value, min, max, step = 1, onChange, theme }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, color: theme.subtext, fontSize: 10 }}>
        <span>{label}</span>
        <span style={{ color: GOLD }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: GOLD }}
      />
    </div>
  );
}
