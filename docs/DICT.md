# 字典中心（v1.2.3）
数据表：`dict_types`（字典类型，code 唯一）、`dict_data`（字典项，typeCode → DictType.code，唯一键 typeCode+value）。

## 接口
| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /api/dicts?page&pageSize&keyword | 类型分页，keyword 匹配 code/name，带 itemCount | 已登录 |
| POST | /api/dicts | 新建类型 {code,name,status?,remark?}，code 重复返回 400 | 管理员 |
| PUT | /api/dicts | 更新类型 {id,name,status?,remark?}，编码不可改 | 管理员 |
| DELETE | /api/dicts?id= | 删除类型；isSystem 拒绝，字典项级联清理 | 管理员 |
| GET | /api/dicts/data?typeCode&all=1 | 字典项，sort 升序；默认只给 status=1，all=1 含停用项 | 已登录 |
| POST | /api/dicts/data | 新增项 {typeCode,label,value,sort?,status?,isDefault?,remark?} | 管理员 |
| PUT | /api/dicts/data | 更新项 {id,label,value?,sort?,status?,isDefault?,remark?} | 管理员 |
| DELETE | /api/dicts/data?id= | 删除字典项 | 管理员 |

## 权限码
无 dict:* 权限码：读走 `requireAuth()`（任意登录用户，业务下拉可直接调 `GET /api/dicts/data?typeCode=xxx`），写走 `requireAdmin()`；写操作统一写审计（module=system、refType=dict）。

## 新增一个字典
页面 `/dict`：左侧「新建类型」填编码与名称 → 右侧「新增字典项」逐条加 label/value/排序/状态；内置字典改 `prisma/seed-dicts.ts` 后重跑 `npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed-dicts.ts`。
