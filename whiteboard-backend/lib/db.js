'use strict';
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { validateObject, RequestError } = require('./validation');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; see .env.example');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_SIZE || 10), connectionTimeoutMillis: 5000 });
const hash = token => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const fail = (message, status, code) => { throw new RequestError(message,status,code); };
const asNumber = v => Number(v);

async function migrate() {
  await pool.query(readFileSync(join(__dirname,'../db/schema.sql'),'utf8'));
}
async function createBoard() {
  const id = randomUUID();
  const secrets = {owner:newToken(), editor:newToken(), viewer:newToken()};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO boards (id) VALUES ($1)',[id]);
    for (const [role, token] of Object.entries(secrets)) await client.query('INSERT INTO board_tokens(board_id,role,token_hash) VALUES ($1,$2,$3)',[id,role,hash(token)]);
    await client.query('COMMIT');
    return { boardId:id, token:secrets.owner };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function authorize(boardId,token) {
  if (typeof token !== 'string' || token.length > 128 || token.length < 30) return null;
  const {rows} = await pool.query('SELECT role FROM board_tokens WHERE board_id=$1 AND token_hash=$2',[boardId,hash(token)]);
  return rows[0]?.role || null;
}
async function snapshot(boardId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const board = (await client.query('SELECT title,sequence FROM boards WHERE id=$1',[boardId])).rows[0];
    if (!board) fail('Board not found',404,'NOT_FOUND');
    const {rows} = await client.query('SELECT body,version FROM board_objects WHERE board_id=$1 ORDER BY created_at,id',[boardId]);
    await client.query('COMMIT');
    return {boardId,title:board.title,seq:asNumber(board.sequence),objects:rows.map(({body,version})=>({...body,version}))};
  } catch(e) {await client.query('ROLLBACK').catch(()=>{}); throw e;}
  finally {client.release();}
}
async function applyOperation(boardId,role,op) {
  if (role === 'viewer') fail('View-only access',403,'FORBIDDEN');
  if (op.kind === 'clear' && role !== 'owner') fail('Only the owner can clear the board',403,'FORBIDDEN');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize per-board operations; avoids operation ID races and ensures revision order.
    const board=(await client.query('SELECT sequence FROM boards WHERE id=$1 FOR UPDATE',[boardId])).rows[0];
    if(!board) fail('Board not found',404,'NOT_FOUND');
    const duplicate=(await client.query('SELECT result FROM board_operations WHERE board_id=$1 AND operation_id=$2',[boardId,op.operationId])).rows[0];
    if(duplicate){ await client.query('COMMIT'); return duplicate.result; }
    let resultObject=null;
    if(op.kind==='create'){
      const objectCount=(await client.query('SELECT COUNT(*)::int AS count FROM board_objects WHERE board_id=$1',[boardId])).rows[0].count;
      if(objectCount>=1500) fail('Board object limit reached (1500 objects)',429,'BOARD_LIMIT');
      const exists=(await client.query('SELECT 1 FROM board_objects WHERE board_id=$1 AND id=$2',[boardId,op.objectId])).rowCount;
      if(exists) fail('Object already exists',409,'CONFLICT');
      const obj=validateObject(op.object);
      await client.query('INSERT INTO board_objects(board_id,id,body) VALUES($1,$2,$3)',[boardId,op.objectId,JSON.stringify(obj)]);
      resultObject={...obj,version:1};
    } else if(op.kind==='update' || op.kind==='delete'){
      const current=(await client.query('SELECT body,version FROM board_objects WHERE board_id=$1 AND id=$2',[boardId,op.objectId])).rows[0];
      if(!current || current.version!==op.expectedVersion) fail('Object was modified or removed; reload and retry',409,'CONFLICT');
      if(op.kind==='update'){
        const next=validateObject({...current.body,...op.patch,id:op.objectId});
        await client.query('UPDATE board_objects SET body=$3,version=version+1,updated_at=now() WHERE board_id=$1 AND id=$2',[boardId,op.objectId,JSON.stringify(next)]);
        resultObject={...next,version:current.version+1};
      }else await client.query('DELETE FROM board_objects WHERE board_id=$1 AND id=$2',[boardId,op.objectId]);
    }else if(op.kind==='clear') await client.query('DELETE FROM board_objects WHERE board_id=$1',[boardId]);
    const seq=asNumber(board.sequence)+1;
    const result={seq,operationId:op.operationId,kind:op.kind,objectId:op.objectId,object:resultObject};
    await client.query('UPDATE boards SET sequence=$2,updated_at=now() WHERE id=$1',[boardId,seq]);
    await client.query('INSERT INTO board_operations(board_id,operation_id,sequence,kind,result) VALUES ($1,$2,$3,$4,$5)',[boardId,op.operationId,seq,op.kind,JSON.stringify(result)]);
    await client.query('COMMIT');
    return result;
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
  finally{client.release();}
}
async function rotateInvite(boardId,role){
  const token=newToken();
  const {rowCount}=await pool.query('UPDATE board_tokens SET token_hash=$3,created_at=now() WHERE board_id=$1 AND role=$2',[boardId,role,hash(token)]);
  if(!rowCount) fail('Board not found',404,'NOT_FOUND');
  return token;
}
async function recentOperations(boardId,after,limit=100){
  const rows=(await pool.query('SELECT result FROM board_operations WHERE board_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3',[boardId,after,limit])).rows;
  return rows.map(r=>r.result);
}
module.exports={pool,migrate,createBoard,authorize,snapshot,applyOperation,rotateInvite,recentOperations};
