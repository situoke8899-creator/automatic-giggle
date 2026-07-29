'use client'

import { useEffect, useMemo, useState } from 'react'

const ZODIACS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪']

const ZODIAC_STRATEGIES = [
  { id:'z1', name:'方案1', group:'20期｜9热', window:20, hot:9, cold:0, mode:'recent' },
  { id:'z2', name:'方案2', group:'20期｜8热+1冷', window:20, hot:8, cold:1, mode:'weighted' },
  { id:'z3', name:'方案3', group:'20期｜7热+2冷', window:20, hot:7, cold:2, mode:'omit' },
  { id:'z4', name:'方案4', group:'30期｜9热', window:30, hot:9, cold:0, mode:'recent' },
  { id:'z5', name:'方案5', group:'30期｜8热+1冷', window:30, hot:8, cold:1, mode:'weighted' },
  { id:'z6', name:'方案6', group:'30期｜7热+2冷', window:30, hot:7, cold:2, mode:'omit' },
  { id:'z7', name:'方案7', group:'50期｜9热', window:50, hot:9, cold:0, mode:'recent' },
  { id:'z8', name:'方案8', group:'50期｜8热+1冷', window:50, hot:8, cold:1, mode:'weighted' },
  { id:'z9', name:'方案9', group:'50期｜7热+2冷', window:50, hot:7, cold:2, mode:'omit' },
  { id:'z10', name:'方案10', group:'综合｜稳定9肖', window:30, hot:7, cold:2, mode:'balanced' },
]

const HEAD_STRATEGIES = [
  { id:'h1', group:'20期｜4热', window:20, hot:4, cold:0 },
  { id:'h2', group:'20期｜4热', window:20, hot:4, cold:0 },
  { id:'h3', group:'20期｜4热', window:20, hot:4, cold:0 },
  { id:'h4', group:'20期｜4热', window:20, hot:4, cold:0 },
  { id:'h5', group:'30期｜3热+1冷', window:30, hot:3, cold:1 },
  { id:'h6', group:'30期｜3热+1冷', window:30, hot:3, cold:1 },
  { id:'h7', group:'30期｜3热+1冷', window:30, hot:3, cold:1 },
  { id:'h8', group:'30期｜2热+2冷', window:30, hot:2, cold:2 },
  { id:'h9', group:'30期｜2热+2冷', window:30, hot:2, cold:2 },
  { id:'h10', group:'30期｜2热+2冷', window:30, hot:2, cold:2 },
]

function pct(v){ return `${Number(v||0).toFixed(2)}%` }
function maxMiss(results){ let m=0,c=0; for(const x of results){ if(x)c=0; else {c++;m=Math.max(m,c)} } return m }
function currentMiss(results){ let c=0; for(const x of results){ if(x) break; c++ } return c }
function getHead(n){ n=Number(n); return n>=1&&n<=49 ? Math.floor(n/10) : -1 }

function zodiacMetrics(history, size){
  const src=history.slice(0,size)
  return ZODIACS.map(z=>{
    let count=0, weight=0, omit=src.length
    src.forEach((d,i)=>{
      if(d.specialZodiac===z){ count++; weight += src.length-i; if(omit===src.length) omit=i }
    })
    return {zodiac:z,count,weight,omit}
  })
}

function chooseZodiacs(history, s){
  const m=zodiacMetrics(history,s.window)
  const hot=[...m].sort((a,b)=>{
    if(b.count!==a.count) return b.count-a.count
    if(s.mode==='weighted' && b.weight!==a.weight) return b.weight-a.weight
    if(s.mode==='balanced' && a.omit!==b.omit) return a.omit-b.omit
    return b.weight-a.weight || a.omit-b.omit
  }).slice(0,s.hot).map(x=>x.zodiac)
  const picked=new Set(hot)
  if(s.cold){
    m.filter(x=>!picked.has(x.zodiac)).sort((a,b)=>{
      if(s.mode==='omit') return b.omit-a.omit || a.count-b.count
      if(s.mode==='balanced') return (b.omit*2-b.count)-(a.omit*2-a.count)
      return a.count-b.count || b.omit-a.omit
    }).slice(0,s.cold).forEach(x=>picked.add(x.zodiac))
  }
  m.sort((a,b)=>b.count-a.count||a.omit-b.omit).forEach(x=>{ if(picked.size<9) picked.add(x.zodiac) })
  return [...picked].slice(0,9)
}

