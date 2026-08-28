/**
 * JSONL persistence for the relay (PROTOCOL §9). Append-only file with
 * atomic compaction on load; every write is queued so ordering is stable.
 *
 * Only hashes are ever stored: pairing codes and tokens live on disk
 * exclusively as sha256 (PROTOCOL §10). The relay keeps plaintext tokens in
 * memory only, inside the phone-session table.
 */

import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256Hex } from './auth.ts'

export interface DeviceRow {
  type: 'device'
  deviceId: string
  hostName: string
  createdAt: number
}

export interface PairingRow {
  type: 'pairing'
  deviceId: string
  codeSha: string
  expiresAt: number
}

export interface TokenRow {
  type: 'token'
  deviceId: string
  tokenSha: string
  createdAt: number
  revokedAt: number | null
}

export type Row = DeviceRow | PairingRow | TokenRow

export class JsonlStore {
  private readonly file: string
  private readonly devices = new Map<string, DeviceRow>()
  private readonly pairings = new Map<string, PairingRow>()
  private readonly tokensBySha = new Map<string, TokenRow>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly dir: string, private readonly log: (message: string) => void) {
    this.file = join(dir, 'relay.jsonl')
  }

  /** Load or recreate the store. Must be awaited before any read. */
  async load(): Promise<void> {
    let content: string
    try {
      content = await readFile(this.file, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        await mkdir(this.dir, { recursive: true })
        this.log(`store: ${this.file} created`)
        return
      }
      throw error
    }
    for (const line of content.split('\n')) {
      if (line.trim() === '') continue
      try {
        const row = JSON.parse(line) as Row
        this.apply(row, false)
      } catch {
        this.log(`store: skipping malformed line`)
      }
    }
    this.log(`store: loaded ${this.devices.size} device(s), ${this.pairings.size} pairing(s), ${this.tokensBySha.size} token(s)`)
  }

  private apply(row: Row, persist: boolean): void {
    switch (row.type) {
      case 'device': {
        const prev = this.devices.get(row.deviceId)
        if (prev === undefined || row.createdAt >= prev.createdAt) this.devices.set(row.deviceId, row)
        break
      }
      case 'pairing': {
        const prev = this.pairings.get(row.deviceId)
        if (prev === undefined || row.expiresAt > prev.expiresAt) this.pairings.set(row.deviceId, row)
        break
      }
      case 'token': {
        const prev = this.tokensBySha.get(row.tokenSha)
        if (prev === undefined || row.revokedAt === null || prev.revokedAt === null) {
          this.tokensBySha.set(row.tokenSha, row)
        }
        break
      }
    }
    if (persist) this.append(row)
  }

  /** Serialize the next write on the single writer lane, then append. */
  private append(row: Row): void {
    const line = `${JSON.stringify(row)}\n`
    this.writeQueue = this.writeQueue.then(async () => {
      await appendFile(this.file, line, 'utf8')
    })
    void this.writeQueue
  }

  // -- devices ---------------------------------------------------------------

  findDevice(deviceId: string): DeviceRow | null {
    return this.devices.get(deviceId) ?? null
  }

  /** Every registered device, oldest first (admin overview). */
  listDevices(): DeviceRow[] {
    return [...this.devices.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  /** Every token row ever issued for a device, oldest first (admin console). */
  listTokens(deviceId: string): TokenRow[] {
    return [...this.tokensBySha.values()]
      .filter(row => row.deviceId === deviceId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  upsertDevice(deviceId: string, hostName: string): DeviceRow {
    const existing = this.devices.get(deviceId)
    const row: DeviceRow = {
      type: 'device',
      deviceId,
      hostName,
      createdAt: existing?.createdAt ?? Date.now(),
    }
    this.apply(row, true)
    return row
  }

  // -- pairing codes ---------------------------------------------------------

  findPairing(deviceId: string): PairingRow | null {
    return this.pairings.get(deviceId) ?? null
  }

  findActivePairing(deviceId: string, now = Date.now()): PairingRow | null {
    const row = this.pairings.get(deviceId)
    return row !== undefined && row.expiresAt > now ? row : null
  }

  /**
   * Reverse lookup: which device does this pairing code belong to? Codes are
   * never stored plaintext, so we probe every row's sha256 against `code`.
   */
  findDeviceByCode(code: string, now = Date.now()): DeviceRow | null {
    const codeSha = sha256Hex(code)
    for (const row of this.pairings.values()) {
      if (row.codeSha !== codeSha) continue
      if (row.expiresAt <= now) continue
      return this.devices.get(row.deviceId) ?? null
    }
    return null
  }

  upsertPairing(deviceId: string, code: string, expiresAt: number): PairingRow {
    const row: PairingRow = { type: 'pairing', deviceId, codeSha: sha256Hex(code), expiresAt }
    this.apply(row, true)
    return row
  }

  // -- tokens ----------------------------------------------------------------

  addToken(deviceId: string, token: string, now = Date.now()): TokenRow {
    const row: TokenRow = { type: 'token', deviceId, tokenSha: sha256Hex(token), createdAt: now, revokedAt: null }
    this.apply(row, true)
    return row
  }

  findTokenBySha(tokenSha: string): TokenRow | null {
    return this.tokensBySha.get(tokenSha) ?? null
  }

  /** A token counts as active when present and not revoked. */
  isTokenActive(tokenSha: string): boolean {
    const row = this.tokensBySha.get(tokenSha)
    return row !== undefined && row.revokedAt === null
  }

  /** Revoke every token of a device; returns the revoked token SHAs + device. */
  revokeDeviceToken(deviceId: string, now = Date.now()): string[] {
    const revoked: string[] = []
    for (const row of [...this.tokensBySha.values()]) {
      if (row.deviceId !== deviceId || row.revokedAt !== null) continue
      const updated: TokenRow = { ...row, revokedAt: now }
      this.tokensBySha.set(row.tokenSha, updated)
      this.append(updated)
      revoked.push(row.tokenSha)
    }
    // Drop the (now revoked) pairing row so a revoked device cannot pair again.
    const pairing = this.pairings.get(deviceId)
    if (pairing !== undefined) {
      this.pairings.delete(deviceId)
      this.append({ ...pairing, expiresAt: 0 })
    }
    return revoked
  }

/**
   * Forget a device entirely: drop its device row, pairing rows and every
   * token. The host re-registers on its next hello (§9); all phones must
   * re-pair. Appends tombstone rows so history stays auditable.
   */
  forgetDevice(deviceId: string): void {
    const device = this.devices.get(deviceId)
    if (device !== undefined) {
      this.devices.delete(deviceId)
      this.append({ ...device, type: 'device', createdAt: Date.now(), hostName: device.hostName })
    }
    const pairing = this.pairings.get(deviceId)
    if (pairing !== undefined) {
      this.pairings.delete(deviceId)
      this.append({ ...pairing, type: 'pairing', expiresAt: 0 })
    }
    for (const row of [...this.tokensBySha.values()]) {
      if (row.deviceId !== deviceId) continue
      const updated: TokenRow = { ...row, revokedAt: Date.now() }
      this.tokensBySha.set(row.tokenSha, updated)
      this.append(updated)
    }
  }
}

/** Recreate a store under a fresh path (used by tests, never by the server). */
export async function wipeStore(dir: string): Promise<void> {
  try {
    await rm(join(dir, 'relay.jsonl'), { force: true })
  } catch {
    // nothing to wipe
  }
}