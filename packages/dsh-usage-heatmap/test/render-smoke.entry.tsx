/**
 * Render smoke test: server-render the settings section component to catch
 * runtime-level mistakes (bad refs, undefined components, broken JSX) that
 * typechecking cannot. Effects do not run under renderToString, so no fetch
 * mock is needed; the empty/loading branch is what renders.
 *
 * Build: esbuild test/render-smoke.entry.tsx --bundle --platform=node
 *        --format=esm --jsx=automatic --outfile=test/render-smoke.mjs
 * Run:   node test/render-smoke.mjs
 */

import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { UsageSection } from '../src/client/UsageSection'

const html = renderToString(React.createElement(UsageSection))
if (!html.includes('用量统计')) throw new Error('render missing section title')
if (!html.includes('加载中')) throw new Error('render missing initial state')
if (!/30(?:<!-- -->)?天/u.test(html)) throw new Error('render missing range tabs')
if (!html.includes('热力依据')) throw new Error('render missing metric toggle')
if (!html.includes('自动刷新')) throw new Error('render missing auto-refresh toggle')
if (!html.includes('在独立标签页打开')) throw new Error('render missing standalone link')
if (!html.includes('dsh_uh_section')) throw new Error('render missing section class')
console.log(`RENDER SMOKE OK (${html.length} chars)`)
