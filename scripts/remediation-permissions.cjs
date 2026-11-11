require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const entries={'inventory:manage':'库存管理','inventory:delete':'库存记录删除','report:manage':'报表订阅管理','purchase:view':'查看采购申请','purchase:create':'创建采购申请','purchase:manage':'管理采购申请','system:config':'系统配置','customer:write':'维护客户','customer:delete':'删除客户','supplier:write':'维护供应商','supplier:delete':'删除供应商'};
(async()=>{for(const [code,name] of Object.entries(entries))await p.permission.upsert({where:{code},create:{code,name,type:'api',status:1},update:{}});console.log('Permission catalogue ensured; existing role grants unchanged.');})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
