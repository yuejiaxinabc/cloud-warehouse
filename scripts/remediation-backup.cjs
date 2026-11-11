const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const app = '/opt/cloud-warehouse';
require(app + '/node_modules/@next/env').loadEnvConfig(app, false, {info(){},error(){}});
const url = new URL(process.env.DATABASE_URL);
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0,14);
const root = '/root/cw-remediation-backups/' + stamp;
fs.mkdirSync(root,{recursive:true,mode:0o700});
const sql = root + '/database.sql';
const fd = fs.openSync(sql,'wx',0o600);
try {
 cp.execFileSync('mysqldump',['--single-transaction','--no-tablespaces','--routines','--triggers','--hex-blob','--set-gtid-purged=OFF','-h',url.hostname,'-P',url.port||'3306','-u',decodeURIComponent(url.username),decodeURIComponent(url.pathname.slice(1))],{env:{...process.env,MYSQL_PWD:decodeURIComponent(url.password)},stdio:['ignore',fd,'pipe']});
} catch(e) { console.error('Database backup failed; publication not started.'); process.exitCode=1; throw new Error('mysqldump failed'); } finally {fs.closeSync(fd);}
cp.execFileSync('tar',['-C',app,'--exclude=./node_modules','--exclude=./.next/cache','--exclude=./.next.prev-*','--exclude=./.git','-czf',root+'/application.tar.gz','.'],{stdio:['ignore','ignore','pipe']});
cp.execFileSync('tar',['-tzf',root+'/application.tar.gz'],{stdio:'ignore'});
const dump = fs.readFileSync(sql,'utf8');
if(!dump.includes('-- Dump completed on') || !dump.includes('CREATE TABLE')) throw new Error('Incomplete dump');
cp.execFileSync('systemctl',['cat','cloud-warehouse'],{stdio:['ignore',fs.openSync(root+'/service.txt','w',0o600),'pipe']});
fs.writeFileSync('/root/cw-remediation-backups/latest',root+'\n',{mode:0o600});
console.log(JSON.stringify({backup:root,databaseBytes:fs.statSync(sql).size,archiveBytes:fs.statSync(root+'/application.tar.gz').size,dumpComplete:true}));
