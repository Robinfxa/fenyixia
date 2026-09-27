# 04 - 微信式社交图谱、通讯录体系与拼音缓存引擎

本文档深入解析《分一下》的社交关系网架构：无向图规范序好友存储、离线邀请码裂变流转、私有标签与群组体系，以及解决移动端长列表掉帧的拼音预计算缓存引擎。

---

## 1. 微信级通讯录架构与无向图正规化

### 1.1 无向图规范序（Canonical Ordering）存储
在社交账单场景中，“A 和 B 是好友”是无向对等关系。若采用有向边存储，查询好友时需要频繁进行 `WHERE user_a = me OR user_b = me` 并做去重，极易产生重复数据与并发脏写。

系统在数据库 RPC `accept_friend_request` ([`supabase/migrations/friend_requests.sql:59-63`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/friend_requests.sql#L59-L63)) 中实施了**字典序正规化**：
```sql
a := least(req.from_user, req.to_user);
b := greatest(req.from_user, req.to_user);
insert into friendships (user_a, user_b)
  values (a, b)
  on conflict (user_a, user_b) do nothing;
```
- 任何好友关系的入库，强制保证 $user\_a < user\_b$（按 UUID 字符串字典序大小比较）。
- 结合表级唯一索引 `UNIQUE(user_a, user_b)`，在数据库引擎层面从物理上彻底杜绝了反向记录的重复生成。

### 1.2 私有备注（Alias）物理隔离
微信通讯录最核心的体验在于“我对好友的备注只有我能看见，对方改名不影响我的备注”。
在 [`supabase/migrations/wechat-contacts-friendships.sql:11-15`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/wechat-contacts-friendships.sql#L11-L15) 中：
- `alias_a text`：专门存放 $user\_a$ 给 $user\_b$ 设置的备注名；
- `alias_b text`：专门存放 $user\_b$ 给 $user\_a$ 设置的备注名。
客户端在拉取好友列表时（[`src/lib/api/friends.ts:46-59`](file:///Users/robin/Desktop/fenyixia/src/lib/api/friends.ts#L46-L59)），通过判断自身 UID 是属于 $user\_a$ 还是 $user\_b$，自动投影出属于自己的 `alias` 字段。

### 1.3 双向申请自动握手（Auto-Accept）
在传统的申请流程中，若 A 向 B 发起申请，B 尚未处理时又主动向 A 发起申请，容易造成两条冲突记录。
在 [`src/lib/api/friends.ts:127-140`](file:///Users/robin/Desktop/fenyixia/src/lib/api/friends.ts#L127-L140) 的 `sendFriendRequest` 接口中：
当 A 准备给 B 发申请时，首先检索是否存在 B 发给 A 且处于 `pending` 状态的申请记录。若存在，**直接调用 `acceptFriendRequest` 自动双向结网**，免去多余等待。

---

## 2. 离线邀请码引流与新用户自动绑定闭环 (`invitations`)

针对非系统注册用户，系统构建了无缝的离线好友邀请闭环：

```text
当前用户在通讯录输入外部邮箱 (如 test@gmail.com)
                     │
                     ▼
             查询 users 表是否存在
             ├── 存在 ───> 正常走 friend_requests 申请流程
             └── 不存在 ─> 走离线邀请闭环
                     │
                     ▼
         写入 `invitations` 表 (invitations.sql:2-9)
         - 随机生成 32 字节 Hex 令牌: encode(gen_random_bytes(16), 'hex')
         - 记录 inviter_id, email, status='pending'
                     │
                     ▼
     调用 Edge Function: `send-email` (Resend API)
     向目标邮箱发送专属注册链接: https://.../login?invite=<token>&email=<encoded>
                     │
                     ▼
          新用户点击邮件链接打开应用
          - LoginPage 自动填充邮箱，输入 PIN 完成建号
          - updateProfile (auth.ts:77-103) 资料完善后：
            1. 自动将对应 token 的 invitation 设为 'accepted'
            2. 自动调用 friend_requests 互相建立好友关系！
```

---

## 3. 群组与私有标签体系

### 3.1 群组多对多模型 (`groups` & `group_members`)
- 源码对应：[`supabase/migrations/wechat-contacts-groups.sql`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/wechat-contacts-groups.sql)
- 关系模型：群组表 `groups`（`id, owner_id, name, emoji`）与成员关联表 `group_members`（`group_id, user_id`）。
- 权限隔离：群主与群成员均有权查阅群信息，但只有群主有权解散群聊；利用 `SECURITY DEFINER` 的 `get_my_group_ids()` 函数保障非群主成员读权限无死锁。

### 3.2 私有彩色分类标签 (`user_tags` & `friend_tags`)
- 源码对应：[`supabase/migrations/wechat-contacts-tags.sql`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/wechat-contacts-tags.sql)
- 架构特性：
  - `user_tags` 归属于单用户私有（`UNIQUE(user_id, name)`），预设 8 种高对比饱和色彩（如 `#FF3B30`, `#34C759`, `#007AFF`）。
  - 中间表 `friend_tags` 外键级联关联 `friendships(id)`，支持单好友打多个标签。
  - 在分账选人抽屉（`MemberPickerSheet.tsx`）中，提供“按标签一键反查好友集合并批量选入账单”的能力。

---

## 4. 拼音索引与读时预计算缓存引擎 (`pinyin-caching`)

### 4.1 移动端性能瓶颈与优化机理
在通讯录包含大量中文好友时，若在组件渲染或列表搜索时频繁调用 `pinyin-pro` 的转换算法，会导致大量正则匹配和字符集查表占用 JS 主线程，引起滑动丢帧（FPS 骤降至 30 以下）。

系统确立了**“API 读时预计算注入”**的架构模式（OpenSpec: `pinyin-caching`）：

```ts
// src/lib/api/friends.ts:69-79
const enrichedFriends = rawFriends.map(f => {
  const displayName = f.alias || f.name
  return {
    ...f,
    _pinyinInitial: getInitial(displayName),       // 单字符，如 'Z'
    _pinyinSortKey: getPinyinSortKey(displayName), // 全拼连续小写，如 'zhangsan'
  }
})
```

### 4.2 拼音工具实现细节 ([`src/lib/pinyin.ts:5-19`](file:///Users/robin/Desktop/fenyixia/src/lib/pinyin.ts#L5-L19))
1. **`getInitial(name)`**：
   - 若首字符为标准英文字母，直接返回大写 `name[0].toUpperCase()`；
   - 若首字符为汉字，调用 `pinyin(char, { pattern: 'first', toneType: 'none' })` 提取首字母；
   - 其它特殊字符统一归入 `#` 组。
2. **`getPinyinSortKey(name)`**：
   - 调用 `pinyin(name, { toneType: 'none', nonZh: 'consecutive' })`，将整个名字转换为连贯无声调小写拼音（如“张伟” $\to$ `"zhangwei"`）。
3. **零计算纯享搜索与分组**：
   - 分组组件 [`src/lib/pinyin.ts:31-52`](file:///Users/robin/Desktop/fenyixia/src/lib/pinyin.ts#L31-L52) 的 `groupByInitial` 直接读取已缓存的 `_pinyinInitial`，无需再对名字进行耗时转译。
   - 搜索框过滤（[`ContactsPage.tsx:26-34`](file:///Users/robin/Desktop/fenyixia/src/pages/ContactsPage.tsx#L26-L34)）支持输入汉字、备注、全拼无缝命中：
     `f.name.includes(q) || f.alias?.includes(q) || f._pinyinSortKey.includes(q)`
