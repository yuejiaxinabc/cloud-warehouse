-- =====================================================================
-- 云仓 v1.2.3 数据库变更（MySQL 8.0+）
--
-- 正常部署走 prisma db push 即可（三张新表 + 六个新列会自动建好），
-- 本文件给「不允许 Prisma 直连改表」的环境用：手工按顺序执行。
-- 执行后务必再跑：node scripts/backfill-org-scope.mjs
-- =====================================================================

-- 1. 角色数据范围
ALTER TABLE `roles`
  ADD COLUMN `data_scope` VARCHAR(20) NOT NULL DEFAULT 'ALL',
  ADD COLUMN `data_scope_org_ids` VARCHAR(1000) NULL;

-- 2. 组织祖先链（',1,2,' 形式，首尾带逗号，便于 contains 查下级）
ALTER TABLE `organizations`
  ADD COLUMN `ancestors` VARCHAR(1000) NULL,
  ADD COLUMN `level` INT NOT NULL DEFAULT 1;

-- 3. 仓库归属组织
ALTER TABLE `warehouses`
  ADD COLUMN `org_id` BIGINT UNSIGNED NULL,
  ADD INDEX `warehouses_org_id_idx` (`org_id`);

-- 4. 字典中心
CREATE TABLE IF NOT EXISTS `dict_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `remark` VARCHAR(500) NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dict_types_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dict_data` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type_code` VARCHAR(64) NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `value` VARCHAR(100) NOT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `is_default` BOOLEAN NOT NULL DEFAULT 0,
  `remark` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dict_data_type_code_value_key` (`type_code`, `value`),
  KEY `dict_data_type_code_sort_idx` (`type_code`, `sort`),
  CONSTRAINT `dict_data_type_code_fkey` FOREIGN KEY (`type_code`) REFERENCES `dict_types` (`code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 登录日志
CREATE TABLE IF NOT EXISTS `login_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `username` VARCHAR(50) NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `success` BOOLEAN NOT NULL DEFAULT 1,
  `reason` VARCHAR(200) NULL,
  `ip` VARCHAR(64) NULL,
  `user_agent` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `login_logs_created_at_idx` (`created_at`),
  KEY `login_logs_username_created_at_idx` (`username`, `created_at`),
  CONSTRAINT `login_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 历史数据：组织祖先链用递归 CTE 一次性算好（MySQL 8+）
--    注意：如果组织树很深或有环，这条可能报错，改用 node scripts/backfill-org-scope.mjs
-- WITH RECURSIVE org_tree AS (
--   SELECT id, CAST('' AS CHAR(1000)) AS ancestors, 1 AS lvl FROM organizations WHERE parent_id IS NULL
--   UNION ALL
--   SELECT o.id, CONCAT(t.ancestors, t.id, ','), t.lvl + 1
--   FROM organizations o JOIN org_tree t ON o.parent_id = t.id
-- )
-- UPDATE organizations o JOIN org_tree t ON o.id = t.id
-- SET o.ancestors = t.ancestors, o.level = t.lvl;

-- 7. 内置字典种子（也可以直接跑 npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed-dicts.ts）