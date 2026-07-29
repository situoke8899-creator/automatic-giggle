'use client'

import { useEffect, useMemo, useState } from 'react'

const ZODIACS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪']
const WINDOWS = [20, 30, 50, 100]

// 10套固定公式。每套都不是“用当期开奖结果反推”，而是逐期只看该期以前的数据。
const FORMULAS = [
  {id:'f1', name:'稳健综合', desc:'20/30/50/100期均衡 + 近期权重', w:{r20:.30,r30:.25,r50:.20,r100:.15,rec:.10,omit:-.05,mom:.05}},
  {id:'f2', name:'短线热势', desc:'最近10/20期 + 近期加权', w:{r10:.30,r20:.35,r30:.10,rec:.20,mom:.10,omit:-.05}},
  {id:'f3', name:'中线均衡', desc:'20/30/50期稳定优先', w:{r20:.25,r30:.35,r50:.25,r100:.05,rec:.10}},
  {id:'f4', name:'长线稳定', desc:'50/100期占主要权重', w:{r20:.10,r30:.15,r50:.30,r100:.35,rec:.10}},
  {id:'f5', name:'热度防断', desc:'热度 + 短遗漏，避开长期断层', w:{r20:.35,r30:.20,rec:.20,shortOmit:.15,mom:.10}},
  {id:'f6', name:'回补平衡', desc:'中热为主 + 适度遗漏回补', w:{r20:.20,r30:.25,r50:.20,rec:.10,rebound:.25}},
  {id:'f7', name:'低波动', desc:'各窗口最低表现也要稳定', kind:'stability'},
  {id:'f8', name:'动量增强', desc:'最近10期相对30期升温', w:{r10:.25,r20:.25,r30:.15,r50:.10,rec:.10,mom:.25}},
  {id:'f9', name:'防冷过滤', desc:'频率为主，强惩罚极冷和长遗漏', w:{r20:.25,r30:.25,r50:.20,r100:.10,rec:.10,omit:-.10,coldPenalty:-.20}},
  {id:'f10', name:'多模型共识', desc:'综合前9套公式排名', kind:'ensemble'},
]

function pct(v){ return `${Number(v||0).toFixed(2)}%` }
function clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,v)) }
function maxMiss(rs){ let m=0,c=0; for(const x of rs){ if(x)c=0; else{c++;m=Math.max(m,c)} } return m }
function currentMiss(rs){ let c=0; for(const x of rs){ if(x)break;c++ } return c }

function metrics(history){
  const getWindow = (n)=>history.slice(0,n)
  return ZODIACS.map(z=>{
    const count = (n)=>getWindow(n).filter(x=>x.specialZodiac===z).length
    const rate = (n)=> n ? count(n)/Math.min(n,history.length||1) : 0
    let omit=history.length
    history.forEach((d,i)=>{ if(omit===history.length && d.specialZodiac===z) omit=i })
    let rec=0, den=0
    history.slice(0,30).forEach((d,i)=>{
      const w=30-i
      den+=w
      if(d.specialZodiac===z) rec+=w
    })
    const r10=rate(10), r20=rate(20), r30=rate(30), r50=rate(50), r100=rate(100)
    const expected=1/12
    const mom=r10-r30
    // 短遗漏分：0~4期较强，太久未出不继续无限加分
    const shortOmit=clamp(1-omit/8)
    // 回补分：适度遗漏2~8期更高，极端遗漏反而下降
    const rebound=clamp(1-Math.abs(omit-5)/8)
    const coldPenalty=omit>=10 || r30<expected*.45 ? 1 : 0
    return {z,r10,r20,r30,r50,r100,rec:den?rec/den:0,omit:clamp(omit/15),shortOmit,rebound,mom,coldPenalty}
  })
}

