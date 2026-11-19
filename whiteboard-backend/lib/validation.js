'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(['sticky', 'text', 'path', 'shape', 'image']);
const SHAPES = new Set(['rect', 'circle', 'triangle', 'square', 'arrow', 'hexagon', 'pentagon', 'star', 'diamond', 'parallelogram', 'trapezium']);
const FIELDS = new Set(['id','type','x','y','width','height','color','text','title','rotation','shapeType','showHandles','points','imageUrl']);
const MUTABLE = new Set([...FIELDS].filter((field) => field !== 'id' && field !== 'type'));

class RequestError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const short = (x, limit) => typeof x === 'string' && x.length <= limit;

function validateObject(input) {
  if (!record(input) || Object.keys(input).some(k => !FIELDS.has(k))) throw new RequestError('Invalid board object fields');
  if (!UUID.test(input.id) || !TYPES.has(input.type)) throw new RequestError('Invalid board object identity/type');
  for (const key of ['x','y']) if (!finite(input[key], -1e6, 1e6)) throw new RequestError(`Invalid ${key}`);
  for (const key of ['width','height']) if (!finite(input[key], 0, 10000)) throw new RequestError(`Invalid ${key}`);
  if (!short(input.color, 16) || !/^(#[0-9a-f]{3}(?:[0-9a-f]{3})?|transparent)$/i.test(input.color)) throw new RequestError('Invalid color');
  for (const [key, limit] of [['text', 10000], ['title', 300]]) if (input[key] !== undefined && !short(input[key], limit)) throw new RequestError(`Invalid ${key}`);
  if (input.rotation !== undefined && !finite(input.rotation, -360000, 360000)) throw new RequestError('Invalid rotation');
  if (input.shapeType !== undefined && !SHAPES.has(input.shapeType)) throw new RequestError('Invalid shape type');
  if (input.showHandles !== undefined && typeof input.showHandles !== 'boolean') throw new RequestError('Invalid handle flag');
  if (input.points !== undefined) {
    if (!Array.isArray(input.points) || input.points.length > 5000 || input.points.some(p => !record(p) || Object.keys(p).some(k => !['x','y'].includes(k)) || !finite(p.x,-1e6,1e6) || !finite(p.y,-1e6,1e6))) throw new RequestError('Invalid drawing path');
  }
  if (input.imageUrl !== undefined && (!short(input.imageUrl, 250000) || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(input.imageUrl))) throw new RequestError('Images must be compressed PNG/JPEG/WebP (max 250 KB encoded)');
  return input;
}

function validateOperation(input) {
  if (!record(input) || !UUID.test(input.operationId) || !['create','update','delete','clear'].includes(input.kind)) throw new RequestError('Invalid operation');
  const { operationId, kind } = input;
  if (kind === 'clear') return {operationId, kind, objectId: null};
  if (!UUID.test(input.objectId)) throw new RequestError('Invalid object ID');
  if (kind === 'create') {
    const object = validateObject(input.object);
    if (object.id !== input.objectId) throw new RequestError('Object ID mismatch');
    return {operationId, kind, objectId: input.objectId, object};
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new RequestError('Expected object version is required');
  if (kind === 'delete') return {operationId, kind, objectId:input.objectId, expectedVersion:input.expectedVersion};
  if (!record(input.patch) || !Object.keys(input.patch).length || Object.keys(input.patch).some(k => !MUTABLE.has(k))) throw new RequestError('Invalid update fields');
  return {operationId, kind, objectId:input.objectId, expectedVersion:input.expectedVersion, patch:input.patch};
}
module.exports = { RequestError, UUID, validateObject, validateOperation };
