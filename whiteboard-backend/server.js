'use strict';
const express=require('express');
const http=require('node:http');
const {createHash}=require('node:crypto');
const cors=require('cors');
const { Server }=require('socket.io');
const { UUID, RequestError, validateOperation }=require('./lib/validation');
const db=require('./lib/db');

const allowedOrigins=(process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',').map(x=>x.trim()).filter(Boolean);
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) throw new Error('Set ALLOWED_ORIGINS in production');
const originAllowed=(origin)=>!origin || allowedOrigins.includes(origin);
const userColor=id=>'#'+createHash('sha256').update(id).digest('hex').slice(0,6);
const app=express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
app.use(cors({origin:(origin,callback)=>callback(null,originAllowed(origin)),methods:['GET','POST'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'64kb'}));

// Bounded in-memory limiter. Suitable for one server; use a shared limiter before scaling.
const limits=new Map();
function limit(key,max,windowMs){
  const now=Date.now();
  if(limits.size>50000) for(const [k,v] of limits) if(v.reset<now) limits.delete(k);
  const state=limits.get(key);
  if(!state||now>state.reset){limits.set(key,{used:1,reset:now+windowMs});return true;}
  if(state.used>=max)return false;
  state.used++;return true;
}
const handler=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
async function authenticate(req){
  const boardId=req.params.id;
  if(!UUID.test(boardId)) throw new RequestError('Invalid board ID');
  const header=req.get('Authorization') || '';
  const match=/^Bearer ([A-Za-z0-9_-]{30,128})$/.exec(header);
  const role=match && await db.authorize(boardId,match[1]);
  if(!role) throw new RequestError('Invalid board link or expired permission',401,'UNAUTHORIZED');
  return role;
}
app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.get('/api/ready',handler(async(_req,res)=>{await db.pool.query('SELECT 1');res.json({status:'ready'});}));
app.post('/api/boards',handler(async(req,res)=>{
  if(!limit('new:'+req.ip,12,3600000)) throw new RequestError('Too many boards created',429,'RATE_LIMIT');
  res.status(201).json(await db.createBoard());
}));
app.get('/api/boards/:id',handler(async(req,res)=>{const role=await authenticate(req);res.json({...await db.snapshot(req.params.id),role});}));
app.get('/api/boards/:id/operations',handler(async(req,res)=>{
  await authenticate(req);
  const after=Number(req.query.after || 0);
  if(!Number.isSafeInteger(after)||after<0) throw new RequestError('Invalid sequence');
  res.json({operations:await db.recentOperations(req.params.id,after,200)});
}));
const httpServer=http.createServer(app);
const io=new Server(httpServer,{
  cors:{origin:allowedOrigins,methods:['GET','POST']},
  maxHttpBufferSize:300000,
  transports:['websocket','polling'],
  allowRequest:(req,callback)=>callback(null,originAllowed(req.headers.origin)),
  pingTimeout:20000,
});

app.post('/api/boards/:id/invites/:role',handler(async(req,res)=>{
  const userRole=await authenticate(req);
  if(userRole!=='owner') throw new RequestError('Owner link required',403,'FORBIDDEN');
  if(!['editor','viewer'].includes(req.params.role)) throw new RequestError('Invalid role');
  if(!limit('invite:'+req.ip,60,3600000)) throw new RequestError('Too many invitation changes',429,'RATE_LIMIT');
  const token=await db.rotateInvite(req.params.id,req.params.role);
  // All previously issued links for this role become invalid immediately.
  const room=`board:${req.params.id}`;
  for(const socket of await io.in(room).fetchSockets()) if(socket.data.role===req.params.role) socket.disconnect(true);
  res.json({boardId:req.params.id,role:req.params.role,token});
}));
app.use((err,_req,res,_next)=>{
  const status=err instanceof RequestError?err.status:500;
  if(status>=500) console.error('HTTP request failed',err);
  res.status(status).json({error:status===500?'Internal server error':err.message,code:err.code||'SERVER_ERROR'});
});

io.use(async(socket,next)=>{
  try{
    const {boardId,token}=socket.handshake.auth || {};
    if(!UUID.test(boardId || '')) throw new RequestError('Invalid board ID',401);
    const role=await db.authorize(boardId,token);
    if(!role) throw new RequestError('Invalid/expired invitation link',401);
    socket.data={boardId,token,role,lastCursor:0};
    next();
  }catch(_error){next(new Error('Access denied: check your board invitation link'));}
});
async function sendPresence(room,boardId){
  const sockets=await io.in(room).fetchSockets();
  io.to(room).emit('presence:update',sockets.map(s=>({id:s.id,role:s.data.role,color:userColor(s.id),x:s.data.x || 0,y:s.data.y || 0})).filter(s=>s.id));
}
io.on('connection',socket=>{
  const {boardId,role,token}=socket.data;
  const room=`board:${boardId}`;
  // Join *before* reading the snapshot. Client buffers in-flight events until snapshot.
  socket.join(room);
  db.snapshot(boardId).then(s=>socket.emit('board:snapshot',{...s,role})).catch(()=>socket.disconnect(true));
  sendPresence(room,boardId).catch(()=>{});
  socket.on('board:resync',async()=>{
    try{socket.emit('board:snapshot',{...await db.snapshot(boardId),role});}catch{socket.disconnect(true);}
  });
  socket.on('cursor:move',data=>{
    const now=Date.now();
    if(now-socket.data.lastCursor<40)return;
    if(!data || typeof data.x!=='number'||typeof data.y!=='number'||!Number.isFinite(data.x)||!Number.isFinite(data.y)||Math.abs(data.x)>1e6||Math.abs(data.y)>1e6)return;
    socket.data.lastCursor=now; socket.data.x=data.x;socket.data.y=data.y;
    socket.to(room).emit('cursor:update',{id:socket.id,x:data.x,y:data.y,color:userColor(socket.id)});
  });
  socket.on('board:operation',async(payload,ack)=>{
    const respond=typeof ack==='function'?ack:()=>{};
    try{
      if(!limit('op:'+socket.id,100,10000))throw new RequestError('Slow down',429,'RATE_LIMIT');
      const freshRole=await db.authorize(boardId,token);
      if(!freshRole||freshRole!==role){socket.disconnect(true);return;}
      const op=validateOperation(payload);
      const event=await db.applyOperation(boardId,role,op);
      respond({ok:true,event});
      io.to(room).emit('board:applied',event);
    }catch(e){
      if(!(e instanceof RequestError))console.error('Socket operation failed',e);
      respond({ok:false,code:e.code||'SERVER_ERROR',error:e instanceof RequestError?e.message:'Server error'});
    }
  });
  socket.on('disconnect',()=>sendPresence(room,boardId).catch(()=>{}));
});
const port=Number(process.env.PORT||3000);
httpServer.listen(port,'0.0.0.0',()=>console.log(`Product Brainstorm API listening on ${port}`));
let shuttingDown=false;
const shutdown=()=>{if(shuttingDown)return;shuttingDown=true;io.close(()=>db.pool.end().finally(()=>process.exit(0)));setTimeout(()=>process.exit(1),10000).unref();};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
