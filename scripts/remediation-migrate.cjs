const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const p=new PrismaClient();
(async()=>{
 const specs=[['users','session_version','INT NOT NULL DEFAULT 0'],['Role','permissions_configured','BOOLEAN NOT NULL DEFAULT FALSE']];
 // Prisma Role deliberately has no @@map. Discover actual table with schema metadata, not a guessed name.
 const tables=await p.$queryRawUnsafe('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
 for(let [table,column,definition] of specs){
  if(table==='Role'&&!tables.some(r=>r.name==='Role')) table='roles';
  const found=await p.$queryRawUnsafe('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',table,column);
  if(!found.length){await p.$executeRawUnsafe('ALTER TABLE '+String.fromCharCode(96)+table+String.fromCharCode(96)+' ADD COLUMN '+String.fromCharCode(96)+column+String.fromCharCode(96)+' '+definition);console.log('ADDED',table,column);}
  else console.log('PRESENT',table,column);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>p.$disconnect());
