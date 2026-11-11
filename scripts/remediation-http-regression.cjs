const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {PrismaClient}=require('@prisma/client');const {encode}=require('next-auth/jwt');const bcrypt=require('bcryptjs');
if(!new URL(process.env.DATABASE_URL).pathname.includes('cw_remediation_'))throw Error('Fixture tests run only on isolated database');
const p=new PrismaClient(),base='http://127.0.0.1:3106',prefix='rem_'+Date.now();const results=[];
async function cookie(user,version=user.sessionVersion){return 'next-auth.session-token='+await encode({secret:process.env.NEXTAUTH_SECRET,token:{sub:String(user.id),name:user.realName,username:user.username,sessionVersion:version,sid:crypto.randomUUID()},maxAge:3600});}
async function req(url,c,method='GET',body){const r=await fetch(base+url,{method,headers:{...(c?{cookie:c}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});const text=await r.text();let data;try{data=JSON.parse(text)}catch{}return {status:r.status,data,text};}
async function check(name,fn){try{await fn();results.push({name,ok:true});console.log('PASS',name)}catch(e){results.push({name,ok:false,error:e.message});console.log('FAIL',name,e.message)}}
(async()=>{
 const org=await p.organization.create({data:{name:prefix,code:prefix}});
 const role=await p.role.findUniqueOrThrow({where:{code:'admin'}});
 const passwd=await bcrypt.hash(crypto.randomBytes(20).toString('hex'),10);
 const admin=await p.user.create({data:{username:prefix+'_admin',realName:'整改回归管理员',password:passwd,status:1,orgId:org.id,userRoles:{create:{roleId:role.id}}}});
 const empty=await p.user.create({data:{username:prefix+'_empty',realName:'整改空角色',password:passwd,status:1,orgId:org.id}});
 const auditorRole=await p.role.findUniqueOrThrow({where:{code:'auditor'}});
 const staff=await p.user.create({data:{username:prefix+'_staff',realName:'整改只读员',password:passwd,status:1,orgId:org.id,userRoles:{create:{roleId:auditorRole.id}}}});
 const ca=await cookie(admin),ce=await cookie(empty),cs=await cookie(staff);
 await check('R05 anonymous 2FA JSON 401',async()=>{const r=await req('/api/auth/2fa');assert.equal(r.status,401);assert.equal(r.data.success,false)});
 await check('R05 authenticated 2FA reports actual user',async()=>{const r=await req('/api/auth/2fa',ca);assert.equal(r.status,200);assert.equal(r.data.data.enabled,false)});
 for(const endpoint of ['/api/products?pageSize=1','/api/inventory?pageSize=1','/api/stock-in?pageSize=1','/api/stock-out?pageSize=1','/api/warehouse','/api/reports','/api/login-logs']){
  await check('R02 empty role 403 '+endpoint,async()=>assert.equal((await req(endpoint,ce)).status,403));
 }
 await check('R02 empty role profile allowed',async()=>assert.equal((await req('/api/settings/profile',ce)).status,200));
 await check('R02 auditor read permitted',async()=>assert.equal((await req('/api/products?pageSize=1',cs)).status,200));
 for(const q of ['page=0&pageSize=1','page=1&pageSize=-1','page=1.2','page=abc','page=','pageSize=','pageSize=999999999','page=Infinity']){
  await check('R04 invalid pagination '+q,async()=>assert.equal((await req('/api/products?'+q,ca)).status,400));
 }
 await check('R04 valid pagination',async()=>{const r=await req('/api/products?page=1&pageSize=1',ca);assert.equal(r.status,200);assert.equal(r.data.success,true)});
 await check('V01 role permissions directory',async()=>{const r=await req('/api/roles?pageSize=200',ca);assert.equal(r.status,200);assert.ok(r.data.data.permissionOptions.length>0)});
 await check('V01 role create/update explicit no permissions',async()=>{
  const r=await req('/api/roles',ca,'POST',{name:prefix,code:prefix,dataScope:'ALL',permissionIds:[]});assert.equal(r.status,200,r.text);
  const id=r.data.data.id;
  const edit=await req('/api/roles?id='+id,ca,'PUT',{name:prefix+'_edited',remark:'回归',permissionIds:[],dataScope:'SELF'});assert.equal(edit.status,200,edit.text);
  const row=await p.role.findUniqueOrThrow({where:{id:BigInt(id)}});assert.equal(row.permissionsConfigured,true);assert.equal(row.dataScope,'SELF');
 });
 await check('V01 organization hierarchy + cycle protection',async()=>{
  const r=await req('/api/organizations',ca,'POST',{code:prefix+'_child',name:'回归子部门',parentId:Number(org.id)});assert.equal(r.status,200,r.text);
  const child=await p.organization.findUniqueOrThrow({where:{id:BigInt(r.data.data.id)}});assert.equal(child.ancestors,','+org.id+',');
  const cycle=await req('/api/organizations',ca,'PUT',{id:Number(org.id),parentId:Number(child.id)});assert.ok([400,422].includes(cycle.status));
 });
 await check('R03 warehouse create audit actor',async()=>{
  const r=await req('/api/warehouse',ca,'POST',{code:prefix+'_wh',name:prefix,orgId:Number(org.id)});assert.equal(r.status,200,r.text);
  const wh=await p.warehouse.findUniqueOrThrow({where:{code:prefix+'_wh'}});
  const log=await p.operationLog.findFirst({where:{module:'warehouse',action:'create',refId:wh.id},orderBy:{id:'desc'}});
  assert.ok(log);assert.equal(String(log.userId),String(admin.id));
 });
 await check('R01 stop account revokes prior session',async()=>{
  assert.equal((await req('/api/users?id='+staff.id,ca,'PUT',{status:0})).status,200);
  for(const endpoint of ['/api/products?pageSize=1','/api/inventory?pageSize=1','/api/auth/2fa']) assert.equal((await req(endpoint,cs)).status,401,endpoint);
 });
 await check('R01 reenable does not revive old session',async()=>{
  assert.equal((await req('/api/users?id='+staff.id,ca,'PUT',{status:1})).status,200);
  assert.equal((await req('/api/products?pageSize=1',cs)).status,401);
  const fresh=await p.user.findUniqueOrThrow({where:{id:staff.id}});assert.ok(fresh.sessionVersion>staff.sessionVersion);
  assert.equal((await req('/api/products?pageSize=1',await cookie(fresh))).status,200);
 });
 await check('R01 legacy token without version rejected',async()=>{const c='next-auth.session-token='+await encode({secret:process.env.NEXTAUTH_SECRET,token:{sub:String(admin.id),sid:crypto.randomUUID()},maxAge:60});assert.equal((await req('/api/products',c)).status,401)});
 const login=await req('/login');
 await check('R06 viewport permits zoom',async()=>{assert.equal(login.status,200);assert.ok(!/user-scalable=no|maximum-scale=1[,"\s]/.test(login.text))});
 await check('R07 account length 100',async()=>assert.match(login.text,/maxLength="100"|maxlength="100"/));
 await check('R08 refresh captcha uses button',async()=>assert.match(login.text,/<button[^>]*aria-label="[^"]*验证码/));
 console.log('SUMMARY',JSON.stringify({pass:results.filter(r=>r.ok).length,fail:results.filter(r=>!r.ok).length}));
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/remediation-http-results.json',JSON.stringify({at:new Date().toISOString(),database:'isolated',results},null,2));
 if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
