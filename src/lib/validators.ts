import { z } from 'zod';

// 密码复杂度策略：至少8位，包含大小写字母、数字、特殊字符
const passwordSchema = z.string()
  .min(8, '密码长度至少8位')
  .max(50, '密码长度不能超过50位')
  .regex(/[a-z]/, '密码必须包含小写字母')
  .regex(/[A-Z]/, '密码必须包含大写字母')
  .regex(/[0-9]/, '密码必须包含数字')
  .regex(/[^a-zA-Z0-9]/, '密码必须包含特殊字符');

// 用户名验证：3-20位字母数字下划线
const usernameSchema = z.string()
  .min(3, '用户名长度至少3位')
  .max(20, '用户名长度不能超过20位')
  .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线');

// 用户创建验证
export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  realName: z.string().min(1, '请输入姓名').max(50),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号').optional(),
  email: z.string().email('请输入正确的邮箱').optional(),
  orgId: z.number().optional(),
  roleIds: z.array(z.number()).optional(),
});

// 密码修改验证
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入旧密码'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, '请确认新密码'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

// 用户更新验证（密码可选）
export const updateUserSchema = z.object({
  id: z.number(),
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  realName: z.string().min(1).max(50).optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/).optional(),
  email: z.string().email().optional(),
  orgId: z.number().optional(),
  roleIds: z.array(z.number()).optional(),
  status: z.number().optional(),
});

// 分页验证
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ID验证
export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// 角色创建验证
export const createRoleSchema = z.object({
  name: z.string().min(1, '请输入角色名称').max(50),
  code: z.string().min(1, '请输入角色编码').max(50).regex(/^[a-zA-Z0-9_]+$/, '编码只能包含字母、数字和下划线'),
  remark: z.string().max(200).optional(),
  permissionIds: z.array(z.number()).optional(),
});

// 调拨单创建验证
export const createTransferSchema = z.object({
  fromWhId: z.coerce.number().positive('请选择源仓库'),
  toWhId: z.coerce.number().positive('请选择目标仓库'),
  remark: z.string().max(500).optional(),
  items: z.array(z.object({
    productId: z.coerce.number().positive('请选择商品'),
    skuVariantId: z.coerce.number().optional(),
    quantity: z.coerce.number().positive('数量必须大于0'),
    remark: z.string().max(200).optional(),
  })).min(1, '请至少添加一个商品'),
});


// BOM创建验证
export const createBomSchema = z.object({
  name: z.string().min(1, '请输入BOM名称').max(100),
  productId: z.number().positive('请选择成品商品'),
  remark: z.string().max(500).optional(),
  items: z.array(z.object({
    materialId: z.number().positive('请选择原材料'),
    quantity: z.number().positive('用量必须大于0'),
    unit: z.string().max(20).optional(),
    remark: z.string().max(200).optional(),
  })).min(1, '请至少添加一个原材料'),
});

// 商品更新验证
export const updateProductSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sku: z.string().min(1).max(50).optional(),
  barcode: z.string().max(50).optional(),
  categoryId: z.number().optional(),
  unit: z.string().max(20).optional(),
  price: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  maxStock: z.number().min(0).optional(),
  description: z.string().max(500).optional(),
  status: z.number().optional(),
});
