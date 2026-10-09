import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';
import {RELICS} from '../../shared/relics.js';
import {PHASE} from '../../shared/constants.js';
for (const clientCombat of [false,true]) test(`时间机器完整流程 ${clientCombat ? '客户端' : '服务端'}`,()=>{
 const h=makeMatch({mode:'solo',fake:true,clientCombat,script:()=>h.m.round===2?{leaks:{p_0:3}}:{}}).start();
 try {
 h.toPrep(1);const ps=h.ps('p_0');
 ps.relics=RELICS.filter(r=>r.id!=='relic_158').map(r=>({id:r.id,round:1}));
 assert.ok(h.drive(()=>h.m.phase===PHASE.SETTLE && h.m.round===1));
 const offer=ps.relicOffer;assert.deepEqual(offer.options,['relic_158']);
 assert.equal(h.m.handle(ps.playerId,{t:'g.relic',offerId:offer.id,idx:0}).ok,true);
 assert.equal(h.m.round,2);assert.equal(ps.relicReverseLpRound,2);
 const lp=ps.lp;assert.ok(h.drive(()=>h.m.phase===PHASE.SETTLE && h.m.round===2));
 assert.equal(ps.lp,lp+3);assert.equal(ps.privateView().lp,lp+3);
 assert.equal(h.lastTo(ps.playerId,'m.private').lp,lp+3);
 } finally{h.m.dispose();}
});
