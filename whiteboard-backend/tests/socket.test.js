const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const net=require('node:net');
const enabled=Boolean(process.env.TEST_DATABASE_URL);

function freePort(){return new Promise((resolve,reject)=>{
  const probe=net.createServer();probe.once('error',reject);
  probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port));});
});}
async function boot(port){
  const child=spawn(process.execPath,['server.js'],{
    cwd:require('node:path').join(__dirname,'..'),
    env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,PORT:String(port),ALLOWED_ORIGINS:`http://127.0.0.1:${port}`,NODE_ENV:'test'},
    stdio:['ignore','pipe','pipe']
  });
  await new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('Backend startup timed out'));}},12000);
    child.stdout.on('data',chunk=>{if(!settled&&String(chunk).includes('API listening')){settled=true;clearTimeout(timer);resolve();}});
    child.on('exit',code=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(`Backend exited ${code}`));}});
  });
  return child;
}
async function connect(io,url,boardId,token){
  const socket=io(url,{auth:{boardId,token},transports:['websocket'],reconnection:false});
  await new Promise((resolve,reject)=>{socket.once('board:snapshot',resolve);socket.once('connect_error',reject);});
  return socket;
}
test('socket: rooms isolated, owner/editor synchronized, viewer unable to modify', {skip:!enabled}, async()=>{
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const db=require('../lib/db');
  const {io}=require('socket.io-client');
  await db.migrate();
  const port=await freePort();const url=`http://127.0.0.1:${port}`;
  let server;const sockets=[];
  try{
    server=await boot(port);
    const create=async()=>{
      const r=await fetch(`${url}/api/boards`,{method:'POST'});
      assert.equal(r.status,201);return r.json();
    };
    const first=await create(),second=await create();
    const inviteResponse=await fetch(`${url}/api/boards/${first.boardId}/invites/editor`,{method:'POST',headers:{Authorization:`Bearer ${first.token}`}});
    assert.equal(inviteResponse.status,200);
    const invite=await inviteResponse.json();
    const a=await connect(io,url,first.boardId,first.token);sockets.push(a);
    const b=await connect(io,url,first.boardId,invite.token);sockets.push(b);
    const separate=await connect(io,url,second.boardId,second.token);sockets.push(separate);
    let crossBoard=0;
    separate.on('board:applied',()=>crossBoard++);
    const received=new Promise(resolve=>b.once('board:applied',resolve));
    const id=randomUUID();
    const ack=await new Promise((resolve,reject)=>a.timeout(8000).emit('board:operation',{
      operationId:randomUUID(),kind:'create',objectId:id,
      object:{id,type:'shape',x:10,y:10,width:80,height:80,color:'#abcdef',shapeType:'rect'}
    },(error,response)=>error?reject(error):resolve(response)));
    assert.equal(ack.ok,true);
    const event=await received;
    assert.equal(event.object.id,id);
    await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(crossBoard,0);
    assert.equal((await db.snapshot(first.boardId)).objects.length,1);
    assert.equal((await db.snapshot(second.boardId)).objects.length,0);
    const viewerToken=await db.rotateInvite(first.boardId,'viewer');
    const viewer=await connect(io,url,first.boardId,viewerToken);sockets.push(viewer);
    const denied=await new Promise((resolve,reject)=>viewer.timeout(8000).emit('board:operation',{
      operationId:randomUUID(),kind:'delete',objectId:id,expectedVersion:1
    },(error,response)=>error?reject(error):resolve(response)));
    assert.equal(denied.ok,false);assert.equal(denied.code,'FORBIDDEN');
  }finally{
    for(const socket of sockets)socket.disconnect();
    server?.kill('SIGTERM');
    await db.pool.end();
  }
});
