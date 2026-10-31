import * as THREE from 'three';
import {dimensions as D} from './dimensions';

export type RoomLightSettings = {enabled: boolean; color: string; brightness: number};
export const ROOM_LIGHT_STORAGE_KEY = 'tideline-room-light-v1';
export const DEFAULT_ROOM_LIGHT: Readonly<RoomLightSettings> = Object.freeze({enabled: false, color: '#ffd6a3', brightness: 50});

export function normalizeRoomLightSettings(value: unknown): RoomLightSettings {
  const input = value && typeof value === 'object' ? value as Partial<RoomLightSettings> : {};
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_ROOM_LIGHT.enabled,
    color: typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : DEFAULT_ROOM_LIGHT.color,
    brightness: typeof input.brightness === 'number' && Number.isFinite(input.brightness)
      ? THREE.MathUtils.clamp(input.brightness, 0, 100) : DEFAULT_ROOM_LIGHT.brightness,
  };
}

export function loadRoomLightSettings(): RoomLightSettings {
  try { return normalizeRoomLightSettings(JSON.parse(localStorage.getItem(ROOM_LIGHT_STORAGE_KEY) ?? 'null')); }
  catch { return {...DEFAULT_ROOM_LIGHT}; }
}

/** Keep a zero-intensity light in the scene so toggles reuse prewarmed shaders. */
export function createRoomLight(initial: RoomLightSettings = loadRoomLightSettings()) {
  const light = new THREE.PointLight(DEFAULT_ROOM_LIGHT.color, 0, 4.3, 2);
  light.name = 'room-ceiling-light';
  light.position.set(0, D.room.height - .22, 0);
  light.castShadow = false;
  let settings = normalizeRoomLightSettings(initial), active = false, disposed = false;
  const apply = () => {
    light.color.set(settings.color);
    light.intensity = active && settings.enabled ? settings.brightness * .3 : 0;
  };
  apply();
  return {
    light,
    getSettings() { return {...settings}; },
    setSettings(value: RoomLightSettings) {
      if (disposed) return;
      settings = normalizeRoomLightSettings(value); apply();
    },
    setActive(value: boolean) { if (!disposed) { active = value; apply(); } },
    dispose() {
      if (disposed) return;
      disposed = true; light.intensity = 0; light.removeFromParent(); light.dispose();
    },
  };
}
