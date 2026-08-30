/**
 * A small library of Warli motifs, drawn rather than imported.
 *
 * The form's entire vocabulary is three shapes: a circle, a triangle, and a straight line.
 * A person is two triangles meeting at the waist with a circle for a head. A hut is a
 * triangle on a square. Cattle are the same two triangles turned on their side. Nothing is
 * shaded, nothing is filled in with detail — the whole village fits on one wall because
 * every figure is reduced to the least that still reads.
 *
 * Everything here is stroked at roughly 1px on a small viewBox so it keeps the quality of
 * rice paste drawn on mud with a bamboo stick, rather than looking like vector clip art.
 * All are decorative and marked aria-hidden.
 */

type M = {className?: string};

const svg = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  role: "presentation" as const,
};

// ---------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------

/** One figure: circle head, two triangles for the torso, sticks for limbs. */
export function WarliFigure({className = ""}: M) {
  return (
    <svg viewBox="0 0 16 30" className={className} strokeWidth="1.2" {...svg}>
      <circle cx="8" cy="5.5" r="2.8" fill="currentColor" stroke="none" />
      <path d="M8 8.6 L4 16 L12 16 Z" fill="currentColor" stroke="none" />
      <path d="M8 8.6 L4.6 2.2 M8 8.6 L11.4 2.2" strokeWidth="0" />
      <path d="M4.4 11 L1 13.5 M11.6 11 L15 13.5" />
      <path d="M6.4 16 L4.4 25 M9.6 16 L11.6 25" />
    </svg>
  );
}

/**
 * The tarpa dance: dancers linked arm to arm around the musician. Warli paints it as a
 * spiral; here it is a ring, which is the same idea — everyone holding on to everyone,
 * which is also what a cooperative treasury is.
 */