function rawScore(m, formula){
  if(formula.kind==='stability'){
    const floor=Math.min(m.r20,m.r30,m.r50,m.r100)
    const avg=(m.r20+m.r30+m.r50+m.r100)/4
    return floor*.65+avg*.25+m.rec*.10-m.omit*.04
  }
  const w=formula.w||{}
  return (
    (w.r10||0)*m.r10 + (w.r20||0)*m.r20 + (w.r30||0)*m.r30 +
    (w.r50||0)*m.r50 + (w.r100||0)*m.r100 + (w.rec||0)*m.rec +
    (w.omit||0)*m.omit + (w.shortOmit||0)*m.shortOmit +
    (w.rebound||0)*m.rebound + (w.mom||0)*m.mom +
    (w.coldPenalty||0)*m.coldPenalty
  )
}

function chooseForFormula(history, formula, priorFormulaPicks=null){
  const ms=metrics(history)

  if(formula.kind==='ensemble'){
    const rankScore=new Map(ZODIACS.map(z=>[z,0]))
    for(const picks of priorFormulaPicks||[]){
      picks.forEach((z,idx)=>rankScore.set(z,rankScore.get(z)+(9-idx)))
    }
    return [...rankScore.entries()].sort((a,b)=>b[1]-a[1]).slice(0,9).map(x=>x[0])
  }

  return ms
    .map(m=>({...m,score:rawScore(m,formula)}))
    .sort((a,b)=>b.score-a.score || a.omit-b.omit)
    .slice(0,9)
    .map(x=>x.z)
}

function allPicks(history){
  const out=[]
  for(const f of FORMULAS){
    out.push(chooseForFormula(history,f,out))
  }
  return out
}

function backtest(history, formulaIndex, size){
  const rows=[]
  const limit=Math.min(size,history.length)

  for(let i=0;i<limit;i++){
    const past=history.slice(i+1)
    if(past.length<20) continue

    const picksList=allPicks(past)
    const picks=picksList[formulaIndex]
    const actual=history[i].specialZodiac
    rows.push({
      expect:history[i].expect,
      actual,
      picks,
      hit:Boolean(actual) && picks.includes(actual),
    })
  }

  const rs=rows.map(x=>x.hit)
  const hitCount=rows.filter(x=>x.hit).length
  return {
    rows,
    testedCount:rows.length,
    hitCount,
    hitRate:rows.length ? hitCount/rows.length*100 : 0,
    maxMiss:maxMiss(rs),
    currentMiss:currentMiss(rs),
  }
}

function buildRanking(history){
  const picksList=allPicks(history)
  return FORMULAS.map((f,i)=>{
    const r20=backtest(history,i,20)
    const r30=backtest(history,i,30)
    const r50=backtest(history,i,50)
    const r100=backtest(history,i,100)
    // 更重视最近20/30期，但保留长样本；同时惩罚连错。
    const score=r20.hitRate*.40+r30.hitRate*.30+r50.hitRate*.20+r100.hitRate*.10-r20.maxMiss*1.5
    return {...f,picks:picksList[i],r20,r30,r50,r100,score}
  }).sort((a,b)=>b.score-a.score || b.r20.hitRate-a.r20.hitRate || a.r20.maxMiss-b.r20.maxMiss)
}

function consensus(ranking){
  const map=new Map(ZODIACS.map(z=>[z,{z,appear:0,weight:0}]))
  ranking.forEach((s,i)=>s.picks.forEach(z=>{
    const old=map.get(z)
    map.set(z,{...old,appear:old.appear+1,weight:old.weight+(10-i)})
  }))
  const stats=[...map.values()].sort((a,b)=>b.appear-a.appear||b.weight-a.weight)
  return {picks:stats.slice(0,9).map(x=>x.z),stats}
}

function Z({z}){ return <span className="z">{z}</span> }
function Ball({n,z,special=false}){ return <div className="bw"><span className={special?'ball sp':'ball'}>{String(n).padStart(2,'0')}</span><small>{z||'-'}</small></div> }

