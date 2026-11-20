import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Session } from '@deepseek-ai/dsh-session'
import { append } from '../test/log-fixture.mjs'

export const inject = ['tools', 'compaction', 'toolResultPruner']

export function apply(ctx) {
  setImmediate(async () => {
    try {
      assert.equal(ctx.compaction.constructor.name, 'EvidenceCompaction')
      assert.equal(ctx.toolResultPruner.constructor.name, 'AddressedPruner')
      const session = Session.create('evidence-release-smoke')
      const seq = append(session, 1)
      ctx.toolResultPruner.pruneSession(session)
      const pruned = JSON.stringify(session.deriveMessages())
      assert.ok(pruned.includes('evidence_page seq=' + seq))
      assert.ok(!pruned.includes('CASE_8317'))
      const nodes = [...session.surface.nodes]
      session.append('turn/start', { turn: 2 })
      await ctx.compaction.compactRegion(nodes[0], nodes.at(-1), { session, options: {} }, new AbortController().signal)
      const checkpoint = session.snapshotEvents().findLast(e => e.type === 'compaction/summary')
      assert.equal(checkpoint?.data.model, 'rule')
      assert.equal(checkpoint.data.provider, 'dsh-evidence-pages')
      const excerpt = checkpoint.data.summary.map(b => b.text).join('\n')
      const ref = excerpt.match(/\[evidence_page seq=(\d+) charOffset=(\d+)\]/)
      assert.equal(Number(ref?.[1]), seq)
      assert.ok(excerpt.includes('CASE_8317'))
      const charOffset = Number(ref[2])
      const replay = Session.create(session.id, session.snapshotEvents())
      const page = await ctx.tools.get('evidence_page').execute(
        { seq, charOffset, budget: 500 }, { agent: { session: replay } })
      assert.ok(page.includes('FAIL CASE_8317'))
      writeFileSync(process.env.DSH_EVIDENCE_SMOKE_RESULT, JSON.stringify({
        provider: checkpoint.data.provider, policy: checkpoint.data.model, seq, charOffset,
        hiddenAfterPrune: true, recoveredFromReplayedSession: 'FAIL CASE_8317'
      }))
      process.exit(0)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  })
}
