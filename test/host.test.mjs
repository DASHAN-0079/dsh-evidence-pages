import { append, text } from './log-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { Session } from '@deepseek-ai/dsh-session'
import Registry from '@deepseek-ai/dsh-session-projection'
import Meter from '@deepseek-ai/dsh-token-meter'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Pruner from '../pruner.js'
import Engine from '../engine.js'
import { readPage } from '../source.js'
import { apply } from '../page.js'
import { candidates } from '../policy.js'
test('compress a historical region using the visible later clarification and the observed tool call',async t=>{
  const old=process.env.DSH_EVIDENCE_POLICY
  process.env.DSH_EVIDENCE_POLICY='jevos'
  t.after(()=>{if(old===undefined)delete process.env.DSH_EVIDENCE_POLICY;else process.env.DSH_EVIDENCE_POLICY=old})
  const ctx=new Context();new Registry(ctx);new Meter(ctx)
  const session=Session.create('clarified-fixture')
  append(session,1)
  new Pruner(ctx).pruneSession(session)
  const nodes=[...session.surface.nodes]
  session.append('turn/start',{turn:2})
  session.append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Use the failed rerun.'}]}),{surfaceOp:'append'})
  let request
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    request=JSON.parse(options.body)
    const q=request.questions.page0
    const target=Object.entries(q.criteria).find(([,body])=>body.includes('CASE_8317'))
    assert.ok(target)
    return Response.json({answers:{page0:{choice:target[0]}}})
  })
  await new Engine(ctx,{auto:false}).compactRegion(nodes[0],nodes.at(-1),{session,options:{}},new AbortController().signal)
  assert.equal(request.state.checkpointTask,'Use the failed rerun.')
  assert.ok(request.questions.page0.instructions.includes('"name":"tests"'))
  assert.ok(request.questions.page0.instructions.includes('Please retain the exact failure.'))
  const checkpoint=session.snapshotEvents().findLast(e=>e.type==='compaction/summary')
  assert.ok(JSON.stringify(checkpoint.data.summary).includes('CASE_8317'))
})
test('actual rc.5 surface, two checkpoints, durable replay and caller-bound paging',async()=>{
  const old=process.env.DSH_EVIDENCE_POLICY
  delete process.env.DSH_EVIDENCE_POLICY
  try {
    const ctx=new Context();new Registry(ctx);new Meter(ctx)
    const session=Session.create('source-fixture')
    const owner={session,options:{}}, first=append(session,1), pruner=new Pruner(ctx)
    const engine=new Engine(ctx,{auto:false})
    pruner.pruneSession(session)
    const view=JSON.stringify(session.deriveMessages())
    assert.ok(!view.includes('CASE_8317'));assert.ok(view.includes('evidence_page seq='+first))
    const nextSlice=async()=>{
      const nodes=[...session.surface.nodes]
      await engine.compactRegion(nodes[0],nodes.at(-1),owner,new AbortController().signal)
      return session.snapshotEvents().findLast(e=>e.type==='compaction/summary')
    }
    session.append('turn/start',{turn:2})
    const checkpoint=await nextSlice()
    assert.equal(checkpoint.data.model,'rule')
    assert.ok(JSON.stringify(checkpoint.data.summary).includes('CASE_8317'))
    session.append('turn/end',{turn:2,reason:{kind:'completed'}})
    append(session,3);pruner.pruneSession(session)
    session.append('turn/start',{turn:4})
    const second=await nextSlice()
    assert.ok(JSON.stringify(second.data.summary).includes('seq='+checkpoint.seq+' '))
    const replay=Session.create(session.id,session.snapshotEvents())
    let tool
    apply({tools:{register(t){tool=t}}})
    assert.ok(readPage(replay,checkpoint.seq,0,1200).includes('seq='+first+' '))
    let offset=0, reconstructed=''
    while (true) {
      const page=await tool.execute({seq:first,charOffset:offset,budget:97},{agent:{session:replay}})
      assert.ok(Array.from(page).length<=97)
      const sep=page.indexOf('\n')
      reconstructed+=page.slice(sep+1)
      const next=page.slice(0,sep).match(/ next=([\d-]+)$/)[1]
      if (next==='-') break
      assert.ok(Number(next)>offset);offset=Number(next)
    }
    assert.equal(reconstructed,text)
    await assert.rejects(()=>tool.execute({seq:first},{agent:{session:Session.create('other')}}))
    await assert.rejects(()=>tool.execute({seq:first},{}))
    assert.throws(()=>readPage(replay,first,-1))
    assert.throws(()=>readPage(replay,first,0,20))
    assert.ok(candidates(text,'failure').some(x=>x.body.includes('CASE_8317')))
  } finally {if(old===undefined)delete process.env.DSH_EVIDENCE_POLICY;else process.env.DSH_EVIDENCE_POLICY=old}
})
