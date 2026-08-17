/**
 * PetSettingsSection: the "宠物" page inside DSH Settings (settings.section slot).
 * All edits write through the pet settings namespace via petScope.set() and
 * apply live (the overlay re-renders from the same scope).
 */
import { useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import type { PetSettingsClient } from './types'

const CORNER_OPTIONS = [
  ['bottom-right', '右下角'],
  ['bottom-left', '左下角'],
  ['top-right', '右上角'],
  ['top-left', '左上角'],
  ['custom', '自由位置'],
] as const

const ANIMATION_LABELS: Array<[string, string]> = [
  ['idle', '待机'],
  ['happy', '开心'],
  ['sad', '难过'],
  ['think', '思考/聆听'],
  ['sleep', '睡觉'],
  ['wave', '挥手'],
]

export interface PetSettingsSectionProps {
  usePetConfig?: (sel?: any, eq?: any) => any
  petScope?: {
    set(field: string, value: unknown): Promise<void>
  }
  close?: () => void
}

export function PetSettingsSection(props: PetSettingsSectionProps): ReactElement {
  const value = props.usePetConfig?.((s: any) => (s !== undefined && s !== null && s.status === 'ready' ? s.value : undefined)) as PetSettingsClient | undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 24px' }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>宠物</h2>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
        展示 DSH 桌面宠物小狐狸：悬浮在窗口角落、可拖拽；LLM 回复流式输出、完成或内容情绪变化时播放不同动画。
      </p>

      <Row label="启用宠物">
        <Switch checked={value?.enabled ?? true} onChange={(v) => { void props.petScope?.set('enabled', v) }} />
      </Row>

      <Row label={`大小 ${Math.round(value?.size ?? 120)}px`}>
        <input
          type="range" min={40} max={400} step={4}
          value={value?.size ?? 120}
          onChange={(e) => { void props.petScope?.set('size', Number(e.target.value)) }}
          style={{ width: 220 }}
        />
      </Row>

      <Row label={`透明度 ${Math.round((value?.opacity ?? 1) * 100)}%`}>
        <input
          type="range" min={10} max={100} step={5}
          value={Math.round((value?.opacity ?? 1) * 100)}
          onChange={(e) => { void props.petScope?.set('opacity', Number(e.target.value) / 100) }}
          style={{ width: 220 }}
        />
      </Row>

      <Row label={`动画速度 ×${(value?.speed ?? 1).toFixed(1)}`}>
        <input
          type="range" min={2} max={30} step={1}
          value={Math.round((value?.speed ?? 1) * 10)}
          onChange={(e) => { void props.petScope?.set('speed', Number(e.target.value) / 10) }}
          style={{ width: 220 }}
        />
      </Row>

      <Row label="停靠位置">
        <select
          value={value?.corner ?? 'bottom-right'}
          onChange={(e) => { void props.petScope?.set('corner', e.target.value) }}
          style={{ padding: '4px 8px', borderRadius: 6, background: 'transparent' }}
        >
          {CORNER_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </Row>

      {(value?.corner ?? 'bottom-right') === 'custom' ? (
        <Row label="自由位置（也可以直接拖动宠物调整）">
          <span>
            X&nbsp;
            <input type="number" min={0} style={{ width: 72 }}
              key={'ox-' + (value?.offsetX ?? 0)}
              defaultValue={value?.offsetX ?? 0}
              onBlur={(e) => { void props.petScope?.set('offsetX', Number(e.target.value) || 0) }} />
            &nbsp;Y&nbsp;
            <input type="number" min={0} style={{ width: 72 }}
              key={'oy-' + (value?.offsetY ?? 0)}
              defaultValue={value?.offsetY ?? 0}
              onBlur={(e) => { void props.petScope?.set('offsetY', Number(e.target.value) || 0) }} />
          </span>
        </Row>
      ) : (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
          停靠偏移：直接拖动宠物即可微调并自动保存；拖到角落会吸附回对应预设。
        </p>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>情绪反应</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ToggleRow label="流式回复时播放“思考/聆听”动画" checked={value?.reactions?.streaming ?? true}
            onChange={(v) => { void props.petScope?.set('reactions', { ...(value?.reactions ?? {}), streaming: v }) }} />
          <ToggleRow label="回复完成时播放情绪动画" checked={value?.reactions?.complete ?? true}
            onChange={(v) => { void props.petScope?.set('reactions', { ...(value?.reactions ?? {}), complete: v }) }} />
          <ToggleRow label="回复出错时播放“难过”动画" checked={value?.reactions?.error ?? true}
            onChange={(v) => { void props.petScope?.set('reactions', { ...(value?.reactions ?? {}), error: v }) }} />
          <ToggleRow label="按回复内容情绪选择动画（欢迎→挥手，积极→开心，道歉→难过）" checked={value?.reactions?.sentiment ?? true}
            onChange={(v) => { void props.petScope?.set('reactions', { ...(value?.reactions ?? {}), sentiment: v }) }} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>动作帧映射</div>
        <p style={{ margin: '2px 0 8px', fontSize: 11, opacity: 0.6, lineHeight: 1.5 }}>
          帧编号对应精灵图格子（1-32）：1-3 大视图；4-11 顶部第二行；12-19 动画第 1 行；20-22 第 2 行；23-28 第 3 行；29-32 第 4 行。逗号分隔，按顺序循环。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ANIMATION_LABELS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 90, fontSize: 12 }}>{label}</span>
              <input
                style={{ width: 180, padding: '4px 8px', borderRadius: 6 }}
                key={'anim-' + key + '-' + (value?.animations?.[key as 'idle'] ?? '')}
                defaultValue={value?.animations?.[key as 'idle'] ?? ''}
                onBlur={(e) => {
                  const next = { ...(value?.animations ?? {}) } as Record<string, string>
                  next[key] = e.target.value
                  void props.petScope?.set('animations', next)
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row(props: { label: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13 }}>{props.label}</span>
      {props.children}
    </div>
  )
}

function ToggleRow(props: { label: string; checked: boolean; onChange(v: boolean): void }): ReactElement {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
      <Switch checked={props.checked} onChange={props.onChange} />
      <span>{props.label}</span>
    </label>
  )
}

function Switch(props: { checked: boolean; onChange(v: boolean): void }): ReactElement {
  return (
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(e) => { props.onChange(e.target.checked) }}
      style={{ width: 16, height: 16, accentColor: 'var(--dsh-accent, #4c8dff)', cursor: 'pointer' }}
    />
  )
}
