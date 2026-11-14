import { copy, type AlbumDocument } from '../album/document';
/** History copies structured layout only, never photo pixels. */
export class AlbumHistory {
  private past: AlbumDocument[] = [];
  private future: AlbumDocument[] = [];
  remember(before: AlbumDocument) { this.past.push(copy(before)); if (this.past.length > 40) this.past.shift(); this.future = []; }
  undo(current: AlbumDocument) { const value = this.past.pop(); if (value) this.future.push(copy(current)); return value; }
  redo(current: AlbumDocument) { const value = this.future.pop(); if (value) this.past.push(copy(current)); return value; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  retainedAssets() { return new Set([...this.past, ...this.future].flatMap(document => document.assets.map(asset => asset.id))); }
}
