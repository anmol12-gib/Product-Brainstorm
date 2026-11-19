// Run ONLY against a board you own specifically for benchmarking.
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
const url=process.env.URL || 'http://localhost:3000';
const boardId=process.env.BOARD_ID,token=process.env.BOARD_TOKEN;
const clients=Math.min(100,Math.max(1,Number(process.env.CLIENTS||10)));
const each=Math.min(100,Math.max(1,Number(process.env.OPERATIONS_PER_CLIENT||5)));
if(!boardId||!token)throw new Error('Set BOARD_ID and BOARD_TOKEN (use a dedicated testing board)');
const sockets=[];const times=[];
async function connect(){
  const socket=io(url,{auth:{boardId,token},transports:['websocket'],reconnection:false,timeout:10000});
  sockets.push(socket);
  await new Promise((resolve,reject)=>{socket.once('board:snapshot',resolve);socket.once('connect_error',reject);});
  return socket;
}
async function perform(socket){
  const id=randomUUID();
  const start=performance.now();
  const ack=await new Promise((resolve,reject)=>socket.timeout(10000).emit('board:operation',{
    operationId:randomUUID(),kind:'create',objectId:id,object:{id,type:'shape',x:100,y:100,width:40,height:40,color:'#3b82f6',shapeType:'rect'}
  },(error,response)=>error?reject(error):resolve(response)));
  if(!ack.ok)throw new Error(ack.error);
  times.push(performance.now()-start);
}
try{
  const start=performance.now();
  const connected=await Promise.all(Array.from({length:clients},()=>connect()));
  await Promise.all(connected.map(async socket=>{for(let n=0;n<each;n++)await perform(socket);}));
  const sorted=times.sort((a,b)=>a-b),percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)].toFixed(1);
  const seconds=(performance.now()-start)/1000;
  console.log(JSON.stringify({clients,operations:times.length,seconds:Number(seconds.toFixed(2)),opsPerSecond:Number((times.length/seconds).toFixed(1)),p50ms:percentile(.5),p95ms:percentile(.95),p99ms:percentile(.99)},null,2));
}finally{for(const socket of sockets)socket.disconnect();}
