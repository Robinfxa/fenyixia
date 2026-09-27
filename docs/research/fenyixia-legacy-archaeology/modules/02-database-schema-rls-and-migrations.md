# 02 - 数据库 Schema、RLS 策略与迁移演进深度剖析

本文档对《分一下》的 Postgres 数据库架构、行级安全策略（RLS）、历史死锁修复手段以及底层事务/权限技术债务进行全面测绘。

---

## 1. 核心数据表结构测绘 (DDL 全景)

系统数据层依托 Supabase 托管的 PostgreSQL，包含 14 张核心业务表与 2 个专用视图：

### 1.1 基础实体表
1. **`users`** ([`supabase-schema.sql:7-15`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L7-L15))
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name text NOT NULL`, `email text UNIQUE NOT NULL`, `emoji text DEFAULT '😊'`, `color text DEFAULT '#4F46E5'`
   - `pin_hash text`（早期用于 6 位数字 PIN 认证，由客户端哈希后写入）
   - `created_at timestamptz DEFAULT now()`
2. **`bills`** ([`supabase-schema.sql:27-38`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L27-L38))
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `icon text DEFAULT '🧾'`, `title text NOT NULL`, `description text DEFAULT ''`
   - `total_amount numeric(10,2) NOT NULL DEFAULT 0`
   - `date date NOT NULL DEFAULT CURRENT_DATE`
   - `payer_id uuid NOT NULL REFERENCES users(id)`（垫付人外键）
   - `settled boolean NOT NULL DEFAULT false`（是否全单结清）
   - `color text DEFAULT '#4F46E5'`, `created_at timestamptz DEFAULT now()`
   - 索引：`idx_bills_payer` (`payer_id`), `idx_bills_date` (`date`)
3. **`bill_items`** ([`supabase-schema.sql:41-48`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L41-L48))
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE`
   - `name text NOT NULL`, `price numeric(10,2) NOT NULL DEFAULT 0`（允许为负数，用于满减折扣项）
   - `qty integer NOT NULL DEFAULT 1`, `sort_order integer DEFAULT 0`
   - 索引：`idx_bill_items_bill` (`bill_id`)
4. **`bill_item_members`** ([`supabase-schema.sql:51-55`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L51-L55))
   - `item_id uuid NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE`
   - `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - **复合主键**：`PRIMARY KEY (item_id, user_id)`
   - 索引：`idx_bill_item_members_user` (`user_id`)
5. **`friendships`** ([`supabase-schema.sql:18-24`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L18-L24))
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `user_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - 唯一约束：`UNIQUE(user_a, user_b)`（通过保证 `user_a < user_b` 避免双向冗余）
   - 索引：`idx_friendships_a` (`user_a`), `idx_friendships_b` (`user_b`)
