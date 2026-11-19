'use strict';
const { migrate,pool } = require('./lib/db');
migrate().then(()=>console.log('Database schema ready')).catch(e=>{console.error('Migration failed:',e);process.exitCode=1}).finally(()=>pool.end());