function backtestZodiac(history,s,size){
  const rows=[]
  for(let i=0;i<Math.min(size,history.length);i++){
    const past=history.slice(i+1)
    if(past.length<s.window) continue
    const picks=chooseZodiacs(past,s)
    const actual=history[i].specialZodiac
    rows.push({expect:history[i].expect,actual,picks,hit:picks.includes(actual)})
  }
  const results=rows.map(x=>x.hit), hitCount=rows.filter(x=>x.hit).length
  return {rows,testedCount:rows.length,hitCount,hitRate:rows.length?hitCount/rows.length*100:0,maxMiss:maxMiss(results),currentMiss:currentMiss(results)}
}

function zodiacRanking(history){
  return ZODIAC_STRATEGIES.map(s=>{
    const picks=chooseZodiacs(history,s)
    const r20=backtestZodiac(history,s,20), r30=backtestZodiac(history,s,30), r50=backtestZodiac(history,s,50)
    return {...s,picks,r20,r30,r50,score:r20.hitRate*.5+r30.hitRate*.3+r50.hitRate*.2-r20.maxMiss*1.2}
  }).sort((a,b)=>b.score-a.score||b.r20.hitRate-a.r20.hitRate)
}

function zodiacConsensus(ranking){
  const map=new Map(ZODIACS.map(z=>[z,{zodiac:z,appear:0,weight:0}]))
  ranking.forEach((s,i)=>s.picks.forEach(z=>{
    const old=map.get(z); map.set(z,{...old,appear:old.appear+1,weight:old.weight+(10-i)})
  }))
  const stats=[...map.values()].sort((a,b)=>b.appear-a.appear||b.weight-a.weight)
  return {picks:stats.slice(0,9).map(x=>x.zodiac),stats}
}

function headMetrics(history,size){
  const src=history.slice(0,size)
  return Array.from({length:5},(_,head)=>{
    let count=0,weight=0,omit=src.length
    src.forEach((d,i)=>{ if(getHead(d.specialNumber)===head){ count++;weight+=src.length-i;if(omit===src.length)omit=i } })
    return {head,count,weight,omit}
  })
}

function chooseHeads(history,s){
  const m=headMetrics(history,s.window)
  const picked=new Set([...m].sort((a,b)=>b.count-a.count||b.weight-a.weight).slice(0,s.hot).map(x=>x.head))
  if(s.cold) m.filter(x=>!picked.has(x.head)).sort((a,b)=>b.omit-a.omit||a.count-b.count).slice(0,s.cold).forEach(x=>picked.add(x.head))
  m.sort((a,b)=>b.count-a.count).forEach(x=>{if(picked.size<4)picked.add(x.head)})
  return [...picked].slice(0,4).sort()
}

function backtestHead(history,s,size){
  const rows=[]
  for(let i=0;i<Math.min(size,history.length);i++){
    const past=history.slice(i+1)
    if(past.length<s.window) continue
    const picks=chooseHeads(past,s), actual=getHead(history[i].specialNumber)
    rows.push({expect:history[i].expect,actual,picks,hit:picks.includes(actual)})
  }
  const rs=rows.map(x=>x.hit), hitCount=rows.filter(x=>x.hit).length
  return {rows,testedCount:rows.length,hitCount,hitRate:rows.length?hitCount/rows.length*100:0,maxMiss:maxMiss(rs),currentMiss:currentMiss(rs)}
}

function headRanking(history){
  return HEAD_STRATEGIES.map(s=>{
    const picks=chooseHeads(history,s), r20=backtestHead(history,s,20), r30=backtestHead(history,s,30), r50=backtestHead(history,s,50)
    return {...s,picks,r20,r30,r50,score:r20.hitRate*.5+r30.hitRate*.3+r50.hitRate*.2-r20.maxMiss}
  }).sort((a,b)=>b.score-a.score)
}

function Ball({num,special,zodiac}){ return <div className="ballwrap"><span className={special?'ball special':'ball'}>{String(num).padStart(2,'0')}</span><small>{zodiac||''}</small></div> }
function ZBadge({z}){ return <span className="zbadge">{z}</span> }
function HBadge({h}){ return <span className="hbadge">{h}头</span> }

