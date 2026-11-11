import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { handleApiError, successResponse, NotFoundError, AppError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';
import { clearDataScopeCache } from '@/lib/data-scope';
import { z } from 'zod';
const idValue=z.coerce.number().int().positive().safe();
const fields=z.object({id:idValue.optional(),name:z.string().trim().min(1).max(100).optional(),code:z.string().trim().regex(/^[A-Za-z0-9_-]{1,50}$/).optional(),parentId:idValue.nullable().optional(),status:z.union([z.literal(0),z.literal(1)]).optional(),remark:z.string().max(500).nullable().optional()}).strict();
async function parentPath(tx:Prisma.TransactionClient,parentId:number|null,childId?:number){
 const visited=new Set<number>(childId?[childId]:[]);const result:number[]=[];let id=parentId;
 while(id){
  if(visited.has(id)) throw new AppError('组织层级形成循环，请更换上级');
  if(visited.size>=100) throw new AppError('组织层级超过100层');
  visited.add(id);const row=await tx.organization.findUnique({where:{id:BigInt(id)},select:{id:true,parentId:true}});
  if(!row) throw new NotFoundError('上级组织',id);
  result.unshift(Number(row.id));id=row.parentId?Number(row.parentId):null;
 }
 return {ancestors:result.length?','+result.join(',')+',':'',level:result.length+1};
}
async function descendants(tx:Prisma.TransactionClient,id:bigint,ancestors:string,level:number,visited:Set<string>){
 if(visited.has(String(id)) || level>100) throw new AppError('组织树存在循环或超出层级上限');
 visited.add(String(id));
 const children=await tx.organization.findMany({where:{parentId:id},select:{id:true}});
 const next=ancestors ? ancestors+id+',' : ','+id+',';
 for(const child of children){
  await tx.organization.update({where:{id:child.id},data:{ancestors:next,level:level+1}});
  await descendants(tx,child.id,next,level+1,visited);
 }
}
export async function GET(req:NextRequest){
 try{
  await requirePermission('user:manage');
  const list=await prisma.organization.findMany({select:{id:true,name:true,code:true,parentId:true,ancestors:true,level:true,status:true,remark:true},orderBy:[{level:'asc'},{id:'asc'}]});
  return successResponse({list,total:list.length});
 }catch(e){return handleApiError(e);}
}
async function save(req:NextRequest,create:boolean){
 try{
  const session=await requirePermission('user:manage');
  const body=fields.parse(await req.json());
  const id=create?undefined:idValue.parse(body.id);
  if(create&&(!body.name||!body.code)) throw new AppError('组织名称与编码必填');
  const result=await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT id FROM organizations ORDER BY id FOR UPDATE');
   const current=id?await tx.organization.findUnique({where:{id:BigInt(id)}}):null;
   if(id&&!current) throw new NotFoundError('组织',id);
   const parentId=body.parentId===undefined ? (current?.parentId?Number(current.parentId):null) : body.parentId;
   const tree=await parentPath(tx,parentId,id);
   const patch={name:body.name,code:body.code,status:body.status,remark:body.remark,parentId:parentId?BigInt(parentId):null,...tree};
   const row=current?await tx.organization.update({where:{id:current.id},data:patch}):await tx.organization.create({data:{...patch,name:body.name!,code:body.code!,status:body.status??1}});
   await descendants(tx,row.id,tree.ancestors,tree.level,new Set());return row;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  clearDataScopeCache();
  await writeLog({module:'system',action:create?'create':'update',userId:(session.user as any).id,content:(create?'新建组织：':'更新组织：')+result.name,refType:'organization',refId:result.id,ip:getClientIp()});
  return successResponse({id:Number(result.id)},'组织已保存');
 }catch(e){return handleApiError(e);}
}
export async function POST(req:NextRequest){return save(req,true);}
export async function PUT(req:NextRequest){return save(req,false);}
export async function DELETE(req:NextRequest){
 try{
  const session=await requirePermission('user:manage');const id=BigInt(idValue.parse(new URL(req.url).searchParams.get('id')));
  await prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT id FROM organizations ORDER BY id FOR UPDATE');
   if(await tx.organization.count({where:{parentId:id}})||await tx.user.count({where:{orgId:id}})||await tx.warehouse.count({where:{orgId:id}})) throw new AppError('请先移除下级组织、用户或仓库关联');
   await tx.organization.delete({where:{id}});
  });
  clearDataScopeCache();
  await writeLog({module:'system',action:'delete',userId:(session.user as any).id,content:'删除组织 #'+id,refType:'organization',refId:id,ip:getClientIp()});
  return successResponse(null,'组织已删除');
 }catch(e){return handleApiError(e);}
}
