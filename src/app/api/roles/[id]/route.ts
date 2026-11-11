import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { successResponse, handleApiError, NotFoundError } from '@/lib/errors';
import { PUT as update, DELETE as remove } from '../route';
import { z } from 'zod';
export async function GET(request: NextRequest,{params}:{params:{id:string}}) {
 try {
  await requirePermission('role:manage');
  const id=z.coerce.number().int().positive().safe().parse(params.id);
  const row=await prisma.role.findUnique({where:{id:BigInt(id)},include:{rolePermissions:{include:{permission:true}}}});
  if(!row) throw new NotFoundError('角色',id);
  return successResponse({...row,permissions:row.rolePermissions.map(p=>p.permission),permissionIds:row.rolePermissions.map(p=>Number(p.permissionId))});
 }catch(e){return handleApiError(e);}
}
function withId(request:NextRequest,id:string){const url=new URL(request.url);url.searchParams.set('id',id);return new NextRequest(url,request);}
export async function PUT(request:NextRequest,{params}:{params:{id:string}}){return update(withId(request,params.id));}
export async function DELETE(request:NextRequest,{params}:{params:{id:string}}){return remove(withId(request,params.id));}