export default function Page(){
  const [data,setData]=useState(null), [error,setError]=useState(''), [loading,setLoading]=useState(true), [copied,setCopied]=useState('')

  async function loadData(){
    setLoading(true); setError('')
    try{
      const res=await fetch('/api/history',{cache:'no-store'}), text=await res.text()
      if(text.trim().startsWith('<')) throw new Error(`/api/history 返回网页而不是JSON（HTTP ${res.status}）`)
      const json=JSON.parse(text)
      if(!res.ok||!json.ok) throw new Error(json.message||`HTTP ${res.status}`)
      setData(json)
    }catch(e){ setError(e.message||'加载失败') }finally{ setLoading(false) }
  }

  useEffect(()=>{ loadData(); const t=setInterval(loadData,30000); return()=>clearInterval(t) },[])

  const history=data?.history||[], latest=data?.latest
  const zRank=useMemo(()=>zodiacRanking(history),[history]), zConsensus=useMemo(()=>zodiacConsensus(zRank),[zRank]), hRank=useMemo(()=>headRanking(history),[history])

  async function copyText(key,text){ try{ await navigator.clipboard.writeText(text);setCopied(key);setTimeout(()=>setCopied(''),1200) }catch{ alert(text) } }

  return <main className="page"><style jsx global>{`
    *{box-sizing:border-box}body{margin:0;background:#07111f;color:#e5edf7;font-family:Arial,'Microsoft YaHei',sans-serif}.page{min-height:100vh;padding:24px;background:radial-gradient(circle at top,#17365e 0%,#07111f 48%,#050914 100%)}.container{max-width:1380px;margin:auto}.card{background:rgba(15,27,48,.94);border:1px solid rgba(148,163,184,.22);border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 16px 36px rgba(0,0,0,.25)}h1,h2{margin:0 0 12px}.sub,.muted{color:#9fb2cc}.hero{display:grid;grid-template-columns:1.35fr .8fr;gap:18px}.latestbox{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}.ballwrap{text-align:center}.ball{display:flex;width:44px;height:44px;border-radius:50%;align-items:center;justify-content:center;background:#e2e8f0;color:#0f172a;font-weight:900}.ball.special{background:linear-gradient(145deg,#fde047,#f97316)}.ballwrap small{display:block;margin-top:4px;color:#cbd5e1}.plus{font-size:24px;font-weight:900;align-self:center}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0}button{cursor:pointer;border:0;border-radius:10px;padding:10px 14px;font-weight:900;background:#38bdf8;color:#07111f}.copy{background:linear-gradient(145deg,#fde047,#f97316)}table{width:100%;border-collapse:collapse;min-width:980px}th,td{padding:10px 9px;border-bottom:1px solid rgba(148,163,184,.16);text-align:left;font-size:13px}th{background:#0a172a;color:#9fb2cc}.scroll{overflow:auto}.zlist,.hlist{display:flex;gap:5px;flex-wrap:wrap}.zbadge,.hbadge{display:inline-flex;min-width:34px;height:30px;padding:0 8px;border-radius:9px;align-items:center;justify-content:center;background:#22c55e;color:#052e16;font-weight:900;border:1px solid #86efac}.hbadge{background:#38bdf8;color:#082f49;border-color:#7dd3fc}.rate{font-size:17px;font-weight:900}.good{color:#4ade80}.mid{color:#fde047}.low{color:#fb7185}.dots{display:grid;grid-template-columns:repeat(10,18px);gap:3px;min-width:210px}.dot{width:18px;height:18px;border-radius:5px;background:#ef4444}.dot.hit{background:#22c55e}.consensus{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:16px;border-radius:14px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25)}.historygrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.draw{display:flex;justify-content:space-between;gap:12px;padding:10px;border-radius:12px;background:rgba(2,6,23,.35)}.drawright{text-align:right}.error{padding:14px;border-radius:12px;background:rgba(239,68,68,.14);color:#fecaca;border:1px solid rgba(248,113,113,.3);margin-bottom:16px}@media(max-width:900px){.page{padding:12px}.hero,.historygrid{display:block}.card{padding:14px}.consensus{display:block}.consensus button{margin-top:12px}}
  `}</style><div className="container">
    <div className="hero">
      <section className="card"><h1>新澳门六合彩｜9生肖预测与回测系统</h1><p className="sub">数据源改为 macaujc.com 新澳门六合彩。最多读取最近100期，按最后特码生肖做10个9生肖方案，并保留4头预测。</p><div className="consensus"><div><div className="muted">下一期综合9生肖｜第 {data?.nextExpect||'-'} 期</div><div className="zlist" style={{marginTop:10}}>{zConsensus.picks.map(z=><ZBadge key={z} z={z}/>)}</div></div><button className="copy" onClick={()=>copyText('z',`第${data?.nextExpect||'-'}期9生肖：${zConsensus.picks.join(' ')}`)}>{copied==='z'?'已复制':'复制9生肖'}</button></div></section>
      <section className="card"><h2>最新开奖</h2>{latest?<><div className="muted">第 {latest.expect} 期｜{latest.openTime}</div><div className="latestbox" style={{marginTop:14}}>{latest.numbers.slice(0,6).map((n,i)=><Ball key={i} num={n} zodiac={latest.zodiac?.[i]}/>)}<span className="plus">+</span><Ball num={latest.specialNumber} special zodiac={latest.specialZodiac}/></div><p><strong>特码：</strong>{String(latest.specialNumber).padStart(2,'0')}｜<strong>生肖：</strong>{latest.specialZodiac||'-'}｜<strong>头：</strong>{getHead(latest.specialNumber)}头</p></>:<p className="muted">等待数据...</p>}</section>
    </div>
    <div className="toolbar"><button onClick={loadData}>{loading?'刷新中...':'刷新数据'}</button><span className="muted">数据源：{data?.source||'macaujc.com'} ｜ 已抓 {data?.historyCount||0}/100期 ｜ 每30秒自动刷新</span></div>{error&&<div className="error">{error}</div>}
    <section className="card"><h2>9生肖方案排行榜｜10个优选方案</h2><p className="sub">每个方案固定选择9个生肖。最后特码生肖在方案9肖内即命中；命中率使用逐期滚动回测。</p><div className="scroll"><table><thead><tr><th>排名</th><th>方案</th><th>逻辑</th><th>下期9生肖</th><th>近20期</th><th>近30期</th><th>近50期</th><th>最大连错</th><th>最近20期走势</th></tr></thead><tbody>{zRank.map((s,i)=><tr key={s.id}><td><strong>{i+1}</strong></td><td><strong>{s.name}</strong></td><td>{s.group}</td><td><div className="zlist">{s.picks.map(z=><ZBadge key={z} z={z}/>)}</div></td><td><span className={s.r20.hitRate>=75?'rate good':s.r20.hitRate>=65?'rate mid':'rate low'}>{pct(s.r20.hitRate)}</span><div className="muted">{s.r20.hitCount}/{s.r20.testedCount}</div></td><td><span className="rate">{pct(s.r30.hitRate)}</span><div className="muted">{s.r30.hitCount}/{s.r30.testedCount}</div></td><td><span className="rate">{pct(s.r50.hitRate)}</span><div className="muted">{s.r50.hitCount}/{s.r50.testedCount}</div></td><td>{s.r50.maxMiss}<div className="muted">当前 {s.r20.currentMiss}</div></td><td><div className="dots">{s.r20.rows.slice().reverse().map(r=><span key={r.expect} className={r.hit?'dot hit':'dot'} title={`第${r.expect}期｜${r.actual}｜${r.hit?'中':'未中'}`}/>)}</div></td></tr>)}</tbody></table></div></section>
    <section className="card"><h2>头数预测｜10个优选方案</h2><p className="sub">保留之前的20期4热、30期3热+1冷、30期2热+2冷；每套固定预测4个头。</p><div className="scroll"><table><thead><tr><th>排名</th><th>逻辑</th><th>下期4头</th><th>20期</th><th>30期</th><th>50期</th><th>最大连错</th><th>走势</th></tr></thead><tbody>{hRank.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{s.group}</td><td><div className="hlist">{s.picks.map(h=><HBadge key={h} h={h}/>)}</div></td><td className="rate">{pct(s.r20.hitRate)}</td><td>{pct(s.r30.hitRate)}</td><td>{pct(s.r50.hitRate)}</td><td>{s.r50.maxMiss}</td><td><div className="dots">{s.r20.rows.slice().reverse().map(r=><span key={r.expect} className={r.hit?'dot hit':'dot'}/>)}</div></td></tr>)}</tbody></table></div></section>
    <section className="card"><h2>最近100期开奖｜特码生肖</h2><div className="historygrid">{history.map(d=><div className="draw" key={d.expect}><div><strong>第 {d.expect} 期</strong><div className="muted">{d.openTime}</div></div><div className="drawright"><strong>{String(d.specialNumber).padStart(2,'0')}｜{d.specialZodiac||'-'}</strong><div className="muted">{getHead(d.specialNumber)}头</div></div></div>)}</div></section>
    <section className="card"><h2>说明</h2><p className="sub">生肖直接读取 macaujc.com 接口返回的 zodiac 字段，不自行按年份推算。历史回测只用于统计，不保证未来结果。</p></section>
  </div></main>
}
