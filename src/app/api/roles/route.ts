import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requirePermission } from '@/lib/auth-guard';
import { successResponse, handleApiError, AppError, NotFoundError } from '@/lib/errors';
import { clearDataScopeCache } from '@/lib/data-scope';
import { writeLog, getClientIp } from '@/lib/log';
import { z } from 'zod';
import { permissionsForRoles } from '@/lib/account-state';

const modes = ['ALL','DEPT','DEPT_AND_CHILD','SELF','CUSTOM'] as const;
const ids = z.array(z.number().int().positive().safe()).max(300).transform(v => [...new Set(v)]);
const input = z.object({
  id: z.coerce.number().int().positive().safe().optional(),
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{0,49}$/).optional(),
  name: z.string().trim().min(1).max(50).optional(),
  remark: z.string().max(500).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.union([z.literal(0),z.literal(1)]).optional(),
  permissionIds: ids.optional(),
  dataScope: z.enum(modes).optional(),
  dataScopeOrgIds: z.union([ids,z.string().max(1000)]).optional(),
}).strict();
function idOf(value: unknown) { return z.coerce.number().int().positive().safe().parse(value); }
function orgIds(value: number[] | string | undefined) {
  const list = typeof value === 'string' ? value.split(',').filter(Boolean).map(Number) : value || [];
  return ids.parse(list);
}
export async function GET(request: NextRequest) {
  try {
    await requirePermission('role:manage');
    const q = new URL(request.url).searchParams;
    const page = z.coerce.number().int().min(1).max(100000).parse(q.get('page') ?? 1);
    const pageSize = z.coerce.number().int().min(1).max(200).parse(q.get('pageSize') ?? 20);
    const [rows,total,permissionOptions] = await Promise.all([
      prisma.role.findMany({include:{rolePermissions:{include:{permission:{select:{id:true,name:true,code:true}}}},_count:{select:{userRoles:true}}},orderBy:{id:'asc'},skip:(page-1)*pageSize,take:pageSize}),
      prisma.role.count(), prisma.permission.findMany({where:{status:1},select:{id:true,name:true,code:true},orderBy:{id:'asc'}})
    ]);
    return successResponse({list:rows.map(r=>({id:Number(r.id),name:r.name,code:r.code,remark:r.remark,description:r.remark,status:r.status,userCount:r._count.userRoles,dataScope:r.dataScope,dataScopeOrgIds:r.dataScopeOrgIds||'',permissionsConfigured:r.permissionsConfigured,permissionIds:(r.permissionsConfigured || r.rolePermissions.length ? r.rolePermissions.map(p=>Number(p.permissionId)) : permissionOptions.filter(p=>permissionsForRoles([{role:r}]).permissions.includes(p.code)).map(p=>Number(p.id))),permissions:r.rolePermissions.map(p=>({...p.permission,id:Number(p.permission.id)}))})),total,page,pageSize,permissionOptions:permissionOptions.map(p=>({...p,id:Number(p.id)}))});
  } catch(e) {return handleApiError(e);}
}
async function save(request: NextRequest, creating: boolean) {
  try {
    const session = await requireAdmin();
    const body = input.parse(await request.json());
    const id = creating ? undefined : idOf(new URL(request.url).searchParams.get('id') ?? body.id);
    if(creating && (!body.code || !body.name)) throw new AppError('角色编码和名称必填');
    const row = await prisma.$transaction(async tx => {
      const current = id ? await tx.role.findUnique({where:{id:BigInt(id)}}) : null;
      if(id && !current) throw new NotFoundError('角色',id);
      // 避免通过改名/停用超级管理员角色使管理入口失联。
      if(current?.code==='admin' && ((body.code && body.code!=='admin') || body.status===0 || (body.dataScope && body.dataScope!=='ALL'))) throw new AppError('系统管理员角色的编码、启用状态与全部数据范围固定');
      if(body.permissionIds && await tx.permission.count({where:{id:{in:body.permissionIds.map(BigInt)},status:1}})!==body.permissionIds.length) throw new AppError('权限列表含无效或停用的权限');
      const selected = body.dataScopeOrgIds === undefined ? undefined : orgIds(body.dataScopeOrgIds);
      const mode = body.dataScope ?? current?.dataScope ?? 'SELF';
      if(selected && await tx.organization.count({where:{id:{in:selected.map(BigInt)},status:1}})!==selected.length) throw new AppError('组织列表含无效或停用的组织');
      const patch = {name:body.name,code:body.code,remark:body.remark ?? body.description,status:body.status,dataScope:mode,
        dataScopeOrgIds:mode==='CUSTOM' ? (selected ? selected.join(',') : current?.dataScopeOrgIds ?? null) : null,
        ...(body.permissionIds !== undefined ? {permissionsConfigured:true} : {})};
      const result = current ? await tx.role.update({where:{id:current.id},data:patch}) : await tx.role.create({data:{...patch,name:body.name!,code:body.code!,status:body.status??1}});
      if(body.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({where:{roleId:result.id}});
        if(body.permissionIds.length) await tx.rolePermission.createMany({data:body.permissionIds.map(permissionId=>({roleId:result.id,permissionId:BigInt(permissionId)}))});
      }
      return result;
    });
    clearDataScopeCache();
    await writeLog({module:'role',action:creating?'create':'update',userId:(session.user as any).id,ip:getClientIp(),content:(creating?'新建角色：':'更新角色及授权：')+row.name,refType:'role',refId:row.id});
    return successResponse({id:Number(row.id),name:row.name,code:row.code},creating?'角色创建成功':'角色更新成功');
  } catch(e) { return handleApiError(e); }
}
export async function POST(request: NextRequest) {return save(request,true);}
export async function PUT(request: NextRequest) {return save(request,false);}
export async function DELETE(request: NextRequest) {
  try {
    const session=await requireAdmin();
    const id=idOf(new URL(request.url).searchParams.get('id'));
    await prisma.$transaction(async tx=>{
      const r=await tx.role.findUnique({where:{id:BigInt(id)}});
      if(!r) throw new NotFoundError('角色',id);
      if(r.code==='admin') throw new AppError('系统管理员角色保留');
      if(await tx.userRole.count({where:{roleId:BigInt(id)}})) throw new AppError('请先移除该角色的用户关联');
      await tx.rolePermission.deleteMany({where:{roleId:BigInt(id)}});
      await tx.role.delete({where:{id:BigInt(id)}});
    });
    clearDataScopeCache();
    await writeLog({module:'role',action:'delete',userId:(session.user as any).id,ip:getClientIp(),content:'删除角色 #'+id,refType:'role',refId:BigInt(id)});
    return successResponse(null,'角色已删除');
  }catch(e){return handleApiError(e);}
}
