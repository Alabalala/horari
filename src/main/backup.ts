import { app } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { db, restoreDatabase, updateSetting, getSettings } from './db'

const BACKUP_DIR = join(app.getPath('userData'), 'backups')

export type BackupInfo = {
  filename: string
  date: string
  size: number
}

async function ensureBackupDir() {
  try {
    await fs.access(BACKUP_DIR)
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
  }
}

export async function createBackup(isAuto = false): Promise<BackupInfo> {
  await ensureBackupDir()
  
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-')
  const filename = `backup-${timestamp}.db`
  const backupPath = join(BACKUP_DIR, filename)
  
  // Use SQLite backup API for safety
  await db.backup(backupPath)
  
  const stats = await fs.stat(backupPath)
  
  if (isAuto) {
      updateSetting('lastAutoBackup', now.toISOString())
  }
  
  await pruneBackups()
  
  return {
    filename,
    date: now.toISOString(),
    size: stats.size
  }
}

export async function getBackups(): Promise<BackupInfo[]> {
  await ensureBackupDir()
  const files = await fs.readdir(BACKUP_DIR)
  
  const backups = await Promise.all(
    files
      .filter(f => f.endsWith('.db'))
      .map(async (f) => {
        const stats = await fs.stat(join(BACKUP_DIR, f))
        return {
          filename: f,
          date: stats.mtime.toISOString(),
          size: stats.size
        }
      })
  )
  
  return backups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function restoreBackup(filename: string): Promise<void> {
  const backupPath = join(BACKUP_DIR, filename)
  restoreDatabase(backupPath)
}

async function pruneBackups() {
  const backups = await getBackups()
  if (backups.length > 3) {
    const toDelete = backups.slice(3)
    for (const backup of toDelete) {
      await fs.unlink(join(BACKUP_DIR, backup.filename))
    }
  }
}

export async function checkAutoBackup() {
    const settings = getSettings()
    const frequency = settings.autoBackupFrequency || 'off' // off, daily, weekly, monthly
    
    if (frequency === 'off') return
    
    const lastBackupStr = settings.lastAutoBackup
    if (!lastBackupStr) {
        await createBackup(true)
        return
    }
    
    const lastBackup = new Date(lastBackupStr)
    const now = new Date()
    const diff = now.getTime() - lastBackup.getTime()
    
    const day = 24 * 60 * 60 * 1000
    
    let shouldBackup = false
    if (frequency === 'daily' && diff > day) shouldBackup = true
    if (frequency === 'weekly' && diff > 7 * day) shouldBackup = true
    if (frequency === 'monthly' && diff > 30 * day) shouldBackup = true
    
    if (shouldBackup) {
        await createBackup(true)
    }
}
