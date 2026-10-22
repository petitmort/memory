export type BookProjection = { corners: { x: number; y: number }[] };

/** Map a DOM rectangle to the actual four projected corners of the paper. */
export function paperTransform(width: number, height: number, projection: BookProjection, left: number, top: number) {
  if (projection.corners.length !== 4 || width <= 0 || height <= 0) return null;
  const source = [[0, 0], [width, 0], [width, height], [0, height]];
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = source[i], u = projection.corners[i].x - left, v = projection.corners[i].y - top;
    if (!Number.isFinite(u + v)) return null;
    rows.push([x, y, 1, 0, 0, 0, -u*x, -u*y, u]);
    rows.push([0, 0, 0, x, y, 1, -v*x, -v*y, v]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let n = column; n <= 8; n++) rows[column][n] /= divisor;
    for (let row = 0; row < 8; row++) if (row !== column) {
      const multiplier = rows[row][column];
      for (let n = column; n <= 8; n++) rows[row][n] -= multiplier * rows[column][n];
    }
  }
  const [a,b,c,d,e,f,g,h] = rows.map(row => row[8]);
  return `matrix3d(${[a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1].join(',')})`;
}

/** The page grows out of the 3D paper; controls appear only after the handoff. */
export async function transitionReader(reader: HTMLElement, projection: BookProjection | undefined, opening: boolean, reducedMotion: boolean) {
  const wrap = reader.querySelector<HTMLElement>('.book-wrap')!;
  const rect = wrap.getBoundingClientRect();
  const projected = projection && paperTransform(rect.width, rect.height, projection, rect.left, rect.top);
  const duration = reducedMotion ? 100 : opening ? 760 : 480;
  const controls = Array.from(reader.querySelectorAll<HTMLElement>('.reader-top,.reader-bottom,.page-nav'));
  const animations: Animation[] = [];
  reader.classList.add('is-transitioning');
  wrap.style.transformOrigin = '0 0';
  wrap.style.willChange = 'transform,opacity';
  const easing = 'cubic-bezier(.22,.7,.2,1)';
  if (projected && !reducedMotion) {
    animations.push(wrap.animate([
      { transform: opening ? projected : 'none', opacity: opening ? .12 : 1 },
      { transform: opening ? 'none' : projected, opacity: opening ? 1 : .06 },
    ], { duration, easing, fill: 'both' }));
  } else {
    animations.push(wrap.animate([{opacity:opening?0:1},{opacity:opening?1:0}],{duration,fill:'both'}));
  }
  animations.push(reader.animate([
    { backgroundColor: opening ? 'rgba(25,56,49,0)' : 'rgba(25,56,49,.64)', backdropFilter: opening ? 'blur(0px)' : 'blur(15px)' },
    { backgroundColor: opening ? 'rgba(25,56,49,.64)' : 'rgba(25,56,49,0)', backdropFilter: opening ? 'blur(15px)' : 'blur(0px)' },
  ], { duration, easing, fill: 'both' }));
  for (const control of controls) animations.push(control.animate(opening
    ? [{opacity:0,offset:0},{opacity:0,offset:.6},{opacity:1,offset:1}]
    : [{opacity:1,offset:0},{opacity:0,offset:.3},{opacity:0,offset:1}],
  {duration,fill:'both'}));
  try {
    await Promise.all(animations.map(animation => animation.finished));
  } finally {
    if (!opening) reader.classList.add('hidden');
    reader.classList.remove('is-transitioning');
    wrap.style.removeProperty('transform-origin');
    wrap.style.removeProperty('will-change');
    for (const animation of animations) animation.cancel();
  }
}
