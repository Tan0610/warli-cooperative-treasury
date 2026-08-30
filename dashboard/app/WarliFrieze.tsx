/**
 * A Warli frieze, drawn rather than imported.
 *
 * The form's whole vocabulary is two triangles for a torso, a circle for a head, and
 * straight lines for limbs — figures reduced to the point where a whole village fits on
 * one wall. The tarpa dance, where dancers link arms in a spiral around a musician, is its
 * signature image, and it happens to be the right one here: a row of people holding on to
 * each other, sharing what comes in.
 *
 * Deliberately hand-drawn in SVG at ~1px stroke so it reads as chalk on mud rather than as
 * clip art, and marked aria-hidden because it carries no information a screen reader needs.
 */

function Dancer({x, flip = false}: {x: number; flip?: boolean}) {
  // torso: two triangles meeting at the waist, the Warli convention
  return (
    <g transform={`translate(${x} 0) ${flip ? "scale(-1 1)" : ""}`}>
      <circle cx="0" cy="7" r="3.1" />
      <path d="M0 10.2 L-4.6 19 L4.6 19 Z" />
      <path d="M0 10.2 L-4.6 2.2 L4.6 2.2 Z" fill="none" />
      {/* arms reaching to the next dancer */}
      <path d="M-4.2 12.5 L-11 9" />
      <path d="M4.2 12.5 L11 9" />
      {/* legs mid-step */}
      <path d="M-1.7 19 L-4.4 27.5" />
      <path d="M1.7 19 L4.6 27.5" />
    </g>
  );
}

export function WarliFrieze({className = ""}: {className?: string}) {
  const dancers = [22, 52, 82, 112, 142, 172, 202, 232];

  return (
    <svg
      viewBox="0 0 254 32"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      /* xMin, not xMid: at a wide aspect ratio the figures would otherwise be
         letterboxed into the centre of the element and shrunk. */
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
      role="presentation"
    >
      {dancers.map((x, i) => (
        <Dancer key={x} x={x} flip={i % 2 === 1} />
      ))}
      {/* the ground they dance on */}
      <path d="M4 29.5 H250" strokeWidth="0.8" opacity="0.45" />
    </svg>
  );
}

/**
 * A drawn divider. A 1px CSS border is the most recognisable "made by a framework" mark
 * on a page; a line with a slight waver in it reads as something someone drew. The path
 * is fixed rather than randomised so it does not shift between server and client render.
 */
export function HandRule({className = ""}: {className?: string}) {
  return (
    <svg
      viewBox="0 0 1000 6"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      preserveAspectRatio="none"
      aria-hidden="true"
      role="presentation"
    >
      <path d="M2 3.4 C 120 2.1, 210 4.3, 330 3.0 S 540 1.9, 660 3.6 S 850 4.4, 998 2.6" />
    </svg>
  );
}

/**
 * The single figure used as a marker beside section headings — the same vocabulary,
 * one dancer instead of eight.
 */
export function WarliMark({className = ""}: {className?: string}) {
  return (
    <svg
      viewBox="0 0 16 30"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden="true"
      role="presentation"
    >
      <circle cx="8" cy="6" r="3" />
      <path d="M8 9.2 L3.6 18 L12.4 18 Z" />
      <path d="M3.8 11.5 L0.8 14" />
      <path d="M12.2 11.5 L15.2 14" />
      <path d="M6.3 18 L4 26" />
      <path d="M9.7 18 L12 26" />
    </svg>
  );
}