6. **`receipt_scans`** ([`receipt-scans-schema.sql:7-14`](file:///Users/robin/Desktop/fenyixia/receipt-scans-schema.sql#L7-L14))
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `image_path text NOT NULL`, `scan_result jsonb NOT NULL`
   - `bill_id uuid REFERENCES bills(id) ON DELETE SET NULL`
   - `created_at timestamptz DEFAULT now()`

### 1.2 核心派生视图
- **`my_bills`** ([`supabase-schema.sql:60-70`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L60-L70))：
  ```sql
  CREATE VIEW my_bills AS
  SELECT DISTINCT b.*
  FROM bills b
  LEFT JOIN bill_items bi ON bi.bill_id = b.id
  LEFT JOIN bill_item_members bim ON bim.item_id = bi.id
  WHERE b.payer_id = auth.uid() OR bim.user_id = auth.uid();
  ```
- **`bill_shares`** ([`supabase-schema.sql:74-89`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L74-L89))：
  利用 `CROSS JOIN LATERAL` 统计每个 item 的承担人数，按精确比例分摊计算当前用户在各个账单项中的应付金额，并聚合为 `round(sum(...), 2) AS my_share`。

---

## 2. 全部 13 个增量迁移脚本剖析 (`supabase/migrations/`)

| 序号 | 迁移脚本名称 | 核心表 / 函数变更 | 业务意图与架构要点 |
|---|---|---|---|
| 1 | `payment-and-reactions.sql` | `payment_proofs`, `bill_reactions` | 引入转账截图上传记录；支持参与人对账单发起“😡 怒气”轻量抗议与统计 |
| 2 | `invitations.sql` | `invitations` | 存储离线好友邀请码，包含 32 字节随机 Hex 令牌，支持过期与认领状态 |
| 3 | `friend_requests.sql` | `friend_requests`, `search_user_by_email()`, `accept_friend_request()` | 好友双向申请流转；在 RPC 中使用 `least/greatest` 强制规范序写入 `friendships` |
| 4 | `wechat-contacts-friendships.sql` | 为 `friendships` 增加 `alias_a`, `alias_b`, `status` | 微信式私有好友备注，A 对 B 的备注与 B 对 A 的备注物理隔离存储 |
| 5 | `wechat-contacts-groups.sql` | `groups`, `group_members` | 群聊模型；多对多成员映射，支持群聊名称与 Emoji 头像 |
| 6 | `wechat-contacts-tags.sql` | `user_tags`, `friend_tags` | 用户私有彩色标签分类系统，多标签聚合反查好友 |
| 7 | `wechat-contacts-rls.sql` | 通讯录模块基础 RLS | 为 groups, tags, friendships 补充行级读写访问控制策略 |
| 8 | `bill-disputes.sql` | `bill_disputes` | 争议仲裁模型，存储 AI 生成的更正分配方案 `suggested_items` (jsonb) |
| 9 | `bill-disputes-update-rls.sql` | 更新 `bill_disputes` 的 UPDATE 规则 | 允许质疑人在 pending 状态下微调建议分配项 |
| 10 | `fix-group-members-rls-recursion.sql`| `get_my_group_ids()` | 创建 `SECURITY DEFINER` 函数突破群成员自引用无限递归死锁 |
| 11 | `admin-email-log.sql` | `admin_email_log` | 邮件发送审计日志，仅限 `service_role` 访问，用于 Resend 免费额度告警 |
| 12 | `token-usage.sql` | `token_usage` | 记录每次调用 Claude API 的 input/output token 消耗与对应用户 |
| 13 | `api-tokens.sql` | `api_tokens` | 为外部 AI 助手发放长效 Bearer Token (`fyx_<48位hex>`) |

---

## 3. 三大 RLS 递归死锁突破考古

行级安全策略（RLS）是 Supabase 多租户架构的核心，但本系统在演进中曾遭遇三次严重的**递归死锁崩溃**，其解决过程极具教科书意义：

### 3.1 死锁 1：账单与商品条目双向递归
- **事故现场**：
  在原始设计中，`bills` 的读策略需要判定“当前用户是否属于该账单下某商品的成员”，因而子查询了 `bill_items`；而 `bill_items` 的读策略又判定“当前用户是否能读取父账单”，反向子查询了 `bills`。两张表的 RLS 互相触发，导致 Postgres 报 `infinite recursion detected in policy for relation "bills"`。
- **终极破解手段** ([`fix-rls-recursion.sql:4-16`](file:///Users/robin/Desktop/fenyixia/fix-rls-recursion.sql#L4-L16))：
  创建一个 `SECURITY DEFINER` 存储函数 `get_my_bill_ids()`。由于 `SECURITY DEFINER` 以超级权限执行，内部查询 `bills` 和 `bill_item_members` 时**完全绕过 RLS**，从而在根源上掐断了递归调用链：
  ```sql
  CREATE OR REPLACE FUNCTION get_my_bill_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  AS $$
    SELECT id FROM bills WHERE payer_id = auth.uid()
    UNION
    SELECT bi.bill_id
    FROM bill_item_members bim
    JOIN bill_items bi ON bi.id = bim.item_id
    WHERE bim.user_id = auth.uid();
  $$;
  ```

### 3.2 死锁 2：STABLE 快照隔离导致的 INSERT 不可见与 DELETE 遗漏
- **事故现场**：
  在引入 `get_my_bill_ids()` 后，新创建账单在刚执行 INSERT 的同一个事务内，由于 `STABLE` 函数的快照隔离特性，`get_my_bill_ids()` 读不到刚插入的主表记录，导致后续立即插入 `bill_items` 时触发 RLS 权限拒绝异常。此外，原策略完全遗漏了 `DELETE` 策略，导致用户无法删除自己的账单。
- **终极破解手段** ([`fix-rls-insert.sql:10-25`](file:///Users/robin/Desktop/fenyixia/fix-rls-insert.sql#L10-L25))：
  在 `bills` 和 `bill_items` 的读写策略中补充**直接判断短路条件** `payer_id = auth.uid()`，优先匹配内存中的当前写入者身份，无需等待 `get_my_bill_ids()` 刷新；并显式补齐 `bills_delete` 策略。

### 3.3 死锁 3：群成员自查询递归死锁
- **事故现场**：
  在 Commit `8beddfd` 之前，[`wechat-contacts-rls.sql:35-37`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/wechat-contacts-rls.sql#L35-L37) 中的 `group_members_read` 策略定义为：
  `USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()))`
  在评估 `group_members` 表的行权限时，子查询再次访问 `group_members` 自身，陷入无限自调用死锁。现象表现为：**非群主的普通成员只能看到自己，完全看不到群内的其他群友**。
- **终极破解手段** ([`fix-group-members-rls-recursion.sql:6-23`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/fix-group-members-rls-recursion.sql#L6-L23))：
  采用相同的解耦范式，构建 `get_my_group_ids()` 函数并标记为 `SECURITY DEFINER`，彻底将群组归属关系的查询隔离在 RLS 之外。

---

## 4. 后端技术债务与高危安全隐患清单

本节记录经深度代码测绘确认的**当前必须立即警惕的技术债务与设计缺陷**：

### 4.1 客户端伪事务与网络半提交状态 (高危)
- **源码坐标**：[`src/lib/api/bills.ts:105-212`](file:///Users/robin/Desktop/fenyixia/src/lib/api/bills.ts#L105-L212)
- **事实与隐患**：
  在保存或更新账单时，客户端连续发起 3 到 5 次独立的 HTTP 请求：
  1. `supabase.from('bills').insert(...)`
  2. `supabase.from('bill_items').insert(...)`
  3. `supabase.from('bill_item_members').insert(...)`
  在更新逻辑中，甚至采取了**先 DELETE 全部旧 items 再 INSERT 新 items** 的危险做法。若用户在点击保存瞬间发生弱网切换或关闭应用，将直接导致：
  - **产生只有账单头但没有任何明细商品的“孤儿账单”**；
  - **旧明细已被物理抹除、新明细尚未写入，导致账单被彻底清空且不可逆**。
- **改进建议**：必须封装为一个统一的 Postgres 存储过程 `create_bill_atomic`，利用数据库原生 ACID 事务保障强一致性。

### 4.2 Schema 漂移与正式迁移脚本丢失 (高危)
- **事实 1**：在整个 `supabase/migrations/` 目录中，**完全不存在 `manual_payments` 表的 DDL 语句**！该表在 Commit `227f36a` 提交时仅由开发者在 Supabase 云端控制台手工执行，未落盘入代码仓库。在新克隆仓库执行迁移部署时，整个手动结清功能将因找不到表而崩溃。
- **事实 2**：`users.profile_completed` 字段以及自动触发器 `handle_new_user()` 也未进入版本库，属于典型的“环境配置漂移”。

### 4.3 付款凭证全库裸奔泄露 (高危)
- **源码坐标**：[`supabase/migrations/payment-and-reactions.sql:24`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/payment-and-reactions.sql#L24)
- **事实与隐患**：
  `payment_proofs` 的读策略被粗暴设置为：
  `CREATE POLICY "payment_proofs_read" ON payment_proofs FOR SELECT TO authenticated USING (true);`
  **全系统任何注册登录用户，均可遍历下载他人账单所上传的全部银行转账截图**，转账截图内的真实姓名、银行账号后四位、电子邮箱等高敏感隐私完全处于失控状态！
- **修复方案**：必须收敛为 `USING (bill_id IN (SELECT get_my_bill_ids()))`。

### 4.4 怒气风暴前后端脱节与虚假 RPC (中危)
- **源码坐标**：[`src/hooks/useAngerStorm.ts:8-26`](file:///Users/robin/Desktop/fenyixia/src/hooks/useAngerStorm.ts#L8-L26)
- **事实**：
  前端 Hook 满怀信心地调用了 `supabase.rpc('add_anger_reaction')`、`supabase.rpc('get_unseen_anger')` 与 `supabase.rpc('mark_anger_seen')`。然而在数据库全量 SQL 脚本中，**这三个函数从未被创建**。前端之所以没崩，是因为客户端代码内部用 `catch` 吞没了所有错误，但所谓的“怒气跨设备通知”实际上从未成功持久化过。