export default function Page(){
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [copied,setCopied]=useState(false)

  async function load(){
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/history',{cache:'no-store'})
      const text=await res.text()
      if(text.trim().startsWith('<')) throw new Error(`/api/history 返回网页而不是JSON（HTTP ${res.status}）`)
      const j=JSON.parse(text)
      if(!res.ok||!j.ok) throw new Error(j.message||`HTTP ${res.status}`)
      setData(j)
    }catch(e){setError(e.message||'加载失败')}finally{setLoading(false)}
  }

  useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[])
  const history=data?.history||[]
  const ranking=useMemo(()=>buildRanking(history),[history])
  const con=useMemo(()=>consensus(ranking),[ranking])
  const latest=data?.latest

  async function copy(){
    const txt=`第${data?.nextExpect||'-'}期综合9生肖：${con.picks.join(' ')}`
    try{await navigator.clipboard.writeText(txt);setCopied(true);setTimeout(()=>setCopied(false),1200)}catch{alert(txt)}
  }

  return <main className="page">
    <style jsx global>{`
      *{box-sizing:border-box}body{margin:0;background:#07111f;color:#e6eef8;font-family:Arial,'Microsoft YaHei',sans-serif}
      .page{min-height:100vh;padding:22px;background:radial-gradient(circle at top,#17365e,#07111f 48%,#050914)}
      .wrap{max-width:1450px;margin:auto}.card{background:#0e1c31;border:1px solid #263a55;border-radius:16px;padding:18px;margin-bottom:18px}
      h1,h2{margin:0 0 10px}.muted,.sub{color:#9db1ca}.hero{display:grid;grid-template-columns:1.25fr .75fr;gap:16px}
      .cons{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:16px;padding:14px;border-radius:13px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25)}
      .zlist{display:flex;flex-wrap:wrap;gap:6px}.z{display:inline-flex;min-width:34px;height:31px;padding:0 8px;align-items:center;justify-content:center;border-radius:9px;background:#22c55e;color:#052e16;border:1px solid #86efac;font-weight:900}
      button{border:0;border-radius:10px;background:#38bdf8;color:#062238;font-weight:900;padding:10px 14px;cursor:pointer}.copy{background:linear-gradient(145deg,#fde047,#f97316)}
      .balls{display:flex;gap:7px;flex-wrap:wrap;align-items:flex-start}.bw{text-align:center}.ball{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#0f172a;font-weight:900}.sp{background:linear-gradient(145deg,#fde047,#f97316)}.bw small{display:block;margin-top:4px}
      .toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0}.error{padding:13px;background:rgba(239,68,68,.14);border:1px solid #7f1d1d;border-radius:10px;color:#fecaca}
      .scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1180px}th,td{padding:10px;border-bottom:1px solid #26364d;text-align:left;font-size:13px}th{background:#08172a;color:#9db1ca}
      .rank{font-size:18px;font-weight:900}.rate{font-size:18px;font-weight:900}.good{color:#4ade80}.mid{color:#fde047}.low{color:#fb7185}.formula{color:#93c5fd}.dots{display:grid;grid-template-columns:repeat(10,18px);gap:3px;min-width:210px}.dot{width:18px;height:18px;border-radius:5px;background:#ef4444}.hit{background:#22c55e}
      .note{padding:14px;border-radius:12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);line-height:1.7}.history{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.draw{padding:10px;border-radius:10px;background:#091629}.draw strong{display:block}
      @media(max-width:900px){.page{padding:10px}.hero,.history{display:block}.card{padding:13px}.cons{display:block}.cons button{margin-top:12px}.draw{margin-bottom:8px}}
    `}</style>

    <div className="wrap">
      <div className="hero">
        <section className="card">
          <h1>新澳门六合彩｜9生肖优化预测系统</h1>
          <p className="sub">10套独立公式全部采用逐期滚动回测。重点修复繁体生肖「馬/龍/雞/豬」与简体「马/龙/鸡/猪」不一致造成的假性未中。</p>
          <div className="cons">
            <div>
              <div className="muted">下一期综合9生肖｜第 {data?.nextExpect||'-'} 期</div>
              <div className="zlist" style={{marginTop:10}}>{con.picks.map(z=><Z key={z} z={z}/>)}</div>
            </div>
            <button className="copy" onClick={copy}>{copied?'已复制':'复制综合9生肖'}</button>
          </div>
        </section>

        <section className="card">
          <h2>最新开奖</h2>
          {latest?<>
            <div className="muted">第 {latest.expect} 期｜{latest.openTime}</div>
            <div className="balls" style={{marginTop:12}}>
              {latest.numbers.slice(0,6).map((n,i)=><Ball key={i} n={n} z={latest.zodiac?.[i]}/>)}
              <span style={{fontSize:24,paddingTop:8}}>+</span>
              <Ball n={latest.specialNumber} z={latest.specialZodiac} special/>
            </div>
            <p><strong>特码生肖：</strong>{latest.specialZodiac||'-'}</p>
          </>:<p className="muted">等待加载...</p>}
        </section>
      </div>

      <div className="toolbar">
        <button onClick={load}>{loading?'刷新中...':'刷新数据'}</button>
        <span className="muted">数据源：{data?.source||'macaujc.com'}｜最近 {data?.historyCount||0}/100期｜每30秒刷新</span>
      </div>
      {error&&<div className="error">{error}</div>}

      <section className="card">
        <h2>10个优化9生肖公式｜自动按真实滚动回测排名</h2>
        <p className="sub">每套固定选9肖。不是简单“9热/8热+1冷”，而是把不同时间窗口、近期权重、遗漏、动量、稳定性组合成不同模型，再按20/30/50/100期表现动态排序。</p>
        <div className="scroll"><table>
          <thead><tr><th>排名</th><th>公式</th><th>逻辑</th><th>下期9生肖</th><th>近20</th><th>近30</th><th>近50</th><th>近100</th><th>最大连错</th><th>最近20期走势</th></tr></thead>
          <tbody>{ranking.map((s,i)=><tr key={s.id}>
            <td className="rank">{i+1}</td>
            <td><strong>{s.name}</strong></td>
            <td className="formula">{s.desc}</td>
            <td><div className="zlist">{s.picks.map(z=><Z key={z} z={z}/>)}</div></td>
            <td><span className={s.r20.hitRate>=75?'rate good':s.r20.hitRate>=65?'rate mid':'rate low'}>{pct(s.r20.hitRate)}</span><div className="muted">{s.r20.hitCount}/{s.r20.testedCount}</div></td>
            <td><span className="rate">{pct(s.r30.hitRate)}</span><div className="muted">{s.r30.hitCount}/{s.r30.testedCount}</div></td>
            <td><span className="rate">{pct(s.r50.hitRate)}</span><div className="muted">{s.r50.hitCount}/{s.r50.testedCount}</div></td>
            <td><span className="rate">{pct(s.r100.hitRate)}</span><div className="muted">{s.r100.hitCount}/{s.r100.testedCount}</div></td>
            <td>{s.r50.maxMiss}<div className="muted">当前 {s.r20.currentMiss}</div></td>
            <td><div className="dots">{s.r20.rows.slice().reverse().map(r=><span key={r.expect} className={r.hit?'dot hit':'dot'} title={`第${r.expect}期｜${r.actual}｜${r.hit?'中':'未中'}`}/>)}</div></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="card">
        <h2>为什么旧版会出现50%左右</h2>
        <div className="note">
          macaujc.com 的 API 示例生肖使用繁体字，例如「馬、龍、雞、豬」。旧版预测列表使用「马、龙、鸡、猪」。
          JavaScript 字符串比较时它们并不相等，因此实际开出这些生肖时，即使方案视觉上看起来包含，也会被程序判成“未中”。
          本版在 API 层统一转换后再统计，所以回测才是正确的。
        </div>
      </section>

      <section className="card">
        <h2>最近100期特码生肖</h2>
        <div className="history">{history.map(d=><div className="draw" key={d.expect}>
          <strong>第 {d.expect} 期</strong>
          <span className="muted">{d.openTime}</span>
          <div style={{marginTop:5}}>{String(d.specialNumber).padStart(2,'0')}｜<b>{d.specialZodiac||'-'}</b></div>
        </div>)}</div>
      </section>

      <section className="card">
        <p className="sub">说明：9生肖相当于覆盖12生肖中的9个，理论覆盖率为75%。任何公式都不能保证未来高于75%；本页面的作用是避免数据错误、比较不同历史模型，并用严格的滚动回测减少“看了答案再选”的偏差。</p>
      </section>
    </div>
  </main>
}
