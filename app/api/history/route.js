import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const HISTORY_HOST = 'https://history.macaumarksix.com'
const LATEST_URL = 'https://macaumarksix.com/api/macaujc2.com'
const MAX_HISTORY = 100
const TIMEOUT_MS = 12000

function parseOpenCode(openCode) {
  if (!openCode) return []
  return String(openCode).split(',').map((n) => Number(String(n).trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 49)
}

function parseZodiac(value) {
  if (Array.isArray(value)) return value.map(String)
  if (!value) return []
  return String(value).split(',').map((x) => x.trim()).filter(Boolean)
}

function normalizeItem(item) {
  const numbers = parseOpenCode(item?.openCode)
  const zodiac = parseZodiac(item?.zodiac)
  if (numbers.length < 7) return null
  return {
    expect: String(item?.expect || ''),
    openTime: item?.openTime || '',
    openCode: numbers.slice(0, 7).join(','),
    numbers: numbers.slice(0, 7),
    specialNumber: numbers[6],
    zodiac: zodiac.slice(0, 7),
    specialZodiac: zodiac[6] || '',
  }
}

function sortHistory(list) {
  return [...list].sort((a, b) => {
    const ea = BigInt(String(a?.expect || '0').replace(/\D/g, '') || '0')
    const eb = BigInt(String(b?.expect || '0').replace(/\D/g, '') || '0')
    if (ea !== eb) return eb > ea ? 1 : -1
    return new Date(b?.openTime || 0).getTime() - new Date(a?.openTime || 0).getTime()
  })
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
        referer: 'https://macaujc.com/macaujc2/',
      },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!text?.trim()) throw new Error('接口返回空内容')
    if (text.trim().startsWith('<')) throw new Error('接口返回网页而不是JSON')
    try { return JSON.parse(text) } catch { throw new Error(`JSON解析失败：${text.slice(0,120)}`) }
  } finally { clearTimeout(timer) }
}

async function getYearHistory(year) {
  const json = await fetchJson(`${HISTORY_HOST}/history/macaujc2/y/${year}`)
  return Array.isArray(json?.data) ? json.data : []
}

async function getNewMacauData() {
  const year = new Date().getFullYear()
  const unique = new Map()
  const warnings = []

  for (const y of [year, year - 1]) {
    try {
      const list = await getYearHistory(y)
      for (const item of list) {
        const row = normalizeItem(item)
        if (row?.expect) unique.set(row.expect, row)
      }
    } catch (error) { warnings.push(`${y}历史读取失败：${error.message}`) }
  }

  try {
    const latestJson = await fetchJson(LATEST_URL)
    const latest = normalizeItem(Array.isArray(latestJson) ? latestJson[0] : null)
    if (latest?.expect) unique.set(latest.expect, latest)
  } catch (error) { warnings.push(`最新一期读取失败：${error.message}`) }

  const history = sortHistory(Array.from(unique.values())).slice(0, MAX_HISTORY)
  if (!history.length) throw new Error(`没有获取到新澳门六合彩数据${warnings.length ? `；${warnings.join('；')}` : ''}`)

  const latest = history[0]
  let nextExpect = ''
  try { nextExpect = (BigInt(latest.expect) + 1n).toString() } catch {}

  return {
    ok: true,
    play: 'new-macau',
    source: 'macaujc.com / macaumarksix.com',
    latest,
    nextExpect,
    history,
    historyCount: history.length,
    maxHistory: MAX_HISTORY,
    warnings,
    updatedAt: new Date().toISOString(),
  }
}

export async function GET() {
  try {
    const data = await getNewMacauData()
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } })
  } catch (error) {
    return NextResponse.json({ ok:false, message:error?.message || '获取开奖数据失败' }, { status:500, headers:{'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate'} })
  }
}
