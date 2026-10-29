# Design Direction: Smart OCR & Data Entry Assistant

## 1. Identity & Personality
- **Product:** Smart OCR & Data Entry Assistant
- **Target Audience:** Indonesian shop owners, retail cashiers, administrative data entry staff, and accounting bookkeepers.
- **Personality:** Precision utility, reliable, calm, and focused. Designed for high-speed document verification rather than decorative flair.
- **Tone:** Professional, clear, no marketing fluff or fake metrics.

## 2. Color Palette & Theming
- **Base Neutrals (Slate / Zinc):**
  - Background: `#f8fafc` (Slate 50) in light mode, `#0f172a` (Slate 900) in dark workbench mode.
  - Surfaces / Panels: `#ffffff` (White) / `#1e293b` (Slate 800).
  - Borders & Dividers: `#e2e8f0` (Slate 200) / `#334155` (Slate 700).
  - Text Primary: `#0f172a` (Slate 900) / `#f1f5f9` (Slate 100).
  - Text Secondary: `#64748b` (Slate 500) / `#94a3b8` (Slate 400).
- **Functional Accent (Emerald):**
  - Verification & Success: `#059669` (Emerald 600) / `#10b981` (Emerald 500). Used strictly on confirmed data status, export action, and verified total matches.
- **Alert / Discrepancy (Amber & Rose):**
  - Mismatch Alert: `#d97706` (Amber 600) for items where calculated sum does not equal scanned total.
  - Error: `#e11d48` (Rose 600) for unreadable / unparsed required fields.

## 3. Typography
- **UI / Headings / Labels:** System Sans stack (`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- **Numbers / Currencies / OCR Tokens:** Tabular Monospace (`"JetBrains Mono", "Cascadia Code", Consolas, monospace`) ensuring numerical alignment across receipt line items and totals.

## 4. Layout & Rhythm
- **Density:** High-density split workbench (50% Receipt Canvas Viewer, 50% Tabular Data & Validation Form).
- **Hierarchy:** Clear distinction between raw OCR inputs and validated exported data.
- **Dials:**
  - ENERGY: 2 (Restrained, focused professional tool).
  - RHYTHM: 2 (Consistent workbench panels with intentional distinction between canvas controls and data grid).
  - MOTION: 1 (Instantaneous or subtle 150ms state changes; no slow decorative easing or floating animations).
