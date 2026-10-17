import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTutorDraft, recoveredTime, DRAFT_TTL, DRAFT_LIMIT } from './tutorSession.js';
const now=1_800_000_000_000;
const draft={v:1,savedAt:now,mode:'passages',state:'running',focus:true,elapsed:12000,typed:';ks',units:[{deva:'योग',keys:';ksx'}],title:'योग',level:'home',passage:14,day:'2026-10-17',seconds:60,nativeSeconds:600,backspace:true,highlight:true,preset:'custom'};
const read=d=>readTutorDraft(JSON.stringify(d),now);
test('valid unfinished Unicode and Remington attempts retain their exact text',()=>{
 assert.deepEqual(read(draft),draft);
 assert.equal(read({...draft,mode:'unicode',typed:'योग'}).typed,'योग');
});
test('invalid, oversized, expired and future drafts are ignored',()=>{
 for(const raw of [null,'{','null','x'.repeat(DRAFT_LIMIT+1)])assert.equal(readTutorDraft(raw,now),null);
 for(const patch of [{v:2},{savedAt:now-DRAFT_TTL-1},{savedAt:now+1001},{mode:'unknown'},{state:'done'},{elapsed:-1},{units:[]},{units:Array(30001).fill(draft.units[0])},{units:[{deva:'x',keys:'x'.repeat(129)}]},{typed:'x'.repeat(150001)},{mode:'unicode',typed:'x'.repeat(20001)},{seconds:42},{nativeSeconds:42},{preset:'unknown'},{focus:'true'},{passage:31}])assert.equal(read({...draft,...patch}),null,JSON.stringify(patch).slice(0,80));
});
test('reading or refreshing practice grants no free timed exam minutes',()=>{
 assert.deepEqual(recoveredTime(draft,now+9000),{elapsed:12000,state:'paused'});
 for(const mode of ['exam','unicode'])assert.deepEqual(recoveredTime({...draft,mode},now+9000),{elapsed:21000,state:'running'});
 assert.deepEqual(recoveredTime({...draft,state:'paused'},now+9000),{elapsed:12000,state:'paused'});
});
