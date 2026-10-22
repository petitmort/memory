/** All lengths are metres; X = width, Y = height, Z = depth. */
export const dimensions = {
  room: { width: 4.6, depth: 5.4, height: 2.7, wall: 0.18 },
  door: {
    width: 0.9,
    height: 2.1,
    thickness: 0.045,
    centerX: 0.55,
    threshold: 0.015,
    handleHeight: 1.0,
  },
  window: { width: 3.0, height: 1.6, sill: 0.85, frame: 0.045 },
  desk: { width: 1.4, depth: 0.75, height: 0.75, top: 0.035 },
  stool: { diameter: 0.36, height: 0.45, seat: 0.035 },
  album: { width: 0.32, depth: 0.26, height: 0.035 },
  cup: { diameter: 0.085, height: 0.095 },
  bouquet: { scale: 0.32, approximateLength: 0.4, approximateWidth: 0.28 },
  rug: { width: 2.0, depth: 1.4, thickness: 0.008 },
  console: { width: 0.9, depth: 0.32, height: 0.78 },
  eye: 1.65,
} as const;
