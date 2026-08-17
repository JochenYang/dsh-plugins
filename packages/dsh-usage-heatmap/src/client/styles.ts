/**
 * dsh-usage-heatmap stylesheet, hand-written and injected once by the plugin
 * body (the web server serves exactly one file per client plugin, so no
 * separate CSS artifact may exist). Tokens come ONLY from the shared
 * `--dsw-alias-*` design platform — no literal colors — so the section follows
 * the shell's light/dark theme automatically; chart accents are derived from
 * the brand/status tokens via color-mix. Class names carry the `dsh_uh` prefix
 * to stay unique in the assembled shell.
 */

/** Stable `<style>` element id (idempotent injection across HMR re-runs). */
export const STYLE_ID = 'dsh-usage-heatmap-style'

/** The section's injected stylesheet text. */
export const cssText = `
.dsh_uh_section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dsh_uh_header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.dsh_uh_title {
  margin: 0 8px 0 0;
  color: var(--dsw-alias-label-primary);
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.dsh_uh_tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_uh_tab {
  min-width: 48px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_uh_tab:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_uh_tab[aria-selected='true'] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.dsh_uh_secondaryButton {
  flex: none;
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_uh_secondaryButton:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_uh_autoToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_uh_autoToggle input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
}
.dsh_uh_link {
  margin-left: auto;
  color: var(--dsw-alias-brand-text);
  font-size: 12px;
  text-decoration: none;
}
.dsh_uh_link:hover {
  text-decoration: underline;
}
.dsh_uh_banner {
  display: none;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  border-radius: 8px;
  background: var(--dsw-alias-state-error-secondary);
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_uh_cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  min-width: 0;
}
.dsh_uh_card {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_uh_cardLabel {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh_uh_cardValue {
  margin-top: 3px;
  color: var(--dsw-alias-label-primary);
  font-size: 17px;
  line-height: 24px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.dsh_uh_cardSub {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_uh_panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.dsh_uh_panelTitle {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.dsh_uh_legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh_uh_legendCell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh_uh_legendCell[data-level='1'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_legendCell[data-level='2'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_legendCell[data-level='3'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_legendCell[data-level='4'] {
  background: var(--dsw-alias-brand-primary);
}
.dsh_uh_calendar {
  position: relative;
  display: grid;
  gap: 3px;
  width: max-content;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}
.dsh_uh_calMonth {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.dsh_uh_calDow {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 13px;
  text-align: right;
  padding-right: 5px;
}
.dsh_uh_calCell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
  cursor: default;
}
.dsh_uh_calCell[data-level='1'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_calCell[data-level='2'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_calCell[data-level='3'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_calCell[data-level='4'] {
  background: var(--dsw-alias-brand-primary);
}
.dsh_uh_tooltip {
  position: fixed;
  z-index: 2000;
  display: none;
  min-width: 160px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  /* Follow the shell theme: light theme -> light tooltip, dark theme -> dark tooltip. */
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 6px 24px var(--dsw-alias-bg-mask-2);
  pointer-events: none;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh_uh_tooltipTitle {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dsh_uh_row2 {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dsh_uh_tableWrap {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
}
.dsh_uh_table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.dsh_uh_table th,
.dsh_uh_table td {
  padding: 5px 7px;
  text-align: right;
  white-space: nowrap;
}
.dsh_uh_table th:first-child,
.dsh_uh_table td:first-child {
  padding-left: 12px;
}
.dsh_uh_table th:last-child,
.dsh_uh_table td:last-child {
  padding-right: 12px;
}
.dsh_uh_table th {
  color: var(--dsw-alias-label-tertiary);
  font-weight: 600;
  font-size: 11px;
  line-height: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dsh_uh_table th:first-child,
.dsh_uh_table td:first-child {
  text-align: left;
}
.dsh_uh_table td {
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_uh_table td.dsh_uh_muted {
  color: var(--dsw-alias-label-tertiary);
}
.dsh_uh_share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 92px;
}
.dsh_uh_shareBar {
  display: inline-block;
  height: 5px;
  border-radius: 3px;
  background: var(--dsw-alias-brand-primary);
}
.dsh_uh_chart {
  width: 100%;
  aspect-ratio: 680 / 240;
}
.dsh_uh_chart text {
  fill: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
.dsh_uh_empty {
  padding: 26px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.dsh_uh_footer {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 18px;
}
`

/**
 * Inject the stylesheet once (stable id; HMR-safe).
 */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = cssText
  document.head.appendChild(style)
}