export function WarliTarpaCircle({className = "", dancers = 10}: M & {dancers?: number}) {
  const cx = 50;
  const cy = 50;
  const r = 33;
  const people = Array.from({length: dancers}, (_, i) => {
    const a = (i / dancers) * Math.PI * 2 - Math.PI / 2;
    return {x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), deg: (a * 180) / Math.PI + 90};
  });

  return (
    <svg viewBox="0 0 100 100" className={className} strokeWidth="1" {...svg}>
      {/* the ring of linked arms */}
      <circle cx={cx} cy={cy} r={r} opacity="0.4" />
      {/* the tarpa player at the centre */}
      <g>
        <circle cx={cx} cy={cy - 5} r="2.4" fill="currentColor" stroke="none" />
        <path d={`M${cx} ${cy - 2.6} L${cx - 3.4} ${cy + 4} L${cx + 3.4} ${cy + 4} Z`} fill="currentColor" stroke="none" />
        <path d={`M${cx + 2.6} ${cy} C ${cx + 8} ${cy + 1}, ${cx + 8} ${cy + 6}, ${cx + 3} ${cy + 6}`} />
        <path d={`M${cx - 2} ${cy + 4} L${cx - 3.4} ${cy + 10} M${cx + 2} ${cy + 4} L${cx + 3.4} ${cy + 10}`} />
      </g>
      {people.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.deg}) scale(0.42)`}>
          <circle cx="0" cy="-9" r="2.7" fill="currentColor" stroke="none" />
          <path d="M0 -6.2 L-4 2 L4 2 Z" fill="currentColor" stroke="none" />
          <path d="M-3.4 -3.6 L-9 -6 M3.4 -3.6 L9 -6" strokeWidth="2.2" />
          <path d="M-1.9 2 L-4 10 M1.9 2 L4 10" strokeWidth="2.2" />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// the village
// ---------------------------------------------------------------------------

/** A tree: a trunk with paired branches, and birds sitting in it. */
export function WarliTree({className = ""}: M) {
  return (
    <svg viewBox="0 0 40 60" className={className} strokeWidth="1.1" {...svg}>
      <path d="M20 58 L20 16" />
      <path d="M20 44 L9 34 M20 44 L31 34" />
      <path d="M20 34 L11 25 M20 34 L29 25" />
      <path d="M20 25 L13 17 M20 25 L27 17" />
      <path d="M9 34 L6 28 M31 34 L34 28" />
      <path d="M11 25 L8 20 M29 25 L32 20" />
      {/* leaves, as the small strokes Warli uses */}
      <path d="M20 16 L17 10 M20 16 L23 10 M20 16 L20 8" />
      {/* a bird on a branch */}
      <g transform="translate(30 20)">
        <path d="M0 0 L4.5 -1.6 L2.2 2.4 Z" fill="currentColor" stroke="none" />
        <circle cx="4.8" cy="-2.4" r="1.1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** A hut: a triangular thatch over a square, the way a Warli village is drawn. */
export function WarliHut({className = ""}: M) {
  return (
    <svg viewBox="0 0 44 40" className={className} strokeWidth="1.1" {...svg}>
      <path d="M4 20 L22 4 L40 20 Z" />
      <path d="M8 20 L8 37 L36 37 L36 20" />
      <path d="M18 37 L18 27 L26 27 L26 37" />
      {/* the ridge line and the roof combing */}
      <path d="M22 4 L22 20" opacity="0.5" />
      <path d="M11 15 L33 15" opacity="0.4" />
    </svg>
  );
}

/** Cattle: the same two triangles as a person, laid on their side. */
export function WarliCattle({className = ""}: M) {
  return (
    <svg viewBox="0 0 54 36" className={className} strokeWidth="1.1" {...svg}>
      <path d="M14 14 L34 8 L34 20 Z" fill="currentColor" stroke="none" />
      <path d="M34 8 L44 14 L34 20 Z" fill="currentColor" stroke="none" opacity="0.85" />
      <circle cx="46" cy="10" r="3" fill="currentColor" stroke="none" />
      <path d="M44 7.5 L41 3 M48.4 7.6 L51 3" />
      <path d="M18 18 L15 31 M26 17 L24 31 M32 18 L34 31 M38 18 L40 31" />
      <path d="M14 14 L5 8" />
    </svg>
  );
}

/** The sun: a circle with straight rays. Warli paints it beside the moon. */
export function WarliSun({className = ""}: M) {
  const rays = Array.from({length: 12}, (_, i) => (i / 12) * Math.PI * 2);
  return (
    <svg viewBox="0 0 40 40" className={className} strokeWidth="1.1" {...svg}>
      <circle cx="20" cy="20" r="7.5" />
      {rays.map((a, i) => (
        <path
          key={i}
          d={`M${20 + 11 * Math.cos(a)} ${20 + 11 * Math.sin(a)} L${20 + 16.5 * Math.cos(a)} ${
            20 + 16.5 * Math.sin(a)
          }`}
        />
      ))}
    </svg>
  );
}

/** A pot-carrier: the figure Warli uses for everyday work rather than ritual. */
export function WarliCarrier({className = ""}: M) {
  return (
    <svg viewBox="0 0 22 34" className={className} strokeWidth="1.2" {...svg}>
      <ellipse cx="11" cy="4" rx="4.6" ry="2.6" />
      <path d="M6.6 4 C 6.6 8, 15.4 8, 15.4 4" />
      <circle cx="11" cy="11" r="2.6" fill="currentColor" stroke="none" />
      <path d="M11 14 L7.4 21 L14.6 21 Z" fill="currentColor" stroke="none" />
      <path d="M7.8 16.4 L4.6 12 M14.2 16.4 L17.4 12" />
      <path d="M9.4 21 L7.6 30 M12.6 21 L14.4 30" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// borders and frames
// ---------------------------------------------------------------------------

/**
 * The triangle border Warli runs along the edge of a wall painting. Tiles horizontally,
 * so it works as a section divider at any width.
 */
export function WarliBorder({className = ""}: M) {
  const teeth = Array.from({length: 40}, (_, i) => i * 10);
  return (
    <svg
      viewBox="0 0 400 12"
      className={className}
      strokeWidth="0.9"
      preserveAspectRatio="none"
      {...svg}
    >
      <path d="M0 11 H400" opacity="0.55" />
      {teeth.map((x) => (
        <path key={x} d={`M${x} 11 L${x + 5} 2 L${x + 10} 11`} />
      ))}
    </svg>
  );
}

/**
 * The chauk — the sacred square Warli paints for a wedding, with the mother goddess
 * Palaghata inside it. Used here as a corner frame rather than a full ritual square.
 */
export function WarliChaukCorner({className = ""}: M) {
  return (
    <svg viewBox="0 0 48 48" className={className} strokeWidth="1" {...svg}>
      <path d="M2 46 L2 2 L46 2" />
      <path d="M8 46 L8 8 L46 8" opacity="0.6" />
      <path d="M14 46 L14 14 L46 14" opacity="0.3" />
      <circle cx="24" cy="24" r="1.4" fill="currentColor" stroke="none" opacity="0.55" />
      <circle cx="33" cy="24" r="1.4" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="24" cy="33" r="1.4" fill="currentColor" stroke="none" opacity="0.4" />
    </svg>
  );
}

/** A drawn divider — a line with a waver, so it reads as painted not as a CSS border. */
export function HandRule({className = ""}: M) {
  return (
    <svg viewBox="0 0 1000 6" className={className} strokeWidth="1.1" preserveAspectRatio="none" {...svg}>
      <path d="M2 3.4 C 120 2.1, 210 4.3, 330 3.0 S 540 1.9, 660 3.6 S 850 4.4, 998 2.6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// composed scenes
// ---------------------------------------------------------------------------

/**
 * A village band: sun, trees, huts, cattle and a line of dancers along one ground line.
 * This is how a Warli wall is actually composed — not one motif, but a whole settlement
 * scattered across a single surface with everything sharing the same earth.
 */
export function WarliVillage({className = ""}: M) {
  return (
    <svg viewBox="0 0 620 96" className={className} strokeWidth="1.05" preserveAspectRatio="xMinYMid meet" {...svg}>
      {/* the ground everything stands on */}
      <path d="M4 88 H616" opacity="0.45" />

      <g transform="translate(6 24) scale(0.62)">
        <WarliSunInline />
      </g>

      <g transform="translate(58 34) scale(0.92)">
        <WarliTreeInline />
      </g>

      <g transform="translate(112 52) scale(0.9)">
        <WarliHutInline />
      </g>

      <g transform="translate(172 62) scale(0.78)">
        <WarliCattleInline />
      </g>

      {/* the dancers, linked */}
      <g transform="translate(238 58) scale(0.95)">
        {[0, 26, 52, 78, 104, 130].map((x, i) => (
          <g key={x} transform={`translate(${x} 0) ${i % 2 ? "scale(-1 1)" : ""}`}>
            <circle cx="0" cy="-22" r="3" fill="currentColor" stroke="none" />
            <path d="M0 -19 L-4.4 -10 L4.4 -10 Z" fill="currentColor" stroke="none" />
            <path d="M-3.8 -16 L-13 -19 M3.8 -16 L13 -19" />
            <path d="M-1.8 -10 L-4.6 0 M1.8 -10 L4.6 0" />
          </g>
        ))}
      </g>

      <g transform="translate(410 52) scale(0.9)">
        <WarliHutInline />
      </g>

      <g transform="translate(472 30) scale(0.95)">
        <WarliTreeInline />
      </g>

      <g transform="translate(532 60) scale(0.8)">
        <WarliCarrierInline />
      </g>

      <g transform="translate(570 62) scale(0.7)">
        <WarliCattleInline />
      </g>
    </svg>
  );
}

/* Inline variants: the same drawings without their own <svg> wrapper, so they can be
   composed into a scene. Kept beside the standalone versions rather than abstracted,
   because the indirection would cost more than the duplication. */

function WarliSunInline() {
  const rays = Array.from({length: 12}, (_, i) => (i / 12) * Math.PI * 2);
  return (
    <g>
      <circle cx="0" cy="0" r="8" />
      {rays.map((a, i) => (
        <path
          key={i}
          d={`M${11.5 * Math.cos(a)} ${11.5 * Math.sin(a)} L${17 * Math.cos(a)} ${17 * Math.sin(a)}`}
        />
      ))}
    </g>
  );
}

function WarliTreeInline() {
  return (
    <g>
      <path d="M0 56 L0 2" />
      <path d="M0 42 L-12 31 M0 42 L12 31" />
      <path d="M0 31 L-10 21 M0 31 L10 21" />
      <path d="M0 20 L-8 12 M0 20 L8 12" />
      <path d="M0 2 L-4 -5 M0 2 L4 -5 M0 2 L0 -7" />
      <g transform="translate(11 20)">
        <path d="M0 0 L5 -1.8 L2.4 2.6 Z" fill="currentColor" stroke="none" />
        <circle cx="5.4" cy="-2.6" r="1.2" fill="currentColor" stroke="none" />
      </g>
    </g>
  );
}

function WarliHutInline() {
  return (
    <g>
      <path d="M-19 0 L0 -18 L19 0 Z" />
      <path d="M-15 0 L-15 18 L15 18 L15 0" />
      <path d="M-5 18 L-5 7 L5 7 L5 18" />
      <path d="M-11 -5 L11 -5" opacity="0.4" />
    </g>
  );
}

function WarliCattleInline() {
  return (
    <g>
      <path d="M-20 0 L0 -6 L0 6 Z" fill="currentColor" stroke="none" />
      <path d="M0 -6 L10 0 L0 6 Z" fill="currentColor" stroke="none" opacity="0.85" />
      <circle cx="12" cy="-4" r="3" fill="currentColor" stroke="none" />
      <path d="M10 -6.5 L7 -11 M14.4 -6.4 L17 -11" />
      <path d="M-16 4 L-19 17 M-8 3 L-10 17 M-2 4 L0 17 M4 4 L6 17" />
      <path d="M-20 0 L-29 -6" />
    </g>
  );
}

function WarliCarrierInline() {
  return (
    <g>
      <ellipse cx="0" cy="-30" rx="4.8" ry="2.6" />
      <path d="M-4.4 -30 C -4.4 -26, 4.4 -26, 4.4 -30" />
      <circle cx="0" cy="-23" r="2.8" fill="currentColor" stroke="none" />
      <path d="M0 -20 L-3.8 -12 L3.8 -12 Z" fill="currentColor" stroke="none" />
      <path d="M-3.2 -17.6 L-6.6 -22 M3.2 -17.6 L6.6 -22" />
      <path d="M-1.8 -12 L-3.6 -1 M1.8 -12 L3.6 -1" />
    </g>
  );
}
