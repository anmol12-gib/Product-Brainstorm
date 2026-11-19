const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const configured=Boolean(process.env.TEST_DATABASE_URL);
test('database: board isolation, persistence, idempotency, optimistic conflicts and role checks', {skip:!configured}, async()=>{
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const db=require('../lib/db');
  try {
    await db.migrate();
    const b1=await db.createBoard();
    const b2=await db.createBoard();
    assert.equal(await db.authorize(b1.boardId,b1.token),'owner');
    assert.equal(await db.authorize(b2.boardId,b1.token),null);
    const id=randomUUID(),operationId=randomUUID();
    const shape={id,type:'shape',x:10,y:20,width:100,height:80,color:'#abcdef',shapeType:'rect'};
    const created=await db.applyOperation(b1.boardId,'owner',{kind:'create',operationId,objectId:id,object:shape});
    assert.equal(created.seq,1);
    assert.equal(created.object.version,1);
    const replay=await db.applyOperation(b1.boardId,'owner',{kind:'create',operationId,objectId:id,object:shape});
    assert.deepEqual(replay,created);
    assert.equal((await db.snapshot(b1.boardId)).objects.length,1);
    assert.equal((await db.snapshot(b2.boardId)).objects.length,0);
    const updated=await db.applyOperation(b1.boardId,'editor',{kind:'update',operationId:randomUUID(),objectId:id,expectedVersion:1,patch:{x:42}});
    assert.equal(updated.object.version,2);
    await assert.rejects(()=>db.applyOperation(b1.boardId,'editor',{kind:'update',operationId:randomUUID(),objectId:id,expectedVersion:1,patch:{x:100}}),e=>e.status===409);
    await assert.rejects(()=>db.applyOperation(b1.boardId,'viewer',{kind:'delete',operationId:randomUUID(),objectId:id,expectedVersion:2}),e=>e.status===403);
    const secret=await db.rotateInvite(b1.boardId,'editor');
    assert.equal(await db.authorize(b1.boardId,secret),'editor');
  }finally{await db.pool.end();}
});
