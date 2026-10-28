# Beanbag cotton cloth

The beanbag cover uses an original AI-generated, photographic-style cotton textile swatch created for this project with OpenAI image generation on 2026-10-28. It does not contain a brand logo or a third-party product photograph. The chair takes visual direction from the user's reference, rather than reproducing an official branded model or measured product material.

The source was generated as a flat, evenly lit mustard cotton twill/canvas material. The source PNG is retained in the local authoring workspace at `.work/beanbag-photo/cotton-source.png`; this authoring file is not downloaded by the site. Runtime assets live in `src/assets/` and receive content-hashed filenames through Vite:

- `beanbag-cotton-albedo.webp`: 1024 × 1024, sRGB, 363,912 bytes. The resized generated swatch supplies the dyed cotton colour and subtle yarn variation.
- `beanbag-cotton-normal.webp`: 512 × 512, linear data, 75,158 bytes. Derived from the fine, high-pass yarn detail with relief calibrated to approximately 22 µm, rather than turning broad colour changes into large surface bumps.
- `beanbag-cotton-roughness.webp`: 256 × 256, linear data, 18,356 bytes. A separate high-roughness map keeps the cloth matte while retaining restrained fibre variation.

Together the three WebP files total 457,426 bytes, approximately 447 KiB. One tile represents approximately 12 cm. The cover uses gentle sheen, no metalness or clearcoat, and shared textures for the shell and seat. The centimetre-scale folds, compressed base and seat depression come from the chair geometry; the normal map only supplies fine cloth relief.

`src/beanbag-fabric.ts` waits for all maps to finish loading before the scene's shader compilation and GPU warmup. Disposal releases the shared maps and materials and prevents late loads from retaining a lost scene.
