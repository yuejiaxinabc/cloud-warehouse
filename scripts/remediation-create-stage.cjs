const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const stage='/opt/cw-remediation-stage-20261111',db='cw_remediation_20261111';
const pass=crypto.randomBytes(32).toString('hex');
cp.execFileSync('mysql',['-e',"CREATE DATABASE IF NOT EXISTS "+db+" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'cw_remediation'@'127.0.0.1' IDENTIFIED BY '"+pass+"'; ALTER USER 'cw_remediation'@'127.0.0.1' IDENTIFIED BY '"+pass+"'; GRANT ALL ON "+db+".* TO 'cw_remediation'@'127.0.0.1';"],{stdio:['ignore','ignore','pipe']});
const root=fs.readFileSync('/root/cw-remediation-backups/latest','utf8').trim();
const fd=fs.openSync(root+'/database.sql','r');
try{cp.execFileSync('mysql',[db],{stdio:[fd,'ignore','pipe']});}finally{fs.closeSync(fd);}
const env=[
'DATABASE_URL="mysql://cw_remediation:'+pass+'@127.0.0.1:3306/'+db+'"',
'NEXTAUTH_SECRET="'+crypto.randomBytes(48).toString('base64')+'"',
'NEXTAUTH_URL="http://127.0.0.1:3106"','AUTH_URL="http://127.0.0.1:3106"',
'COOKIE_SECURE="false"','REDIS_URL="redis://127.0.0.1:6379/14"','UPLOAD_DIR="'+stage+'/public/uploads"','TZ="Asia/Shanghai"'
].join('\n').replace(/\\n/g,'\n');
// Explicit line joining, never copy production secrets into the candidate environment.
fs.writeFileSync(stage+'/.env',env.replace(/\n/g,'\n'),{mode:0o600});
console.log(JSON.stringify({stage,database:db,backupImported:true}));
