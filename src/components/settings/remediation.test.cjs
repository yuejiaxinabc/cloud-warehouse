const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const mod = {exports:{}};
const sandbox = {exports:mod.exports, fetch:undefined, Error, Array, JSON};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'request.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,sandbox);
const {settingsRequest,settingsList} = mod.exports;
let passed = 0;
async function test(name, run) {await run(); passed++; console.log('PASS ' + name);}
(async () => {
 await test('HTTP 500 with success:true never reports success', async () => {
  sandbox.fetch = async () => ({ok:false,status:500,json:async()=>({success:true})});
  await assert.rejects(settingsRequest('/fixture'), /操作未完成/);
 });
 await test('HTTP 200 with success:false rejects raw server exception', async () => {
  sandbox.fetch = async () => ({ok:true,status:200,json:async()=>({success:false,error:'SECRET_STACK'})});
  await assert.rejects(settingsRequest('/fixture'), e=>e.message.includes('操作未完成') && !e.message.includes('SECRET'));
 });
 await test('401 maps to login-expiry guidance', async () => {
  sandbox.fetch = async () => ({ok:false,status:401,json:async()=>({success:false})});
  await assert.rejects(settingsRequest('/fixture'), /登录已过期/);
 });
 await test('Malformed JSON rejects', async () => {
  sandbox.fetch = async () => ({ok:true,status:200,json:async()=>{throw Error('raw');}});
  await assert.rejects(settingsRequest('/fixture'), /返回格式异常/);
 });
 await test('Network rejection gives actionable error', async () => {
  sandbox.fetch = async () => {throw Error('raw');};
  await assert.rejects(settingsRequest('/fixture'), /网络连接失败/);
 });
 await test('Two-page role selection keeps all assigned choices', async () => {
  let n=0; sandbox.fetch = async () => ({ok:true,status:200,json:async()=>({success:true,data:{list:[{id:++n}],total:2}})});
  const result = await settingsList('/fixture'); assert.equal(result.length,2); assert.equal(result[1].id,2);
 });
 await test('Incomplete pagination rejects instead of silently losing assignments', async () => {
  sandbox.fetch = async () => ({ok:true,status:200,json:async()=>({success:true,data:{list:[],total:2}})});
  await assert.rejects(settingsList('/fixture'), /分页不完整/);
 });
 await test('Only successful response resolves', async () => {
  sandbox.fetch = async () => ({ok:true,status:200,json:async()=>({success:true,data:{id:42}})});
  assert.equal((await settingsRequest('/fixture')).data.id,42);
 });
 const login = fs.readFileSync(path.join(root,'app/login/page.tsx'),'utf8');
 const mapping = login.slice(login.indexOf('const AUTH_MESSAGES'),login.indexOf('/**',login.indexOf('const AUTH_MESSAGES')));
 const ctx={}; vm.runInNewContext(ts.transpileModule(mapping+'\n globalThis.mapError = authMessage;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,ctx);
 await test('Unknown exceptions and missing accounts match wrong-password feedback', async () => {
  assert.equal(ctx.mapError('SECRET_STACK'),ctx.mapError('账号或密码错误'));
  assert.equal(ctx.mapError('USER_NOT_FOUND'),ctx.mapError('CredentialsSignin'));
  assert.equal(ctx.mapError('__proto__'),'账号或密码错误');
 });
 await test('CAPTCHA expiration, TOTP and throttling have actionable allowlisted feedback', async () => {
  assert.match(ctx.mapError('验证码已过期，请刷新'),/刷新/);
  assert.match(ctx.mapError('动态验证码不正确'),/6 位/);
  assert.match(ctx.mapError('尝试过于频繁，请稍后再试'),/稍后/);
 });
 console.log('RESULT: ' + passed + ' executable tests passed; browser interaction not covered.');
})().catch(e=>{console.error(e);process.exitCode=1;});
